<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], count: appStore.selectedTask.size }
);

const cmdRef = ref<HTMLTextAreaElement>(null);
watch(() => selectedTasks.value.task?.cmdData, () => {
	const elem = cmdRef.value;
	if (elem) {
		const scrollBottom = elem?.scrollTop + elem.getBoundingClientRect().height;
		if (elem.scrollHeight - scrollBottom < 1) {
			setTimeout(() => {
				elem.scrollTo(0, Number.MAX_SAFE_INTEGER);
			}, 0);
		}
	}
});

onMounted(() => {
	const elem = cmdRef.value;
	if (elem) {
		setTimeout(() => {
			elem.scrollTo(0, Number.MAX_SAFE_INTEGER);
		}, 0);
	}
})

</script>

<template>
	<div class="ffmpegLog">
		<div class="title">{{ selectedTasks.count === 0 ? '您未选择任务' : selectedTasks.task.taskName }}</div>
		<div class="code">
			<textarea
				aria-label="任务命令行"
				readonly
				:value="selectedTasks.task?.cmdData"
				ref="cmdRef"
			/>
		</div>
	</div>
</template>

<style lang="less" scoped>
	.ffmpegLog {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		.title {
			font-size: 14px;
			padding: 4px;
		}
		.code {
			width: 100%;
			height: 100%;
			padding: 0 12px 12px;
			box-sizing: border-box;
			textarea {
				border: none;
				background: hwb(var(--bg96) / 0.6);
				outline: none;
				box-sizing: border-box;
				width: 100%;
				height: 100%;
				resize: none;
				color: var(--33);
				font-family: Consolas,monaco,"Noto Mono","黑体","苹方-简","苹方",Roboto;
				font-weight: 400;
				font-size: 12px;
				line-height: 13px; // 52 / 4
				border-radius: 0 2px 2px 0;
				box-shadow: 0 0 1px 1px hwb(0 0% 100% / 0.05), // 外部阴影
							0 3px 6px hwb(0 0% 100% / 0.02) inset; // 内部凹陷阴影
				&:hover {
					background: hwb(var(--bg97) / 0.8);
					box-shadow: 0 0 1px 1px hwb(210deg 0% 0% / 0.5), // 外部阴影
								0 3px 6px hwb(0 0% 100% / 0.02) inset; // 内部凹陷阴影
				}
			}
		}
	}
</style>