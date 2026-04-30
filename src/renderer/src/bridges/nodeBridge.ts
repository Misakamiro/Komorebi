// import _ElectronStore from 'electron-store';
import { IpcRenderer } from 'electron';
import type { Stats } from 'fs';
import parsePath from 'parse-path';
import { getEnv } from '@common/utils';

const nodeBridge = {
	get env(): 'electron' | 'browser' {
		if (window.jsb) {
			return 'electron';
		} else {
			return 'browser';
		}
	},

	get localStorage() {
		return {
			get(key: string): Promise<any> {
				return new Promise((resolve) => {
					if (key.indexOf('.') > -1) {
						// 若存在多级则进行特殊处理
						const keys = key.split('.');
						const keyInLS = keys[0];
						let storedValue;
						try {
							// key 中的第一项指示需要从 localStorage 读出的字符串
							storedValue = JSON.parse(localStorage.getItem(keys.shift()));
						} catch (error) {}
						if (storedValue == undefined) {
							storedValue = {};
						}
						let obj = storedValue;
						// obj 指示最深一层对象，而非最深一层对象的值，因此保留 1 的深度
						while (keys.length > 1) {
							const currentKey = keys.shift();
							if (obj[currentKey] == undefined) {
								obj[currentKey] = {};
							}
							obj = obj[currentKey]; // 进入深一层
						}
						resolve(obj[keys.shift()]);
					} else {
						try {
							const value = JSON.parse(localStorage.getItem(key));
							resolve(value);
						} catch (error) {
							resolve(localStorage.getItem(key));
						}
						resolve(localStorage.getItem(key));
					}
				});
			},
			set(key: string, value: any) {
				return new Promise((resolve) => {
					if (key.indexOf('.') > -1) {
						// 若存在多级则进行特殊处理
						const keys = key.split('.');
						const keyInLS = keys[0];
						let storedValue;
						try {
							// key 中的第一项指示需要从 localStorage 读出的字符串
							storedValue = JSON.parse(localStorage.getItem(keys.shift()));
						} catch (error) {}
						if (storedValue == undefined) {
							storedValue = {};
						}
						let obj = storedValue;
						// obj 指示最深一层对象，而非最深一层对象的值，因此保留 1 的深度
						while (keys.length > 1) {
							const currentKey = keys.shift();
							if (obj[currentKey] == undefined) {
								obj[currentKey] = {};
							}
							obj = obj[currentKey]; // 进入深一层
						}
						obj[keys.shift()] = typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; // 对于对象，需先将其 Proxy 解开
						resolve(localStorage.setItem(keyInLS, JSON.stringify(storedValue)));
					} else {
						resolve(localStorage.setItem(key, JSON.stringify(value)))
					}
				});
			},
			delete(key: string) {
				return new Promise((resolve) => {
					if (key.indexOf('.') > -1) {
						// 若存在多级则进行特殊处理
						const keys = key.split('.');
						const keyInLS = keys[0];
						let storedValue;
						try {
							// key 中的第一项指示需要从 localStorage 读出的字符串
							storedValue = JSON.parse(localStorage.getItem(keys.shift()));
						} catch (error) {}
						if (storedValue == undefined) {
							storedValue = {};
						}
						let obj = storedValue;
						// obj 指示最深一层对象，而非最深一层对象的值，因此保留 1 的深度
						while (keys.length > 1) {
							const currentKey = keys.shift();
							if (obj[currentKey] == undefined) {
								obj[currentKey] = {};
							}
							obj = obj[currentKey]; // 进入深一层
						}
						delete obj[keys.shift()];
						resolve(localStorage.setItem(keyInLS, JSON.stringify(storedValue)));
					} else {
						resolve(localStorage.removeItem(key))
					}
				});
				return new Promise((resolve) => resolve(localStorage.removeItem(key)));
			},
		}
	},

	get ipcRenderer(): IpcRenderer | undefined {
		return window.jsb?.ipcRenderer as any;
	},

	// get spawn(): (...args: any) => ChildProcess | undefined {
	// 	return window.jsb?.spawn;
	// },

	// get exec(): (...args: any) => ChildProcess | undefined {
	// 	return window.jsb?.exec;
	// },

	get os(): 'Windows' | 'Linux' | 'MacOS' | 'Unix' | 'Android' | 'iPadOS' | 'iOS' | 'unknown' {
		// TODO this.isElectron 不可用
		if (this.isElectron) {
			// electron 环境
			let platform : NodeJS.Platform = process.platform
			switch (platform) {
				case 'win32':
					return 'Windows';
				case 'linux':
					return 'Linux';
				case 'darwin':
					return 'MacOS';
				default:
					return 'unknown';
			}
		} else {
			// web 环境（有新的 navigator.userAgentData 可以代替 platform）
			if (navigator.userAgent.match(/(Android)\s+([\d.]+)/)) {
				return 'Android';
			}
			if (navigator.userAgent.match(/(iPad).*OS\s([\d_]+)/)) {
				return 'iPadOS';
			}
			if (navigator.userAgent.match(/(iPhone\sOS)\s([\d_]+)/)) {
				return 'iOS';
			}
			if (navigator.platform.indexOf('Win') >= 0) {
				return 'Windows';
			}
			if (navigator.platform.indexOf('Mac') >= 0) {
				return 'MacOS';
			}
			if (navigator.platform.indexOf('Linux') >= 0) {
				return 'Linux';
			}
			if (navigator.platform.indexOf('X11') >= 0) {
				return 'Unix';
			}
			return 'unknown';
		}
	},

	jumpToUrl(url: string): void {
		if (window.jsb?.ipcRenderer) {
			window.jsb?.ipcRenderer.send('jumpToUrl', url);
		} else {
			window.open(url);
		}
	},

	openFile(url: string): void {
		if (window.jsb?.ipcRenderer) {
			window.jsb?.ipcRenderer.send('openFile', url);
		} else {
			window.open(url);
		}
	},

	/** 将包含多行路径的字符串归类为本地文件、本地目录、远程文件的数量统计，及每行的类型。若为 electron 环境则自动展开子目录，若为浏览器环境则将全部本地路径归类为本地文件 */
	getPathsCategorized(value: string): Promise<{ localFilesCount: number, localDirsCount: number, remotesCount: number, unknownsCount: number, lineResults: ('lf' | 'ld' | 'r' | 'u')[] }> {
		if (window.jsb) {
			return window.jsb?.ipcRenderer.invoke('getPathsCategorized', value);
		} else {
			const paths = value.split('\n').filter((line) => line !== '');
			// const [localFiles, localDirs, remotes, unknowns] = [[], [], [], []] as string[][];
			let [localFilesCount, localDirsCount, remotesCount, unknownsCount] = [0, 0, 0, 0];
			const lineResults: ('lf' | 'ld' | 'r' | 'u')[] = [];
			for (const path of paths) {
				const fixedPath = path.startsWith('\\\\') ? 'file://' + path.slice(2) : path;	// 由于 node 的 URL 在解析 Windows 网络共享路径时会出错，故手动修一下
				const result = parsePath(fixedPath);
				if (result.parse_failed) {
					// unknowns.push(path);
					unknownsCount++;
					lineResults.push('u');
				} else if (result.host) {
					// remotes.push(path);
					remotesCount++;
					lineResults.push('r');
				} else {
					localFilesCount++;
					lineResults.push('lf');
				}
			}
			return Promise.resolve({ localFilesCount, localDirsCount, remotesCount, unknownsCount, lineResults });
		}
	},

	getLocalFileStats(url: string): Promise<Stats> {
		return window.jsb?.ipcRenderer.invoke('getLocalFileStats', url);
	},

	getLocalFileChunk(url: string, start: number, length: number): Promise<Uint8Array> {
		return window.jsb?.ipcRenderer.invoke('getLocalFileChunk', url, start, length);
	},

	listItemsInDirectory(path: string, options?: { mode?: 'getFiles' | 'getDirectories', recursive?: boolean, fullPath?: boolean }): Promise<string[]> {
		return window.jsb?.ipcRenderer.invoke('listItemsInDirectory', { path, ...options });
	},

	flashFrame(value = true): void {
		window.jsb?.ipcRenderer?.send('flashFrame', value);
	},

	setProgressBar(progress: number, options: Electron.ProgressBarOptions | undefined): void {
		window.jsb?.ipcRenderer?.send('setProgressBar', progress, options);
	},

	openDevTools(): void {
		window.jsb?.ipcRenderer?.send('openDevTools');
	},

	startService(): Promise<void> {
		return window.jsb?.ipcRenderer?.invoke('startService');
	},

	setBlurBehindWindow(on = true): void {
		window.jsb?.ipcRenderer?.send('setBlurBehindWindow', on);
	},

	triggerSystemMenu(): void {
		window.jsb?.ipcRenderer?.send('triggerSystemMenu');
	},

	triggerSnapLayout(): void {
		window.jsb?.ipcRenderer?.send('triggerSnapLayout');
	},

	appReady(): void {
		window.jsb?.ipcRenderer?.send('appReady');
	},
	
	setApplicationMenu(menu: any): void {
		window.jsb?.ipcRenderer?.send('setApplicationMenu', JSON.stringify(menu));
	},

	showOpenDialog(options?: Electron.OpenDialogOptions): Promise<string[]> {
		return window.jsb?.ipcRenderer?.invoke('showOpenDialog', options);
	},

	zoomPage(type: 'in' | 'out' | 'reset') {
		if (window.jsb) {
			const webFrame = window.jsb.webFrame;
			const finalZoomLevel = type === 'reset' ? 0 : webFrame.zoomLevel + (type === 'in' ? 1 : -1);
			webFrame.setZoomLevel(finalZoomLevel);
		}
	},

	readLicense(): Promise<string | undefined> {
		return window.jsb?.ipcRenderer?.invoke('readLicense');
	},

	getMachineId(): Promise<string> {
		return window.jsb?.ipcRenderer?.invoke('getMachineId');
	},

	request(url: string, options?: { method?: string; body?: any; headers?: Record<string, string> }) {
		return window.jsb?.ipcRenderer?.invoke('request', url, options);
	},

	spawn(url: string, args?: string[], options?: any) {
		window.jsb?.ipcRenderer?.send('spawn', url, args, options);
	},

	localConfig: {
		get(key: string) { return window.jsb?.ipcRenderer?.invoke('localConfig', 'get', key) },
		set(key: string, value: any) { return window.jsb?.ipcRenderer?.invoke('localConfig', 'set', key, value) },	// value 必须是可序列化的，不可是 Proxy 等东西
		delete(key: string) { return window.jsb?.ipcRenderer?.invoke('localConfig', 'delete', key) },
	},
}

export default nodeBridge;
