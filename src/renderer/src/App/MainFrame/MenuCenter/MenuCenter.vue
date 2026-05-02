<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { TaskStatus, WorkingStatus } from '@common/types';
import { version } from '@common/constants';
import { useAppStore } from '@renderer/stores/appStore';
import showMenu, { MenuItem } from '@renderer/components/Menu/Menu';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { handleCloseConfirm } from '@renderer/logic/eventsHandler';
import { showEnvironmentInfo } from '@renderer/components/misc/EnvironmentInfo';
import { showAddTaskPrompt, showOpenFilePrompt } from '@renderer/components/misc/AddTasks';
import LocalSettings from './LocalSettings/LocalSettings.vue';
import AboutPanel from './AboutPanel.vue';
import Popup from '@renderer/components/Popup/Popup';
import IconSidebarSettings from './settings.svg?component';
import IconSidebarTerm from './term.svg?component';
import i11n from '@common/i11n/i11n';

const appStore = useAppStore();

const sidebarIcons = [IconSidebarSettings, IconSidebarTerm];
const sidebarTexts = computed(() => {
	appStore.frontendSettings.language;
	return [i11n.frontend.menuCenter.settings, i11n.frontend.menuCenter.about];
});
const sidebarColors = computed(() =>
	appStore.frontendSettings.colorTheme === 'themeLight'
		? ['hwb(195 0% 10%)', 'hwb(26 15% 0%)']
		: ['hwb(195 5% 5%)', 'hwb(26 25% 0%)'],
);
const animationName = ref('animationUp');

const selectedMenuIndex = ref(-1);
const topMenuRef = ref<HTMLDivElement>(null);
const currentOpenedMenuRef = ref<ReturnType<typeof showMenu>>();
const topMenuButtonsMousemoveElems = ref<HTMLDivElement[]>([]);

const selectedPanelIndex = ref(-1);

const addFiles = () => {
	showOpenFilePrompt().then((fileList) => appStore.addTasks(fileList));
};

