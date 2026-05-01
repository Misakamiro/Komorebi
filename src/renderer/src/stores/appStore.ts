import { h, VNodeRef } from 'vue';
import { defineStore } from 'pinia';
import CryptoJS from 'crypto-js';
import { FFmpegCodecDetail, FFmpegDemuxerDetail, FFmpegFilterDetail, FFmpegMuxerDetail, NcmTaskParams, Notification, NotificationLevel, OutputParams, WorkingStatus } from '@common/types';
import { version } from '@common/constants'; 
import { Server } from '@renderer/types';
import { defaultParams } from "@common/defaultParams";
import { buildKomorebiAudioParams, buildKomorebiRemuxParams, buildKomorebiVideoParams, defaultKomorebiAudioPreset, defaultKomorebiRemuxPreset, defaultKomorebiVideoPreset, KomorebiAudioPreset, KomorebiMode, KomorebiRemuxPreset, KomorebiVideoPreset, KomorebiWorkflow, normalizeKomorebiVideoPreset } from '@common/komorebiPresets';
import { ServiceBridge, ServiceBridgeStatus } from '@renderer/bridges/serviceBridge'
import { LanguageCode, setLanguage } from '@common/i11n/i11n';
import { randomString, replaceOutputParams } from '@common/utils';
import { getMenuItemByValue } from '@common/menu';
import { allVcodecs, builtInVcodecs } from '@common/params/vcodecs';
import { allAcodecs, builtInAcodecs } from '@common/params/acodecs';
import { allMuxers, builtInMuxers } from '@common/params/formats';
import path from '@common/path';
import { parseFFmpegCodecsToCodecsList, parseFFmpegFiltersToFiltersList, parseFFmpegMuDeMuxersToList } from '@common/params/parser';
import { handleCmdUpdate, handleFFmpegInfo, handleProgressUpdate, handleTasklistUpdate, handleNotificationUpdate, handleTaskUpdate, handleWorkingStatusUpdate } from '@renderer/logic/eventsHandler';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { addUploadTask } from '../logic/transferManager2';
import { getLimitaion } from '../logic/limitaions';
import Popup from '@renderer/components/Popup/Popup';

const { trimExt } = path;

type KomorebiNcmPreset = NcmTaskParams & {
	rawInputs: string;
};

interface StoreState {
	// 鐣岄潰绫?
	showMenuCenter: 0 | 1 | 2; // 0锛氬叧闂€€1锛氬紑鍚彍鍗曟爮銆€2锛氬叏寮€
	showInfoCenter: boolean;
	showTransferCenter: boolean;
	showTaskInfo: [taskId: number, tab: 0 | 1 | 2, params?: any] | undefined;
	showDragFilesOverlay: boolean;
	paraSelected: number,
	komorebiMode: KomorebiMode;
	komorebi: {
		workflow: KomorebiWorkflow;
		video: KomorebiVideoPreset;
		audio: KomorebiAudioPreset;
		remux: KomorebiRemuxPreset;
		ncm: KomorebiNcmPreset;
	};
	draggerPos: number,
	taskViewSettings: {
		showParams: boolean,
		showDashboard: boolean,
		showCmd: boolean,
		cmdDisplay: 'input' | 'output',
		paramsVisibility: {
			duration: 'all' | 'input' | 'none',
			format: 'all' | 'input' | 'none',
			smpte: 'all' | 'input' | 'none',
			video: 'all' | 'input' | 'none',
			audio: 'all' | 'input' | 'none',
		},
	},
	frontendSettings: {
		// 鎵€鏈夊€奸兘鏄繀闇€棰勭疆榛樿鍊肩殑锛岃繖鏍峰湪鍒濆鍖栨椂浼氭妸娌℃湁淇濆瓨杩囩殑璁剧疆瀛樹竴閬?		colorTheme: string,
		colorTheme: string,
		colorThemeMode: 'light' | 'dark' | 'system',
		language: LanguageCode,
		useIEC: boolean,
		useVirtualTaskList: boolean,
	},
	unreadNotificationCount: number,
	componentRefs: { [key: string]: VNodeRef | Element },
	// 闈炵晫闈㈢被
	notifications: Notification[],
	servers: Server[];
	currentServerId: string;
	selectedTask: Set<number>,
	taskSelectionModified: boolean;	// 淇敼鍙傛暟鍚庢樉绀烘彁绀烘槸鍚﹀簲鐢ㄥ埌鎵€鏈変换鍔★紝鏇存敼 selectedTask 鏃跺幓闄ゆ樉绀?
	globalParams: OutputParams;
	presetName: string | undefined;
	availablePresets: string[];
	downloadMap: Map<string, string>;	// <url, serverId>
	latestVersion?: string;
	functionLevel: number;
	queueTogglePending: boolean;
}

