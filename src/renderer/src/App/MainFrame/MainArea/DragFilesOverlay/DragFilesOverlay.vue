<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import { showAddTaskPrompt } from '@renderer/components/misc/AddTasks';
import nodeBridge from '@renderer/bridges/nodeBridge';
import i11n from '@common/i11n/i11n';
import type { KomorebiWorkflow } from '@common/komorebiPresets';
import { getKomorebiWorkflowForPaths, isKomorebiKnownInputPath } from '@common/mediaExtensions';
import Popup from '@renderer/components/Popup/Popup';
import dropFilesOkImage from '@renderer/assets/komorebi-guides/drop-files-ok.png';

const appStore = useAppStore();
const multiInputMode = ref(false);
const fastStartMode = ref(false);
const lastMousePos = ref<'multiInput' | 'fastStart' | undefined>();
const draggingStatus = ref<{ count: number, fileCount: number }>();

const largeAreaHue = computed(() => multiInputMode.value ? 220 : 200);
const isNcmMode = computed(() => appStore.komorebi.workflow === 'ncm');
const tr = computed(() => {
	appStore.frontendSettings.language;
	return i11n.frontend.dragDrop;
});
const workflowLabels = computed<Record<KomorebiWorkflow, string>>(() => ({
	'video-compress': i11n.frontend.komorebi.workflows.videoCompress,
	'audio-convert': i11n.frontend.komorebi.workflows.audioConvert,
	remux: i11n.frontend.komorebi.workflows.remux,
	ncm: i11n.frontend.komorebi.workflows.ncm,
}));

const hasKnownExtension = (filePath: string) => isKomorebiKnownInputPath(filePath);

const expandDroppedPaths = async (paths: string[]) => {
	const expanded: string[] = [];
	const categorized = await nodeBridge.getPathsCategorized(paths.join('\n'));
	for (let i = 0; i < paths.length; i++) {
		if (categorized.lineResults[i] === 'ld') {
			const subFiles = await nodeBridge.listItemsInDirectory(paths[i], { mode: 'getFiles', recursive: true, fullPath: true });
			expanded.push(...subFiles.filter(hasKnownExtension));
		} else if (['lf', 'r'].includes(categorized.lineResults[i])) {
			if (hasKnownExtension(paths[i])) {
				expanded.push(paths[i]);
			}
		}
	}
	return [...new Set(expanded)];
};

const switchWorkflowForPaths = (paths: string[]) => {
	const nextWorkflow = getKomorebiWorkflowForPaths(paths, appStore.komorebi.workflow);
	if (!nextWorkflow) {
		Popup({ message: paths.length ? tr.value.noCommonWorkflow : tr.value.noSupportedInputs, level: 2 });
		return undefined;
	}
	if (nextWorkflow !== appStore.komorebi.workflow) {
		appStore.komorebi.workflow = nextWorkflow;
		Popup({ message: tr.value.autoSwitched(workflowLabels.value[nextWorkflow]), level: 1 });
	}
	return nextWorkflow;
};

const startAddedTasksIfNeeded = (addTasksPromise: Promise<number[]>) => {
	if (!fastStartMode.value) {
		return;
	}
	addTasksPromise.then(() => {
		const server = appStore.currentServer;
		if (server.data.uploadFiles.length) {
			// 轮询检查是否所有文件都上传好了（暂时没给上传完成设监听机制，所以轮询）
			const checkStatusHandler = () => {
				const isOKList = server.data.uploadFiles.map((uploadFile) => !uploadFile.readTask && !uploadFile.hashTask && !uploadFile.uploadTask);
				if (isOKList.every((value) => value)) {
					server.entity.queueStart();
					clearInterval(checkStatusTimer);
				}
			};
			const checkStatusTimer = setInterval(checkStatusHandler, 250);
		} else {
			// 不需要上传，直接开始
			server.entity.queueStart();
		}
	});
};

const addDroppedPaths = async (rawPaths: string[]) => {
	const paths = await expandDroppedPaths(rawPaths);
	const workflow = switchWorkflowForPaths(paths);
	if (!workflow) {
		return;
	}
	if (workflow === 'ncm') {
		const taskId = await appStore.addNcmTasksFromInputs(paths);
		if (fastStartMode.value && typeof taskId === 'number' && taskId >= 0) {
			appStore.currentServer?.entity.taskStart(taskId);
		}
		return;
	}
	const addTasksPromise = appStore.addTasks(paths, multiInputMode.value ? 'multiInput' : 'multiTask') as Promise<number[]>;
	startAddedTasksIfNeeded(addTasksPromise);
};

