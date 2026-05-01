<script setup lang="tsx">
import { computed, ref, watch } from 'vue';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { useAppStore } from '@renderer/stores/appStore';
import { NotificationLevel } from '@common/types';
import { getOutputFileBaseName } from '@common/params/formats';
import { getOutputFileTime } from '@common/utils';
import { showAddTaskPrompt, showOpenFilePrompt } from '@renderer/components/misc/AddTasks';
import Popup from '@renderer/components/Popup/Popup';
import { TaskItem } from './TaskItem/TaskItem';
import showMenu from '@renderer/components/Menu/Menu';
import i11n from '@common/i11n/i11n';
import dropFilesImage from '@renderer/assets/komorebi-guides/drop-files.png';
import ffmpegGuideImage from '@renderer/assets/komorebi-guides/ffmpeg-guide.png';

const appStore = useAppStore();
const tr = computed(() => {
	appStore.frontendSettings.language;
	return i11n.frontend.ffmpegGuide;
});

const selectedTask_last = ref(-1);
const taskListRef = ref<HTMLDivElement>();
const itemRefs = ref(new Map());	// index -> TaskItem
const isVisible = ref(new Map<number, boolean>());	// index -> boolean
let observer: IntersectionObserver;

const tasks = computed(() => {
	// console.log('服务器', appStore.currentServer, '任务', appStore.currentServer?.data.tasks);
	const currentServer = appStore.currentServer;
	if (!currentServer) {
		return [];
	}
	const ret = [];
	// 为 tasklist 中的每个条目补充 id（以前我这么设计，是为了节省一个字段，🤔但现在看来这个做法有点“个性”😂）
	for (const [id_s, task] of Object.entries(currentServer.data.tasks)) {
		let id = parseInt(id_s);
		if (id_s !== '-1') {
			ret.push({ ...task, id });
		}
	}
	return ret;
});

// const taskList = computed(() => Object.keys(appStore.currentServer.data.tasks).map((s_id, index) => ({
// 	task: appStore.currentServer.data.tasks[+s_id],
// 	id: +s_id,
// 	index,
// 	selected: appStore.selectedTask.has(+s_id),
// 	shouldHandleHover: true,
// 	onClick: handleTaskClicked,
// })).concat({ task: undefined, id: -1, index: -1 } as any));

// const heightList = computed(() => Object.entries(appStore.currentServer.data.tasks).map(([s_id, task]) => {
// 	const settings = appStore.taskViewSettings;
// 	const uploadFiles = appStore.currentServer.data.uploadFiles.filter((uploadFile) => uploadFile.taskId === +s_id);
// 	const isUploading = uploadFiles.length > 0 && task.status === TaskStatus.initializing;
// 	const showDashboard = [TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finishing].includes(task.status) || isUploading;
// 	let height = 4;
// 	height += settings.showParams ? 24 : 0;
// 	height += showDashboard ? 72 : 0;
// 	height += settings.showCmd ? 64 : 0;
// 	height = Math.max(24, height);
// 	return height;
// }));

const debugLauncher = (() => {
	let clickSpeedCounter = 0;
	let clickSpeedTimer = 0;
	let clickSpeedTimerStatus = false;
	return function (event: MouseEvent) {
		if (event.button !== 2) {
			return;
		}
		clickSpeedCounter += 20;
		if (clickSpeedCounter > 100) {
			Popup({
			    message: '打开开发者工具',
			    level: NotificationLevel.info
			});
			console.log('打开开发者工具');
			nodeBridge.openDevTools();
			clickSpeedCounter = 0;
			clearInterval(clickSpeedTimer);
			clickSpeedTimerStatus = false;
		} else if (clickSpeedTimerStatus == false) {
			clickSpeedTimerStatus = true;
			clickSpeedTimer = setInterval(() => {
				// console.log(clickSpeedCounter)
				if (clickSpeedCounter == 0) {
					clearInterval(clickSpeedTimer);
					clickSpeedTimerStatus = false;
				}
				clickSpeedCounter -= 1;
			}, 70) as any as number;
		}
	}
})();


const bindItemRef = (el: any) => {
	// 卸载时 el 不存在
	const index = +el?.$el.dataset.index;
	if (el?.$el && itemRefs.value.get(index) !== el.$el) {
		itemRefs.value.set(index, el.$el);
		// console.log('bindItemRef', el.$el.dataset);
	}
};

