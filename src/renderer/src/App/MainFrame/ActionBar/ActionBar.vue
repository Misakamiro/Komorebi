<script setup lang="ts">
import { computed } from 'vue';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import { useAppStore } from '@renderer/stores/appStore';
import { WorkingStatus } from '@common/types';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import IconSelectAll from './selectAll.svg?component';

const appStore = useAppStore();
const selectionDescription = computed(() => {
	if (!appStore.currentServer || appStore.currentServer.entity.status !== ServiceBridgeStatus.Connected) {
		return '未连接到服务器';
	}
	return Object.keys(appStore.currentServer?.data.tasks || []).length > 1 && !appStore.selectedTask.size && appStore.taskSelectionModified
		? '您修改了参数' + (window.innerWidth > 740 ? '，但并未应用到任务，是否' : '')
		: `${Object.keys(appStore.currentServer?.data.tasks || []).length} 个任务` + (appStore.selectedTask.size ? `，已选择 ${appStore.selectedTask.size} 个` : '')
});
const startButtonClass = computed(() => {
	if (!appStore.currentServer || appStore.currentServer.entity.status !== ServiceBridgeStatus.Connected) {
		return 'startbutton-gray';
	}
	if (appStore.queueTogglePending) {
		return 'startbutton-gray';
	}
	return appStore.currentServer.data.workingStatus === WorkingStatus.running ? 'startbutton-yellow' : 'startbutton-green';
});
const startButtonText = computed(() => {
	if (!appStore.currentServer || appStore.currentServer.entity.status !== ServiceBridgeStatus.Connected) {
		return '▶开始';
	}
	if (appStore.queueTogglePending) {
		return '处理中';
	}
	return appStore.currentServer.data.workingStatus === WorkingStatus.running ? '⏸暂停' : '▶开始';
});

const handleSelectAllClick = () => {
	const newSet = new Set([...Object.keys(appStore.currentServer.data.tasks).map(Number)]);
	newSet.delete(-1);
	appStore.selectedTask = newSet;
	appStore.taskSelectionModified = false;
};
const handleApplyAllClick = () => {
	const newSet = new Set([...Object.keys(appStore.currentServer.data.tasks).map(Number)]);
	newSet.delete(-1);
	appStore.applyParameters('applyToAllTasks', newSet);
	appStore.taskSelectionModified = false;
};

</script>

<template>
	<div class="actionbar" :data-color_theme="appStore.frontendSettings.colorTheme">
		<div class="left">
			<Button :disabled="!appStore.currentServer || appStore.currentServer.entity.status !== ServiceBridgeStatus.Connected" :type="ButtonType.NoBg" @click="handleSelectAllClick"><IconSelectAll />全选</Button>
			<div class="description">{{ selectionDescription }}</div>
			<Button
				v-if="Object.keys(appStore.currentServer?.data.tasks || []).length > 1 && (appStore.taskSelectionModified || appStore.selectedTask.size)"
				:type="ButtonType.Primary"
				size="small"
				class="smallButton"
				@click="handleApplyAllClick"
			>
				应用参数到全部任务
			</Button>
		</div>
		<div class="center">
			<div class="brand">Komorebi</div>
		</div>
		<div class="right">
			<button class="startbutton" :class="startButtonClass" :disabled="appStore.queueTogglePending" @click="appStore.startNpause()">{{ startButtonText }}</button>
		</div>
	</div>
</template>