// useStore 鍙互鏄?useUser銆乽seCart 涔嬬被鐨勪换浣曚笢瑗?// 绗竴涓弬鏁版槸搴旂敤绋嬪簭涓?store 鐨勫敮涓€ id
export const useAppStore = defineStore('app', {
	// other options...
	// 鎺ㄨ崘浣跨敤 瀹屾暣绫诲瀷鎺ㄦ柇鐨勭澶村嚱鏁?
	state: (): StoreState => {
		return {
			// 鎵€鏈夎繖浜涘睘鎬ч兘灏嗚嚜鍔ㄦ帹鏂叾绫诲瀷
			// 鐣岄潰绫?
			showMenuCenter: 0,
			showInfoCenter: false,
			showTransferCenter: false,
			showTaskInfo: undefined,
			showDragFilesOverlay: false,
			paraSelected: 1,
			komorebiMode: 'normal',
			komorebi: {
				workflow: 'video-compress',
				video: JSON.parse(JSON.stringify(defaultKomorebiVideoPreset)),
				audio: JSON.parse(JSON.stringify(defaultKomorebiAudioPreset)),
				remux: JSON.parse(JSON.stringify(defaultKomorebiRemuxPreset)),
				ncm: {
					rawInputs: '',
					inputs: [],
					outputDir: '',
					outputNameTemplate: '',
					recursive: true,
					deleteSource: false,
					targetFormat: 'auto',
					qualityMode: 'copy',
				},
			},
			draggerPos: 0.57,
			taskViewSettings: {
				showParams: true,
				showDashboard: true,
				showCmd: true,
				cmdDisplay: 'input',
				paramsVisibility: {
					duration: 'none',
					format: 'none',
					smpte: 'none',
					video: 'none',
					audio: 'none',
				},
			},
			frontendSettings: {
				colorTheme: 'themeLight',
				colorThemeMode: 'system',
				language: 'zh-CN',
				useIEC: false,
				useVirtualTaskList: true,
			},
			unreadNotificationCount: 0,
			componentRefs: {},
			// 闈炵晫闈㈢被
			notifications: [],
			servers: [],
			currentServerId: undefined,
			selectedTask: new Set(),
			taskSelectionModified: false,
			globalParams: JSON.parse(JSON.stringify(defaultParams)),
			presetName: '',
			availablePresets: [],
			downloadMap: new Map(),
			latestVersion: undefined,
			functionLevel: 100,
			queueTogglePending: false,
		};
	},
	getters: {
		currentServer: (state) => {
			return state.servers.find((server) => server.data.id === state.currentServerId);
		},
		localServer: (state) => {
			// app 鍒濆鍖栭€昏緫涓細閫氳繃璇嗗埆 nodeBridge.env 娣诲姞涓€涓?localhost 鏈嶅姟鍣ㄣ€傞櫎姝や互澶栨病鏈夋坊鍔?localhost 鐨勬笭閬?
			return state.servers.length && state.servers[0].entity.ip === 'localhost' ? state.servers[0] : undefined;
		},
	},
	actions: {
		// #region 浠诲姟澶勭悊
		/**
		 * 娣诲姞涓€绯诲垪浠诲姟銆備粎鏀寔鏈湴鏂囦欢鍜岃繙绋嬭矾寰勶紝鏈湴鏂囦欢澶归渶灞曞紑鍚庡啀浼犲叆锛屾湭鐭ヨ矾寰勪紶鍏ユ棤鏁?		 * Promise 鏈€缁堜細鍦ㄥ悗绔繑鍥炰换鍔℃洿鏂帮紙鎴?200ms 瓒呮椂锛夊悗锛屽苟灏?globalParams 鏇挎崲鍚?resolve
		 */
		addTasks (inputList: string[] | FileList, type: 'multiTask' | 'multiInput' = 'multiTask') {
			return new Promise(async (resolve) => {
				function allTimerFinish() {
					Promise.all(newlyAddedTaskIds).then((ids) => {
						// 浠?5.0 寮€濮嬶紝鐢变簬鏀寔澶氳緭鍏ワ紝addTask 鍑芥暟鍚戝悗绔紶鐨勬槸鏇挎崲浜嗘枃浠跺悕鐨?globalParams锛屽洜姝ら渶瑕?applySelectedTask 浣垮弬鏁板彉鎴愬綋鍓嶉€変腑鐨?task 鐨勫弬鏁帮紝鍚﹀垯涓嶄竴鑷?						// 闇€瑕佺瓑寰呬竴娆?taskUpdate锛屽緟鍙︿竴涓洃鍚櫒鏇挎崲浜嗕换鍔″弬鏁颁箣鍚庯紝鍐嶅湪姝ゅ applySelectedTask锛屽惁鍒欎細瀵艰嚧鍙傛暟涓虹┖
						// 鐢变簬缃戠粶鍒拌揪椤哄簭鐨勪笉纭畾鎬э紝Promise 瀹屾垚鏃跺彲鑳芥墍鏈変换鍔￠兘瀹屾垚浜?taskUpdate锛屾鏃跺啀鍔犵洃鍚櫒鍒欐棤娉曡Е鍙戙€傚洜姝ら渶瑕佸姞涓€涓?timeout 鍋氬厹搴?
						const handler = () => {
							clearTimeout(timer);
							server.entity.off('taskUpdate', handler);
							这.selectedTask = new Set(ids);
							这.applySelectedTask();
							resolve(ids);
						};
						const timer = setTimeout(handler, 200);
						server.entity.on('taskUpdate', handler);
					});
				}
	
				const 这 = useAppStore();
				const server = 这.currentServer;
				const isRemoteService = server.entity.ip !== 'localhost';
				const newlyAddedTaskIds: Promise<number>[] = [];	// 鑰冭檻鍒?timer 鐨勬渶鍚庝竴椤瑰苟涓嶄竴瀹氭槸缃戠粶鍒拌揪鐨勬渶鍚庝竴椤癸紝杩欓噷浣跨敤 Promise銆傚緟鍚庢湡杩滅▼璋冪敤鎵归噺鍖栧悗鍙敼
				let dropDelayCount = 0;

				if (type === 'multiTask') {
					let needStopCuzLimit = false;	// 鍥犱负浣跨敤浜?setTimeout锛屾墍浠ヤ娇鐢ㄦ爣璁颁綅鍋滄鍚庣画娣诲姞
					for (const input of inputList) {
						setTimeout(async () => {	// v2.4 鐗堟湰寮€濮嬪畬鍏ㄥ彲浠ヤ笉瑕佸欢鏃讹紝浣嗘槸澶敓纭紝鎵€浠ュ姞涓姩鐢?
							if (needStopCuzLimit) {
								return;
							}
							const fileBaseName = typeof input === 'string' ? path.parse(input.replaceAll('\\', '/')).base : input.name;
							const fileType = typeof input === 'string' ? (await nodeBridge.getPathsCategorized(input)).lineResults?.[0] : 'lf';
							const needUpload = fileType === 'lf' && isRemoteService;	// 缃戦〉鐗堝繀瀹氭槸 remoteService锛涘鏋滄嫋鍏ョ殑鏄枃浠惰€屼笉鏄瓧绗︿覆閭ｄ箞蹇呭畾鏄?lf锛堜互鍚庡啀鏀寔鏂囦欢澶规嫋鍏ワ級
							// console.log('娣诲姞浠诲姟', input, fileType);
							if (needUpload) {
								const limitedFileSizeGB = getLimitaion('maxUploadSizeGB');
								const fileSize = typeof input === 'string' ? (await nodeBridge.getLocalFileStats(input)).size : input.size;
								if (fileSize > limitedFileSizeGB * 1000 * 1000 * 1000) {
									Popup({
										message: `${fileBaseName} 文件大小超过 ${limitedFileSizeGB} GB，暂不支持上传操作`,
										level: 2,
									});
									return;
								}
							}
							const inputName = `[uploading] ${fileBaseName}`
							let promise: Promise<number> = 这.addTask(
								trimExt(fileBaseName),
								[needUpload ? inputName : (typeof input === 'string' ? input : input.path)]
							);	// 缃戦〉鐗堟嫋鍏ユ枃浠跺繀瀹氫笂浼狅紝electron 鐗堟嫋鍏ユ枃浠跺垯鐩存帴浠ヨ矾寰勮緭鍏?
							if (needUpload) {
								// addTask 鍚庯紝鍚庣閫氳繃鍙戦€佷竴涓?tasklistUpdate 鏉ヤ娇鍓嶇鏇存柊浠诲姟鍒楄〃锛岀劧鍚?resolve 鎺?addTask 璇锋眰銆傜敱浜庝笂浼犺繃绋嬪苟涓嶄細璁块棶 task锛屾晠鍝€曠綉缁滃埌杈鹃『搴忎笉瀵癸紝杩欓噷涔熶笉浼氬嚭閿?
								promise.then(async (taskId) => {
									const file = await addUploadTask(server as any, input, taskId, fileBaseName, inputName);
									server.data.uploadFiles.push(file);
								});
							}
							newlyAddedTaskIds.push(promise);
							if (newlyAddedTaskIds.length === inputList.length) {
								allTimerFinish();
							}
						}, dropDelayCount);
						// console.log(dropDelayCount)
						dropDelayCount += 66.67;
					}
				} else if (type === 'multiInput') {
					/**
					 * 鏈湴锛氭棤闇€涓婁紶锛屽瓧绗︿覆鍘熸牱浼犲叆锛孎ile 璇诲彇 .path
					 * 杩滅▼锛氬瓧绗︿覆鍒ゆ柇鏄枃浠讹紙闈炴枃浠跺す锛夊悗鐢熸垚 inputName 鍗犱綅绗﹀悗涓婁紶锛屾枃浠剁洿鎺ヤ笂浼狅紙涓㈡枃浠跺す浼氬け璐ワ級
					 */
					// 鍏堟坊鍔犲崰浣嶇浠诲姟锛岀劧鍚庢鏌ヤ笂浼?
					const firstFileBaseName = typeof inputList[0] === 'string' ? path.parse(inputList[0])?.name : inputList[0]?.name;
					const taskId = await 这.addTask(
						firstFileBaseName ? trimExt(firstFileBaseName) : `鏂颁换鍔?${new Date().toISOString()}`,
						[]
					);
					newlyAddedTaskIds.push(Promise.resolve(taskId));

					const inputPaths: string[] = [];
					for (const input of inputList) {
						const fileBaseName = typeof input === 'string' ? path.parse(input.replaceAll('\\', '/')).base : input.name;
						const fileType = typeof input === 'string' ? (await nodeBridge.getPathsCategorized(input)).lineResults?.[0] : 'lf';
						const needUpload = fileType === 'lf' && isRemoteService;	// 缃戦〉鐗堝繀瀹氭槸 remoteService锛涘鏋滄嫋鍏ョ殑鏄枃浠惰€屼笉鏄瓧绗︿覆閭ｄ箞蹇呭畾鏄?lf锛堜互鍚庡啀鏀寔鏂囦欢澶规嫋鍏ワ級
						// console.log('娣诲姞浠诲姟', input, fileType);
						if (needUpload) {
							const limitedFileSizeGB = getLimitaion('maxUploadSizeGB');
							const fileSize = typeof input === 'string' ? (await nodeBridge.getLocalFileStats(input)).size : input.size;
							if (fileSize > limitedFileSizeGB * 1000 * 1000 * 1000) {
								Popup({
									message: `${fileBaseName} 文件大小超过 ${limitedFileSizeGB} GB，暂不支持上传操作`,
									level: 2,
								});
								continue;
							}
						}
						if (needUpload) {
							const inputName = `[uploading] ${fileBaseName}`
							const file = await addUploadTask(server as any, input, taskId, fileBaseName, inputName);
							server.data.uploadFiles.push(file);
							inputPaths.push(inputName);
						} else {
							inputPaths.push(typeof input === 'string' ? input : input.path);
						}
						// inputPaths.push(input);
						// inputPaths.push(input.path);
					}

					// 瀹屾垚浠诲姟娣诲姞鍚庯紝璁剧疆杈撳叆鍒楄〃
					const entity = 这.currentServer?.entity;
					const params = 这.buildKomorebiParamsForInputs(inputPaths) || 这.globalParams;
					entity.setParameters([taskId], [{
						...params,
						input: {
							files: inputPaths.map((path, index) => ({
								filePath: path.replace(/\\/g, '/'),
								demuxer: params.input.files[index]?.demuxer ?? '鑷姩',
								begin: params.input.files[index]?.begin ?? '',
								end: params.input.files[index]?.end ?? '',
								hwaccel: params.input.files[index]?.hwaccel ?? '鑷姩',
								realtime: params.input.files[index]?.realtime ?? false,
								detail: params.input.files[index]?.detail ?? {},
								custom: params.input.files[index]?.custom ?? '',
							})),
						},
					}]);
					allTimerFinish();
				}
			});
		},
		/**
		 * 娣诲姞浠诲姟
		 * path 灏嗚嚜鍔ㄦ坊鍔犲埌 params 涓幓
		 * @param path 杈撳叆鏂囦欢鐨勮矾寰勩€傝嫢涓鸿繙绋嬩换鍔″垯闇€瀹氫箟涓€涓崰浣嶇锛屽畬鎴愪笂浼犲悗閫氳繃 service.mergeUploaded 淇鏂囦欢鍚?		 */
		addTask(fileName: string, paths: string[]): Promise<number> {
			const 这 = useAppStore();
			const currentBridge = 这.currentServer?.entity;
			if (!currentBridge) {
				return;
			}
			const params: OutputParams = JSON.parse(JSON.stringify(这.buildKomorebiParamsForInputs(paths) || 这.globalParams));
			params.input.files = paths.map((path, index) => ({
				filePath: path ? path.replace(/\\/g, '/') : undefined,
				demuxer: params.input.files[index]?.demuxer ?? '鑷姩',
				begin: params.input.files[index]?.begin ?? '',
				end: params.input.files[index]?.end ?? '',
				hwaccel: params.input.files[index]?.hwaccel ?? '鑷姩',
				realtime: params.input.files[index]?.realtime ?? false,
				detail: params.input.files[index]?.detail ?? {},
				custom: params.input.files[index]?.custom ?? '',
			}));
			const result = currentBridge.taskAdd(fileName, params);
			return result;
		},
		getKomorebiCurrentInputPaths(): string[] {
			const store = useAppStore();
			const selectedId = [...store.selectedTask][0];
			const sourceParams = selectedId !== undefined
				? store.currentServer?.data.tasks[selectedId]?.after
				: store.globalParams;
			return (sourceParams?.input.files || [])
				.map((file) => file.filePath)
				.filter((filePath) => filePath && !filePath.startsWith('[')) as string[];
		},
		buildKomorebiCurrentParams(): OutputParams | undefined {
			const store = useAppStore();
			const inputs = store.getKomorebiCurrentInputPaths();
			return store.buildKomorebiParamsForInputs(inputs);
		},
		buildKomorebiParamsForInputs(inputs: string[]): OutputParams | undefined {
			const store = useAppStore();
			if (store.komorebi.workflow === 'video-compress') {
				const normalized = normalizeKomorebiVideoPreset(store.komorebi.video);
				if (normalized.codec !== store.komorebi.video.codec) {
					store.komorebi.video.codec = normalized.codec;
					Popup({ message: '当前封装与视频编码不兼容，已自动修正为更稳定的编码组合。', level: NotificationLevel.warning });
				}
				return buildKomorebiVideoParams(inputs, store.komorebi.video);
			}
			if (store.komorebi.workflow === 'audio-convert') {
				return buildKomorebiAudioParams(inputs, store.komorebi.audio);
			}
			if (store.komorebi.workflow === 'remux') {
				return buildKomorebiRemuxParams(inputs, store.komorebi.remux);
			}
			return undefined;
		},
		applyKomorebiNormalPreset(target: 'global' | 'selected' = 'selected') {
			const store = useAppStore();
			const selectedIds = [...store.selectedTask];
			if (target === 'selected' && !selectedIds.length && store.komorebi.workflow !== 'ncm') {
				Popup({ message: '请先选中任务，或使用“设为全局参数”。', level: NotificationLevel.warning });
				return;
			}
			if ([...store.selectedTask].some((id) => store.currentServer?.data.tasks[id]?.kind === 'ncm') && store.komorebi.workflow !== 'ncm') {
				Popup({ message: 'NCM 任务不能应用 FFmpeg 预设。', level: NotificationLevel.warning });
				return;
			}
			const params = store.buildKomorebiCurrentParams();
			if (!params) {
				store.addNcmTasks();
				return;
			}
			if (target === 'global') {
				store.globalParams = params;
				store.taskSelectionModified = false;
				nodeBridge.localStorage.set('globalParams', store.globalParams);
				Popup({ message: '已将 Komorebi 预设设为全局参数。', level: NotificationLevel.ok });
				return;
			}
			if (store.currentServer?.data) {
				const ids = selectedIds;
				const paramsList = ids.map((id) => {
					const inputs = (store.currentServer.data.tasks[id]?.after.input.files || [])
						.map((file) => file.filePath)
						.filter((filePath) => filePath && !filePath.startsWith('[')) as string[];
					return store.buildKomorebiParamsForInputs(inputs);
				}).filter(Boolean) as OutputParams[];
				if (paramsList.length === ids.length) {
					ids.forEach((id, index) => {
						store.currentServer.data.tasks[id].after = paramsList[index];
					});
					store.currentServer.entity.setParameters(ids, paramsList);
					store.taskSelectionModified = true;
					Popup({ message: '已将 Komorebi 预设应用到选中任务。', level: NotificationLevel.ok });
					return;
				}
			}
			Popup({ message: '没有可更新的选中任务。', level: NotificationLevel.warning });
		},
		getCurrentNcmParams(inputs: string[] = []): NcmTaskParams {
			const store = useAppStore();
			return {
				inputs,
				outputDir: store.komorebi.ncm.outputDir,
				outputNameTemplate: store.komorebi.ncm.outputNameTemplate,
				recursive: store.komorebi.ncm.recursive,
				deleteSource: store.komorebi.ncm.deleteSource,
				targetFormat: store.komorebi.ncm.targetFormat,
				qualityMode: store.komorebi.ncm.qualityMode,
			};
		},
		async expandNcmInputs(rawInputs: Array<string | File>): Promise<string[]> {
			const store = useAppStore();
			const inputs = rawInputs
				.map((input: any) => typeof input === 'string' ? input : input.path)
				.map((input) => (input || '').trim())
				.filter(Boolean);
			const expanded: string[] = [];
			const categorized = await nodeBridge.getPathsCategorized(inputs.join('\n'));
			for (let i = 0; i < inputs.length; i++) {
				if (categorized.lineResults[i] === 'ld') {
					const files = await nodeBridge.listItemsInDirectory(inputs[i], { mode: 'getFiles', recursive: store.komorebi.ncm.recursive, fullPath: true });
					expanded.push(...files.filter((file) => file.toLowerCase().endsWith('.ncm')));
				} else if (inputs[i].toLowerCase().endsWith('.ncm')) {
					expanded.push(inputs[i]);
				}
			}
			return [...new Set(expanded)];
		},
		async applyKomorebiNcmPreset(target: 'global' | 'selected' = 'selected'): Promise<void> {
			const store = useAppStore();
			if (target === 'global') {
				await nodeBridge.localStorage.set('komorebi.ncm', store.getCurrentNcmParams());
				Popup({ message: '已将 NCM 参数设为全局参数，之后拖入的 NCM 会使用这套设置。', level: NotificationLevel.ok });
				return;
			}
			const ids = [...store.selectedTask].filter((id) => store.currentServer?.data.tasks[id]?.kind === 'ncm');
			if (!ids.length) {
				Popup({ message: '请先选中 NCM 任务。', level: NotificationLevel.warning });
				return;
			}
			const bridge = store.currentServer?.entity;
			if (!bridge) {
				Popup({ message: '请先连接本地服务。', level: NotificationLevel.warning });
				return;
			}
			const params = store.getCurrentNcmParams();
			await bridge.setNcmParameters(ids, params);
			ids.forEach((id) => {
				const task = store.currentServer?.data.tasks[id];
				if (task?.ncm) {
					task.ncm = { ...task.ncm, ...params, inputs: task.ncm.inputs };
				}
			});
			Popup({ message: '已将 NCM 参数应用到选中任务。', level: NotificationLevel.ok });
		},
		async addNcmTasks(): Promise<number | undefined> {
			const store = useAppStore();
			const currentBridge = store.currentServer?.entity;
			if (!currentBridge) {
				Popup({ message: '请先连接本地服务。', level: NotificationLevel.warning });
				return;
			}
			if (currentBridge.ip !== 'localhost') {
				Popup({ message: 'NCM 转换只支持本地桌面服务。', level: NotificationLevel.warning });
				return;
			}
			const inputs = store.komorebi.ncm.rawInputs
				.split(/\r?\n/)
				.map((input) => input.trim())
				.filter(Boolean);
			if (!inputs.length) {
				Popup({ message: '请先添加 .ncm 文件或文件夹。', level: NotificationLevel.warning });
				return;
			}
			if (store.komorebi.ncm.deleteSource) {
				const confirmed = window.confirm('确认在 NCM 转换成功后删除源文件？此操作不可撤销。');
				if (!confirmed) {
					return;
				}
			}
			const expandedInputs = await store.expandNcmInputs(inputs);
			if (!expandedInputs.length) {
				Popup({ message: '没有找到 .ncm 文件。', level: NotificationLevel.warning });
				return;
			}
			const taskIds: number[] = [];
			for (const input of expandedInputs) {
				const taskId = await currentBridge.taskAddNcm(store.getCurrentNcmParams([input]));
				if (typeof taskId === 'number' && taskId >= 0) {
					taskIds.push(taskId);
				}
			}
			if (taskIds.length) {
				store.selectedTask = new Set(taskIds);
				Popup({ message: `已添加 ${taskIds.length} 个 NCM 转换任务`, level: NotificationLevel.ok });
			}
			return taskIds[0];
		},
		async addNcmTasksFromInputs(rawInputs: Array<string | File>): Promise<number | undefined> {
			const store = useAppStore();
			const currentBridge = store.currentServer?.entity;
			if (!currentBridge) {
				Popup({ message: '请先连接本地服务。', level: NotificationLevel.warning });
				return;
			}
			const inputs = await store.expandNcmInputs(rawInputs);
			if (!inputs.length) {
				Popup({ message: '没有找到 .ncm 文件。', level: NotificationLevel.warning });
				return;
			}
			if (store.komorebi.ncm.deleteSource) {
				const confirmed = window.confirm('确认在 NCM 转换成功后删除源文件？此操作不可撤销。');
				if (!confirmed) {
					return;
				}
			}
			const taskIds: number[] = [];
			for (const input of inputs) {
				const taskId = await currentBridge.taskAddNcm(store.getCurrentNcmParams([input]));
				if (typeof taskId === 'number' && taskId >= 0) {
					taskIds.push(taskId);
				}
			}
			store.selectedTask = new Set(taskIds);
			Popup({ message: `已添加 ${taskIds.length} 个 NCM 转换任务`, level: NotificationLevel.ok });
			return taskIds[0];
		},
		/**
		 * 鑾峰彇 service 鐨?taskList 鏇存柊鍒版湰鍦?		 */
		updateTaskList(server: Server) {
			const 这 = useAppStore();
			server.entity.getTaskList().then((content) => {
				handleTasklistUpdate(server, content);
				这.recalcChangedParams();
			});
		},
		/**
		 * 鑾峰彇 service 鐨?task 鏇存柊鍒版湰鍦?		 */
		updateTask(server: Server, taskId: number) {
			const 这 = useAppStore();
			server.entity.getTask(taskId).then((content) => {
				handleTaskUpdate(server, taskId, content);
				这.recalcChangedParams();
			});
		},
		/**
		 * 妫€鏌ユ瘡涓换鍔＄殑涓婁紶鐘舵€侊紝璋冪敤 entity.deleteTask
		 * @param taskIds 
		 */
		deleteTasks(taskIds: number[]) {
			const 这 = useAppStore();
			for (const taskId of taskIds) {
				const uploadFiles = 这.currentServer.data.uploadFiles.filter((uploadFile) => uploadFile.taskId === taskId)
				for (const uploadFile of uploadFiles) {
					// 瀵逛簬姝ｅ湪璇诲彇鏍￠獙鐨勪换鍔?
					uploadFile.readTask?.stop();	// 涓嶄竴瀹氭湁锛屾瘮濡備笂浼犲畬鎴?
					// 瀵逛簬姝ｅ湪涓婁紶鐨勪换鍔?
					const uploadingChunks = uploadFile.chunks.filter((chunk) => chunk.status === 'uploading'); 
					uploadingChunks.forEach((chunk) => chunk.abortController.abort());
				}
				这.currentServer.entity.taskDelete(taskId);
			}
		},
		/**
		 * 淇敼宸查€変换鍔￠」鍚庤皟鐢?		 * 鍑芥暟灏嗕娇鐢ㄥ凡閫夋嫨鐨勪换鍔￠」鏇挎崲 globalParameters
		 */
		applySelectedTask() {
			const 这 = useAppStore();
			if (这.selectedTask.size > 0) {
				for (const id of 这.selectedTask) {
					这.globalParams = replaceOutputParams(这.currentServer.data.tasks[id].after, 这.globalParams, true);
				}
			}
			这.globalParams.extra.presetName = '';
			这.presetName = '';
		},
		startNpause () {
			const 这 = useAppStore();
			if (这.queueTogglePending || !这.currentServer || 这.currentServer.entity.status !== ServiceBridgeStatus.Connected) {
				return;
			}
			const data = 这.currentServer.data;
			const entity = 这.currentServer.entity;
			这.queueTogglePending = true;
			const operation = data.workingStatus === WorkingStatus.idle
				? entity.queueStart()
				: entity.queuePause();
			operation.catch((error) => {
				console.warn('Queue toggle failed', error);
				Popup({ message: '队列状态切换失败，请稍后再试。', level: NotificationLevel.warning });
			}).finally(() => {
				setTimeout(() => {
					这.queueTogglePending = false;
				}, 250);
			});
		},
		// #endregion 浠诲姟澶勭悊
		// #region 鍙傛暟澶勭悊
		/**
		 * 淇敼 globalParams 鍚庨渶璋冪敤姝ゅ嚱鏁?		 * 鍑芥暟灏嗕慨鏀瑰悗鐨勫叏灞€鍙傛暟搴旂敤鍒板綋鍓嶉€夋嫨鐨勪换鍔￠」锛岀劧鍚庝繚瀛樺埌鏈湴纾佺洏
		 * 瀵逛簬鐢ㄦ埛鎿嶄綔锛屽皢棰勮鍙傛暟缃负鏈繚瀛?		 */
		applyParameters(behavior: 'modifyTask' | 'applyToAllTasks' | 'loadPreset' | 'verifyDefaults' = 'modifyTask', selection?: Set<number>) {
			const 这 = useAppStore();
			// 鏇存敼鍒颁竴浜涗笉鍖归厤鐨勫€煎悗浼氬鑷?getFFmpegParaArray 鍑洪敊锛屼絾鏄慨姝ｄ唬鐮佸氨鍦ㄥ悗闈紝鍥犳浠呴渶蹇界暐瀹冿紝璁╁畠缁х画杩愯涓嬪幓锛屼笉瑕佹€ョ潃鏇存柊

			// 鍙樻洿棰勮鍙傛暟
			if (behavior === 'modifyTask') {
				这.globalParams.extra.presetName = '';
				这.presetName = '';
			}

			const entity = 这.currentServer?.entity;
			const data = 这.currentServer?.data;
			if (data) {
				// 这.globalParams
				// 鏀堕泦闇€瑕佹壒閲忔洿鏂扮殑杈撳嚭鍙傛暟锛屼氦缁?service銆傚悓鏃舵湰鍦版浛鎹竴娆?task.after
				let needToUpdateIds: number[] = [];
				let needToUpdateParams: OutputParams[] = [];
				for (const id of selection || 这.selectedTask) {
					let task = data.tasks[id];
					const needToReplaceAll = behavior === 'modifyTask' && 这.selectedTask.size === 1;
					task.after = replaceOutputParams(这.globalParams, task.after, needToReplaceAll);
					needToUpdateIds.push(id);
					needToUpdateParams.push(task.after);
				}
				if (needToUpdateIds.length) {
					// paraArray 鐢?service 绠楀嚭鍚庡洖濉湰鍦?					// 鏇存柊鏂瑰紡鏄?taskUpdate
					// 娉ㄦ剰鍥炲～鏈湴鏃朵篃浼氫骇鐢熶竴娆?task.after 鏇存柊
					entity.setParameters(needToUpdateIds, needToUpdateParams);
				}

				这.taskSelectionModified = true;
			}

			// 瀛樼洏
			clearTimeout((window as any).saveAllParaTimer);
			(window as any).saveAllParaTimer = setTimeout(() => {
				nodeBridge.localStorage.set('globalParams', 这.globalParams);
				console.log('Parameters saved');
			}, 700);
		},
		/**
		 * 鍒囨崲缂栫爜鍣ㄤ箣鍚庢垨鑰呯涓€娆′娇鐢?FFBox 闇€瑕侀缃竴浜涢粯璁ゅ€硷紝閫氳繃璋冪敤姝ゅ嚱鏁拌繘琛?		 * 骞朵細璋冪敤涓€娆?applyParameters 浠ュ瓨鍌ㄥ苟灏嗗綋鍓嶉厤缃簲鐢ㄥ埌鎵€閫変换鍔′笂
		 */
		checkAndApplyCodecDefaults(who: { video?: true, audio?: true, mux?: true }, outputIndex = 0) {
			const 这 = useAppStore();
			if (who.video) {
				const v = 这.globalParams.outputs[outputIndex].video;
				const vcodec = getMenuItemByValue(builtInVcodecs, v.vcodec) ?? getMenuItemByValue(allVcodecs, v.vcodec)
				for (const parameter of ((vcodec as any)?.extra?.parameters || [])) {
					if (parameter.optional) {
						continue;	// 榛樿涓嶅惎鐢ㄥ彲閫夊弬鏁般€傚湪鍕鹃€夊悗鎵嶈鍙栭粯璁ゅ€?
					}
					if (parameter.mode === 'combo') {
						const defaultValue = parameter.default ?? parameter.items[0].value;
						console.log(`鍙傛暟 ${parameter.parameter} 閲嶇疆涓洪粯璁ゅ€兼垨棣栭」锛?{defaultValue}`);
						v.detail[parameter.parameter] = defaultValue;
					} else if (parameter.mode == 'slider') {
						const defaultValue = parameter.default ?? ((parameter.max ?? 1) + (parameter.min ?? 0)) / 2;
						console.log(`鍙傛暟 ${parameter.parameter} 閲嶇疆涓洪粯璁ゅ€兼垨涓棿鍊硷細${defaultValue}`);	// 鍋囧畾鎵€鏈?string 绫荤殑 slider 閮藉繀椤诲畾涔?default
						v.detail[parameter.parameter] = defaultValue;
					}
				}
			}
			if (who.audio) {
				const a = 这.globalParams.outputs[outputIndex].audio;
				const acodec = getMenuItemByValue(builtInAcodecs, a.acodec) ?? getMenuItemByValue(allAcodecs, a.acodec)
				for (const parameter of ((acodec as any)?.extra?.parameters || [])) {
					if (parameter.optional) {
						continue;	// 榛樿涓嶅惎鐢ㄥ彲閫夊弬鏁般€傚湪鍕鹃€夊悗鎵嶈鍙栭粯璁ゅ€?
					}
					if (parameter.mode === 'combo') {
						const defaultValue = parameter.default ?? parameter.items[0].value;
						console.log(`鍙傛暟 ${parameter.parameter} 閲嶇疆涓洪粯璁ゅ€兼垨棣栭」锛?{defaultValue}`);
						a.detail[parameter.parameter] = defaultValue;
					} else if (parameter.mode == 'slider') {
						const defaultValue = parameter.default ?? ((parameter.max ?? 1) + (parameter.min ?? 0)) / 2;
						console.log(`鍙傛暟 ${parameter.parameter} 閲嶇疆涓洪粯璁ゅ€兼垨涓棿鍊硷細${defaultValue}`);	// 鍋囧畾鎵€鏈?string 绫荤殑 slider 閮藉繀椤诲畾涔?default
						a.detail[parameter.parameter] = defaultValue;
					}
				}
			}
			if (who.mux) {
				const m = 这.globalParams.outputs[outputIndex].mux;
				const muxer = getMenuItemByValue(builtInMuxers, m.format) ?? getMenuItemByValue(allMuxers, m.format)
				for (const parameter of ((muxer as any)?.extra?.parameters || [])) {
					if (parameter.optional) {
						continue;	// 榛樿涓嶅惎鐢ㄥ彲閫夊弬鏁般€傚湪鍕鹃€夊悗鎵嶈鍙栭粯璁ゅ€?
					}
					if (parameter.mode === 'combo') {
						const defaultValue = parameter.default ?? parameter.items[0].value;
						console.log(`鍙傛暟 ${parameter.parameter} 閲嶇疆涓洪粯璁ゅ€兼垨棣栭」锛?{defaultValue}`);
						m.detail[parameter.parameter] = defaultValue;
					} else if (parameter.mode == 'slider') {
						const defaultValue = parameter.default ?? ((parameter.max ?? 1) + (parameter.min ?? 0)) / 2;
						console.log(`鍙傛暟 ${parameter.parameter} 閲嶇疆涓洪粯璁ゅ€兼垨涓棿鍊硷細${defaultValue}`);	// 鍋囧畾鎵€鏈?string 绫荤殑 slider 閮藉繀椤诲畾涔?default
						m.detail[parameter.parameter] = defaultValue;
					}
				}
			}
			这.applyParameters('verifyDefaults');
		},
		/**
		 * 妫€鏌ユ湁澶氬皯鍙傛暟鏄潪鈥滀笉閲嶆柊缂栫爜鈥濈殑锛屼互姝ゆ洿鏀圭晫闈㈡樉绀哄舰寮忥紙paramsVisibility锛?		 * 鍦ㄦ湇鍔″櫒鍒濇鍔犺浇鍜屼慨鏀瑰弬鏁版椂璋冪敤
		 * 鐩墠鍧囦互绗竴涓緭鍏ュ拰绗竴涓緭鍑虹殑鍙傛暟涓哄噯
		 */
		recalcChangedParams() {
			const 这 = useAppStore();
			const paramsVisibility = {
				duration: 0,
				format: 0,
				smpte: 0,
				video: 0,
				audio: 0,
			};
			for (const [index, task] of Object.entries(这.currentServer?.data.tasks) || []) {
				if (index === '-1' || task.after.input.files.length !== 1 || task.after.outputs.length !== 1) {
					continue;
				}
				const after = task.after;
				if (after.input.files[0].begin || after.input.files[0].end || after.outputs[0].mux.begin || after.outputs[0].mux.end) {
					paramsVisibility.duration = Math.max(paramsVisibility.duration, 2);
				} else {
					paramsVisibility.duration = Math.max(paramsVisibility.duration, 1);
				}
				if (after.outputs[0].mux.format === '无' || after.outputs[0].mux.format === task.before[0]?.demuxer) {
					paramsVisibility.format = Math.max(paramsVisibility.format, 1);
				} else {
					paramsVisibility.format = Math.max(paramsVisibility.format, 2);
				}
				if (after.outputs[0].video.vcodec !== '禁用视频') {
					if (after.outputs[0].video.vcodec !== '不重新编码') {
						paramsVisibility.video = Math.max(paramsVisibility.video, 2);
						if (after.outputs[0].video.resolution !== '不改变' || task.after.outputs[0].video.framerate !== '不改变') {
							paramsVisibility.smpte = Math.max(paramsVisibility.smpte, 2);
						} else {
							paramsVisibility.smpte = Math.max(paramsVisibility.smpte, 1);
						}
					} else {
						paramsVisibility.video = Math.max(paramsVisibility.video, 1);
					}
				}
				if (after.outputs[0].audio.acodec !== '禁用音频') {
					if (after.outputs[0].audio.acodec !== '不重新编码') {
						paramsVisibility.audio = Math.max(paramsVisibility.audio, 2);
					} else {
						paramsVisibility.audio = Math.max(paramsVisibility.audio, 1);
					}
				}
			}
			const newVisibility = {
				duration: (['none', 'input', 'all'] as any)[paramsVisibility.duration],
				format: (['none', 'input', 'all'] as any)[paramsVisibility.format],
				smpte: (['none', 'input', 'all'] as any)[paramsVisibility.smpte],
				video: (['none', 'input', 'all'] as any)[paramsVisibility.video],
				audio: (['none', 'input', 'all'] as any)[paramsVisibility.audio],
			};
			if (
				这.taskViewSettings.paramsVisibility.duration !== newVisibility.duration ||
				这.taskViewSettings.paramsVisibility.format !== newVisibility.format ||
				这.taskViewSettings.paramsVisibility.smpte !== newVisibility.smpte ||
				这.taskViewSettings.paramsVisibility.video !== newVisibility.video ||
				这.taskViewSettings.paramsVisibility.audio !== newVisibility.audio
			) {
				这.taskViewSettings.paramsVisibility = newVisibility;
			}
			// 这.taskViewSettings.paramsVisibility = {
			// 	duration: (['none', 'input', 'all'] as any)[paramsVisibility.duration],
			// 	format: (['none', 'input', 'all'] as any)[paramsVisibility.format],
			// 	smpte: (['none', 'input', 'all'] as any)[paramsVisibility.smpte],
			// 	video: (['none', 'input', 'all'] as any)[paramsVisibility.video],
			// 	audio: (['none', 'input', 'all'] as any)[paramsVisibility.audio],
			// };
			// console.log('recalcChangedParams', 这.taskViewSettings.paramsVisibility);
		},
		/**
		 * 鎸夊悕绉拌浇鍏ラ璁惧苟鏇存柊閰嶇疆锛堝惈鎵€閫変换鍔￠厤缃級
		 */
		async loadPreset(name: string) {
			const 这 = useAppStore();
			const secureName = name.replaceAll('.', '_');
			if (secureName === '榛樿閰嶇疆') {
				这.globalParams = JSON.parse(JSON.stringify(defaultParams));
				这.presetName = secureName;
				这.checkAndApplyCodecDefaults({ video: true, audio: true });
			} else {
				const params = await nodeBridge.localStorage.get(`presets.${secureName}`);
				if (params) {
					这.globalParams = params;
				}
				这.presetName = secureName;
				这.applyParameters('loadPreset');
			}
			if (这.selectedTask.size > 0) {
				// 杩欎釜鎿嶄綔绾︾瓑浜?applySelectedTask
				// 涓昏鐩殑鏄紝褰撻€変腑浜嗕换鍔℃洿鏀归璁炬椂锛屽叏灞€鍙傛暟涓殑杈撳叆鏂囦欢鍚嶇瓑淇℃伅浼氳鏇挎崲锛屼絾浠诲姟涓殑涓嶈鏇挎崲銆傝嫢椹笂灏变慨鏀瑰叾浠栧弬鏁帮紝浼氬鑷翠换鍔′腑鐨勮緭鍏ユ枃浠跺悕绛変俊鎭彉鎴愬叏灞€鐨?
				const fisrtSelectedTaskId = [...这.selectedTask][0];
				这.globalParams = replaceOutputParams(这.currentServer.data.tasks[fisrtSelectedTaskId].after, 这.globalParams, true);
			}
		},
		savePreset(name: string) {
			const 这 = useAppStore();
			const secureName = name.replaceAll('.', '_');
			return nodeBridge.localStorage.set(`presets.${secureName}`, 这.globalParams).then(() => {
				这.presetName = secureName;
				这.loadPresetList();
			});
		},
		editPreset(oldName: string, newName: string) {
			const 这 = useAppStore();
			const secureOldName = oldName.replaceAll('.', '_');
			const secureNewName = newName.replaceAll('.', '_');
			async function f() {
				const oldPreset = await nodeBridge.localStorage.get(`presets.${secureOldName}`);
				nodeBridge.localStorage.set(`presets.${secureNewName}`, oldPreset);
				if (newName !== oldName) {
					nodeBridge.localStorage.delete(`presets.${secureOldName}`);
				}
				这.presetName = secureNewName;
				这.loadPresetList();
			}
			return f();
		},
		deletePreset(name: string) {
			const 这 = useAppStore();
			const secureName = name.replaceAll('.', '_');
			return nodeBridge.localStorage.delete(`presets.${secureName}`).then(() => {
				这.presetName = '';
				这.loadPresetList();
			});
		},
		/**
		 * 閫氳繃 electronStore.get('presets') 寰楀埌鐨?key 鏇存柊褰撳墠鍙敤鐨勯璁捐彍鍗?		 */
		loadPresetList() {
			const 这 = useAppStore();
			nodeBridge.localStorage.get('presets').then((presets) => {
				try {
					这.availablePresets = Object.keys(presets);
				} catch (error) {
					nodeBridge.localStorage.set('presets', {});
				}
			});
		},
		fetchAVOptions() {
			const 这 = useAppStore();
			const entity = 这.currentServer?.entity;
			if (entity?.status === ServiceBridgeStatus.Connected) {
				entity.getAVOptions().then((result: { codecs: { video: FFmpegCodecDetail[], audio: FFmpegCodecDetail[] }, formats: { muxer: FFmpegMuxerDetail[], demuxer: FFmpegDemuxerDetail[] }, filters: FFmpegFilterDetail[] }) => {
					parseFFmpegCodecsToCodecsList(result.codecs);
					parseFFmpegFiltersToFiltersList(result.filters);
					parseFFmpegMuDeMuxersToList(result.formats);
					nodeBridge.localStorage.set('ffmpegCodecs', result.codecs);
					nodeBridge.localStorage.set('ffmpegFormats', result.formats);
					nodeBridge.localStorage.set('ffmpegFilters', result.filters);
					Popup({ message: `Fetched FFmpeg capabilities from ${这.currentServer.data.name}: ${result.codecs.video.length} video codecs, ${result.codecs.audio.length} audio codecs, ${result.formats.demuxer.length} demuxers, ${result.formats.muxer.length} muxers, ${result.filters.length} filters.`, level: NotificationLevel.ok });
					window?.dispatchEvent(new CustomEvent('finished-fetch-codecs'));
				});
			} else {
				Popup({ message: '请先连接当前标签的服务。', level: NotificationLevel.error });
			}
		},
		// #endregion 鍙傛暟澶勭悊
		// #region 閫氱煡澶勭悊
		/**
		 * 鑾峰彇 service 鐨?notifications 鏇存柊鍒版湰鍦?		 */
		updateNotifications(server: Server) {
			const 这 = useAppStore();
			const entity = 这.currentServer?.entity;
			entity.getNotifications().then((result) => {
				server.data.notifications = result;
			});
		},
		pushMsg(message: string, level: NotificationLevel) {
			const 这 = useAppStore();
			Popup({ message, level });
			这.notifications.push({
				time: new Date().getTime(),
				content: message,
				level,
			})
		},
		setUnreadNotifationCount(clear = false) {
			const 这 = useAppStore();
			这.unreadNotificationCount = clear ? 0 : 这.unreadNotificationCount + 1;
		},
		// #endregion 閫氱煡澶勭悊
		// #region 鏈嶅姟鍣ㄥ鐞?
		/**
		 * 鑾峰彇 service 鐨勭増鏈拰灞炴€ф洿鏂板埌鏈湴
		 */
		async updateServerProperties(server: Server) {
			const [versionResponse, properties, workingStatus] = await Promise.all([
				fetch(`http://${server.entity.ip}:${server.entity.port}/api/v1/system/version`, { method: 'get' }),
				server.entity.getProperties(),
				server.entity.getWorkingStatus(),
			]);
			const text = await versionResponse.text();
					server.data.version = text;
					if (['3.0', '4.0', '4.1', '4.2', '4.3', '4.4', '4.5', '5.0', '5.1', '5.2'].includes(text)) {
						// 4.3 鐗堟湰鏇存柊浜嗕换鍔＄鐞嗘柟寮?						// 5.0 鐗堟湰鏇存柊浜嗕换鍔″弬鏁版暟鎹粨鏋?						// 5.1 鐗堟湰鏇存柊浜嗕换鍔″悕
						// 5.3 鐗堟湰鏇存柊浜?API
						Popup({ message: `服务端版本 ${text} 与客户端版本 ${version} 不兼容，请更换服务端或客户端。`, level: NotificationLevel.warning });
					} else if (text !== version) {
						Popup({ message: `服务端版本 ${text} 与客户端版本 ${version} 不一致，部分操作可能异常。`, level: NotificationLevel.warning });
					}

			// properties
			server.data.os = properties.os;
			server.data.isSandboxed = properties.isSandboxed;
			server.data.machineId = properties.machineId;
			server.data.functionLevel = properties.functionLevel;
			server.data.ffmpegInfo = properties.ffmpegInfo;

			// workingStatus
			if (workingStatus === WorkingStatus.idle || workingStatus === WorkingStatus.running) {
				server.data.workingStatus = workingStatus;
			}
		},
		/**
		 * 娣诲姞鏈嶅姟鍣ㄦ爣绛鹃〉
		 */
		addServer() {
			const 这 = useAppStore();
			const id = randomString(6);
			这.servers.push({
				data: {
					id: id,
					name: 'Not connected',
					tasks: [],
					notifications: [],
					uploadFiles: [],
					downloadFiles: [],
					ffmpegInfo: { version: '', scanning: false, videoEncodersCount: 0, audioEncodersCount: 0, muxersCount: 0, demuxersCount: 0, filtersCount: 0 },
					version: '',
					workingStatus: WorkingStatus.idle,
					progress: 0,
					overallProgressTimerID: NaN,
					functionLevel: 100,
				},
				entity: new ServiceBridge(),
			});
			这.selectedTask.clear();
			这.currentServerId = id;
			return id;
		},
		/**
		 * 鍏抽棴鏈嶅姟鍣ㄦ爣绛鹃〉
		 * TODO 鏆傛湭瀹炵幇涓婁紶涓嬭浇涓柇閫昏緫
		 */
		removeServer(serverId: string) {
			const 这 = useAppStore();
			const index = 这.servers.findIndex((server) => server.data.id === serverId);
			if (index > -1) {
				这.servers.splice(index, 1);
			}
			if (这.currentServerId === serverId) {
				这.currentServerId = 这.servers[index - 1].data.id;
			}
		},
		/**
		 * 鍒濆鍖栨湇鍔″櫒杩炴帴骞舵寕杞戒簨浠剁洃鍚?		 */
		initializeServer(serverId: string, ip: string, port: number, username: string, password: string, retryCount = 0) {
			const 这 = useAppStore();
			const server = 这.servers.find((server) => server.data.id === serverId) as Server;
			const entity = server.entity;
			if (!ip) {
				return Promise.reject();
			}
			const _port = port ?? 33269;
			console.log('鍒濆鍖栨湇鍔″櫒杩炴帴', server.data);

			const destroy = () => {
				for (const eventName of ['connected', 'disconnected', 'error', 'ffmpegInfo', 'workingStatusUpdate', 'tasklistUpdate', 'taskUpdate', 'cmdUpdate', 'progressUpdate', 'taskNotification'] as any[]) {
					entity.removeAllListeners(eventName);
				}
			}
			return new Promise((resolve, reject) => {
				entity.connect(ip, _port, username, password);
	
				entity.on('connected', async () => {
					server.data.name = ip === 'localhost' ? 'Local server' : ip;
					console.log(`成功连接到服务 ${server.entity.ip}`);
					这.pushMsg(`成功连接到服务 ${server.data.name}`, NotificationLevel.ok);
					server.data.tasks = [];	// 鐢变簬 taskList 鍙寘鍚?id锛岄噸鏂拌繛鎺ュ悗闇€瑕佹竻闄ゅ師 task 淇℃伅浠ヨ幏鍙栨柊鐨?					这.updateServerProperties(server);
					server.data.ffmpegInfo = { version: '', scanning: true, videoEncodersCount: 0, audioEncodersCount: 0, muxersCount: 0, demuxersCount: 0, filtersCount: 0 };
					try {
						await 这.updateServerProperties(server);
					} catch (error) {
						console.error('Failed to update server properties', error);
					}
					这.updateTaskList(server);
					// entity.updateTaskList();
					这.updateNotifications(server);
					resolve(server);
				});
				entity.on('disconnected', () => {
					console.log(`Disconnected from server ${server.entity.ip}`);
					这.pushMsg(`Disconnected from server ${server.data.name}`, NotificationLevel.warning);
					destroy();
				});
				entity.on('error', (reason) => {
					if (!retryCount || reason.includes('杩炴帴澶辫触')) {
						console.log(`鏈嶅姟鍣?${server.entity.ip} ${reason}`);
						这.pushMsg(`鏈嶅姟鍣?${server.data.name} ${reason}`, NotificationLevel.error);
						destroy();
						reject(reason);
					} else {
						console.log(`鏈嶅姟鍣?${server.entity.ip} ${reason}锛屽墿浣欓噸璇曟鏁?${retryCount}`);
						setTimeout(() => {
							这.initializeServer(serverId, ip, port, username, password, retryCount - 1);
						}, 150);
					}
				});
	
				entity.on('ffmpegInfo', (data) => {
					handleFFmpegInfo(server, data);
				});
				entity.on('workingStatusUpdate', (data) => {
					handleWorkingStatusUpdate(server, data.value);
				});
				entity.on('tasklistUpdate', (data) => {
					handleTasklistUpdate(server, data.content);
					这.recalcChangedParams();
				});
				entity.on('taskUpdate', (data) => {
					handleTaskUpdate(server, data.taskId, data.task);
					这.recalcChangedParams();
				});
				entity.on('cmdUpdate', (data) => {
					handleCmdUpdate(server, data.taskId, data.content, data.append);
				});
				entity.on('progressUpdate', (data) => {
					handleProgressUpdate(server, data.taskId, data.time, data.status, 这.functionLevel);
				});
				entity.on('notificationUpdate', (data) => {
					handleNotificationUpdate(server, data.notificationId, data.notification);
				});
			});
		},
		/**
		 * 閲嶆柊杩炴帴宸叉帀绾挎垨鏈垚鍔熻繛鎺ョ殑鏈嶅姟鍣?		 */
		reConnectServer(serverId: string) {
			const 这 = useAppStore();
			const server = 这.servers.find((server) => server.data.id === serverId) as Server;
			const entity = server.entity;
			这.initializeServer(serverId, entity.ip, entity.port, entity.username, entity.password);
		},
		// #endregion 鏈嶅姟鍣ㄥ鐞?		// #region 鍏朵粬
		async activateBackend(userInput: string): Promise<number | false> {
			const 这 = useAppStore();
			const result = await 这.currentServer?.entity.activate(userInput).catch(() => false);
			if (result && Number.isFinite(+result)) {
				这.currentServer!.data.functionLevel = +result;
				return +result;
			}
			return false;
		},
		async activateFrontend(userInput: string): Promise<number | false> {
			const 这 = useAppStore();
			这.functionLevel = 100;
			这.currentServer && (这.currentServer.data.functionLevel = 100);
			return 100;
			if (nodeBridge.env === 'electron') {
				/**
				 * 瀹㈡埛绔拰绠＄悊绔潎浣跨敤鏈哄櫒鐮?+ 鍥哄畾鐮佸叡 32 浣嶄綔涓?key
				 * 绠＄悊绔娇鐢ㄨ繖涓?key 瀵?functionLevel 鍔犲瘑锛屽緱鍒扮殑鍔犲瘑瀛楃涓茬敱鐢ㄦ埛杈撳叆鍒?userInput 涓幓
				 * 瀹㈡埛绔皢 userInput 浣跨敤 key 瑙ｅ瘑锛屽鏋?userInput 涓嶆槸鐬庣紪鐨勶紝閭ｄ箞灏辫兘瑙ｅ嚭姝ｇ‘鐨?functionLevel
				 */
				const machineId = await nodeBridge.getMachineId();
				const fixedCode = 'd324c697ebfc42b7';
				const key = machineId + fixedCode;
				const decrypted = CryptoJS.AES.decrypt(userInput, key)
				const decryptedString = CryptoJS.enc.Utf8.stringify(decrypted);
				if ((+decryptedString).toString() === decryptedString) {
					这.functionLevel = parseInt(decryptedString);
					nodeBridge.localStorage.set('frontendSettings.activationCode', userInput);
					return parseInt(decryptedString);
				} else {
					return false;
				}
			}
		},
		/**
		 * 淇敼鍓嶇璁剧疆鍚庤皟鐢?		 * 鍑芥暟灏嗕慨鏀瑰悗鐨勫叏灞€鍙傛暟搴旂敤鍒板綋鍓嶉€夋嫨鐨勪换鍔￠」锛岀劧鍚庝繚瀛樺埌鏈湴纾佺洏
		 * 瀵逛簬鐢ㄦ埛鎿嶄綔锛岃繘琛屽瓨鐩?		 */
		applyFrontendSettings(isUserInteraction: boolean) {
			const 这 = useAppStore();
			const legacyTheme = 这.frontendSettings.colorTheme;
			const themeMode = 这.frontendSettings.colorThemeMode
				|| (legacyTheme === 'themeDark' ? 'dark' : legacyTheme === 'themeLight' ? 'light' : 'system');
			const systemPrefersDark = typeof window !== 'undefined'
				&& window.matchMedia?.('(prefers-color-scheme: dark)').matches;
			const effectiveTheme = themeMode === 'system'
				? (systemPrefersDark ? 'themeDark' : 'themeLight')
				: themeMode === 'dark' ? 'themeDark' : 'themeLight';

			if (isUserInteraction) {
				// 瀛樼洏
				clearTimeout((window as any).saveAllParaTimer);
				(window as any).saveAllParaTimer = setTimeout(() => {
					nodeBridge.localStorage.set('frontendSettings', 这.frontendSettings);
					console.log('Settings saved');
				}, 700);
			}

			这.frontendSettings.colorThemeMode = themeMode;
			这.frontendSettings.language = setLanguage(这.frontendSettings.language);
			这.frontendSettings.colorTheme = effectiveTheme;
			document.body.className = effectiveTheme;
			nodeBridge.setBlurBehindWindow(false);
			// document.body.setAttribute('data-color_theme', 这.frontendSettings.colorTheme);

			window.frontendSettings.useIEC = 这.frontendSettings.useIEC;
			window.frontendSettings.language = 这.frontendSettings.language;
			window.frontendSettings.colorThemeMode = themeMode;
			window.frontendSettings.colorTheme = effectiveTheme;
		},
		
		// #endregion 鍏朵粬
	},
});
