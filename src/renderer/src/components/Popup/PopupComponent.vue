<script setup lang="ts">
import { computed, Fragment, h, onMounted, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import IconX from '@renderer/assets/×.svg?component';

const appStore = useAppStore();

interface Props {
    message: string;
	level: 0 | 1 | 2 | 3;
	verticalOffset: number;	// px
    onWillClose: (isUserInteraction?: boolean) => void;	// 由本组件调用，通知外部倒计时后调整气泡位置
    onClose: () => void;	// 由本组件调用，外部将本组件销毁
	index: number;			// 用于计算 delayedVerticalOffset
}

const props = defineProps<Props>();

const show = ref(false);
const duration = ref(0);
const timeLeft = ref(0);
const mouseIn = ref(false);
const delayedVerticalOffset = ref(0);
const popupAnimateName = ref('popupanimate');	// 用户主动关闭时换一个动画

const newLinedMessage = computed(() => h(
	Fragment,
	props.message.split('\n').reduce((prev, curr) => prev.concat(curr, h('br')), [])
));

const bgClass = computed(() => {
	switch (props.level) {
		case 1:
			return 'popup-box popup-ok'
		case 2:
			return 'popup-box popup-warning'
		case 3:
			return 'popup-box popup-error'
		default:
			return 'popup-box'
	}
});
const strokeColor = computed(() => {
	switch (props.level) {
		case 1:
			return '#FFFFFF'
		case 2:
			return '#3F330D'
		case 3:
			return '#FFFFFF'
		default:
			return 'currentColor'
	}
});

const close = (isUserInteraction?: boolean) => {
	if (isUserInteraction) {
		popupAnimateName.value = 'popupanimateUser';
	}
	show.value = false;
	props.onWillClose(isUserInteraction);
}

const handleMouseUp = (event: MouseEvent) => {
	if (event.button === 1) {
		close(true);
	}
}

onMounted(() => {
	// 设置动画并自动退出
	const powerSave = true;
	show.value = true;
	duration.value = 2500 + props.message.length * 100;
	timeLeft.value = duration.value;
	let lastTime = new Date().getTime();
	const count = () => {
		let now = new Date().getTime();
		if (!mouseIn.value) {
			timeLeft.value = timeLeft.value - (now - lastTime);
			if (timeLeft.value <= 0) {
				close();
			}
		} else {
			timeLeft.value += (duration.value - timeLeft.value) * 0.2;
		}
		if (show.value) {
			if (powerSave) {
				setTimeout(count, 67);
			} else {
				requestAnimationFrame(count);
			}
		}
		lastTime = now;
	}
	count();
});

watch(() => props.verticalOffset, (newValue) => {
	setTimeout(() => {
		delayedVerticalOffset.value = newValue;
	}, 33 * props.index);
});

</script>

<template>
	<div
		:data-color_theme="appStore.frontendSettings.colorTheme"
		class="popup"
		@mouseenter="mouseIn = true"
		@mouseleave="mouseIn = false"
		:style="{ transform: `translateY(${-delayedVerticalOffset}px)` }"
	>
		<Transition :name="popupAnimateName" @after-leave="props.onClose()">
			<div v-if="show" :class="bgClass" @mouseup="handleMouseUp">
				<div class="popup-progress">
					<svg viewBox="-24 -24 48 48" class="popup-progress-circle">
						<circle
							fill="transparent"
							stroke-width="6"
							:stroke="strokeColor"
							stroke-dasharray="125.664"
							:stroke-dashoffset=" - 125.664 * (1 - timeLeft / duration)"
							r="20"
						></circle>
					</svg>
					<IconX class="popup-progress-x" :style="{ color: strokeColor }" @click="() => close(true)" />
				</div>
				<div class="popup-message">
					<component :is="newLinedMessage" />
				</div>
			</div>
		</Transition>
	</div>
</template>


<style lang="less" scoped>
	.popup {
		display: block;
		position: absolute;
		bottom: 10%;
		left: 0;
		right: 0;
		width: fit-content;
		max-width: 60%;
		background: none;
		border: none;
		margin: auto;
		padding: 0;
		transition: transform 0.7s cubic-bezier(0.35, 1.4, 0.2, 0.95);
		z-index: 10;
		.popupanimate-enter-from {
			opacity: 0;
			transform: scale(0.0) translateY(120px);
		}
		.popupanimate-enter-active {
			transition: transform 0.5s cubic-bezier(0.4, 1.3, 0.4, 1), opacity 0.2s linear;
		}
		.popupanimate-enter-to, .popupanimate-leave-from, .popupanimateUser-leave-from {
			opacity: 1;
			transform: scale(1);
		}
		.popupanimate-leave-active {
			transition: opacity 0.7s ease-out, transform 0.6s cubic-bezier(1, 0, 1, 1) 0.1s;
		}
		.popupanimate-leave-to {
			opacity: 0;
			transform: scale(0.5);
		}
		.popupanimateUser-leave-active {
			transition: all 0.5s linear;
		}
		.popupanimateUser-leave-to {
			opacity: 0;
			transform: scale(0.5) translateX(calc(100vw + 400px));
		}

		.popup-box {
			width: fit-content;
			display: flex;
			align-items: stretch;
			padding: 8px;
			background: hwb(var(--bg98));
			border: hsl(0, 0%, 67%) 1px solid;
			border-radius: 12px;
			overflow: hidden;
			box-shadow: 0px 4px 8px hwb(0 0% 100% / 0.3);
			&:hover {
				.popup-progress .popup-progress-circle {
					opacity: 0;
					transform: rotate(-90deg) scale(0.5);
				}
				.popup-progress .popup-progress-x {
					opacity: 1;
					transform: translateX(0);
				}
			}
			.popup-message {
				margin: 4px;
				font-size: 16px;
				line-height: 1.3em;
				text-align: center;
				word-break: break-word;
			}
			.popup-progress {
				position: relative;
				width: 24px;
				height: auto;
				display: flex;
				justify-content: center;
				align-items: center;
				opacity: 0.8;
				.popup-progress-circle {
					width: 16px;
					height: 16px;
					transform: rotate(-90deg) scale(1);
					transition: transform 0.3s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.3s cubic-bezier(0.1, 0.8, 0.3, 1);
					&:hover {
						visibility: hidden;
					}
				}
				.popup-progress-x {
					position: absolute;
					width: 24px;
					height: 100%;
					margin: auto;
					border-radius: 4px;
					opacity: 0;
					transform: translateX(-32px);
					transition: transform 0.3s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.3s cubic-bezier(0.1, 0.8, 0.3, 1);
					&:hover {
						box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.2),
									0 4px 2px -2px hwb(var(--highlight) / 0.5) inset;
					}
					&:active {
						box-shadow: 0 0px 1px hwb(var(--hoverShadow) / 0.2),
									0 15px 20px -10px hwb(var(--hoverShadow) / 0.15) inset;
						transform: translateY(0.25px);
					}
				}
			}
		}
	}

	// 主题
	.popup[data-color_theme="themeLight"] {
		.popup-ok {
			background: linear-gradient(180deg, hwb(120 40% 10%), hwb(120 20% 20%));
			border-color: hwb(120 15% 35%);
			box-shadow: 0px 4px 8px hwb(120 10% 35% / 0.4);
			color: #FFF;
		}
		.popup-warning {
			background: linear-gradient(180deg, hwb(45 50% 0%), hwb(45 30% 0%));
			border-color: hwb(45 30% 10%);
			box-shadow: 0px 4px 8px hwb(45 10% 35% / 0.4);
			color: hsl(46, 66%, 15%);
		}
		.popup-error {
			background: hwb(0 35% 5%);
			border-color: hwb(0 20% 20%);
			box-shadow: 0px 4px 8px hwb(0 5% 40% / 0.4);
			color: #FFF;
		}
	}
	.popup[data-color_theme="themeDark"] {
		.popup-ok {
			background: linear-gradient(180deg, hwb(120 30% 15%), hwb(120 10% 25%));
			border-color: hwb(120 10% 45%);
			box-shadow: 0px 4px 8px hwb(120 5% 45% / 0.4);
			color: #FFF;
		}
		.popup-warning {
			background: linear-gradient(180deg, hwb(45 40% 0%), hwb(45 20% 0%));
			border-color: hwb(45 25% 15%);
			box-shadow: 0px 4px 8px hwb(45 10% 30% / 0.4);
			color: hsl(46, 66%, 15%);
		}
		.popup-error {
			background: hwb(0 30% 10%);
			border-color: hwb(0 20% 30%);
			box-shadow: 0px 4px 8px hwb(0 5% 40% / 0.4);
			color: #FFF;
		}
	}

</style>
