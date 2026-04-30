<script setup lang="ts">
// 以下这句对全局有效
/// <reference types="vite-svg-loader" />
import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore';
import { handleCloseConfirm } from '@renderer/logic/eventsHandler';
import { Server } from '@renderer/types';
import { buildNumber, version } from '@common/constants';
import { parseFFmpegCodecsToCodecsList, parseFFmpegFiltersToFiltersList, parseFFmpegMuDeMuxersToList } from '@common/params/parser';
import Popup from '@renderer/components/Popup/Popup';
import nodeBridge from '@renderer/bridges/nodeBridge';
import MainFrame from './MainFrame/MainFrame.vue';

const appStore = useAppStore();
let colorSchemeMediaQuery: MediaQueryList | undefined;
let colorSchemeListener: (() => void) | undefined;

onMounted(async () => {
	colorSchemeMediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
	colorSchemeListener = () => {
		if (appStore.frontendSettings.colorThemeMode === 'system') {
			appStore.applyFrontendSettings(false);
		}
	};
	colorSchemeMediaQuery?.addEventListener?.('change', colorSchemeListener);

	// 挂载调试变量
	if (buildInfo.isDev) {
		(window as any).appStore = appStore;
		(window as any).nodeBridge = nodeBridge;
	}

	// 初始化本地服务器
	const firstServerId = appStore.addServer();
	if (nodeBridge.env === 'electron') {
		// electron 环境自动连接 localhost
		if (location.href.startsWith('file')) {
			// 打包后的 electron 环境首先启动 service 再连接
			nodeBridge.startService().finally(() => {
				appStore.initializeServer(firstServerId, 'localhost', 33269, '', '', 3); // 4 次连接机会
			});
		} else {
			appStore.initializeServer(firstServerId, 'localhost', 33269, '', '');
		}
	}

	// 挂载退出确认
	nodeBridge.ipcRenderer?.on("exitConfirm", () => {
		handleCloseConfirm();
	});

	// 挂载下载进度指示
	nodeBridge.ipcRenderer?.on("downloadStatusChange", (event, params: { url: string, status: 'started' | 'interrupted' | 'completed' | 'cancelled', finalFilePath?: string }) => {
		const serverId = appStore.downloadMap.get(params.url);
		const server = appStore.servers.find((server) => server.data.id === serverId);
		const downloadFile = server.data.downloadFiles.find((downloadFile) => downloadFile.url === params.url);
		if (params.status === 'started' && !downloadFile) {
			server.data.downloadFiles.push({
				url: params.url,
				transferred: 0,
				size: NaN,
				status: 'downloading',
			});
		} else if (params.status === 'cancelled') {
			const downloadFile = server.data.downloadFiles.find((downloadFile) => downloadFile.url === params.url);
			downloadFile.status = 'error';
		}
		if (params.finalFilePath && downloadFile) {
			downloadFile.finalFilePath = params.finalFilePath;
		}
	});
	nodeBridge.ipcRenderer?.on("downloadProgress", (event, params: { url: string, loaded: number, total: number }) => {
		const serverId = appStore.downloadMap.get(params.url);
		const server = appStore.servers.find((server) => server.data.id === serverId);
		const downloadFile = server.data.downloadFiles.find((downloadFile) => downloadFile.url === params.url);
		if (downloadFile) {
			downloadFile.transferred = params.loaded;
			downloadFile.size = params.total;
		};
	});

	// 挂载主进程 console 信息回传
	nodeBridge.ipcRenderer?.on("debugMessage", (event, ...message) => {
		console.log(...message);
	});

	// 初始化或加载配置
	window.frontendSettings = {};
	appStore.loadPresetList();
	(async () => {
		const ffmpegCodecs = await nodeBridge.localStorage.get('ffmpegCodecs');
		if (ffmpegCodecs) {
			parseFFmpegCodecsToCodecsList(ffmpegCodecs);
		}
		const ffmpegFormats = await nodeBridge.localStorage.get('ffmpegFormats');
		if (ffmpegFormats) {
			parseFFmpegMuDeMuxersToList(ffmpegFormats);
		}
		const ffmpegFilters = await nodeBridge.localStorage.get('ffmpegFilters');
		if (ffmpegFilters) {
			parseFFmpegFiltersToFiltersList(ffmpegFilters);
		}

		const storedBuildNumber = await nodeBridge.localStorage.get('version.buildNumber');
		if (!storedBuildNumber || storedBuildNumber != buildNumber) {
			Popup({
				message: `欢迎使用 Komorebi ${version}`,
				level: 0,
			});
			nodeBridge.localStorage.set('version.buildNumber', buildNumber);
			appStore.checkAndApplyCodecDefaults({ video: true, audio: true });
		} else {
			const globalParams = await nodeBridge.localStorage.get('globalParams');
			appStore.globalParams = globalParams;;
		}
		const storedFrontendSettings = await nodeBridge.localStorage.get('frontendSettings') || {};
		if (!storedFrontendSettings.colorThemeMode && storedFrontendSettings.colorTheme) {
			storedFrontendSettings.colorThemeMode = storedFrontendSettings.colorTheme === 'themeDark' ? 'dark' : 'light';
		}
		const validFrontendSettings = ['colorTheme', 'colorThemeMode', 'useIEC', 'useVirtualTaskList'];
		for (const key of Object.keys(storedFrontendSettings)) {
			if (!validFrontendSettings.includes(key)) {
				delete storedFrontendSettings[key];
			}
		}
		appStore.frontendSettings = Object.assign(appStore.frontendSettings, storedFrontendSettings);
		appStore.applyFrontendSettings(false);
	})();

	// 激活
	nodeBridge.localStorage.get('frontendSettings.activationCode').then(async (value) => {
		const result = await appStore.activateFrontend(value);
		console.log('前端激活结果', result);
	});					

	setTimeout(() => {
		nodeBridge.appReady();
	}, 0);
});

onUnmounted(() => {
	if (colorSchemeMediaQuery && colorSchemeListener) {
		colorSchemeMediaQuery.removeEventListener?.('change', colorSchemeListener);
	}
});
</script>

<template>
	<MainFrame />
</template>

<style src="./theme.css"></style>
<style>
	html {
		overflow: hidden;
	}
	body {
		width: 100vw;
		height: 100vh;
		margin: 0;
		font-weight: 400;
        font-family: MiSans, PingFang SC, 苹方, 微软雅黑, HarmonyOS Sans, HarmonyOS Sans SC, Noto Sans S Chinese, 思源黑体, Product Sans, Segoe UI, Avenir, Arial, Consolas, Helvetica, sans-serif, 黑体;
		-webkit-font-smoothing: grayscale;
		-moz-osx-font-smoothing: grayscale;
		text-align: center;
		position: relative;
		overflow: hidden;
		user-select: none;
		background: hwb(var(--bg92));
		transition: background 0.18s ease, color 0.18s ease;
	}
	#app {
		height: 100vh;
		overflow: hidden;
		position: relative;
	}
</style>
