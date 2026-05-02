<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { TaskStatus, WorkingStatus } from '@common/types';
import { Server } from '@renderer/types';
import nodeBridge from '@renderer/bridges/nodeBridge';
import showMenu from '@renderer/components/Menu/Menu';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import IconX from '@renderer/assets/×.svg?component';

const appStore = useAppStore();

const serverStyle = computed(() => {
	const map: {
		[key: string]: {
			colorStyle: any;
			text: string;
			status: 'running' | 'paused' | 'idle';
		}
	} = {};
	for (const server of appStore.servers) {
		const hasUndoneWork = server.data.tasks.some((task) => [TaskStatus.idle_queued, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.running, TaskStatus.stopping, TaskStatus.finishing].includes(task.status));
		const obj = {
			colorStyle: { width: hasUndoneWork ? `${server.data.progress * 100}%` : '0%' },
			text: server.data.name + (hasUndoneWork ? ` (${(server.data.progress * 100).toFixed(0)}%)` : ''),
			status: hasUndoneWork ? (server.data.workingStatus === WorkingStatus.running ? 'running' : 'paused') as any : 'idle',
		};
		map[server.data.id] = obj;
	}
	return map;
});

watch(
	[() => appStore.currentServerId, () => appStore.currentServer?.data?.progress, () => appStore.currentServer?.data?.workingStatus],
	() => {
		const serverData = appStore.currentServer?.data;
		if (!serverData) {
			nodeBridge.setProgressBar(0, { mode: 'none' });
			return;
		}
		const hasUndoneWork = serverData.workingStatus === WorkingStatus.running || serverData.tasks.some((task) => [TaskStatus.idle_queued, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.running, TaskStatus.stopping, TaskStatus.finishing].includes(task.status));
		const mode = (() => {
			if (hasUndoneWork) {
				if (serverData.workingStatus === WorkingStatus.running) {
					return 'normal';
				} else {
					return 'paused';
				}
			} else {
				return 'none';
			}
		})();
		nodeBridge.setProgressBar(
			serverData.progress,
			{ mode },
		);
	},
	{ immediate: true, flush: 'sync' },
);

// 点击标签页
const handleTabClicked = (serverId: string) => {
	appStore.currentServerId = serverId;
	appStore.selectedTask.clear();
};

const handleTabMouseUp = (server: Server, event: MouseEvent) => {
	if (event.button === 1) {
		handleTabCloseClicked(server, event);
	}
}

const handleTabContextMenu = (event: MouseEvent, server: Server) => {
	let tabElem = event.target;
	while (tabElem.className.includes('tab')) {
		tabElem = tabElem.parentElement;
	}
	const rect = tabElem.getBoundingClientRect();
	showMenu({
		menu: [
			...(server.entity.status === ServiceBridgeStatus.Idle ? [
				{ type: 'normal' as const, label: '未连接', value: '未连接', disabled: true },
			] : []),
			...(server.entity.status !== ServiceBridgeStatus.Idle ? [
				{ type: 'normal' as const, label: `${server.entity.ip}:${server.entity.port}`, value: 'ipport', disabled: true },
			] : []),
			...(server.entity.ip !== 'localhost' && appStore.servers.length > 1 ? [
				{ type: 'separator' as const },
				{ type: 'normal' as const, label: server.entity.status === ServiceBridgeStatus.Idle ? '关闭' : '断开连接并关闭', value: '断开连接并关闭', onClick: () => handleTabCloseClicked(server, event) },
			] : []),
		],
		type: 'action',
		// triggerRect: { xMin: event.pageX - 110, xMax: event.pageX + 110, yMin: event.pageY, yMax: event.pageY },
		triggerRect: { xMin: rect.x, xMax: rect.x + rect.width, yMin: event.y, yMax: rect.y + rect.height },
	});
};

// 点击关闭标签页
const handleTabCloseClicked = (server: Server, event: MouseEvent) => {
	if (server.entity.ip !== 'localhost' && appStore.servers.length > 1) {
		appStore.removeServer(server.data.id);
		event.stopPropagation();
	}
};

</script>

<template>
	<div class="titlebar" :data-color_theme="appStore.frontendSettings.colorTheme">
		<div class="tabArea">
			<TransitionGroup name="tabanimate">
				<div
					v-for="server in appStore.servers"
					:key="server.data.id"
					class="tabWrapper"
					@click="handleTabClicked(server.data.id)"
					@mouseup="handleTabMouseUp(server as Server, $event)"
					@contextmenu="handleTabContextMenu($event, server as Server)"
				>
					<div class="tab" :class="appStore.currentServerId === server.data.id ? 'selected' : 'unselected'">
						<div class="progress progress-green" :style="{...serverStyle[server.data.id].colorStyle, opacity: serverStyle[server.data.id].status === 'running' ? 1 : 0}" />
						<div class="progress progress-yellow" :style="{...serverStyle[server.data.id].colorStyle, opacity: serverStyle[server.data.id].status === 'paused' ? 1 : 0}" />
						<span>{{ serverStyle[server.data.id].text }}</span>
						<div class="close" v-if="server.entity.ip !== 'localhost' && appStore.servers.length > 1" @click="handleTabCloseClicked(server as Server, $event)">
							<IconX />
						</div>
					</div>
				</div>
			</TransitionGroup>
		</div>
	</div>

</template>

