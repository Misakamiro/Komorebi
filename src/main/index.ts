import { app, dialog, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
// import ElectronStore from 'electron-store';
import { spawn, SpawnOptions } from 'child_process';
import net from 'net';
import path from 'path';
import parsePath from 'parse-path';
import CryptoJS from 'crypto-js';
import { utimes } from 'utimes';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { getMachineId } from './utils';
import ProcessInstance from '@common/processInstance';
import localConfig from '@common/localConfig';
import i11n from '@common/i11n/i11n';
import { getFileExtension } from '@common/mediaExtensions';
import { convertFFBoxMenuToElectronMenuTemplate, getOs } from './utils';
import osBridge from './osBridge';
import * as mica from './mica';
// import { FFBoxService } from './service/FFBoxService';

const APP_NAME = 'Komorebi';
const cleanPathInput = (value: string) => value.trim().replace(/^["']|["']$/g, '');
const isLikelyLocalFilesystemPath = (value: string) =>
	/^\\\\[^\\]+\\[^\\]+/.test(value) ||
	/^[a-zA-Z]:[\\/]/.test(value) ||
	/^\/(?!\/)/.test(value) ||
	value.toLowerCase().startsWith('file:');

interface DownloadMap {
	item?: Electron.DownloadItem;
	finalFileBaseName?: string;
	dir?: string;	// 批量下载前指定文件夹，这样每个文件下载时就不弹窗
	fileTime?: { accessTime: number, createTime: number, modifyTime: number };
	sessionId?: string;
}

class ElectronApp {
	mainWindow: BrowserWindow | null = null;
	// electronStore: ElectronStore;
	service: ProcessInstance | null = null;
	servicePort = 33269;
	blockWindowClose = true;
	isQuitting = false;
	downloadMap: Map<string, DownloadMap> = new Map();

	constructor() {
		this.mountAppEvents();
	}

	mountAppEvents(): void {
		// 本程序是启动的第二个实例时，将因获不到锁而退出
		if (!app.requestSingleInstanceLock()) {
			console.log(`${APP_NAME} 已启动，暂不支持启动第二个实例`);
			app.quit();
			process.exit(0);
		}
		app.whenReady().then(async () => {
			app.setName(APP_NAME);
			if (process.platform === 'win32') {
				app.setAppUserModelId('com.komorebi.desktop');
			}
			// if (!app.isPackaged) {
			// 	await session.defaultSession.loadExtension(`${app.getAppPath()}/vue-devtools`);
			// }
			await osBridge.initPipe();
			this.createMainWindow();
			this.mountIpcEvents();
		});

		// 发现本程序启动了第二个实例的时候，弹出主窗口
		app.on('second-instance', () => {
			if (this.mainWindow) {
				this.mainWindow.focus();
			}
		});
		// macOS dock 操作相关适配，未验证
		app.on('activate', () => {
			if (BrowserWindow.getAllWindows()) {
				this.mainWindow?.focus();
			} else {
				this.createMainWindow();
			}
		});
		app.on('window-all-closed', () => {
			// FFBoxService 进程尽管没有指定 detached
			// 但在 macOS 上，主进程退出不会导致 service 退出；在 linux 上，主进程调用了 app.exit() 之后依然会等待 service 退出
			// 故保险起见主动关闭
			this.isQuitting = true;
			void this.shutdownService().finally(() => app.exit());
		});
		app.on('before-quit', () => {
			this.isQuitting = true;
			void this.shutdownService();
		});

		// Set app user model id for windows
		// electronApp.setAppUserModelId('com.electron');

		// Default open or close DevTools by F12 in development
		// and ignore CommandOrControl + R in production.
		// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
		// app.on('browser-window-created', (_, window) => {
		// 	optimizer.watchWindowShortcuts(window);
		// });
	}

	createMainWindow(): void {
		const mainWindow = new BrowserWindow({
			title: APP_NAME,
			width: buildInfo.isDev ? 1440 : 1080,
			height: buildInfo.isDev ? 900 : 720,
			minWidth: 600,
			minHeight: 300,
			show: false,
			resizable: true,
			maximizable: true,
			center: true,
			// transparent: true,
			backgroundColor: '#00ffffff',
			frame: false,
			hasShadow: true,
			// titleBarOverlay: {
			// 	color: '#444444'
			// },
			// titleBarStyle: 'hidden',
			// autoHideMenuBar: true,
			...(process.platform === 'linux' ? { icon: path.join(__dirname, '../../build/icon.png') } : {}),
			webPreferences: {
				preload: path.join(__dirname, '../preload/index.cjs'),
				backgroundThrottling: false,
				// nodeIntegration: true,
				// contextIsolation: false,
			},
		});
		this.mainWindow = mainWindow;

		// 设置默认使用外部应用（浏览器）打开链接
		mainWindow.webContents.setWindowOpenHandler(({ url }) => {
			try {
				const parsedUrl = new URL(url);
				if (['https:', 'http:'].includes(parsedUrl.protocol)) {
					shell.openExternal(parsedUrl.toString());
				}
			} catch {
				// Ignore malformed URLs from renderer-created windows.
			}
			return { action: 'deny' };
		});

		mainWindow.once('ready-to-show', () => {
			mainWindow!.show();
			osBridge.sendLoadStatus('show');
		});

		// HMR for renderer base on electron-vite cli.
		// Load the remote URL for development or the local html file for production.
		// if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
		// 	mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
		// } else {
		// 	mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
		// }
		if (app.isPackaged) {
			mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
		} else {
			// 环境变量来自 build.mjs 传入
			const url = `http://localhost:${process.env['VITE_DEV_SERVER_PORT']}`;

			mainWindow.loadURL(url);
			mainWindow.webContents.openDevTools();
		}
	
		mainWindow.on('close', (e) => {
			if (!this.isQuitting && this.blockWindowClose) {
				e.preventDefault();
				mainWindow!.webContents.send('exitConfirm');
			}
		});

		mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
			const url = item.getURL();
			const map = this.downloadMap.get(url);
			if (!map || map?.item) return;
			map.item = item;
			const finalFileBaseName = map.finalFileBaseName || item.getFilename() || 'download';

			if (map.dir) {
				item.setSavePath(path.join(map.dir, finalFileBaseName));
			} else {
				item.setSaveDialogOptions({ defaultPath: finalFileBaseName });
			}
			mainWindow.webContents.send('downloadStatusChange', { url: url, status: 'started' });
			item.on('updated', (event, state) => {
				if (state === 'interrupted') {
					console.log(url, '下载取消');
				} else if (state === 'progressing') {
					if (item.isPaused()) {
						console.log(url, '下载暂停');
					} else {
						mainWindow.webContents.send('downloadProgress', { url: url, loaded: item.getReceivedBytes(), total: item.getTotalBytes() });
					}
				}
				if (item.getSavePath()) {
					mainWindow.webContents.send('downloadStatusChange', { url: url, status: state, finalFilePath: item.getSavePath() });
				}
			});
			item.once('done', async (event, state) => {
				console.log(url, `下载${state === 'completed' ? '完成' : state}`);
				mainWindow.webContents.send('downloadStatusChange', { url: url, status: state, finalFilePath: item.getSavePath() });
				if (state === 'completed') {
					let finalPath = item.getSavePath();
					// if (map.finalFileName) {
					// 	const destPath = finalPath;
					// 	const destDir = path.parse(destPath).dir;
					// 	finalPath = path.resolve(destDir, map.finalFileName);
					// 	await fs.rename(destPath, finalPath);
					// }
					if (map.fileTime) {
						const { accessTime, createTime, modifyTime } = map.fileTime;
						utimes(finalPath, { atime: accessTime || undefined, btime: createTime || undefined, mtime: modifyTime || undefined });
					}
				}
				this.downloadMap.delete(url);
			});
		});

		// 应用菜单
		const initialMenuTemplate = [
			{ label: 'Komorebi' },
			{ label: '加载中' }
		]
		
		const menu = Menu.buildFromTemplate(initialMenuTemplate as any);
		Menu.setApplicationMenu(menu);

		// this.electronStore = new ElectronStore();
	}

	private async firstExecutable(candidates: string[]): Promise<string> {
		for (const candidate of [...new Set(candidates.filter(Boolean))]) {
			try {
				await fs.access(candidate, fs.constants.X_OK);
				return candidate;
			} catch {}
		}
		return '';
	}

	private async firstReadable(candidates: string[]): Promise<string> {
		for (const candidate of [...new Set(candidates.filter(Boolean))]) {
			try {
				await fs.access(candidate, fs.constants.R_OK);
				return candidate;
			} catch {}
		}
		return '';
	}

	private async isPortAvailable(port: number): Promise<boolean> {
		return new Promise((resolve) => {
			const tester = net.createServer()
				.once('error', () => resolve(false))
				.once('listening', () => {
					tester.close(() => resolve(true));
				})
				.listen(port, '::');
		});
	}

	private async getAvailableServicePort(startPort = 33269): Promise<number> {
		for (let offset = 0; offset < 30; offset++) {
			const port = startPort + offset;
			if (await this.isPortAvailable(port)) {
				return port;
			}
		}
		throw new Error(`No available local service port found from ${startPort}.`);
	}

	async createService(): Promise<number> {
		if (this.service) {
			return this.servicePort;
		}
		let servicePath = '';
		if (getOs() === 'Windows') {
			servicePath = await this.firstExecutable([
				path.join(path.dirname(process.execPath), 'KomorebiService.exe'),
				process.resourcesPath ? path.join(process.resourcesPath, '..', 'KomorebiService.exe') : '',
				process.resourcesPath ? path.join(process.resourcesPath, 'KomorebiService.exe') : '',
				path.join(process.cwd(), 'KomorebiService.exe'),
				path.join(process.cwd(), 'app', 'backend', 'index.exe'),
				path.join(__dirname, '..', 'backend', 'index.exe'),
			]);
		} else if (getOs() === 'MacOS') {
			servicePath = await this.firstExecutable([
				path.join(process.resourcesPath, 'KomorebiService'),
				path.join(path.dirname(process.execPath), 'KomorebiService'),
				path.join(process.cwd(), 'KomorebiService'),
			]);
		} else if (getOs() === 'Linux') {
			servicePath = await this.firstExecutable([
				path.join(process.cwd(), 'KomorebiService'),
				path.join(path.dirname(process.execPath), 'KomorebiService'),
				path.join(process.cwd(), 'app', 'backend', 'index'),
				path.join(__dirname, '..', 'backend', 'index'),
			]);
		}
		// this.mainWindow.webContents.send('debugMessage', '选出路径', servicePath);
		const service = new ProcessInstance();
		const port = await this.getAvailableServicePort();
		this.service = service;
		this.servicePort = port;
		return new Promise((resolve, reject) => {
			if (!servicePath) {
				reject(new Error('KomorebiService executable was not found.'));
				return;
			}
			let settled = false;
			const finish = (error?: Error) => {
				if (settled) {
					return;
				}
				settled = true;
				if (error) {
					if (this.service === service) {
						this.service = null;
					}
					reject(error);
				} else {
					osBridge.sendLoadStatus('service');
					resolve(port);
				}
			};
			service.start(servicePath, ['--port', String(port)], { cwd: path.dirname(servicePath) }).then(() => {
				service.once('escaped', ({ code }) => {
					finish(new Error(`KomorebiService exited with code ${code}.`));
				});
				service.once('closed', () => {
					if (this.service === service) {
						this.service = null;
					}
				});
				service.on('stderr', ({ content }) => {
					console.warn(`KomorebiService stderr: ${content}`);
				});
				// 需要加一点延迟才报告成功，主要是因为 service 启动 server 需要一定时间，待 server 启动好之后才让 renderer 去连接
				// 在 Windows 中可能不需要加这个延时，但是在 macOS 和 Linux 上似乎都是需要的
				// 另外，调试过程中发现，如果尝试使用 debugMessage 把调试消息发送给 renderer，当程序忙的时候 renderer 并不一定会按实际顺序去显示，因此需要适当增加延时以验证 Promise 正常工作
				// 150ms 延迟在 Linux 上很可能不够。但目前的设计是在 renderer 那边自动重试，主进程尽快报告完成。
				setTimeout(() => {
					finish();
				}, 300);
			}).catch((error) => {
				finish(error instanceof Error ? error : new Error(String(error)));
			});
		});
	}

	private async shutdownService(): Promise<void> {
		const service = this.service;
		if (!service) {
			return;
		}
		this.service = null;
		try {
			await service.killTree();
		} catch (error) {
			console.warn(`Failed to terminate KomorebiService process tree: ${error}`);
			try {
				service.sendSig(9);
			} catch {}
		}
	}

	mountIpcEvents(): void {
		session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
			const download = this.downloadMap.get(details.url);
			if (download?.sessionId) {
				details.requestHeaders['Authorization'] = `Bearer ${download.sessionId}`;
			}
			callback({ requestHeaders: details.requestHeaders });
		});

		// 最小化按钮
		ipcMain.on('minimize', () => {
			this.mainWindow.minimize();
		});

		// 窗口模式按钮
		ipcMain.on('windowmode', () => {
			if (this.mainWindow.isMaximized()) {
				this.mainWindow.unmaximize();
			} else {
				this.mainWindow.maximize();
			}
		});

		// 窗口主动发送的确认关闭通知
		ipcMain.on('exitConfirm', () => {
			this.blockWindowClose = false;
		});

		// 窗口主动发送的关闭通知
		ipcMain.on('close', () => {
			this.mainWindow!.close();
		});

		// 打开 url
		ipcMain.on('jumpToUrl', (event, url: string) => {
			try {
				const parsedUrl = new URL(url);
				if (['https:', 'http:'].includes(parsedUrl.protocol)) {
					shell.openExternal(parsedUrl.toString());
				}
			} catch {}
		});

		// 打开文件
		ipcMain.on('openFile', (event, url: string) => {
			shell.openPath(url);
		});

		// 将包含多行路径的字符串归类为本地文件、本地目录、远程文件的数量统计，及每行的类型
		ipcMain.handle('getPathsCategorized', async (event, value: string) => {
			const paths = value.split('\n').map(cleanPathInput).filter((line) => line !== '');
			// const [localFiles, localDirs, remotes, unknowns] = [[], [], [], []] as string[][];
			let [localFilesCount, localDirsCount, remotesCount, unknownsCount] = [0, 0, 0, 0];
			const lineResults: ('lf' | 'ld' | 'r' | 'u')[] = [];
			for (const inputPath of paths) {
				const localPathCandidates = [inputPath];
				if (inputPath.toLowerCase().startsWith('file:')) {
					try {
						localPathCandidates.push(fileURLToPath(inputPath));
					} catch {}
				}
				let localPathHandled = false;
				for (const localPath of [...new Set(localPathCandidates)]) {
					try {
						const stats = await fs.lstat(localPath);
						if (stats.isDirectory()) {
							// localDirs.push(localPath);
							localDirsCount++;
							lineResults.push('ld');
						} else {
							// localFiles.push(localPath);
							localFilesCount++;
							lineResults.push('lf');
						}
						localPathHandled = true;
						break;
					} catch (e) {
						// Not a directly readable local path; continue below as a remote URL candidate.
					}
				}
				if (localPathHandled) {
					continue;
				}
				if (isLikelyLocalFilesystemPath(inputPath) && getFileExtension(inputPath)) {
					localFilesCount++;
					lineResults.push('lf');
					continue;
				}
				const result = parsePath(inputPath);
				if (result.parse_failed) {
					// unknowns.push(inputPath);
					unknownsCount++;
					lineResults.push('u');
				} else if (result.host) {
					// remotes.push(inputPath);
					remotesCount++;
					lineResults.push('r');
				} else {
					// unknowns.push(inputPath);
					unknownsCount++;
					lineResults.push('u');
				}
			}
			return { localFilesCount, localDirsCount, remotesCount, unknownsCount, lineResults };
		});

		/**
		 * 列出文件夹内的所有内容
		 * @params path 指定文件夹
		 * @params mode 'getFiles' | 'getDirectories'
		 * @params recursive 是否递归查找子文件夹
		 * @params fullPath 是否返回完整的绝对路径
		 */
		ipcMain.handle('listItemsInDirectory', async (event, options) => {
			async function dfs(basePath: string, recursive = false, fullPath = false) {
				const resultArr: Array<string> = [];
				const directoriesArr: Array<string> = [];
				const filesArr: Array<string> = [];
				const fnd = await fs.readdir(basePath);
				for (const fileName of fnd) {
					const filePath = path.join(basePath, fileName);
					const stats = await fs.stat(filePath);
					if (stats.isFile()) {
						filesArr.push(fullPath ? filePath : fileName);
					}
					if (stats.isDirectory()) {
						directoriesArr.push(fullPath ? filePath : fileName);
					}
				}
				if (options.mode === 'getFiles') {
					resultArr.push(...filesArr);
				}
				if (options.mode === 'getDirectories') {
					resultArr.push(...directoriesArr);
				}
				if (recursive) {
					for (const directory of directoriesArr) {
						const result = await dfs(fullPath ? directory : path.join(basePath, directory), recursive, fullPath);
						resultArr.push(...result.resultArr);
					}
					return { filesArr, directoriesArr, resultArr };
				}
				return {
					filesArr, // 当前文件夹下的所有文件
					directoriesArr, // 当前文件夹下的所有文件夹
					resultArr, // 依据选项查找的结果
				};
			}
	
			const stats = await fs.stat(options.path);
			if (stats.isFile()) {
				return undefined;
			}
			const result = await dfs(options.path, options.recursive, options.fullPath);
			return result.resultArr;
		});

		// 获取本地文件属性
		ipcMain.handle('getLocalFileStats', async (event, url: string) => {
			try {
				const stats = await fs.stat(url);
				if (!stats.isFile()) {
					// 理论上不应出现对非本地文件调用此方法的现象，此处是为了避免用户手动将文件改为文件夹之类的特殊情况
					return undefined;
				}
				// return { size: stats.size, mtimeMs: stats.mtimeMs };
				return stats;
			} catch (e) {
				return undefined;
			}
		});

		// 获取本地文件块
		ipcMain.handle('getLocalFileChunk', async (event, url: string, start: number, length: number) => {
			let fd: Awaited<ReturnType<typeof fs.open>> | undefined;
			try {
				fd = await fs.open(url, 'r');
				const buffer = new Uint8Array(length);
				await fd.read(buffer, 0, length, start);
				return buffer;
			} catch (e) {
				return undefined;
			} finally {
				await fd?.close().catch(() => {});
			}
		});

		// 闪烁任务栏图标
		ipcMain.on('flashFrame', (event, value) => {
			this.mainWindow!.flashFrame(value);
		});

		// 设置任务栏 / dock 进度状态
		ipcMain.on('setProgressBar', (event, progress: number, options: Electron.ProgressBarOptions | undefined) => {
			const mode = options?.mode || 'normal';
			const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
			if (mode === 'none') {
				this.mainWindow!.setProgressBar(-1, { mode: 'none' });
				this.mainWindow!.setTitle(APP_NAME);
				return;
			}
			this.mainWindow!.setProgressBar(safeProgress * 0.99 + 0.01, options);
			this.mainWindow!.setTitle(`${APP_NAME}${['normal', 'paused'].includes(mode) ? ` - ${(safeProgress * 100).toFixed(0)}%` : ''}`);
		});

		// 打开开发者工具
		ipcMain.on('openDevTools', () => {
			this.mainWindow!.webContents.openDevTools();
		});

		/**
		 * 启动文件下载流程：
		 * 渲染进程发出 downloadFile 调用，传入 url。此时主进程会调用主窗口的 downloadURL，将下载任务挂到主窗口的名义上，下载任务实际上还是主进程负责
		 * 此时 mainWindow 会触发 will-download 事件。
		 * 收到此事件后，主进程自动打开另存为对话框，记录该 url 对应的保存位置，自动下载到本地。这一切无需代码，只需要另写代码监听这个过程即可。
		 * 监听到下载开始后，主进程保存 url 与下载对象的 DownloadItem 关系，方便后续用 url 控制下载暂停或取消。同时，向渲染进程发送 downloadStatusChange 信号，告知主窗口改变 UI
		 * 下载过程持续向渲染进程发送 downloadProgress
		 * 下载完成后再次发送 downloadStatusChange 信号，告知主窗口改变 UI
		 */
		ipcMain.on('downloadFile', (_event, params: { url: string; sessionId: string; finalFileBaseName?: string; fileTime?: any }) => {
			console.log('发动下载请求：', params.url);
			const { finalFileBaseName, fileTime } = params;
			this.downloadMap.set(params.url, { finalFileBaseName, fileTime, sessionId: params.sessionId });
			this.mainWindow!.webContents.downloadURL(params.url);
		});

		ipcMain.on('downloadFiles', async (_event, params: { sessionId: string; files: { url: string; finalFileBaseName?: string; fileTime?: any }[] }) => {
			const result = await dialog.showOpenDialog(this.mainWindow, {
				title: `指定 ${params.files.length} 个下载文件的保存文件夹`,
				properties: ['openDirectory', 'createDirectory']
			});
			if (!result.canceled) {
				for (const file of params.files) {
					this.downloadMap.set(file.url, { finalFileBaseName: file.finalFileBaseName, fileTime: file.fileTime, dir: result.filePaths[0], sessionId: params.sessionId });
					this.mainWindow!.webContents.downloadURL(file.url);
				}
			}
		});

		// 启动一个 ffboxService，这个 ffboxService 目前钦定监听 localhost:33269，而 serviceBridge 会连接此 service
		ipcMain.handle('startService', () => this.createService());

		// osBridge 系列
		ipcMain.on('triggerSystemMenu', () => osBridge.triggerSystemMenu());
		ipcMain.on('triggerSnapLayout', () => osBridge.triggerSnapLayout());
		ipcMain.on('appReady', () => osBridge.sendLoadStatus('app'));
		ipcMain.on('rendererReady', () => osBridge.sendLoadStatus('renderer'));

		// 应用菜单更新
		ipcMain.on('setApplicationMenu', (event, menuStr: string) => {
			const menuTemplate = convertFFBoxMenuToElectronMenuTemplate(menuStr, this.mainWindow.webContents);
			if (process.platform === 'darwin') {
				menuTemplate.splice(1, 0, {
					label: i11n.frontend.applicationMenu.编辑,
					submenu: [
						{ role: 'undo', label: i11n.frontend.applicationMenu.撤销 },
						{ role: 'redo', label: i11n.frontend.applicationMenu.重做 },
						{ type: 'separator' },
						{ role: 'cut', label: i11n.frontend.applicationMenu.剪切 },
						{ role: 'copy', label: i11n.frontend.applicationMenu.复制 },
						{ role: 'paste', label: i11n.frontend.applicationMenu.粘贴 },
						{ role: 'delete', label: i11n.frontend.applicationMenu.删除 },
						{ role: 'selectall', label: i11n.frontend.applicationMenu.全选 },
					] as any
				});
			}
			const menu = Menu.buildFromTemplate(menuTemplate as any);
			Menu.setApplicationMenu(menu);	
		});

		// 打开“打开文件”对话框
		ipcMain.handle('showOpenDialog', async (event, options: Electron.OpenDialogOptions) => {
			const result = await dialog.showOpenDialog(this.mainWindow, options);
			return result.canceled ? [] : result.filePaths;
		});
		  
		// 读取 LICENSE 文件
		ipcMain.handle('readLicense', () => {
			return new Promise(async (resolve) => {
				let licensePath = '';
				if (getOs() === 'Windows') {
					licensePath = await this.firstReadable([
						path.join(path.dirname(process.execPath), 'LICENSE'),
						process.resourcesPath ? path.join(process.resourcesPath, '..', 'LICENSE') : '',
						path.join(process.cwd(), 'LICENSE'),
						path.join(app.getAppPath(), 'LICENSE'),
					]);
				} else if (getOs() === 'MacOS') {
					licensePath = path.join(process.resourcesPath, '../LICENSE');
				} else if (getOs() === 'Linux') {
					// this.mainWindow.webContents.send('debugMessage', 'service 路径', process.execPath, __dirname, __filename, process.cwd(), path.join(process.execPath, '../FFBoxService'));
					await fs.access('./LICENSE', fs.constants.R_OK).then((result) => {
						licensePath = './LICENSE'; // 通过终端直接执行
					}).catch(() => {});
					await fs.access(path.join(process.cwd(), 'LICENSE'), fs.constants.R_OK).then((result) => {
						licensePath = path.join(process.cwd(), 'LICENSE'); // 无沙箱双击执行、通过终端直接执行
					}).catch(() => {});	
					await fs.access(path.join(process.execPath, '../LICENSE'), fs.constants.R_OK).then((result) => {
						licensePath = path.join(process.execPath, '../LICENSE'); // AppImage 双击执行（/tmp 目录）、deb 安装后双击执行（/opt/FFBox/）
					});
				}		
				fs.readFile(licensePath, { encoding: 'utf-8' }).then((data) => {
					const cipherText = CryptoJS.SHA1(data);
					if (['03a87d14cad233d7f57d7e3642bc8f9665df48ed', 'ae08d78587d0e2e1584981291938abdf936ca3a6'].includes(cipherText.toString())) {
						// 两个校验码，适配 LF 换行符和 CRLF 换行符
						resolve(data);
					} else {
						resolve(undefined);
					}
				}).catch(() => {
					resolve(undefined);
				});
			});
		});

		// 获取机器码
		ipcMain.handle('getMachineId', async (event) => {
			return getMachineId();
		});

		// 代为请求
		ipcMain.handle('request', async (event, url: string, options?: { method?: string; body?: any; headers?: Record<string, string> }) => {
			const requestOptions: RequestInit = {
				method: options?.method || 'GET',
				// mode: 'cors', // 目前不需要跨域
				headers: options?.headers || {},
				body: options?.body,
			};
			const response = await fetch(url, requestOptions);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const responseData = await response.text();
			return {
				status: response.status,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
				data: responseData,
			};
		});

		// 代为启动程序
		ipcMain.on('spawn', async (event, url: string, params?: string[], options?: SpawnOptions) => {
			spawn(url, params || [], options).on('error', () => {});
		});		

		// 半透明窗体
		ipcMain.on('setBlurBehindWindow', (event, on: boolean) => {
			switch (getOs()) {
				case 'MacOS':
					this.mainWindow.setVibrancy(on ? 'window' : 'window');
					break;
				case 'Windows':
					// this.mainWindow.setBackgroundMaterial(on ? 'mica' : 'none');
					// this.mainWindow.setDarkTheme();
					// this.mainWindow.setMicaEffect();
					mica.setBlur(this.mainWindow, on);					
					break;
			}
		});

		// 原 electron-store 功能
		ipcMain.handle('localConfig', (event, type: 'get' | 'set' | 'delete', key: string, value?: any) => {
			if (type === 'get') {
				return localConfig.get(key);
			} else if (type === 'set') {
				return localConfig.set(key, value);
			} else {
				return localConfig.delete(key);
			}
		});
	}
}

new ElectronApp();