const finalMenu = computed(() => {
	appStore.frontendSettings.language;
	const menuText = i11n.frontend.appMenu;
	const ret: MenuItem[] = [
		{
			type: 'submenu',
			label: 'Komorebi (A)',
			subMenu: [
				{ type: 'normal', label: `Komorebi v${version}`, value: 'Komorebi', tooltip: menuText.showEnvironmentInfo, onClick: () => showEnvironmentInfo() },
				{ type: 'separator' },
				{ type: 'submenu', label: menuText.sourceNotice, subMenu: [
					{ type: 'normal', label: menuText.ffboxProject, value: 'ffbox-source', onClick: () => nodeBridge.jumpToUrl('https://github.com/ttqftech/FFBox') },
					{ type: 'normal', label: menuText.ncmdumpProject, value: 'ncmdump-source', onClick: () => nodeBridge.jumpToUrl('https://github.com/taurusxin/ncmdump') },
					{ type: 'normal', label: menuText.ffmpegProject, value: 'ffmpeg-source', onClick: () => nodeBridge.jumpToUrl('https://ffmpeg.org') },
				] },
				{ type: 'separator' },
				{ type: 'normal', label: menuText.exit, value: 'closeKomorebi', onClick: () => handleCloseConfirm() },
			],
		},
		{
			type: 'submenu',
			label: menuText.tasks,
			subMenu: [
				{ type: 'normal', label: menuText.addTasksFromFiles, value: 'addTasksFromFiles', tooltip: menuText.addTasksFromFilesTip, onClick: addFiles },
				{ type: 'normal', label: menuText.addTasksFromText, value: 'addTasksFromText', tooltip: menuText.addTasksFromTextTip, onClick: () => showAddTaskPrompt() },
				{ type: 'submenu', label: menuText.allTaskActions, subMenu: [
					{ type: 'normal', label: menuText.stop, value: 'resetAllTasks', onClick: () => {
						let count = 0;
						for (const [id, task] of Object.entries(appStore.currentServer?.data.tasks || {})) {
							if ([TaskStatus.idle_queued, TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued].includes(task.status)) {
								appStore.currentServer.entity.taskReset(+id);
								count++;
							}
						}
						Popup({ message: menuText.stoppedTasks(count) });
					} },
					{ type: 'normal', label: menuText.deleteFinished, value: 'deleteFinishedTasks', onClick: () => {
						const taskIds = Object.entries(appStore.currentServer?.data.tasks || {})
							.filter(([, task]) => task.status === TaskStatus.finished)
							.map(([id]) => +id);
						appStore.deleteTasks(taskIds);
						Popup({ message: menuText.deletedTasks(taskIds.length) });
					} },
					{ type: 'normal', label: menuText.deleteIdle, value: 'deleteIdleTasks', onClick: () => {
						const taskIds = Object.entries(appStore.currentServer?.data.tasks || {})
							.filter(([, task]) => [TaskStatus.idle, TaskStatus.idle_queued].includes(task.status))
							.map(([id]) => +id);
						appStore.deleteTasks(taskIds);
						Popup({ message: menuText.deletedTasks(taskIds.length) });
					} },
					{ type: 'normal', label: menuText.resetErrors, value: 'resetErrorTasks', onClick: () => {
						let count = 0;
						for (const [id, task] of Object.entries(appStore.currentServer?.data.tasks || {})) {
							if (task.status === TaskStatus.error) {
								appStore.currentServer.entity.taskReset(+id);
								count++;
							}
						}
						Popup({ message: menuText.resetTasks(count) });
					} },
				] },
				{ type: 'submenu', label: menuText.selectedTaskActions, subMenu: [
					{ type: 'normal', label: menuText.startNow, value: 'startSelectedTasks', onClick: () => {
						for (const taskId of appStore.selectedTask) {
							appStore.currentServer.entity.taskStart(taskId);
						}
					} },
					{ type: 'normal', label: menuText.queueStartSelected, value: 'queueSelectedTasks', onClick: () => {
						for (const taskId of appStore.selectedTask) {
							appStore.currentServer.entity.taskReady(taskId);
						}
					} },
					{ type: 'normal', label: menuText.stopOrReset, value: 'resetSelectedTasks', onClick: () => {
						for (const taskId of appStore.selectedTask) {
							appStore.currentServer.entity.taskReset(taskId);
						}
					} },
					{ type: 'normal', label: menuText.delete, value: 'deleteSelectedTasks', onClick: () => {
						appStore.deleteTasks([...appStore.selectedTask]);
					} },
				] },
				{ type: 'separator' },
				{ type: 'normal', label: menuText.startQueue, value: 'startQueue', onClick: () => appStore.currentServer?.entity.queueStart() },
				{ type: 'normal', label: menuText.pauseQueue, value: 'pauseQueue', disabled: appStore.currentServer?.data.workingStatus === WorkingStatus.idle, onClick: () => appStore.currentServer?.entity.queuePause() },
			],
		},
		{
			type: 'submenu',
			label: menuText.view,
			subMenu: [
				{ type: 'normal', label: menuText.zoomIn, value: 'zoomIn', onClick: () => nodeBridge.zoomPage('in') },
				{ type: 'normal', label: menuText.zoomOut, value: 'zoomOut', onClick: () => nodeBridge.zoomPage('out') },
				{ type: 'normal', label: menuText.resetZoom, value: 'zoomReset', onClick: () => nodeBridge.zoomPage('reset') },
				{ type: 'separator' },
				{ type: 'checkbox', label: menuText.infoCenter, value: 'toggleInfoCenter', checked: appStore.showInfoCenter, onClick: () => {
					appStore.showInfoCenter = !appStore.showInfoCenter;
					if (appStore.showInfoCenter) {
						appStore.showMenuCenter = 0;
					}
				} },
				{ type: 'checkbox', label: menuText.transferCenter, value: 'toggleTransferCenter', checked: appStore.showTransferCenter, onClick: () => {
					appStore.showTransferCenter = !appStore.showTransferCenter;
					if (appStore.showTransferCenter) {
						appStore.showMenuCenter = 0;
					}
				} },
				{ type: 'checkbox', label: menuText.menuCenter, value: 'toggleMenuCenter', checked: appStore.showMenuCenter === 2, onClick: () => {
					appStore.showMenuCenter = appStore.showMenuCenter === 2 ? 0 : 2;
					if (appStore.showMenuCenter === 2) {
						appStore.showInfoCenter = false;
					}
				} },
			],
		},
	];
	return ret;
});