const handleTaskClicked = (event: MouseEvent, id: number, index: number) => {
	let currentSelection = new Set(appStore.selectedTask);
	if (event.shiftKey) {
		if (selectedTask_last.value !== -1) {		// 之前没选东西，现在选一堆
			currentSelection.clear();
			const minIndex = Math.min(selectedTask_last.value, index);
			const maxIndex = Math.max(selectedTask_last.value, index);
			for (let i = minIndex; i <= maxIndex; i++) {	// 对 taskOrder 里指定区域项目进行选择
				currentSelection.add(tasks.value[i].id);
				// if (taskArray.has(id)) {	// 如果任务未被删除
				// 	currentSelection.add(i);
				// }
			}
		} else {							// 之前没选东西，现在选第一个
			currentSelection = new Set([id]);
		}
	} else if (event.ctrlKey == true || nodeBridge.os === 'MacOS' && event.metaKey == true) {
		if (currentSelection.has(id)) {
			currentSelection.delete(id);
		} else {
			currentSelection.add(id);
		}
	} else {
		currentSelection.clear();
		currentSelection.add(id);
	}
	selectedTask_last.value = index;
	// this.selectedTask = new Set([...this.selectedTask])	// 更新自身的引用值以触发 computed: taskSelected
	appStore.selectedTask = new Set([...currentSelection]);
	appStore.applySelectedTask();
};

const handleTaskBatchContextMenu = (event: MouseEvent) => {
	showMenu({
		menu: [
			{ type: 'normal', label: `已选中 ${appStore.selectedTask.size} 个任务`, value: 'description', disabled: true },
			{ type: 'separator',  },
			{ type: 'normal', icon: <span>▶️</span>, label: '立即开始', value: '立即开始选中任务', tooltip: '马上启动所选任务的编码（仅对未启动、排队开始、排队继续任务有效）', onClick: () => {
				for (const taskId of appStore.selectedTask) {
					appStore.currentServer.entity.taskStart(taskId);
				}
			} },
			{ type: 'normal', icon: <span>⏳</span>, label: '排队开始', value: '排队开始选中任务', tooltip: '将所选任务置入准备状态（对未启动任务置入排队开始状态，对已暂停任务置入排队继续状态）', onClick: () => {
				for (const taskId of appStore.selectedTask) {
					appStore.currentServer.entity.taskReady(taskId);
				}
			} },
			{ type: 'normal', icon: <span>⏹️</span>, label: '停止或重置', value: '停止或重置选中任务', tooltip: '对正在运行任务进行软停止，对正在停止任务进行硬停止，对已停止、已完成、出错任务置入未开始状态', onClick: () => {
				for (const taskId of appStore.selectedTask) {
					appStore.currentServer.entity.taskReset(taskId);
				}
			} },
			{ type: 'normal', icon: <span>🗑️</span>, label: '删除', value: '删除选中任务', tooltip: '对未开始、上传中任务进行删除操作（对其他状态任务无效）', onClick: () => {
				appStore.deleteTasks([...appStore.selectedTask]);
			} },
			...(appStore.currentServer.entity.ip !== 'localhost' ? [
				{ type: 'normal' as const, icon: <span>⬇️</span>, label: '下载输出文件', value: '下载输出文件', tooltip: '将所有已完成任务输出文件下载到指定文件夹', onClick: () => {
					const entity = appStore.currentServer.entity;
					const tasks = [...appStore.selectedTask].map((taskId) => appStore.currentServer.data.tasks[taskId]);
					if (nodeBridge.env === 'electron') {
						const downloadList = [];
						for (const task of tasks) {
							for (const [s_index, filePath] of Object.entries(task.outputFiles)) {
								const newFileBaseName = getOutputFileBaseName(task.after.outputs[+s_index].mux, task.taskName);
								const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
								let fileTime = undefined;
								const output = task.after.outputs[+s_index];
								const mux = output.mux;
								if (mux.keepFileTime) {
									let { accessTime, createTime, modifyTime, ok } = getOutputFileTime(task, +s_index);
									fileTime = { accessTime, createTime, modifyTime };
								}
								downloadList.push({ url, finalFileBaseName: newFileBaseName, fileTime });
								appStore.downloadMap.set(url, appStore.currentServer.data.id);
							}							
						}
						nodeBridge.ipcRenderer?.send('downloadFiles', { sessionId: entity.sessionId, files: downloadList });
					} else {
						for (const task of tasks) {
							for (const [s_index, filePath] of Object.entries(task.outputFiles)) {
								const newFileBaseName = getOutputFileBaseName(task.after.outputs[+s_index].mux, task.taskName);
								const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
								const elem = document.createElement('a');
								elem.href = `${url}?fileBaseName=${newFileBaseName}`;	// 目前只对浏览器环境添加此参数控制响应的 header。electron 环境会涉及 encodeURI 的操作，因此较方便的做法是分开处理
								elem.click();
							}
						}
					}
				} },
			] : []),
		],
		type: 'action',
		triggerRect: { xMin: event.pageX - 110, xMax: event.pageX + 110, yMin: event.pageY, yMax: event.pageY },
	})
};