const handleDragOver = (event: DragEvent) => {
	event.preventDefault();
	const rect = event.target.getBoundingClientRect();
	const xPos = event.offsetX / rect.width;
	const yPos = event.offsetY / rect.height;
	if (xPos >= 0.05 && xPos <= 0.25 && yPos >= 0.8 && yPos <= 0.95) {
		if (lastMousePos.value !== 'multiInput') {
			multiInputMode.value = !multiInputMode.value;
			lastMousePos.value = 'multiInput';
		}
	} else if (xPos >= 0.75 && xPos <= 0.95 && yPos >= 0.8 && yPos <= 0.95) {
		if (lastMousePos.value !== 'fastStart') {
			fastStartMode.value = !fastStartMode.value;
			lastMousePos.value = 'fastStart';
		}
	} else {
		lastMousePos.value = undefined;
	}
};

const handleDragEnter = (event: DragEvent) => {
	if (draggingStatus.value) {
		draggingStatus.value.count++;
	} else {
		let fileCount = 0;
		for (const item of event.dataTransfer?.items || []) {
			if (item.kind === 'file') {
				fileCount++;
			} else if (item.kind === 'string') {
				fileCount = -1;	// 文本类需要 drop 时才能拿到数据
				break;
			}
		}
		draggingStatus.value = { count: 1, fileCount };
	}
}

const handleDragLeave = () => {
	appStore.showDragFilesOverlay = false;
	draggingStatus.value = undefined;
};

const handleDrop = (event: DragEvent) => {
	event.preventDefault();
	draggingStatus.value = undefined;
	appStore.showDragFilesOverlay = false;
	if (event.dataTransfer?.files?.length) {
		const rawPaths = [...event.dataTransfer.files].map((file) => file.path).filter(Boolean);
		addDroppedPaths(rawPaths);
	} else if (event.dataTransfer?.items) {
		const text = event.dataTransfer?.getData('text/plain');
		const rawPaths = text.replaceAll('\r\n', '\n').split('\n').map((line) => line.trim()).filter(Boolean);
		if (rawPaths.some(hasKnownExtension)) {
			addDroppedPaths(rawPaths);
		} else {
			showAddTaskPrompt(text);
		}
	}
};

</script>

<template>
	<Transition name="dragFilesOverlayAnim">
		<div
			class="container"
			:style="{ height: appStore.paraSelected === 1 ? `${appStore.draggerPos * 100}%` : '', '--hue': largeAreaHue }"
			@dragenter="handleDragEnter"
			@dragover="handleDragOver"
			@dragleave="handleDragLeave"
			@drop="handleDrop"
			v-if="appStore.showDragFilesOverlay && appStore.currentServer?.entity.status === ServiceBridgeStatus.Connected"
		>
			<div class="dragFrame">
				<div class="inner" v-if="draggingStatus">
					<img class="guideImage" :src="dropFilesOkImage" alt="" />
					<p :style="{ fontSize: '2em' }">{{ Math.abs(draggingStatus.fileCount) }}</p>
					<p v-if="isNcmMode">{{ tr.ncmInputs(draggingStatus.fileCount === -1 ? tr.textPaths : '', Math.abs(draggingStatus.fileCount)) }}</p>
					<p v-else>{{ tr.inputs(draggingStatus.fileCount === -1 ? tr.textPaths : '', Math.abs(draggingStatus.fileCount), multiInputMode ? 'multiInput' : 'multiTask') }}</p>
				</div>
				<div class="inner" v-else>
					<img class="guideImage" :src="dropFilesOkImage" alt="" />
					<p>{{ tr.createTask }}</p>
				</div>
			</div>
			<div class="switchMultiInputMode" v-if="!isNcmMode">
				<div :class="multiInputMode ? 'small' : ''">{{ multiInputMode ? '🔲' : '✅' }} {{ tr.batchTaskMode }}</div>
				<div :class="multiInputMode ? '' : 'small'">{{ multiInputMode ? '✅' : '🔲' }} {{ tr.multiInputMode }}</div>
			</div>
			<div class="switchFastStartMode" :class="fastStartMode ? 'enabled' : ''" v-if="!draggingStatus || draggingStatus.fileCount !== -1">
				<div>{{ fastStartMode ? '✅' : '🔲' }} {{ tr.fastStart }}</div>
				<div class="small">{{ tr.status(fastStartMode) }}</div>
			</div>
		</div>
	</Transition>