const menuCenterPadStyle = computed(() => {
	if (appStore.showMenuCenter === 0) {
		return {
			top: '8px',
			left: '8px',
			width: '76px',
			height: '28px',
			background: 'linear-gradient(to bottom, hwb(var(--bg97)), hwb(var(--bg95)))',
			opacity: '0',
			transitionDelay: '0s, 0s, 0s, 0s, var(--motion-standard)',
		};
	} else if (appStore.showMenuCenter === 1) {
		return {
			top: '8px',
			left: '8px',
			width: '360px',
			height: '28px',
			background: 'hwb(var(--bg98))',
			opacity: 1,
		};
	}
	return {
		top: '0',
		left: '0',
		width: '100%',
		height: '100%',
		background: 'linear-gradient(to bottom, hwb(var(--bg97)), hwb(var(--bg95)))',
		opacity: 1,
	};
});
const menuCenterContainerStyle = computed(() => {
	if (appStore.showMenuCenter === 0) {
		return {
			width: '84px',
			height: '36px',
		};
	} else if (appStore.showMenuCenter === 1) {
		return {
			width: '368px',
			height: '36px',
		};
	}
	return {
		width: '100%',
		height: '100%',
		opacity: 1,
	};
});

const getButtonColorStyle = (index: number) => ({ color: selectedPanelIndex.value === index ? sidebarColors.value[index] : 'hwb(0 50% 50%)' });

watch(() => appStore.showMenuCenter, () => {
	selectedMenuIndex.value = -1;
	selectedPanelIndex.value = 0;
});

watch(selectedMenuIndex, (index, oldIndex) => {
	const selectedMenu = finalMenu.value[index];
	if (selectedMenu) {
		if (oldIndex === -1 && appStore.showMenuCenter === 1) {
			const rects: DOMRect[] = [];
			for (const topMenuButton of topMenuRef.value.children) {
				rects.push(topMenuButton.getBoundingClientRect());
			}
			for (const [key, rect] of Object.entries(rects)) {
				const elem = document.createElement('div');
				elem.style.setProperty('position', 'fixed');
				elem.style.setProperty('left', `${rect.left}px`);
				elem.style.setProperty('top', `${rect.top}px`);
				elem.style.setProperty('width', `${rect.width}px`);
				elem.style.setProperty('height', `${rect.height}px`);
				elem.style.setProperty('z-index', `100`);
				elem.setAttribute('data-index', key);
				elem.addEventListener('mousemove', (ev: MouseEvent) => {
					const index = +(ev.target as HTMLDivElement).getAttribute('data-index');
					selectedMenuIndex.value = index;
				});
				document.body.appendChild(elem);
				topMenuButtonsMousemoveElems.value.push(elem);
			}
		}

		const elem = topMenuRef.value.children[index];
		const rect = elem.getBoundingClientRect();
		currentOpenedMenuRef.value?.close();
		if (selectedMenu.type !== 'submenu') {
			return;
		}
		currentOpenedMenuRef.value = showMenu({
			menu: selectedMenu.subMenu,
			type: 'action',
			triggerRect: { xMin: rect.x, yMin: rect.y, xMax: rect.x + rect.width, yMax: rect.y + rect.height },
			disableOnClick: true,
			onClose: () => {
				if (index === selectedMenuIndex.value) {
					selectedMenuIndex.value = -1;
					if (appStore.showMenuCenter === 1) {
						appStore.showMenuCenter = 0;
					}
				}
			},
			onSelect: (event, value) => {
				handleMenuItemClicked(event, value);
				selectedMenuIndex.value = -1;
				if (appStore.showMenuCenter === 1) {
					const ev = new MouseEvent('mouseup');
					document.dispatchEvent(ev);
					appStore.showMenuCenter = 0;
				}
			},
			onKeyDown: (event: KeyboardEvent) => {
				if (event.key === 'ArrowLeft') {
					selectedMenuIndex.value = selectedMenuIndex.value === 0 ? finalMenu.value.length - 1 : selectedMenuIndex.value - 1;
				} else if (event.key === 'ArrowRight') {
					selectedMenuIndex.value = selectedMenuIndex.value === finalMenu.value.length - 1 ? 0 : selectedMenuIndex.value + 1;
				}
			},
		});
	} else if (oldIndex !== -1) {
		currentOpenedMenuRef.value?.close();
		currentOpenedMenuRef.value = undefined;
		for (const elem of topMenuButtonsMousemoveElems.value) {
			document.body.removeChild(elem);
		}
		topMenuButtonsMousemoveElems.value.splice(0, Number.MAX_SAFE_INTEGER);
	}
});