const handleDownloadFFmpegClicked = () => {
	nodeBridge.jumpToUrl('https://ffmpeg.org/download.html');
};

// 新任务加入，滚动到底
watch(() => tasks.value.length, (newValue, oldValue) => {
	if (newValue > oldValue) {
		const elem = taskListRef.value.parentElement;
		const elemHeight = elem.getBoundingClientRect().height;
		if (elem.scrollTop + elemHeight > elem.scrollHeight - elemHeight * 1) {
			elem.scrollTop = elem.scrollHeight - elem.getBoundingClientRect().height;
		}
	}
});

const handleEntry = (entry: IntersectionObserverEntry, dataset: any) => {
	isVisible.value.set(+dataset.index, entry.isIntersecting);
}
const intersectProps = computed(() => ({ onChange: handleEntry, options: {  } }));

</script>

<template>
	<div class="listarea">
		<div class="tasklist" ref="taskListRef">
			<TransitionGroup name="tasklistTrans">
				<TaskItem
					v-for="(id, index) in Object.keys(appStore.frontendSettings.useVirtualTaskList ? appStore.currentServer.data.tasks : []).map(Number)"
					v-intersect="intersectProps"
					:key="id"
					:task="appStore.currentServer.data.tasks[id]"
					:id="id"
					:index="index"
					:show="isVisible.get(index - 2) || isVisible.get(index + 2) || isVisible.get(index)"
					:ref="bindItemRef"
					:selected="appStore.selectedTask.has(id)"
					:should-handle-hover="true"
					@click="handleTaskClicked"
					@batchContextMenu="handleTaskBatchContextMenu"
				/>
				<TaskItem
					v-for="(id, index) in Object.keys(appStore.frontendSettings.useVirtualTaskList ? [] : appStore.currentServer.data.tasks).map(Number)"
					:key="id"
					:task="appStore.currentServer.data.tasks[id]"
					:id="id"
					:index="index"
					:show="true"
					:selected="appStore.selectedTask.has(id)"
					:should-handle-hover="true"
					@click="handleTaskClicked"
					@batchContextMenu="handleTaskBatchContextMenu"
				/>
			</TransitionGroup>
		</div>
		<div
			v-if="appStore.currentServer?.data.ffmpegInfo.version"
			class="dropfilesdiv"
			@click="appStore.selectedTask = new Set(); appStore.taskSelectionModified = false;"
			@mousedown="debugLauncher($event)"
			@dblclick="nodeBridge.env === 'electron' ? showAddTaskPrompt() : showOpenFilePrompt().then((fileList) => appStore.addTasks(fileList))"
		>
			<img class="dropfilesimage imgNormal" :src="dropFilesImage" alt="" />
		</div>
		<div v-if="!appStore.currentServer?.data.ffmpegInfo.version && appStore.currentServer?.data.ffmpegInfo.scanning" class="noffmpeg">
			<div class="box">
				<img class="guideImage" :src="ffmpegGuideImage" alt="" />
				<div class="right">
					<h2>{{ tr.checkingTitle }}</h2>
					<p class="smallTip">{{ tr.checkingText }}</p>
				</div>
			</div>
		</div>
		<div v-else-if="!appStore.currentServer?.data.ffmpegInfo.version" class="noffmpeg">
			<div class="box">
				<img class="guideImage" :src="ffmpegGuideImage" alt="" />
				<div class="right">
					<h2>{{ tr.missingTitle }}</h2>
					<p class="smallTip">{{ tr.missingTip }}</p>
					<div style="height: 12px" />
					<p>1. <a @click="handleDownloadFFmpegClicked">FFmpeg</a> {{ tr.stepDownload }} <span>{{ appStore.currentServer.data.os || tr.currentOs }}</span></p>
					<p v-if="['Windows', 'unknown'].includes(appStore.currentServer.data.os)">　　2.1. {{ tr.stepWindowsPath }}</p>
					<p v-if="['MacOS', 'Linux'].includes(appStore.currentServer.data.os)">　　2.1. {{ tr.stepUnixPath }}</p>
					<p v-if="['Windows', 'Linux', 'unknown'].includes(appStore.currentServer.data.os)">　　2.2. {{ tr.stepSameDir }}</p>
					<p v-if="appStore.currentServer.data.os === 'MacOS'">　　2.2. {{ tr.stepMacDir(appStore.currentServer.data.isSandboxed ? 'Komorebi.app/Contents/Resources' : 'KomorebiService executable directory') }}</p>
					<div style="height: 4px" />
					<p>{{ tr.restart(appStore.currentServer.entity.ip === 'localhost' ? 'Komorebi' : 'KomorebiService') }}</p>
					<div style="height: 12px" />
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped lang="less">
	.listarea {
		position: relative;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		height: 100%;
		padding: 8px 0;
		overflow-y: auto;
		.tasklist {
			margin-bottom: 14px;
			.tasklistTrans-enter-from {
				--height: 0px !important;
				margin-bottom: 0;
				opacity: 0;
				// transition: all 3s ease, opacity 0.3s linear;	// 进场动画在这里控制 var 无效，需要在子节点直接控制变换的属性
			}
			.tasklistTrans-leave-to {
				--height: 0px !important;
				margin-bottom: 0;
				opacity: 0;
				transform: translateY(-4px);
				transition: height 0.16s ease, margin-bottom 0.16s ease, opacity 0.12s linear, transform 0.12s ease;
			}
			.tasklistTrans-enter-to, .tasklistTrans-leave-from {
			}
		}
		.dropfilesdiv {
			display: flex;
			width: 100%;
			min-height: 80px;
			flex-grow: 1;
			.dropfilesimage {
				margin: auto;
				width: 100%;
				max-height: 200px;
				height: 100%;
				object-fit: contain;
				opacity: 0.9;
				filter: drop-shadow(0 8px 14px hwb(var(--hoverShadow) / 0.08));
				transform: translateY(0) scale(1);
				transition: transform 0.18s ease, opacity 0.18s ease, filter 0.18s ease;
				will-change: transform, opacity;
			}
			&:hover .dropfilesimage {
				opacity: 1;
				transform: translateY(-2px) scale(1.015);
				filter: drop-shadow(0 12px 20px hwb(var(--hoverShadow) / 0.12));
			}
			.imgDragging {
				transform: translateY(-4px) scale(1.03);
			}
		}
		.noffmpeg {
			position: absolute;
			left: 0;
			top: 0;
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: center;
			align-items: center;
			.box {
				border-radius: 8px;
				background-color: hwb(var(--bg97) / 0.8);
				box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
							0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),
							0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),
							0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
				display: flex;
				justify-content: center;
				align-items: center;
				width: 720px;
				text-align: left;
				transition: all 0.3s ease-in-out;
				@media only screen and (max-width: 760px) {
					width: 660px;
				}
				.guideImage {
					width: 120px;
					height: auto;
					padding-right: 24px;
					object-fit: contain;
					filter: drop-shadow(0 8px 16px hwb(var(--hoverShadow) / 0.1));
					transition: width 0.3s ease-in-out, padding-right 0.3s ease-in-out, transform 0.2s ease, filter 0.2s ease;
					will-change: transform;
					@media only screen and (max-width: 680px) {
						width: 0;
						padding-right: 0;
					}
				}
				&:hover .guideImage {
					transform: translateY(-2px);
					filter: drop-shadow(0 12px 20px hwb(var(--hoverShadow) / 0.14));
				}
				.right {
					padding: 0 12px;
					h2 {
						font-size: 20px;
						color: var(--titleText);
					}
					.smallTip {
						margin-top: -16px;
						font-size: 13px;
					}
					p {
						font-size: 15px;
						margin-block-start: 0.5em;
						margin-block-end: 0.5em;
					}
					a {
						color: var(--titleText);
						cursor: pointer;
					}
				}
			}
		}
	}
</style>