<style scoped lang="less">
	.actionbar {
		position: relative;
		width: 100%;
		height: 56px;
		flex: 0 0 auto;
		display: flex;
		justify-content: space-between;
		background: hwb(var(--bg97) / 0.94);
		border-bottom: 1px solid hwb(var(--bg90) / 0.42);
		box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.08);
		z-index: 1;
		-webkit-app-region: drag;
		&>* {
			-webkit-app-region: none;
		}
		.left, .center, .right {
			display: flex;
			justify-content: center;
			align-items: center;
			height: 100%;
		}
		.left {
			flex: 0 0 auto;
			padding-left: 96px;
			opacity: 0.9;
			button:not(.smallButton) {
				height: 32px;
				min-width: unset;
				font-size: 13px;
				svg {
					width: 18px;
					height: 18px;
					vertical-align: -4px;
					margin-right: 4px;
					color: hwb(var(--primaryColor));
				}
			}
			.description {
				font-size: 13px;
				margin-right: 16px;
			}
		}
		.center {
			flex: 1 1 auto;
			-webkit-app-region: drag;
			&>div {
				width: clamp(104px, calc(40px + 50%), 100%);
			}
			.brand {
				text-align: center;
				font-size: 18px;
				font-weight: 600;
				color: hwb(var(--primaryColor));
			}
		}
		.right {
			padding-right: 16px;
		}
		.startbutton {
			position: relative;
			overflow: hidden;
			width: 120px;
			height: 36px;
			text-align: center;
			line-height: 36px;
			font-size: 20px;
			letter-spacing: 4px;
			text-indent: 2px;
			color: #FFF;
			text-shadow: 0px 1px 1px rgba(0, 0, 0, 0.5);
			border-radius: 10px;
			border: none;
			outline: none;
			will-change: transform;
			transition: transform var(--motion-standard) var(--ease-elegant), box-shadow var(--motion-standard) ease, filter var(--motion-standard) ease;
			&:hover {
				transform: translateY(-1px) scale(1.015);
				filter: saturate(1.08);
			}
			&:active {
				transform: translateY(0) scale(0.985);
			}
			&:hover:before {
				position: absolute;
				left: 0;
				content: "";
				width: 100%;
				height: 100%;
				border-radius: 10px;
				background:
					linear-gradient(120deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.04) 46%, rgba(255, 255, 255, 0.24));
			}
		}
	}

	// 主题
	.actionbar[data-color_theme="themeLight"] {
		.startbutton-green {
			background: linear-gradient(180deg, hwb(120 40% 10%), hwb(120 20% 20%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(120 40% 10%);	// 按钮发光和远距阴影
		}
		.startbutton-green:active {
			background: linear-gradient(180deg, hwb(120 10% 40%), hwb(120 20% 20%));
		}
		.startbutton-green:hover {
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),
						0px 4px 24px 0px hwb(120 40% 10%);
		}
		.startbutton-yellow {
			background: linear-gradient(180deg, hwb(54 35% 5%), hwb(54 15% 15%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(54 35% 5%);	// 按钮发光和远距阴影
		}
		.startbutton-yellow:active {
			background: linear-gradient(180deg, hwb(54 5% 35%), hwb(54 15% 15%));
		}
		.startbutton-yellow:hover {
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),
						0px 4px 24px 0px hwb(54 35% 5%);
		}
		.startbutton-gray {
			color: hwb(0 60% 40%);
			text-shadow: none;
			opacity: 0.8;
			background: linear-gradient(180deg, hwb(0 96% 4%), hwb(0 88% 12%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 上高光
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 下立体
						0px 2px 6px 0px rgba(0, 0, 0, 0.1);	// 下阴影
			pointer-events: none;
		}
	}
	.actionbar[data-color_theme="themeDark"] {
		.startbutton-green {
			background: linear-gradient(180deg, hwb(120 20% 10%), hwb(120 10% 30%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(120 40% 10%);	// 按钮发光和远距阴影
		}
		.startbutton-green:active {
			background: linear-gradient(180deg, hwb(120 5% 50%), hwb(120 10% 30%));
		}
		.startbutton-green:hover {
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),
						0px 4px 24px 0px hwb(120 20% 10%);
		}
		.startbutton-yellow {
			background: linear-gradient(180deg, hwb(54 15% 5%), hwb(54 5% 25%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(54 15% 5%);	// 按钮发光和远距阴影
		}
		.startbutton-yellow:active {
			background: linear-gradient(180deg, hwb(54 5% 50%), hwb(54 5% 25%));
		}
		.startbutton-yellow:hover {
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),
						0px 4px 24px 0px hwb(54 15% 5%);
		}
		.startbutton-gray {
			color: hwb(0 60% 40%);
			text-shadow: none;
			opacity: 0.8;
			background: linear-gradient(180deg, hwb(0 20% 80%), hwb(0 16% 84%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 上高光
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 下立体
						0px 2px 6px 0px rgba(0, 0, 0, 0.1);	// 下阴影
			pointer-events: none;
		}
	}
</style>