watch(finalMenu, (finalMenu) => {
	nodeBridge.setApplicationMenu(finalMenu);
}, { immediate: true });

const handleTopMenuHover = (index: number) => {
	if (appStore.showMenuCenter === 1) {
		selectedMenuIndex.value = index;
	}
};

const handleMenuItemClicked = (event: Event, value: any) => {
	function dfs(menuItems: MenuItem[]): { item: MenuItem, route: any[] } | undefined {
		for (const menuItem of menuItems) {
			if (menuItem.type === 'submenu') {
				const result = dfs(menuItem.subMenu);
				if (result) {
					return {
						item: result.item,
						route: result.route.concat(menuItem.label),
					};
				}
			} else if ('value' in menuItem && menuItem.value === value) {
				return { item: menuItem, route: [menuItem.value] };
			}
		}
	}
	const correspondingMenuItem = dfs(finalMenu.value);
	if (correspondingMenuItem && 'onClick' in correspondingMenuItem.item && !correspondingMenuItem.item.disabled) {
		const ret = correspondingMenuItem.item.onClick(event, value);
		if (ret === true) {
			appStore.showMenuCenter = 0;
		} else if (ret !== false && correspondingMenuItem.route.includes(i11n.frontend.appMenu.tasks)) {
			appStore.showMenuCenter = 0;
		}
	}
};

const handleParaButtonClicked = (index: number) => {
	if (index === selectedPanelIndex.value) {
		return;
	}
	animationName.value = index < selectedPanelIndex.value ? 'animationUp' : 'animationDown';
	selectedPanelIndex.value = index;
};

onMounted(() => {
	nodeBridge.ipcRenderer?.removeAllListeners('menuItemClicked');
	nodeBridge.ipcRenderer?.on('menuItemClicked', (event, value: any) => {
		handleMenuItemClicked(event, value);
	});
	const keydownListener = (event: KeyboardEvent) => {
		if (event.key === 'Alt' && appStore.showMenuCenter === 0) {
			appStore.showMenuCenter = 1;
		} else if (event.altKey) {
			const index = [65, 84, 86].indexOf(event.keyCode);
			if (index > -1) {
				selectedMenuIndex.value = index;
			}
		}
	};
	const keyupListener = (event: KeyboardEvent) => {
		if (event.key === 'Alt' && appStore.showMenuCenter === 1 && selectedMenuIndex.value === -1) {
			appStore.showMenuCenter = 0;
		}
	};
	document.addEventListener('keydown', keydownListener);
	document.addEventListener('keyup', keyupListener);
});
</script>

<template>
	<div class="pad" :style="menuCenterPadStyle"></div>
	<div class="container" :style="menuCenterContainerStyle">
		<div class="topDragger"></div>
		<div class="topMenu" ref="topMenuRef">
			<div
				v-for="(menu, index) in finalMenu"
				:class="`menu ${selectedMenuIndex === index ? 'menuSelected' : ''}`"
				@mouseenter="() => handleTopMenuHover(index)"
				@mousedown="() => selectedMenuIndex = index"
			>
				{{ 'label' in menu && menu.label }}
			</div>
		</div>
		<div class="lrCenter">
			<div>
				<div class="selectors">
					<button v-for="index in [0, 1]" :key="index" :aria-label="sidebarTexts[index]" @click="handleParaButtonClicked(index)">
						<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
						<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
					</button>
				</div>
				<div class="content">
					<Transition :name="animationName" mode="out-in">
						<LocalSettings v-if="selectedPanelIndex === 0" />
						<AboutPanel v-else-if="selectedPanelIndex === 1" />
					</Transition>
				</div>
			</div>
		</div>
		<h1 class="title">{{ sidebarTexts[selectedPanelIndex] }}</h1>
	</div>
</template>

