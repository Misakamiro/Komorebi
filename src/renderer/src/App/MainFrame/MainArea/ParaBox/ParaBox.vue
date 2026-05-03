<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import KomorebiNormalView from './KomorebiNormalView.vue';
import { KomorebiWorkflow } from '@common/komorebiPresets';
import { getFileExtension, getKomorebiInputKind, isKomorebiDroppablePath } from '@common/mediaExtensions';
import i11n from '@common/i11n/i11n';
import Popup from '@renderer/components/Popup/Popup';

const appStore = useAppStore();
const tr = computed(() => {
	appStore.frontendSettings.language;
	return i11n.frontend.komorebi;
});
const workflowButtons = computed<{ value: KomorebiWorkflow; label: string }[]>(() => [
	{ value: 'video-compress', label: tr.value.workflows.videoCompress },
	{ value: 'audio-convert', label: tr.value.workflows.audioConvert },
	{ value: 'remux', label: tr.value.workflows.remux },
	{ value: 'ncm', label: tr.value.workflows.ncm },
]);
const workflowLabel = (workflow: KomorebiWorkflow) => workflowButtons.value.find((item) => item.value === workflow)?.label || workflow;
const selectedTasks = computed(() => [...appStore.selectedTask].map((id) => appStore.currentServer?.data.tasks[id]).filter(Boolean));
const selectedInputPaths = computed(() => selectedTasks.value.flatMap((task) => {
	if (task.kind === 'ncm') {
		return task.ncm?.inputs || [];
	}
	return (task.after?.input?.files || [])
		.map((file) => file.filePath)
		.filter((filePath) => filePath && !filePath.startsWith('['));
}));

const getWorkflowBlockedReason = (workflow: KomorebiWorkflow) => {
	if (!selectedTasks.value.length) {
		return '';
	}
	const hasNcmTask = selectedTasks.value.some((task) => task.kind === 'ncm');
	const hasFfmpegTask = selectedTasks.value.some((task) => task.kind !== 'ncm');
	if (workflow === 'ncm' && hasFfmpegTask) {
		return tr.value.workflowGuard.ffmpegOnly;
	}
	if (workflow !== 'ncm' && hasNcmTask) {
		return tr.value.workflowGuard.ncmOnly;
	}
	const firstIncompatiblePath = selectedInputPaths.value.find((filePath) => !isKomorebiDroppablePath(workflow, filePath));
	if (!firstIncompatiblePath) {
		return '';
	}
	const kind = getKomorebiInputKind(firstIncompatiblePath);
	if (kind === 'audio' && workflow === 'video-compress') {
		return tr.value.workflowGuard.audioCannotVideo;
	}
	if (kind === 'ncm') {
		return tr.value.workflowGuard.ncmCannotFfmpeg;
	}
	return tr.value.workflowGuard.unsupportedExtension(getFileExtension(firstIncompatiblePath));
};

const handleWorkflowClick = (workflow: KomorebiWorkflow) => {
	if (workflow === appStore.komorebi.workflow) {
		return;
	}
	const reason = getWorkflowBlockedReason(workflow);
	if (reason) {
		Popup({ message: tr.value.workflowGuard.blocked(workflowLabel(workflow), reason), level: 2 });
		return;
	}
	appStore.komorebi.workflow = workflow;
};
</script>

<template>
	<div class="parabox">
		<div class="komorebiTopbar">
			<div class="workflowSwitch">
				<button
					v-for="item in workflowButtons"
					:key="item.value"
					:class="{ active: appStore.komorebi.workflow === item.value }"
					@click="handleWorkflowClick(item.value)"
				>{{ item.label }}</button>
			</div>
		</div>
		<Transition name="workflowPanel">
			<KomorebiNormalView :key="appStore.komorebi.workflow" />
		</Transition>
	</div>
</template>

<style lang="less">
	.parabox  {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: transparent;
		overflow: hidden;
		position: relative;
		.komorebiTopbar {
			height: 36px;
			flex: 0 0 auto;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 0 12px;
			background: hwb(var(--bg97) / 0.92);
			border-bottom: 1px solid hwb(var(--bg90) / 0.42);
			.workflowSwitch {
				display: flex;
				align-items: center;
				border: 1px solid hwb(var(--bg90) / 0.45);
				border-radius: 8px;
				overflow: hidden;
				background: hwb(var(--bg100) / 0.42);
				button {
					height: 26px;
					min-width: 86px;
					padding: 0 12px;
					border: none;
					border-right: 1px solid hwb(var(--bg90) / 0.35);
					background: transparent;
					color: var(--66);
					font-size: 13px;
					transition: background var(--motion-standard) ease, color var(--motion-standard) ease, box-shadow var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant);
					will-change: background, color, transform;
					&:last-child {
						border-right: none;
					}
					&.active {
						background: hwb(var(--primaryColor) / 0.12);
						color: hwb(var(--primaryColor));
						box-shadow: 0 0 0 1px hwb(var(--primaryColor) / 0.10) inset;
						transform: translateY(-1px);
					}
					&:hover {
						background: hwb(var(--primaryColor) / 0.08);
					}
					&:active {
						transform: scale(0.98);
						transition-duration: var(--motion-press);
					}
				}
			}
		}
		.komorebi-normal {
			flex: 1 1 auto;
			min-height: 0;
		}
		.workflowPanel-enter-active,
		.workflowPanel-leave-active {
			transition: opacity var(--motion-standard) ease, transform var(--motion-panel) var(--ease-elegant), filter var(--motion-panel) ease;
			will-change: opacity, transform;
		}
		.workflowPanel-leave-active {
			position: absolute;
			left: 0;
			right: 0;
			top: 36px;
			bottom: 0;
			pointer-events: none;
		}
		.workflowPanel-enter-from {
			opacity: 0;
			transform: translateY(5px) scale(0.997);
			filter: saturate(0.95);
		}
		.workflowPanel-leave-to {
			opacity: 0;
			transform: translateY(-4px) scale(0.997);
			filter: saturate(0.95);
		}
	}
</style>
