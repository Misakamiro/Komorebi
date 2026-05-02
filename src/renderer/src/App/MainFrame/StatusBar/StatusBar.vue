<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { version } from '@common/constants'
import { showEnvironmentInfo } from '@renderer/components/misc/EnvironmentInfo';
import IconLoading from '@renderer/assets/loading.svg?component';
import IconInfo from './info.svg?component';
import IconArrow from '@renderer/assets/swap_right.svg?component'

const appStore = useAppStore();

const versionStyle = computed(() => {
	if (appStore.currentServer?.data.ffmpegInfo?.version) {
		return { zoom: 0.55 };
	} else {
		return { top: '10px' };
	}
})
const KomorebiVersionText = computed(() => {
	if (appStore.currentServer?.data.version === version || !appStore.currentServer?.data.version) {
		return version;
	} else {
		return `${version} | ${appStore.currentServer?.data.version}`;
	}
});
const handleInfoCenterButtonClicked = () => {
	appStore.showInfoCenter = !appStore.showInfoCenter;
	if (appStore.showInfoCenter) {
		appStore.showMenuCenter = 0;
	}
	appStore.setUnreadNotifationCount(true);
}
const handleTransferCenterButtonClicked = () => {
	if (appStore.showMenuCenter || appStore.showInfoCenter) {
		appStore.showMenuCenter = 0;
		appStore.showInfoCenter = false;
		appStore.showTransferCenter = true;
		appStore.showTaskInfo = undefined;
	} else {
		if (appStore.showTransferCenter) {
			appStore.showTransferCenter = false;
		} else {
			appStore.showTransferCenter = true;
			appStore.showTaskInfo = undefined;
		}
	}
}
// const handleThemeButtonClicked = () => {
// 	if (appStore.frontendSettings.colorTheme === 'themeDark') {
// 		appStore.frontendSettings.colorTheme = 'themeLight';
// 	} else {
// 		appStore.frontendSettings.colorTheme = 'themeDark';
// 	}
// 	appStore.applyFrontendSettings(true);
// }

</script>

<template>
	<div class="statusbar" :data-color_theme="appStore.frontendSettings.colorTheme">
		<div class="left">
			<div>
				<div class="version" :style="versionStyle" @click="showEnvironmentInfo">
					Komorebi：{{ KomorebiVersionText }}
					<br />
					FFmpeg：{{ appStore.currentServer?.data.ffmpegInfo?.version || '-' }}<IconLoading class="loading" v-if="appStore.currentServer?.data.ffmpegInfo?.scanning" />
				</div>
			</div>
			<div @click="handleInfoCenterButtonClicked">
				<IconInfo />{{ appStore.unreadNotificationCount }}
			</div>
			<div @click="handleTransferCenterButtonClicked">
				<IconArrow style="transform: rotate(-90deg);" />
				<div style="margin-right: -12px"></div>
				<IconArrow style="transform: rotate(90deg);" />
				传输中心
			</div>
			<!-- <div @click="handleThemeButtonClicked">{{ appStore.frontendSettings.colorTheme }}</div> -->
		</div>
	</div>
</template>

<style lang="less">
	.statusbar {
		width: 100%;
		height: 24px;
		flex: 0 0 auto;
		padding: 0 4px;
		background-color: hwb(var(--primaryColor));
		color: white;
		/* box-shadow: 0 3px 2px -2px hwb(0deg 100% 0%) inset; */
		font-size: 14px;
		overflow: hidden;
		.left {
			float: left;
		}
		.right {
			float: right;
		}
		.left, .right {
			position: relative;
			&>div {
				display: inline-flex;
				justify-content: center;
				align-items: center;
				height: 24px;
				padding: 0 8px;
				// line-height: 24px;
				vertical-align: middle;
				&:hover {
					background-color: hwb(0	100% 0% / 0.2);
					box-shadow: 0 -1px 2px 0px hwb(0 100% 0% / 0.2) inset;
				}
				&:active {
					background-color: hwb(0	0% 100% / 0.15);
					box-shadow: 0 1px 2px hwb(0 0% 100% / 0.3) inset;
					// box-shadow: 0 0 2px 1px hwb(0 0% 100% / 0.05), // 外部阴影
					// 			0 6px 12px hwb(0 0% 100% / 0.2) inset; // 内部凹陷阴影
					transform: translateY(0.25px);
				}
				svg {
					width: 12px;
					height: 12px;
					margin-right: 6px;
				}
				.version {
					position: relative;
					top: 0;
					text-align: left;
					zoom: 1;
					transition: top var(--motion-standard) var(--ease-elegant), opacity var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant);
					@keyframes rotation {
						from {
							transform: rotate(0deg);
						}
						to {
							transform: rotate(360deg);
						}
					}
					.loading {
						width: 18px;
						height: 18px;
						animation: rotation var(--motion-spin) steps(8) infinite;
						margin: -2px -2px -2px 8px;
					}
				}
			}
		}
	}
</style>