<style lang="less" scoped>
	.pad {
		position: absolute;
		border-radius: 8px;
		box-shadow: 0 2px 8px hwb(0 10% 90% / 0.2);
		overflow: hidden;
		z-index: 2;
		transition: left var(--motion-panel) var(--ease-elegant),
					top var(--motion-panel) var(--ease-elegant),
					width var(--motion-panel) var(--ease-elegant),
					height var(--motion-panel) var(--ease-elegant),
					opacity var(--motion-standard) ease;
		will-change: left, top, width, height, opacity;
		transform: translateZ(0);
		backface-visibility: hidden;
	}
	.container {
		position: absolute;
		left: 0;
		top: 0;
		overflow: hidden;
		z-index: 2;
		transition:
			left var(--motion-panel) var(--ease-elegant),
			top var(--motion-panel) var(--ease-elegant),
			width var(--motion-panel) var(--ease-elegant),
			height var(--motion-panel) var(--ease-elegant),
			opacity var(--motion-standard) ease;
		will-change: left, top, width, height, opacity;
		contain: layout paint;
		transform: translateZ(0);
		backface-visibility: hidden;
		-webkit-app-region: none;
		.topDragger {
			position: absolute;
			left: 0;
			top: 0;
			right: 0;
			height: 92px;
			-webkit-app-region: drag;
		}
		.topMenu {
			position: absolute;
			left: 85px;
			top: 8px;
			width: 282px;
			height: 28px;
			font-size: 14px;
			-webkit-app-region: none;
			.menu {
				display: inline-block;
				padding: 0 16px;
				line-height: 28px;
				border-radius: 8px;
				&:not(.menuSelected):hover {
					box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.2),
								0 4px 2px -2px hwb(var(--highlight) / 0.5) inset;
				}
			}
			.menuSelected {
				background-color: hwb(220 25% 10%);
				box-shadow: 0 1px 4px hwb(220 25% 10% / 0.5);
				color: #FFF;
			}
		}
	}
	.animationUp-enter-from, .animationDown-leave-to {
		opacity: 0;
		transform: translate3d(0, -8px, 0) scale(0.998);
	}
	.animationDown-enter-from, .animationUp-leave-to {
		opacity: 0;
		transform: translate3d(0, 8px, 0) scale(0.998);
	}
	.animationUp-enter-active, .animationUp-leave-active,
	.animationDown-enter-active, .animationDown-leave-active {
		transition: opacity var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant);
		will-change: opacity, transform;
		backface-visibility: hidden;
	}
	.animationUp-leave-active,
	.animationDown-leave-active {
		position: absolute;
		inset: 0;
		width: 100%;
		pointer-events: none;
	}
	.animationUp-enter-to, .animationUp-leave-from,
	.animationDown-enter-to, .animationDown-leave-from {
		opacity: 1;
		transform: translate3d(0, 0, 0) scale(1);
	}
	.lrCenter {
		position: absolute;
		top: 96px;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		margin: auto;
		&>div {
			position: relative;
			width: calc(70vw + 160px);
			flex: 0 0 auto;
			.selectors {
				position: absolute;
				left: 0;
				top: 0;
				bottom: 0;
				width: 128px;
				padding: 4px;
				overflow: auto;
				box-shadow: 0.5px 0.5px 1px 0 hwb(var(--hoverLightBg) / 0.95),
							20px 20px 20px 0 hwb(var(--hoverShadow) / 0.02),
							6px 6px 6px 0 hwb(var(--hoverShadow) / 0.02);
				button {
					text-align: center;
					width: 120px;
					height: 40px;
					padding: 0;
					background-color: transparent;
					border: none;
					border-radius: 8px;
					transition: background-color var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant), box-shadow var(--motion-standard) ease;
					&:hover {
						background-color: hwb(var(--hoverLightBg) / 0.4);
						transform: translateX(2px);
					}
					&:active {
						transform: translateX(1px) scale(0.985);
					}
					svg {
						width: 18px;
						height: 18px;
						vertical-align: -4px;
						margin-right: 6px;
						transition: color var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant);
					}
				}
			}
			.content {
				position: absolute;
				left: 160px;
				right: 0;
				top: 0;
				bottom: 0;
				text-align: left;
				overflow: auto;
				overscroll-behavior: contain;
				contain: layout paint;
				transform: translateZ(0);
				backface-visibility: hidden;
				& > * {
					transform: translateZ(0);
					backface-visibility: hidden;
				}
			}
		}
	}
	.title {
		position: absolute;
		left: calc(15vw + 160px);
		top: 54px;
		margin: 0;
		font-size: 26px;
		line-height: 32px;
	}
</style>