</template>

<style lang="less" scoped>
	.dragFilesOverlayAnim-leave-to {
		opacity: 0;
		filter: blur(8px);
		.dragFrame>.inner {
			// -webkit-mask-image: none !important;
			backdrop-filter: none !important;
		}
	}
	.dragFilesOverlayAnim-leave-active {
		transition: opacity var(--motion-standard) ease, filter var(--motion-panel) var(--ease-exit);
	}
	.container {
		position: absolute;
		top: 0;
		width: 100%;
		height: 100%;
		container-type: size;
		container-name: box;
		z-index: 1;
		// background-color: hwb(var(--bg95) / 0.5);
		background:
			linear-gradient(to right, hwb(var(--hue) 70% 0% / 0.2), transparent 50%),
			linear-gradient(to left,  hwb(var(--hue) 70% 0% / 0.2), transparent 50%),
			linear-gradient(to top,   hwb(var(--hue) 70% 0% / 0.2), transparent 50%),
			linear-gradient(to bottom,hwb(var(--hue) 70% 0% / 0.2), transparent 50%);
		// background-blend-mode: screen; /* 或 lighten/overlay，看效果 */
		& * {
			pointer-events: none;
		}
		// .largeArea {
		// 	position: absolute;
		// 	left: 16px;
		// 	right: 16px;
		// 	top: 16px;
		// 	bottom: 16px;
		// 	border: gray 2px dashed;
		// 	pointer-events: none;
		// }
		.dragFrame {
			position: absolute;
			left: 0;
			right: 0;
			top: 0;
			bottom: 0;
			.inner {
				position: absolute;
				top: 0;
				bottom: 0;
				width: 100%;
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
				font-size: 32px;
				// filter: contrast(200%);
				backdrop-filter: blur(2px);
				text-shadow: 0 0 8px hwb(var(--bg92)),
							 0 0 4px hwb(var(--bg92));
				-webkit-mask-image: radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 70.71%);
				-webkit-mask-repeat: no-repeat;
				-webkit-mask-position: center;
				-webkit-mask-size: cover;
				.guideImage {
					width: min(26cqw, 30cqh, 220px);
					height: min(26cqw, 30cqh, 220px);
					object-fit: contain;
					margin-bottom: 10px;
					filter: drop-shadow(0 12px 24px hwb(var(--hoverShadow) / 0.16));
					animation: guideImageFloat var(--motion-float) ease-in-out infinite;
				}
				p {
					margin: 0;
				}
			}
		}
		@keyframes guideImageFloat {
			0%, 100% {
				transform: translateY(0) scale(1);
			}
			50% {
				transform: translateY(-4px) scale(1.015);
			}
		}
		.switchMultiInputMode, .switchFastStartMode {
			position: absolute;
			bottom: 5%;
			width: 20%;
			height: 15%;
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 1cqh;
			// border: gray 2px dashed;
			border-radius: min(1.5vw, 1.5vh);
			background-color: hwb(var(--bg96) / 0.5);
			box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
				0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
				0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset;	// 上高光
			backdrop-filter: blur(2px) contrast(110%);
			font-size: min(1.5cqw, 3.5cqh);
			transition: background-color var(--motion-standard) ease, border-color var(--motion-standard) ease, box-shadow var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant);
			will-change: transform, background-color;
			&>div {
				transform-origin: left center;
				transition: opacity var(--motion-standard) ease, transform var(--motion-panel) var(--ease-elegant);
				will-change: transform, opacity;
			}
			.small {
				transform: translate3d(0, 0, 0) scale(0.72);
				opacity: 0.7;
			}
		}
		.switchMultiInputMode {
			left: 5%;
			// border: hwb(var(--hue) 5% 15%) 2px dashed;
			background-color: hwb(var(--hue) 35% 5% / 0.3);
		}
		.switchFastStartMode {
			right: 5%;
			&.enabled {
				border-color: hwb(120 5% 15%);
				background-color: hwb(120 15% 5% / 0.2);
			}
		}
	}
</style>
