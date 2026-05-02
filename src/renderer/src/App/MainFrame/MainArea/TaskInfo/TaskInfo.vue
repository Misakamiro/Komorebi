<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import MediaInfo from './MediaInfo.vue';
import FFmpegLog from './FFmpegLog.vue';
import ProgressLog from './ProgressLog.vue';
import IconMedia from './parabox_media3.svg';
import IconCmd from './parabox_cmd.svg';
import IconChart from './parabox_chart.svg';
import IconUpArrow from '../ParaBox/uparrow.svg?component';

const appStore = useAppStore();
const sidebarIcons = [IconMedia, IconCmd, IconChart];
const sidebarTexts = ['媒体信息', '输出日志', '进展图表', '任务信息'];
const sidebarColors = computed(() => 
	appStore.frontendSettings.colorTheme === 'themeLight'
		? ['hwb(200 0% 10%)', 'hwb(225 40% 10%)', 'hwb(135 20% 20%)', 'hwb(25 5% 5%)']
		: ['hwb(200 5% 5%)', 'hwb(225 50% 20%)', 'hwb(135 15% 25%)', 'hwb(25 5% 10%)']
);

const deviderRef = ref<Element>(null);
const animationName = ref('animationLeft');

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

const handleParaButtonClicked = (index: any) => {
	animationName.value = index < appStore.showTaskInfo[1] ? 'animationLeft' : 'animationRight';
	appStore.showTaskInfo[1] = index;
}

const getButtonColorStyle = (index: number) => ({ color: appStore.showTaskInfo?.[1] === index ? sidebarColors.value[index] : 'hwb(0 50% 50%)' });

</script>

<template>
	<div class="taskInfo" :data-color_theme="appStore.frontendSettings.colorTheme">
		<div class="upper">
			<div class="devider" :ref="(el) => deviderRef = el as Element">
				<button class="leftButton" @click="appStore.showTaskInfo = undefined" aria-label="任务信息面板开关">
					<IconUpArrow :style="{ transform: 'rotate(-90deg)' }" />
					<span>任务参数</span>
				</button>
				<div class="buttons" @mousedown="handleDragStart" @touchstart="handleDragStart">
					<button v-for="index in [0, 1, 2]" :key="index" :aria-label="sidebarTexts[index] + '参数'" @click="() => handleParaButtonClicked(index)">
						<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
						<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
					</button>
				</div>
			</div>
		</div>
		<div class="lower">
			<transition :name="animationName">
				<MediaInfo v-if="appStore.showTaskInfo?.[1] == 0" />
			</transition>
			<transition :name="animationName">
				<FFmpegLog v-if="appStore.showTaskInfo?.[1] == 1" />
			</transition>
			<transition :name="animationName">
				<ProgressLog v-if="appStore.showTaskInfo?.[1] == 2" />
			</transition>
		</div>
	</div>
</template>

<style lang="less" scoped>
	.taskInfo {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background-color: hwb(var(--bg94));
		overflow: hidden;
		// 切换动画（向左）
		.animationLeft-enter-from {
			/* z-index: 0; */
			opacity: 0;
			transform: translateX(-30px);
		}
		.animationLeft-enter-active {
			transition: opacity var(--motion-standard) ease, transform var(--motion-soft) var(--ease-elegant);
		}
		.animationLeft-enter-to, .animationLeft-leave-from {
			/* z-index: 1; */
			opacity: 1;
			transform: translateX(0);
		}
		.animationLeft-leave-active {
			transition: opacity var(--motion-standard) ease, transform var(--motion-standard) var(--ease-exit);
		}
		.animationLeft-leave-to {
			opacity: 0;
			transform: translateX(30px);
		}
		// 切换动画（向右）
		.animationRight-enter-from {
			/* z-index: 0; */
			opacity: 0;
			transform: translateX(30px);
		}
		.animationRight-enter-active {
			transition: opacity var(--motion-standard) ease, transform var(--motion-soft) var(--ease-elegant);
		}
		.animationRight-enter-to, .animationRight-leave-from {
			/* z-index: 1; */
			opacity: 1;
			transform: translateX(0);
		}
		.animationRight-leave-active {
			transition: opacity var(--motion-standard) ease, transform var(--motion-standard) var(--ease-exit);
		}
		.animationRight-leave-to {
			opacity: 0;
			transform: translateX(-30px);
		}
		.upper {
			position: relative;
			height: 30px;
			flex: 0 0 auto;
			background-color: hwb(var(--bg97));
			box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.02), // 远距离下阴影
						0px -2px 1px -1px rgba(0, 0, 0, 0.1) inset; // 内部下阴影
			overflow: hidden;
			transition: height var(--motion-panel) var(--ease-elegant);
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
						transition: width var(--motion-panel) var(--ease-elegant), background-color var(--motion-standard) ease, box-shadow var(--motion-standard) ease;
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
							transition: width var(--motion-panel) var(--ease-elegant), padding var(--motion-panel) var(--ease-elegant);
							filter: var(--paraBoxButtonDropFilterText);
						}
					}
				}
				.leftButton {
					position: absolute;
					left: 0;
					right: 0;
					width: 40px;
					height: 28px;
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 0;
					background-color: transparent;
					border: none;
					transition: width var(--motion-panel) var(--ease-elegant), background-color var(--motion-standard) ease, box-shadow var(--motion-standard) ease;
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
						transition: width var(--motion-panel) var(--ease-elegant), padding var(--motion-panel) var(--ease-elegant);
						filter: var(--paraBoxButtonDropFilterText);
					}
					svg {
						width: 20px;
						height: 20px;
						color: #777;
						transition: transform var(--motion-panel) var(--ease-elegant);
					}
					@media only screen and (min-width: 640px) {
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
			&>div {
				position: absolute;
				top: 0;
			}
		}
	}

</style>
