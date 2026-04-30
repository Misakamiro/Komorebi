<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import nodeBridge from '@renderer/bridges/nodeBridge';
import ListArea from './ListArea/ListArea.vue';
import ParaBox from './ParaBox/ParaBox.vue';
import TransferCenter from './TransferCenter/TransferCenter.vue';
import TaskInfo from './TaskInfo/TaskInfo.vue';
import DragFilesOverlay from './DragFilesOverlay/DragFilesOverlay.vue';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import ImageDisconnected from './disconnect.svg?component';
import ImageLoading from '@renderer/assets/loading.svg?component';

const appStore = useAppStore();

const draggingCount = ref(0);

const loginBoxVisible = computed(() => [ServiceBridgeStatus.Idle, ServiceBridgeStatus.Connecting].includes(appStore.currentServer?.entity.status));
const isConnecting = computed(() => [ServiceBridgeStatus.Connecting, ServiceBridgeStatus.Reconnecting].includes(appStore.currentServer?.entity.status));
const isDisconnected = computed(() => [ServiceBridgeStatus.Disconnected, ServiceBridgeStatus.Reconnecting].includes(appStore.currentServer?.entity.status));

const handleReconnectClicked = async () => {
	if (location.href.startsWith('file') && appStore.currentServer?.entity.ip === 'localhost') {
		nodeBridge.startService();
	}
	appStore.reConnectServer(appStore.currentServerId);
};

const handleDragEnter = () => {
	draggingCount.value++;
	appStore.showDragFilesOverlay = true;
};
const handleDragLeave = () => {
	if (draggingCount.value <= 1) {
		appStore.showDragFilesOverlay = false;
		draggingCount.value = 0;
	} else {
		draggingCount.value--;
	}
};
const handleDrop = () => {
	draggingCount.value = 0;
	appStore.showDragFilesOverlay = false;
};
</script>

<template>
	<div
		class="mainarea"
		:ref="(el) => appStore.componentRefs['MainArea'] = (el as Element)"
		@dragover="(e) => e.preventDefault()"
		@dragenter="handleDragEnter"
		@dragleave="handleDragLeave"
		@drop="handleDrop"
	>
		<div class="upperArea" :style="{ height: `${appStore.draggerPos * 100}%`, position: 'relative' }">
			<div class="loginArea" v-if="loginBoxVisible">
				<Transition name="bganimate" appear>
					<div v-if="loginBoxVisible" class="loginBackground" />
				</Transition>
				<Transition name="boxanimate" appear>
					<div v-if="loginBoxVisible" class="loginBox">
						<h2>正在启动本地处理服务</h2>
						<div class="box">
							<div class="svg">
								<ImageLoading style="width: 120px;" />
							</div>
							<p>Komorebi 正在准备内置 FFmpeg、ffprobe 与 ncmdump。</p>
						</div>
					</div>
				</Transition>
			</div>

			<ListArea v-if="!loginBoxVisible && appStore.currentServer" />

			<div class="disconnectArea" v-if="isDisconnected">
				<Transition name="bganimate" appear>
					<div v-if="isDisconnected" class="disconnectBackground" />
				</Transition>
				<Transition name="boxanimate" appear>
					<div v-if="isDisconnected" class="disconnectBox">
						<div class="box">
							<h2>本地处理服务暂时不可用</h2>
							<div class="svg" v-if="appStore.currentServer?.entity.status === ServiceBridgeStatus.Disconnected">
								<ImageDisconnected style="animation: none;" />
							</div>
							<div class="svg" v-if="isConnecting">
								<ImageLoading style="width: 120px;" />
							</div>
						</div>
						<div class="buttonBox">
							<Button
								:type="ButtonType.Primary"
								size="large"
								:disabled="isConnecting"
								@click="handleReconnectClicked"
							>
								重试
							</Button>
						</div>
					</div>
				</Transition>
			</div>
		</div>
		<div class="lowerArea" :style="{ height: `${(1 - appStore.draggerPos) * 100}%` }">
			<Transition name="paraboxanim">
				<ParaBox v-if="!appStore.showTransferCenter && appStore.showTaskInfo === undefined" />
			</Transition>
			<Transition name="paraboxanim">
				<TransferCenter v-if="appStore.showTransferCenter" />
			</Transition>
			<Transition name="paraboxanim">
				<TaskInfo v-if="appStore.showTaskInfo !== undefined" />
			</Transition>
		</div>
		<DragFilesOverlay />
	</div>
</template>

<style scoped lang="less">
	.mainarea {
		position: relative;
		width: 100%;
		background: hwb(var(--bg92) / 0.64);
		flex: 1 1 auto;
		overflow: hidden;
		.upperArea {
			.loginArea, .disconnectArea {
				overflow: hidden;
				@keyframes bganimation {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				.bganimate-enter-active {
					animation: bganimation ease-out 0.16s;
				}
				.bganimate-leave-active {
					animation: bganimation ease-out 0.12s reverse;
				}
				.boxanimate-enter-from {
					transform: translateY(8px);
					opacity: 0;
				}
				.boxanimate-enter-active {
					transition: transform ease-out 0.16s, opacity linear 0.12s;
				}
				.boxanimate-leave-to {
					transform: translateY(6px);
					opacity: 0;
				}
				.boxanimate-leave-active {
					transition: transform ease-in 0.12s, opacity linear 0.10s;
				}
				.loginBackground, .disconnectBackground {
					position: absolute;
					left: 0;
					top: 0;
					width: 100%;
					height: 100%;
					background: hwb(var(--bg92) / 0.68);
					z-index: 3;
				}
				.loginBox, .disconnectBox {
					position: absolute;
					left: 0;
					right: 0;
					top: 0;
					bottom: 0;
					width: min(560px, calc(100vw - 96px));
					height: 260px;
					margin: auto;
					z-index: 4;
					text-align: center;
					border-radius: 8px;
					background: hwb(var(--bg99) / 0.92);
					border: 1px solid hwb(var(--bg90) / 0.46);
					box-shadow: 0 12px 32px hwb(var(--hoverShadow) / 0.14);
					padding: 28px 32px;
					box-sizing: border-box;
					h2 {
						margin: 0 0 24px;
						font-size: 26px;
						font-weight: 600;
					}
					p {
						margin: 16px 0 0;
						color: hwb(var(--fg50));
						font-size: 14px;
					}
					.box {
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
					}
					.svg {
						height: 120px;
						display: flex;
						align-items: center;
						justify-content: center;
					}
					.buttonBox {
						margin-top: 24px;
					}
				}
			}
		}
		.lowerArea {
			position: relative;
			background: hwb(var(--bg96) / 0.94);
			border-top: 1px solid hwb(var(--bg90) / 0.42);
			box-shadow: 0 -1px 5px hwb(var(--hoverShadow) / 0.08);
			overflow: hidden;
		}
	}
	.paraboxanim-enter-from, .paraboxanim-leave-to {
		transform: translateY(4px);
		opacity: 0;
	}
	.paraboxanim-enter-active, .paraboxanim-leave-active {
		transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1), opacity 0.14s ease;
		will-change: transform, opacity;
	}
	.paraboxanim-enter-to, .paraboxanim-leave-from {
		transform: translateY(0);
		opacity: 1;
	}
</style>
