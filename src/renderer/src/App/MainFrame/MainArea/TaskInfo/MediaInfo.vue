<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Task, TaskStatus } from '@common/types';
import { formatTimeToFFmpegStyle, getOutputFileTime, getTimeString } from '@common/utils';
import { getOutputFileBaseName } from '@common/params/formats';
import { useTooltip } from '@renderer/common/tooltipUtil';
import { useAppStore } from '@renderer/stores/appStore';
import nodeBridge from '@renderer/bridges/nodeBridge';
import Popup from '@renderer/components/Popup/Popup';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], count: appStore.selectedTask.size }
);

const centerDraggerPos = ref(50);

const openFile = (task: Task, filePath: string, outputIndex?: number) => {
	const entity = appStore.currentServer.entity;
	if ([TaskStatus.finished, TaskStatus.error].includes(task.status)) {
		if (entity.ip === 'localhost') {
			nodeBridge.openFile(`"${filePath}"`);
		} else {
			const newFileBaseName = getOutputFileBaseName(task.after.outputs[outputIndex].mux, task.taskName);
			const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
			if (nodeBridge.env === 'electron') {
				let fileTime = undefined;
				const output = task.after.outputs[outputIndex];
				const mux = output.mux;
				if (mux.keepFileTime) {
					let { accessTime, createTime, modifyTime, ok } = getOutputFileTime(task, outputIndex);
					fileTime = { accessTime, createTime, modifyTime };
				}
				nodeBridge.ipcRenderer?.send('downloadFile', { url, sessionId: entity.sessionId, finalFileBaseName: newFileBaseName, fileTime });
				appStore.downloadMap.set(url, appStore.currentServer.data.id);
			} else {
				const elem = document.createElement('a');
				elem.href = `${url}?fileBaseName=${newFileBaseName}`;	// 目前只对浏览器环境添加此参数控制响应的 header。electron 环境会涉及 encodeURI 的操作，因此较方便的做法是分开处理
				elem.click();
			}
		}
	} else {
		Popup({ message: `转码完成后才可以${entity.ip === 'localhost' ? '打开' : '下载'}输出文件哦` })
	}
};

const getOutputFileTimeString = (task: Task, index: number, type: 'createTime' | 'modifyTime') => {
	const result = getOutputFileTime(task, index);
	if (result.ok) {
		return getTimeString(new Date(result[type]));
	} else {
		return '不改变';
	}
}

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

</script>

