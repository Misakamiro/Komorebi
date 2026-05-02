import zhCN from './zh-CN';
import enUS from './en-US';
import jaJP from './ja-JP';

export type LanguageCode = 'zh-CN' | 'en-US' | 'ja-JP';

export const languageOptions: { value: LanguageCode; caption: string }[] = [
	{ value: 'zh-CN', caption: '简体中文' },
	{ value: 'en-US', caption: 'English' },
	{ value: 'ja-JP', caption: '日本語' },
];

export interface I11n {
	service: {
		功能限制_暂停转码: (taskName: string, byFrontend: boolean, reason: 'media' | 'working') => string;
		功能限制_不能继续: (taskName: string, byFrontend: boolean, reason: 'media' | 'working', pid: number) => string;
		功能限制_任务数上限: (maxTaskCount: string | number, byFrontend: boolean) => string;
		功能限制_滤镜图节点数上限: (maxNodeCount: string | number) => string;
	},
	ffmpeg: {
		文件不存在: string;
		内存或显存不足: string;
		无硬件解码设备_nvenc: string;
		硬件解码错误回退软件_nvenc: string;
		硬件编码器不存在: string;
		硬件编码器初始化失败_amd: string;
		复用器不支持某编码: (codecName: string) => string;
		编码无法识别: string;
		移动文件信息到文件头: string;
		编码器输出参数设置有误: string;
		输入文件无法识别: string;
		权限不足: string;
		外存已满: string;
		无法原地编辑: string;
	},
	frontend: {
		settings: {
			title: string;
			language: string;
			dataRadix: string;
			colorTheme: string;
			animationSpeed: string;
			taskListPerformance: string;
			light: string;
			dark: string;
			system: string;
			animationDefault: string;
			animationFast: string;
			animationSlow: string;
			enableVirtualTaskList: string;
			fullRenderTaskList: string;
			useVirtualTaskListDesc: string;
		},
		about: {
			title: string;
			philosophyTitle: string;
			philosophyBody: string[];
			creditsTitle: string;
			credits: {
				name: string;
				url: string;
				description: string;
			}[];
		},
		menuCenter: {
			settings: string;
			about: string;
		},
		appMenu: {
			showEnvironmentInfo: string;
			sourceNotice: string;
			ffboxProject: string;
			ncmdumpProject: string;
			ffmpegProject: string;
			exit: string;
			tasks: string;
			addTasksFromFiles: string;
			addTasksFromFilesTip: string;
			addTasksFromText: string;
			addTasksFromTextTip: string;
			allTaskActions: string;
			stop: string;
			deleteFinished: string;
			deleteIdle: string;
			resetErrors: string;
			selectedTaskActions: string;
			startNow: string;
			queueStartSelected: string;
			stopOrReset: string;
			delete: string;
			startQueue: string;
			pauseQueue: string;
			view: string;
			zoomIn: string;
			zoomOut: string;
			resetZoom: string;
			infoCenter: string;
			transferCenter: string;
			menuCenter: string;
			stoppedTasks: (count: number) => string;
			deletedTasks: (count: number) => string;
			resetTasks: (count: number) => string;
		},
		dialogs: {
			exitTitle: string;
			exitContent: (count: number) => string;
			exitConfirm: string;
			exitCancel: string;
			welcome: (version: string) => string;
		},
		ffmpegGuide: {
			checkingTitle: string;
			checkingText: string;
			missingTitle: string;
			missingTip: string;
			stepDownload: string;
			stepWindowsPath: string;
			stepUnixPath: string;
			stepSameDir: string;
			stepMacDir: (path: string) => string;
			restart: (target: string) => string;
			currentOs: string;
		},
		dragDrop: {
			ncmInputs: (prefix: string, count: number) => string;
			inputs: (prefix: string, count: number, mode: 'multiInput' | 'multiTask') => string;
			textPaths: string;
			createTask: string;
			batchTaskMode: string;
			multiInputMode: string;
			fastStart: string;
			status: (enabled: boolean) => string;
		},
		komorebi: {
			workflows: {
				videoCompress: string;
				audioConvert: string;
				remux: string;
				ncm: string;
			};
			hints: {
				noInput: string;
				hasVideoAudio: string;
				hasVideo: string;
				hasAudio: string;
				unknown: string;
			};
			fields: {
				scene: string;
				encoder: string;
				quality: string;
				container: string;
				aspectRatio: string;
				resolution: string;
				frameRate: string;
				gifFps: string;
				encodeSpeed: string;
				audioTrack: string;
				externalAudio: string;
				externalAudioFile: string;
				outputDir: string;
				outputName: string;
				targetFormat: string;
				targetContainer: string;
				qualityPreset: string;
				convertFormat: string;
			};
			options: {
				sceneAnime: string;
				sceneScreen: string;
				sceneLive: string;
				qualityHigh: string;
				qualityBalanced: string;
				qualitySmall: string;
				qualityTiny: string;
				aspectSource: string;
				aspectStandard: string;
				resolutionSource: string;
				resolutionAboveSource: (resolution: string) => string;
				resolutionReadingSource: string;
				frameRateSource: string;
				frameRateAuto: string;
				frameRateLimited: (fps: number) => string;
				frameRateAboveSource: (fps: string) => string;
				gifFpsAuto: string;
				gifFpsLimited: (fps: number) => string;
				encodeSpeedFast: string;
				encodeSpeedBalanced: string;
				encodeSpeedLow: string;
				keepSourceAudio: string;
				muteVideo: string;
				useExternalAudio: string;
				noExternalAudio: string;
				addExternalAudio: string;
				audioLossless320: string;
				audio192: string;
				audio128: string;
				audio64: string;
				ncmAuto: string;
				ncmCopy: string;
				ncmStandard: string;
				ncmSmall: string;
				recursive: string;
				deleteSource: string;
			};
			placeholders: {
				externalAudio: string;
				outputToSourceDir: string;
				outputToSourceRoot: string;
				videoOutputName: string;
				audioOutputName: string;
				remuxOutputName: string;
				ncmOutputName: string;
			};
			estimate: {
				waiting: string;
				unknown: string;
				summary: (output: string, source: string, ratioText: string) => string;
				actualSummary: (output: string, source: string, ratioText: string) => string;
				shrink: (rate: string) => string;
				grow: (rate: string) => string;
				flat: string;
				actualShrink: (rate: string) => string;
				actualGrow: (rate: string) => string;
				actualFlat: string;
			};
			notes: {
				remux: string;
				ncm: string;
			};
			actions: {
				choose: string;
				setGlobal: string;
				applySelected: string;
			};
		},
		applicationMenu: {
			编辑: string;
			撤销: string;
			重做: string;
			剪切: string;
			复制: string;
			粘贴: string;
			删除: string;
			全选: string;
		},
	},
}

let currentLanguage: LanguageCode = 'zh-CN';
const languageMap = {
	'zh-CN': zhCN,
	'en-US': enUS,
	'ja-JP': jaJP,
} as Record<LanguageCode, I11n>;

export function setLanguage(language: string | undefined): LanguageCode {
	if (language && language in languageMap) {
		currentLanguage = language as LanguageCode;
	}
	return currentLanguage;
}

export function getLanguage(): LanguageCode {
	return currentLanguage;
}

export default new Proxy({} as I11n, {
	get(_, key) {
		return (languageMap[currentLanguage] as any)[key];
	}
});