<style scoped lang="less">
	.titlebar {
		position: relative;
		height: 36px;
		padding: 0 176px 0 92px;
		.tabArea {
			// height: 100%;
			// box-sizing: border-box;
			flex: 1 1 auto;
			display: flex;
			padding: 8px 6px 0;
			margin-left: -2px;
			overflow: auto hidden;
			-webkit-app-region: drag;
			&>* {
				-webkit-app-region: none;
			}
			&::-webkit-scrollbar {
				height: 0;
			}
			.tabWrapper {
				position: relative;
				flex: 0 1 200px;
				min-width: 140px;
				margin-right: 8px;
				.tab {
					position: relative;
					height: 28px;
					border-radius: 6px 6px 0 0;
					overflow: hidden;
					transition: transform var(--motion-panel) var(--ease-elegant), background-color var(--motion-standard) ease, box-shadow var(--motion-standard) ease, opacity var(--motion-standard) ease;
					span {
						position: absolute;
						left: 0;
						top: 0;
						display: inline-block;
						width: 100%;
						height: 100%;
						font-size: 14px;
						line-height: 28px;
					}
					.progress {
						position: absolute;
						left: 0;
						top: 0;
						height: 100%;
						transition: width var(--motion-standard) ease-out, opacity var(--motion-standard) ease-out;
					}

					.close {
						position: absolute;
						right: 4px;
						top: 4px;
						width: 20px;
						height: 20px;
						border-radius: 2px;
						&:hover {
							box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.2),
										0 4px 2px -2px hwb(var(--highlight) / 0.5) inset;
						}
						&:active {
							box-shadow: 0 0px 1px hwb(var(--hoverShadow) / 0.2),
										0 20px 15px -10px hwb(var(--hoverShadow) / 0.15) inset;
							transform: translateY(0.25px);
						}
						svg {
							width: 100%;
							height: 100%;
							fill: var(--66);
						}
					}
				}
				.selected {
					background-color: hwb(var(--bg97));
					box-shadow: 0 0 6px hwb(var(--hoverShadow) / 0.2),	// 外阴影
								0 -24px 12px -12px hwb(var(--hoverLightBg)) inset,	// 内高光
								0 4px 2px -2px hwb(var(--highlight) / 0.6) inset;	// 上高光
					&:hover {
						box-shadow: 0 0 6px hwb(var(--hoverShadow) / 0.3),	// 外阴影
								0 -32px 16px -12px hwb(var(--hoverLightBg)) inset,	// 内高光
								0 4px 2px -2px hwb(var(--highlight) / 0.6) inset;	// 上高光
					}
				}
				.unselected {
					background-color: transparent;
					transform: translateY(1px);
					opacity: 0.8;
					box-shadow: 0 0 6px hwb(var(--hoverShadow) / 0.05),	// 外阴影
								0 -12px 10px -10px hwb(0 100% 0% / 0.1) inset,	// 内阴影
								0 4px 2px -2px hwb(var(--highlight) / 0.25) inset;	// 上高光
					&:hover {
						background-color: hwb(var(--bg97) / 0.5);
						opacity: 1;
					}
				}
			}
			.tabanimate-enter-from, .tabanimate-leave-to {
				.tab {
					transform: translateX(-100%);
				}
			}
			.tabanimate-enter-to, .tabanimate-leave-from {
				.tab {
					transform: translateX(0);
				}
			}
			.tabanimate-enter-active {	// 这个类似乎不生效
				overflow: hidden;
				// transition: transform linear 0.4s; // 这个 transition 会被上面的定义覆盖，无需启用
			}
			.tabanimate-leave-active {
				overflow: hidden;
				transition: transform var(--motion-quick) var(--ease-exit); // 这个 transition 会被上面的定义覆盖，但需要定义时长让 Vue 控制消失
			}
		}
	}

	// 主题
	.titlebar[data-color_theme="themeLight"] {
		// background-color: hwb(220 25% 10%);
		background-color: hwb(220 92% 4%);
		box-shadow: 0 -32px 32px -16px hwb(var(--hoverShadow) / 0.02) inset,
					0 -8px 8px -4px hwb(var(--hoverShadow) / 0.02) inset;
		.tab {
			.progress-green {
				background: linear-gradient(180deg, hwb(120 75% 0% / 0.9), hwb(120 60% 0% / 0.9));
				box-shadow: 0 6px 12px hwb(120 30% 30% / 0.33);
			}
			.progress-yellow {
				background: linear-gradient(180deg, hwb(50 75% 0% / 0.9), hwb(50 55% 0% / 0.9));
				box-shadow: 0 6px 12px hwb(50 30% 30% / 0.33);
			}
		}
	}
	.titlebar[data-color_theme="themeDark"] {
		background-color: hwb(220 4% 90%);
		box-shadow: 0 -32px 32px -16px hwb(var(--hoverShadow) / 0.02) inset,
					0 -8px 8px -4px hwb(var(--hoverShadow) / 0.02) inset;
		.tab {
			text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
			.progress-green {
				background: linear-gradient(180deg, hwb(120 10% 30% / 0.9), hwb(120 15% 20% / 0.9));
				box-shadow: 0 6px 12px hwb(120 30% 30% / 0.33);
			}
			.progress-yellow {
				background: linear-gradient(180deg, hwb(50 0% 25% / 0.9), hwb(50 5% 15% / 0.9));
				box-shadow: 0 6px 12px hwb(50 30% 30% / 0.33);
			}			
		}
	}
</style>
