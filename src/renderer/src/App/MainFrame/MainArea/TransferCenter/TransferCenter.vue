<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UploadFile } from '@renderer/types';
import { useAppStore } from '@renderer/stores/appStore';
import { formatSize } from '@common/utils';
import { useTooltip } from '@renderer/common/tooltipUtil';
import nodeBridge from '@renderer/bridges/nodeBridge';
import IconUpArrow from '../ParaBox/uparrow.svg?component';
import IconDownload from './Download.svg';
import IconUpload from './Upload.svg';
import IconDownloadAllTab from './DownloadAllTab.svg';
import IconDownloadTab from './DownloadTab.svg';
import IconUploadAllTab from './UploadAllTab.svg';
import IconUploadTab from './UploadTab.svg';

const appStore = useAppStore();
const sidebarIcons = [IconUploadAllTab, IconUploadTab, IconDownloadAllTab];
const sidebarTexts = ['上传', '已选任务上传', '下载', '音频', '封装'];
const sidebarColors = computed(() => 
	appStore.frontendSettings.colorTheme === 'themeLight'
		? ['hwb(25 5% 5%)', 'hwb(25 5% 5%)', 'hwb(210 15% 5%)']
		: ['hwb(25 5% 10%)', 'hwb(25 5% 10%)', 'hwb(210 25% 0%)']
);
const paraSelected = ref(0);

const deviderRef = ref<Element>(null);
const centerDraggerPos = ref(50);
const selectedFileIndex = ref(undefined);

const uploadFileList = computed(() => {
	// const tasks = appStore.currentServer?.data.tasks || [];
	const serverUploadFiles = appStore.currentServer?.data.uploadFiles || [];
	return serverUploadFiles.map((serverUploadFile) => ({
		fileBaseName: serverUploadFile.fileBaseName,
		taskId: serverUploadFile.taskId,
		isCurrentTask: appStore.selectedTask.has(serverUploadFile.taskId),
		status: serverUploadFile.status,
		chunks: serverUploadFile.chunks,
		size: serverUploadFile.size,
		readProgress: serverUploadFile.chunks.reduce((prev, curr) => prev + curr.size, 0) / serverUploadFile.size,
		hashProgress: serverUploadFile.chunks.reduce((prev, curr) => prev + (curr.hash ? curr.size : 0), 0) / serverUploadFile.size,
		uploadProgress: serverUploadFile.chunks.reduce((prev, curr) => prev + curr.transferred, 0) / serverUploadFile.size,
	}));
});

const chunkList = computed(() => {
	const serverUploadFile = uploadFileList.value[selectedFileIndex.value];
	return (serverUploadFile?.chunks || []).map((chunk) => ({
		hash: chunk.hash,
		status: chunk.status,
		progress: chunk.transferred / chunk.size,
	}));
});

const downloadFileList = computed(() => appStore.currentServer?.data.downloadFiles || []);

const selectedTaskName = computed(() => 
	appStore.selectedTask.size === 0 ? '您未选择任务' : 
	appStore.selectedTask.size === 1 ? `任务「${appStore.currentServer.data.tasks[[...appStore.selectedTask][0]].taskName}」上传文件` : 
	`${appStore.selectedTask.size} 个任务的上传文件`
);

const fileListStyle = computed(() => (
	(paraSelected.value === 0 ? uploadFileList.value.length : 0) +
	(paraSelected.value === 1 ? uploadFileList.value.filter((file) => file.isCurrentTask).length : 0) + 
	(paraSelected.value === 2 ? downloadFileList.value.length : 0)
) >= 11 ? "--itemHeight: 26px" : "--itemHeight: 34px");
const chunkListStyle = computed(() => chunkList.value ? "--itemHeight: 26px" : "--itemHeight: 34px");