<template>
	<div class="mediaInfo">
		<div class="title">{{ selectedTasks.count === 0 ? '您未选择任务' : selectedTasks.task.taskName }}</div>
		<div class="container" :data-color_theme="appStore.frontendSettings.colorTheme">
            <div class="left" :style="{ width: `${centerDraggerPos}%` }">
				<div class="title">
					输入文件信息
				</div>
				<div class="listContainer">
					<button
						class="node inputNode"
						v-if="selectedTasks.task?.before"
						v-for="(inputFile, index) in selectedTasks.task.before"
					>
						<div class="fileName">{{ inputFile.path ?? '-' }}</div>
						<div class="groups">
							<div class="group" v-if="inputFile.demuxer">
								<table><tbody>
									<tr>
										<td>解复用器</td>
										<td>{{ inputFile.demuxer }}</td>
									</tr>
									<tr>
										<td>时长</td>
										<td>{{ formatTimeToFFmpegStyle(inputFile.duration) }}</td>
									</tr>
								</tbody></table>
							</div>
							<div class="group" v-if="inputFile.metadata">
								<table><tbody>
									<tr v-for="[key, value] in Object.entries(inputFile.metadata || {})">
										<td>{{ key }}</td>
										<td>{{ value }}</td>
									</tr>
								</tbody></table>
							</div>
							<div class="group">
								<table><tbody>
									<tr>
										<td>创建时间</td>
										<td>{{ inputFile.createTime ? getTimeString(new Date(inputFile.createTime), false) : '-' }}</td>
									</tr>
									<tr>
										<td>修改时间</td>
										<td>{{ inputFile.modifyTime ? getTimeString(new Date(inputFile.modifyTime), false) : '-' }}</td>
									</tr>
								</tbody></table>
							</div>
						</div>
						<div class="streamGroups" v-if="inputFile.streams">
							<i></i>
							<div
								class="group"
								v-for="stream in inputFile.streams" v-bind="useTooltip(`${stream.infoText}\n元信息: ${JSON.stringify(stream.metadata, undefined, ' ')}\n旁数据：${JSON.stringify(stream.sidedata, undefined, ' ')}`, 'tl')"
							>
								<div class="defaultLabel" v-if="stream.isDefault">默认</div>
								<div class="streamType">{{ ['视频', '音频', '字幕', '数据', '附件', stream.type][['Video', 'Audio', 'Subtitle', 'Data', 'Attachment', stream.type].indexOf(stream.type)] }}</div>
								<table><tbody>
									<tr>
										<td>编码</td>
										<td>{{ stream.codec }}</td>
									</tr>
									<tr v-if="stream.bitrate">
										<td>码率</td>
										<td>{{ stream.bitrate }} kbps</td>
									</tr>
									<tr v-if="stream.language">
										<td>语言</td>
										<td>{{ stream.language }}</td>
									</tr>
									<tr v-if="stream.resolution">
										<td>尺寸</td>
										<td>{{ stream.resolution }}</td>
									</tr>
									<tr v-if="stream.fps">
										<td>帧率</td>
										<td>{{ stream.fps }}</td>
									</tr>
									<tr v-if="stream.sampleRate">
										<td>采样率</td>
										<td>{{ stream.sampleRate }} Hz</td>
									</tr>
									<tr v-if="stream.channel">
										<td>声道</td>
										<td>{{ stream.channel }}</td>
									</tr>
									<tr v-for="[key, value] in Object.entries(stream.metadata)">
										<td>{{ key }}</td>
										<td>{{ value }}</td>
									</tr>
									<tr v-for="line in stream.sidedata">
										<td colspan="2" class="sideData">{{ line }}</td>
									</tr>
								</tbody></table>
							</div>
							<i></i>
						</div>
						<div class="streamGroups" v-if="inputFile.chapters?.length">
							<i></i>
							<div
								class="group"
								v-for="chapter in inputFile.chapters" v-bind="useTooltip(`${chapter.infoText}\n元信息: ${JSON.stringify(chapter.metadata, undefined, ' ')}`, 'tl')"
							>
								<div class="streamType">章节</div>
								<table><tbody>
									<tr>
										<td>起时</td>
										<td>{{ chapter.start }}</td>
									</tr>
									<tr>
										<td>止时</td>
										<td>{{ chapter.end }}</td>
									</tr>
									<tr v-for="[key, value] in Object.entries(chapter.metadata)">
										<td>{{ key }}</td>
										<td>{{ value }}</td>
									</tr>
								</tbody></table>
							</div>
							<i></i>
						</div>
					</button>
				</div>
			</div>
			<div class="dragger" :style="{ left: `${centerDraggerPos}%` }" @mousedown="handleCenterDraggerDragStart($event)" @touchstart="handleCenterDraggerDragStart($event)" />
			<div class="right" :style="{ width: `${100 - centerDraggerPos}%`}">
				<div class="title">输出文件信息</div>
				<div class="listContainer">
					<button
						class="node outputNode"
						v-if="selectedTasks.task"
						v-for="(outputFile, index) in selectedTasks.task.outputFiles"
						@click="openFile(selectedTasks.task, outputFile, index)"
						v-bind="useTooltip(appStore.currentServer.entity.ip === 'localhost' ? '点击打开输出文件' : '点击下载输出文件', 'tr')"
					>
						<div class="fileName">{{ outputFile }}</div>
						<div class="groups">
							<div class="group">
								<div class="infoBlock">
									<h4>创建时间</h4>
									<p>{{ getOutputFileTimeString(selectedTasks.task, index, 'createTime') }}</p>
								</div>
							</div>
							<div class="group">
								<div class="infoBlock">
									<h4>修改时间</h4>
									<p>{{ getOutputFileTimeString(selectedTasks.task, index, 'modifyTime') }}</p>
								</div>
							</div>
						</div>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style lang="less" scoped>
	.mediaInfo {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		&>.title {
			height: 18px;
			box-sizing: border-box;
			font-size: 14px;
			padding: 4px;
			// margin-bottom: -8px;
		}
		.container {
			width: 100%;
			height: calc(100% - 18px);
			display: flex;
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
					height: calc(100% - 24px);
					box-sizing: border-box;
					margin: 0 -4px;
					padding: 4px;
					overflow: auto;
					.node {
						width: 100%;
						border: none;
						color: inherit;
						background: linear-gradient(180deg, hwb(var(--bg99)), hwb(var(--bg94)));
						border-radius: 8px;
						padding: 12px;
						font-family: inherit;
						&:active {
							transform: translateY(0.5px);
						}
					}
					.inputNode, .outputNode {
						.fileName {
							font-size: 14px;
							font-weight: 500;
							margin: 0 0 8px;
							overflow: hidden;
							text-overflow: ellipsis;
						}
						.groups {
							display: flex;
							justify-content: stretch;
							overflow: auto;
							margin: 0 -8px;
							.group {
								flex: 1 1 auto;
								padding: 0 8px;
								overflow: hidden;
								&:not(.group:last-child) {
									border-right: hwb(0 50% 50% / 0.2) 1px solid;
								}
								table, tbody {
									width: 100%;
								}
								tr {
									height: 18px;
									td:first-child {
										padding-right: 0.5em;
										font-size: 10px;
										font-weight: 500;
										line-height: 20px;
										text-align: right;
										white-space: nowrap;
										overflow: hidden;
										text-overflow: ellipsis;
										opacity: 0.7;
									}
									td:last-child {
										text-align: left;
										white-space: nowrap;
										max-width: 144px;
										overflow: hidden;
										text-overflow: ellipsis;
									}
								}
							}
						}
						.streamGroups {
							display: flex;
							justify-content: space-between;
							gap: 12px;
							padding: 8px 0 12px;
							margin-bottom: -8px;
							overflow: auto hidden;
							i:first-child {
								margin-right: -8px;
							}
							i:last-child {
								margin-left: -8px;
							}
							.group {
								position: relative;
								box-sizing: border-box;
								// border: hwb(0 50% 50% / 0.4) dashed 1.5px;
								// outline: red 1px solid;
								padding: 12px 12px 8px;
								border-radius: 24px;
								box-shadow: -4px -8px 8px 0 hwb(var(--hoverLightBg) / 0.3),	// 上发光
											4px 8px 4px -2px hwb(var(--hoverLightBg) / 0.3),	// 下折射光线
											5px 10px 4px 0 hwb(var(--hoverShadow) / 0.08),	// 下投影
											3px 6px 3px 0 hwb(var(--hoverShadow) / 0.08) inset,	// 内部上折射遮挡
											-2px -4px 3px 0 hwb(var(--hoverLightBg) / 0.8) inset,	// 内部下反射
								;
								background-color: hwb(var(--bg100) / 0.1);
								.defaultLabel {
									position: absolute;
									top: 12px;
									left: 16px;
									padding: 3px 5px;
									// background-color: hwb(var(--opposite80) / 0.5);
									// color: var(--f7);
									background-color: hwb(120 0% 10% / 0.3);
									box-shadow: 2px 4px 2px 0 hwb(120 0% 60% / 0.1);	// 下投影
									border-radius: 12px;
									font-size: 10px;
								}
								.streamType {
									font-size: 16px;
									font-weight: 500;
									margin-bottom: 4px;
								}
								tr {
									height: 18px;
									td:first-child:not(td:only-child) {
										padding-right: 0.5em;
										font-size: 10px;
										font-weight: 500;
										line-height: 20px;
										text-align: right;
										white-space: nowrap;
										max-width: 114px;
										overflow: hidden;
										text-overflow: ellipsis;
										opacity: 0.7;
									}
									td:last-child {
										text-align: left;
										white-space: nowrap;
										max-width: 114px;
										overflow: hidden;
										text-overflow: ellipsis;
									}
									.sideData {
										text-align: middle;
										white-space: nowrap;
										overflow: hidden;
										text-overflow: ellipsis;
										font-size: 10px;
									}
								}
							}
						}
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
		.container[data-color_theme="themeLight"] {
			.listContainer .node {
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
				&:hover {
					box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
								0 0 0 0.5px hwb(var(--highlight)) inset,	// 包边
								0 1px 4px 0 hwb(var(--hoverShadow) / 0.4),	// 外部阴影
				}
				&:active {
					box-shadow: 0 0px 2px 0.5px hwb(var(--hoverShadow) / 0.15), // 外部阴影
								0 8px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
				}
			}
		}
		.container[data-color_theme="themeDark"] {
			.listContainer .node {
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 0 0 0.5px hwb(var(--highlight) / 0.5) inset,	// 包边
							0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
				&:hover {
					box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
								0 0 0 0.75px hwb(var(--highlight)) inset,	// 包边
								0 1px 4px 0 hwb(var(--hoverShadow) / 0.4),	// 外部阴影
				}
				&:active {
					box-shadow: 0 0px 2px 0.5px hwb(var(--hoverShadow) / 0.15), // 外部阴影
								0 8px 12px hwb(var(--hoverShadow) / 0.4) inset; // 内部凹陷阴影
				}
			}
		}
	}
</style>