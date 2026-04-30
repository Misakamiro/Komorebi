<script setup lang="ts">
import { useAppStore } from '@renderer/stores/appStore';
import KomorebiNormalView from './KomorebiNormalView.vue';
import { KomorebiWorkflow } from '@common/komorebiPresets';

const appStore = useAppStore();
const workflowButtons: { value: KomorebiWorkflow; label: string }[] = [
	{ value: 'video-compress', label: '视频压缩' },
	{ value: 'audio-convert', label: '音频转换' },
	{ value: 'remux', label: '转封装' },
	{ value: 'ncm', label: 'NCM转换' },
];
</script>

<template>
	<div class="parabox">
		<div class="komorebiTopbar">
			<div class="workflowSwitch">
				<button
					v-for="item in workflowButtons"
					:key="item.value"
					:class="{ active: appStore.komorebi.workflow === item.value }"
					@click="appStore.komorebi.workflow = item.value"
				>{{ item.label }}</button>
			</div>
		</div>
		<Transition name="workflowPanel" mode="out-in">
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
					transition: background 0.16s ease, color 0.16s ease;
					&:last-child {
						border-right: none;
					}
					&.active {
						background: hwb(var(--primaryColor) / 0.12);
						color: hwb(var(--primaryColor));
					}
					&:hover {
						background: hwb(var(--primaryColor) / 0.08);
					}
				}
			}
		}
		.workflowPanel-enter-active,
		.workflowPanel-leave-active {
			transition: opacity 0.14s ease, transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1);
			will-change: opacity, transform;
		}
		.workflowPanel-enter-from {
			opacity: 0;
			transform: translateY(3px);
		}
		.workflowPanel-leave-to {
			opacity: 0;
			transform: translateY(-2px);
		}
	}
</style>