const handleDragStart = (event: MouseEvent | TouchEvent) => {
	// event.preventDefault();
	const deviderRect = deviderRef.value.getBoundingClientRect();	// 列表元素的 rect
	const mainAreaRect = (appStore.componentRefs['MainArea'] as Element).getBoundingClientRect();	// 列表元素的 rect
	const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
	// const inElementY = (event as MouseEvent).offsetY || (event as TouchEvent).touches[0].offsetY;	// 鼠标在元素内的 Y
	const inElementY = mouseY - deviderRect.top;	// 不直接用 offsetY 的原因是，鼠标所在的元素不一定是 devider
	// 添加鼠标事件捕获
	let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
		const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
		let listPercent = (mouseY - mainAreaRect.top - inElementY) / mainAreaRect.height;
		listPercent = Math.min(Math.max(listPercent, 0), 1);
		appStore.draggerPos = listPercent;
	}
	let handleMouseUp = () => {
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('touchmove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
		window.removeEventListener('touchend', handleMouseUp);
	}
	window.addEventListener('mousemove', handleMouseMove);
	window.addEventListener('touchmove', handleMouseMove);
	window.addEventListener('mouseup', handleMouseUp);
	window.addEventListener('touchend', handleMouseUp);
};

const handleCenterDraggerDragStart = (event: MouseEvent | TouchEvent) => {
	const draggerRect = event.target.getBoundingClientRect();
	const mainAreaRect = event.target.parentElement.getBoundingClientRect();
	const inElementX = ((event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX) - draggerRect.x;	// 鼠标在元素内的 X
	// 添加鼠标事件捕获
	let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
		const mouseX = (event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX;	// 鼠标在窗口内的 X
		let listPercent = (mouseX - inElementX + 8) / mainAreaRect.width;
		listPercent = Math.min(Math.max(listPercent, 0.2), 0.8);
		centerDraggerPos.value = listPercent * 100;
	}
	let handleMouseUp = () => {
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('touchmove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
		window.removeEventListener('touchend', handleMouseUp);
	}
	window.addEventListener('mousemove', handleMouseMove);
	window.addEventListener('touchmove', handleMouseMove);
	window.addEventListener('mouseup', handleMouseUp);
	window.addEventListener('touchend', handleMouseUp);
};

const handleFileClick = (file: UploadFile, index: number) => {
	selectedFileIndex.value = index;
	appStore.selectedTask = appStore.currentServer.data.tasks[file.taskId] ? new Set([file.taskId]) : new Set();
	appStore.taskSelectionModified = false;
	appStore.applySelectedTask();
};

const getButtonColorStyle = (index: number) => ({ color: paraSelected.value === index ? sidebarColors.value[index] : 'hwb(0 50% 50%)' });

watch(() => (appStore.currentServer?.data.uploadFiles || []).length, () => {
	if (selectedFileIndex.value >= (appStore.currentServer?.data.uploadFiles || []).length - 1) {
		selectedFileIndex.value = undefined;
	}
});

</script>

<template>
	<div class="transferCenter" :data-color_theme="appStore.frontendSettings.colorTheme">
		<div class="upper">
			<div class="devider" :ref="(el) => deviderRef = el as Element">
				<button class="leftButton" @click="appStore.showTransferCenter = false" aria-label="传输中心面板开关">
					<IconUpArrow :style="{ transform: 'rotate(-90deg)' }" />
					<span>返回参数</span>
				</button>
				<div class="buttons" @mousedown="handleDragStart" @touchstart="handleDragStart">
					<button v-for="index in [0, 1, ...(nodeBridge.env === 'electron' ? [2] : [])]" :key="index" :aria-label="sidebarTexts[index] + '参数'" @click="paraSelected = index">
						<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
						<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
					</button>
				</div>
			</div>
		</div>
		<div class="lower">
			<div class="left" :style="{ width: paraSelected === 2 ? '100%' : `${centerDraggerPos}%` }">
				<div class="title">
					{{ paraSelected === 0 ? '全部上传文件' : paraSelected === 1 ? selectedTaskName : '全部下载文件' }}
				</div>
				<div class="listContainer" :style="fileListStyle">
					<div
						v-if="paraSelected !== 2"
						v-for="(file, index) in (paraSelected == 0 ? uploadFileList : uploadFileList.filter((item) => item.isCurrentTask))"
						class="listItem" :class="selectedFileIndex === index ? 'listItemSelected' : undefined"
						:style="file.isCurrentTask ? {} : (paraSelected == 0 ? { opacity: 0.6 } : { display: 'none' })"
						@click="handleFileClick(file as any, index)"
						v-bind="useTooltip(`文件名：${file.fileBaseName}\n大小：${formatSize(file.size, appStore.frontendSettings.useIEC)}\n分段数：${file.chunks.length}\n任务 ID：${file.taskId}`, 'mtl')"
					>
						<div :class="`progress ${file.status === 'error' ? 'progressError' : ''}`">
							<div :style="{
								width: '100%',
								clipPath: `polygon(
									0% 0%, ${file.readProgress * 100}% 0%,    ${file.readProgress * 100}% 33.3%,
									       ${file.hashProgress * 100}% 33.3%,   ${file.hashProgress * 100}% 66.7%,
									       ${file.uploadProgress * 100}% 66.7%, ${file.uploadProgress * 100}% 100%, 0% 100%
								)`}"
							/>
						</div>
						<IconUpload />
						<span>{{ file.fileBaseName }}</span>
					</div>
					<div
						v-if="paraSelected === 2"
						v-for="(file, index) in downloadFileList"
						class="listItem"
						v-bind="useTooltip(`网址：${file.url}\n存址：${file.finalFilePath ?? ''}\n大小：${formatSize(file.size, appStore.frontendSettings.useIEC)}`, 'mtl')"
					>
						<div class="progress">
							<div :style="{
								width: `${file.transferred / (isFinite(file.size) ? file.size : Number.MAX_SAFE_INTEGER) * 100}%`,
							}" />
						</div>
						<IconDownload />
						<span>{{ file.finalFilePath || `（${file.url}）` }}</span>
					</div>
				</div>
			</div>
			<div class="dragger" v-if="paraSelected !== 2" :style="{ left: `${centerDraggerPos}%` }" @mousedown="handleCenterDraggerDragStart($event)" @touchstart="handleCenterDraggerDragStart($event)" />
			<div class="right" v-if="paraSelected !== 2" :style="{ width: `${100 - centerDraggerPos}%`}">
				<div class="title">分片列表</div>
				<div class="listContainer" :style="chunkListStyle">
					<div v-for="(chunk, index) in chunkList" class="listItem" :key="`${index} ${chunk.hash}`">
						<div :class="`progress ${chunk.status === 'error' ? 'progressError' : ''}`">
							<div :style="{
								width: `${chunk.progress * 100}%`,
							}" />
						</div>
						<span>{{ chunk.hash }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style lang="less" scoped>
	.transferCenter {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background-color: hwb(var(--bg94));
		overflow: hidden;
		.upper {
			position: relative;
			height: 30px;
			flex: 0 0 auto;
			background-color: hwb(var(--bg97));
			box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.02), // 远距离下阴影
						0px -2px 1px -1px rgba(0, 0, 0, 0.1) inset; // 内部下阴影
			overflow: hidden;
			transition: height 0.4s cubic-bezier(0.2, 1.4, 0.65, 1);
			.devider {
				cursor: ns-resize;
				.buttons {
					height: 28px;
					overflow: hidden;
					display: flex;
					justify-content: center;
					align-items: center;
					button {
						// display: inline-block;
						text-align: center;
						// width: 80px;
						height: 28px;
						padding: 0 8px;
						background-color: transparent;
						border: none;
						transition: width 0.3s ease;
						&:hover {
							background-color: hwb(var(--hoverLightBg) / 0.5);
							box-shadow: 0 0 4px 2px hwb(var(--hoverShadow) / 0.05);
						}
						&:active {
							background-color: transparent;
							box-shadow: 0 0 2px 1px hwb(var(--hoverShadow) / 0.05), // 外部阴影
										0 6px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
							transform: translateY(0.25px);
						}
						svg {
							width: 24px;
							height: 24px;
							vertical-align: middle;
							filter: var(--paraBoxButtonDropFilterSvg);
						}
						span {
							display: inline-block;
							// width: 32px;
							vertical-align: -4.5px;
							padding-left: 4px;
							letter-spacing: 2px;
							white-space: nowrap;
							overflow: hidden;
							transition: width 0.3s ease, padding 0.3s ease;
							filter: var(--paraBoxButtonDropFilterText);
						}
					}
				}
				.leftButton {
					position: absolute;
					top: 0;
					left: 0;
					width: 40px;
					height: 28px;
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 0;
					background-color: transparent;
					border: none;
					transition: width 0.3s ease;
					&:hover {
						background-color: hwb(var(--hoverLightBg) / 0.5);
						box-shadow: 0 0 4px 2px hwb(var(--hoverShadow) / 0.05);
					}
					&:active {
						background-color: transparent;
						box-shadow: 0 0 2px 1px hwb(var(--hoverShadow) / 0.05), // 外部阴影
									0 6px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
						transform: translateY(0.25px);
					}
					span {
						position: relative;
						display: inline-block;
						width: 0px;
						margin-left: 0px;
						letter-spacing: 1px;
						top: -0.5px;
						white-space: nowrap;
						overflow: hidden;
						color: #777;
						transition: width 0.3s ease, padding 0.3s ease;
						filter: var(--paraBoxButtonDropFilterText);
					}
					svg {
						width: 20px;
						height: 20px;
						color: #777;
						transition: transform 0.4s cubic-bezier(0.2, 1.4, 0.65, 1);
					}
					@media only screen and (min-width: 600px) {
						width: 120px;
						span {
							width: 62px;
							margin-left: 8px;
						}
					}
				}
			}
		}
		.lower {
			position: relative;
			height: 100%;
			isolation: isolate;
			overflow: hidden;
			display: flex;
			// align-items: center;	/* 一行 */
			/* align-content: space-between;	 多行 */
			justify-content: center;
			font-size: 14px;
			&>.left, &>.right {
				height: 100%;
				box-sizing: border-box;
				padding: 10px 12px;
				text-align: left;
				// outline: red 1px solid;
				.title {
					height: 24px;
					display: flex;
					justify-content: space-between;
					align-items: center;
					white-space: nowrap;
					overflow: hidden;
					.right {
						flex: 0 1 auto;
						display: flex;
						justify-content: space-between;
						align-items: center;
						white-space: nowrap;
					}
				}
				.listContainer {
					position: relative;
					width: 100%;
					height: calc(100% - 24px);
					box-sizing: border-box;
					padding: 4px;
					border-radius: 6px;
					background: hwb(var(--bg98) / 0.5);
					box-shadow: 0 0 1px 1px hwb(0 0% 100% / 0.05), // 外部阴影
								0 -1px 1px 0px hwb(var(--highlight) / 0.6) inset,	// 上高光
								0 4px 6px hwb(0 0% 100% / 0.03) inset, // 内部凹陷阴影（短）
								0 4px 24px hwb(0 0% 100% / 0.06) inset; // 内部凹陷阴影（长）
					overflow: hidden auto;
					.listItem {
						position: relative;
						display: flex;
						align-items: center;
						height: var(--itemHeight);
						line-height: var(--itemHeight);
						padding: 0 8px;
						border: 1px solid transparent;
						border-radius: 6px;
						font-size: 13px;
						// overflow: hidden;
						isolation: isolate;
						transition: padding 0.3s ease, background-color 0.3s;
						&::after {
							content: '';
							position: absolute;
							left: 4px;
							bottom: 0;
							right: 4px;
							background-color: hwb(var(--hoverShadow) / 0.05);
							height: 1px;
						}
						&:hover {
							.operations {
								width: 76px;
								box-shadow: -14px 0 12px -14px hwb(var(--highlight));
								transition: box-shadow 0.6s cubic-bezier(0.1, 6, 0.6, 1), width 0.4s cubic-bezier(0.1, 1.6, 0.6, 0.9);
							}
						}
						.operations {
							width: 0px;
							flex: 0 0 auto;
							white-space: nowrap;
							border-radius: 8px;
							box-shadow: -14px 0 12px -16px hwb(var(--highlight) / 0);
							transition: width 2s cubic-bezier(1, -0.05, 0.8, 0.1);
							button {
								flex: 0 0 auto;
								width: 26px;
								height: 24px;
								display: inline-flex;
								justify-content: center;
								align-items: center;
								border: none;
								outline: none;
								background: none;
								padding: 0;
								margin: 0px;
								font-size: 16px;
								vertical-align: middle;
								border-radius: 4px;
								&:hover {
									box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.2),
												0 4px 2px -2px hwb(var(--highlight) / 0.5) inset;
								}
								&:active {
									box-shadow: 0 0px 1px hwb(var(--hoverShadow) / 0.2),
												0 15px 20px -10px hwb(var(--hoverShadow) / 0.15) inset;
									transform: translateY(0.25px);
								}
								svg {
									color: var(--33);
									width: 20px;
									height: 20px;
									opacity: 0.5;
								}
							}
						}
						svg {
							width: 22px;
							margin-right: 8px;
						}
						span {
							flex: 1 1 auto;
							font-family: Arial;
							white-space: nowrap;
							overflow: hidden;
						}
						.progress {
							position: absolute;
							top: 0;
							left: 0;
							height: 100%;
							width: 100%;
							z-index: -1;
							div {
								height: 100%;
								transition: width 0.1s linear;
								border-radius: 6px;
							}
						}
					}
					.listItemSelected {
						background-color: hwb(var(--menuItemHovered));
						border: hwb(var(--menuItemSelected)) 1px solid;
					}
					.listItemMove {
						transition: all 0.3s ease;
					}
					.listItemFromTo {
						opacity: 0;
						// transform: translateX(30px);
					}
					.listItemLeaveActive {
						position: absolute;
					}
				}

			}
			.dragger {
				height: 100%;
				width: 16px;
				display: flex;
				justify-content: center;
				align-items: center;
				margin: 0 -8px;
				z-index: 1;	// 为了防止被 .right 遮住
				cursor: ew-resize;
				// outline: green 1px solid;
				&::after {
					content: '';
					height: calc(100% - 24px);
					width: 4px;
					// background-color: hwb(var(--opposite80)  / 0.2);
					border-radius: 2px;
					background-color: hwb(var(--hoverLightBg) / 0.5);
					box-shadow: 0.5px 1px 4px hwb(var(--hoverShadow) / 0.2),    // 阴影（写在最前面，渲染时最后渲染）
								0 0 0.5px 1.5px hwb(var(--hoverLightBg)), // 斜坡，其中扩展半径是斜坡长度，模糊半径是斜坡底的缓坡
								0 1px 1px 0px hwb(var(--highlight) / 0.5) inset;	// 上高光
					pointer-events: none;
				}
			}
		}
	}

	// 主题
	.transferCenter[data-color_theme="themeLight"] {
		.progress {
			filter: drop-shadow(0 3px 8px hwb(225 40% 20% / 0.4));
			&>div {
				background: linear-gradient(180deg, hwb(225 75% 0% / 0.7), hwb(225 60% 0% / 0.7));
				// box-shadow: 0 3px 8px 0 hwb(225 40% 20% / 0.15),
				// 			0 0px 1px 0.75px hwb(225 80% 0%) inset;
			}
		}
		.progressError {
			filter: drop-shadow(0 3px 8px hwb(0 40% 20% / 0.4));
			&>div {
				background: linear-gradient(180deg, hwb(0 75% 0% / 0.7), hwb(0 60% 0% / 0.7));
			}
		}
	}
	.transferCenter[data-color_theme="themeDark"] {
		.progress {
			filter: drop-shadow(0 3px 8px hwb(225 40% 20% / 0.1));
			&>div {
				background: linear-gradient(180deg, hwb(225 25% 15% / 0.7), hwb(225 20% 30% / 0.7));
				// box-shadow: 0 3px 8px 0 hwb(225 40% 20% / 0.1),
				// 			0 0px 1px 0.75px hwb(225 80% 0% / 0.25) inset;
			}
		}
		.progressError {
			filter: drop-shadow(0 3px 8px hwb(0 40% 20% / 0.1));
			&>div {
				background: linear-gradient(180deg, hwb(0 25% 15% / 0.7), hwb(0 20% 30% / 0.7));
			}
		}
	}
</style>
