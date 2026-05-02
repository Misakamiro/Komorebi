<script setup lang="ts">
import { computed, ref, VNodeRef } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import nodeBridge from '@renderer/bridges/nodeBridge';
import IconBack from './back.svg?component';
import IconMinimize from './minimize.svg?component';
import IconMaximize from './maximize.svg?component';
import IconClose from './close.svg?component';
import { version } from '@common/constants';

const appStore = useAppStore();

const bigIconRef = ref<VNodeRef>(null);
const isDev = computed(() => version.includes(' '));

const bigIconStyle = computed(() => {
	if (appStore.showInfoCenter) {
		return {
			width: '32px',
			height: '32px',
			borderRadius: '4px',
		};
	}
});

const fourthButtonType = computed(() => {
	if (appStore.showInfoCenter || appStore.showMenuCenter === 2) {
		return 'back';
	}
});

const handleBigIconMousedown = (e: MouseEvent) => {
	const mouseupHandler = (e: MouseEvent) => {
		const elem = document.elementFromPoint(e.pageX, e.pageY);
		if (elem === bigIconRef.value) {
			if (e.button === 0) {
				if (appStore.showMenuCenter === 1) {
					appStore.showMenuCenter = 2;
				} else if (appStore.showMenuCenter === 2) {
					appStore.showMenuCenter = 0;
				}
			} else if (e.button === 2) {
				nodeBridge.triggerSystemMenu();
			}
		} else if (appStore.showMenuCenter === 1) {
			appStore.showMenuCenter = 0;
		}
		document.removeEventListener('mouseup', mouseupHandler);
	};
	document.addEventListener('mouseup', mouseupHandler);
	if (e.button === 0 && appStore.showMenuCenter === 0) {
		appStore.showMenuCenter = 1;
		appStore.showInfoCenter = false;
	}
};

const handleRefreshButtonClicked = () => location.reload();

const handleFourthButtonClicked = () => {
	appStore.showInfoCenter = false;
	appStore.showMenuCenter = 0;
};

const handleMinimizeClicked = () => {
	window.jsb.ipcRenderer.send('minimize');
};

const handleWindowmodeClicked = () => {
	window.jsb.ipcRenderer.send('windowmode');
};
const windowmodeHoverTimer = ref(0);
const handleWindowmodeMouseEnter = () => {
	windowmodeHoverTimer.value = setTimeout(() => {
		nodeBridge.triggerSnapLayout();
	}, 600) as any;
};
const handleWindowmodeMouseLeave = () => {
	clearTimeout(windowmodeHoverTimer.value);
};

const handleCloseClicked = () => {
	window.jsb.ipcRenderer.send('close');
};
</script>

<template>
	<div class="buttonArea">
		<button v-if="isDev" class="normalButton" @click="handleRefreshButtonClicked">刷新</button>
		<button v-if="fourthButtonType" class="normalButton" aria-label="返回" @click="handleFourthButtonClicked">
			<IconBack />
		</button>
		<button class="normalButton" aria-label="最小化窗口" @click="handleMinimizeClicked">
			<IconMinimize />
		</button>
		<button class="normalButton" aria-label="最大化或还原窗口" @click="handleWindowmodeClicked" @mouseenter="handleWindowmodeMouseEnter" @mouseleave="handleWindowmodeMouseLeave">
			<IconMaximize />
		</button>
		<button class="redButton" aria-label="关闭窗口" @click="handleCloseClicked">
			<IconClose />
		</button>
	</div>
	<div class="bigicon" :style="bigIconStyle" @mousedown="handleBigIconMousedown" ref="bigIconRef">
		<img :src="'./images/icon_256_transparent.png'" />
	</div>
	<Transition name="titleTrans">
		<div v-if="appStore.showInfoCenter" class="title">Komorebi</div>
	</Transition>
</template>

<style scoped lang="less">
	.buttonArea {
		position: fixed;
		right: 0;
		top: 0;
		min-width: 176px;
		height: 30px;
		padding-bottom: 8px;
		display: flex;
		align-items: center;
		justify-content: end;
		z-index: 100;
		-webkit-app-region: none;
		button {
			position: relative;
			width: 44px;
			height: 30px;
			line-height: 30px;
			display: inline-flex;
			justify-content: center;
			align-items: center;
			border: none;
			outline: none;
			background: none;
			svg {
				position: absolute;
				left: 17px;
				top: 10px;
				width: 10px;
				height: 10px;
				color: var(--66);
			}
		}
		.normalButton:hover {
			background-color: hwb(var(--opposite) / 0.10);
		}
		.normalButton:active {
			box-shadow: 0 1px 2px hwb(0 0% 100% / 0.3) inset;
			transform: translateY(0.5px);
		}
		.redButton:hover {
			background-color: hwb(0 15% 0% / 0.8);
			svg {
				fill: #FFF;
			}
		}
		.redButton:active {
			box-shadow: 0 2px 4px hwb(0 0% 100% / 0.6) inset;
			transform: translateY(0.5px);
		}
	}
	.bigicon {
		position: absolute;
		top: 8px;
		left: 8px;
		width: 76px;
		height: 76px;
		background-color: hwb(0.0 98% 2%);
		border-radius: 8px;
		box-shadow: 0 2px 6px hwb(0 0% 100% / 0.2);
		transition: background-color var(--motion-standard) ease, opacity var(--motion-standard) ease, width var(--motion-panel) var(--ease-elegant), height var(--motion-panel) var(--ease-elegant);
		z-index: 1;
		-webkit-app-region: none;
		img {
			width: 100%;
			height: 100%;
			pointer-events: none;
		}
		&:active {
			box-shadow: 0 0 2px 1px hwb(0deg 0% 100% / 0.1), 0 3px 6px hwb(0deg 0% 100% / 10%) inset;
			transform: translateY(0.5px);
		}
	}
	.title {
		position: absolute;
		left: 56px;
		top: 8px;
		line-height: 32px;
		font-size: 18px;
		z-index: 1;
	}
	.titleTrans-enter-from, .titleTrans-leave-to {
		opacity: 0;
	}
	.titleTrans-enter-to, .titleTrans-leave-from {
		opacity: 1;
	}
	.titleTrans-enter-active {
		transition: opacity var(--motion-soft) ease var(--motion-stagger);
	}
	.titleTrans-leave-active {
		transition: opacity var(--motion-quick) ease;
	}
</style>
