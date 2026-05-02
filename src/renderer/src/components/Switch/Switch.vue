<script setup lang="ts">
import { ref, VNodeRef } from 'vue';

interface Props {
	checked?: boolean;
	onChange?: (value: boolean) => any;
}

const props = defineProps<Props>();

const slipperRef = ref<VNodeRef>(null);

const handleDragStart = (event: MouseEvent | TouchEvent) => {
	event.preventDefault();
	const beforeChecked = props.checked;
	let mouseDownX = (event as MouseEvent).pageX || (event as TouchEvent).touches[0].pageX;	// 鼠标在页面（窗口）内的坐标
	let sliderLeft: number, sliderWidth: number;
	if (event.target! === slipperRef.value) {
		sliderLeft = event.target!.parentElement!.getBoundingClientRect().left;
		sliderWidth = event.target!.parentElement!.offsetWidth;
	} else {
		sliderLeft = event.target!.getBoundingClientRect().left;
		sliderWidth = event.target!.offsetWidth;
	}
	// 添加鼠标事件捕获，将其独立为一个函数，以便于 mouseDown 直接触发 mouseMove
	const handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
		let valueX: any = Math.floor((event as MouseEvent).pageX || (event as TouchEvent).touches[0].pageX) - sliderLeft;
		if (valueX < sliderWidth / 2) {;
			valueX = false;
		} else {
			valueX = true;
		}
		if (valueX !== lastValue) {
			(props.onChange || (() => {}))(valueX);
			lastValue = valueX;
		}
	}
	const handleMouseUp = (event: MouseEvent | TouchEvent) => {
		// 处理只点一下没有动的情况
		if (Math.abs(mouseDownX - Math.floor((event as MouseEvent).pageX || (event as TouchEvent).touches[0].pageX)) <= 3) {
			if (props.checked && beforeChecked) {
				(props.onChange || (() => {}))(false);
			} else if (!props.checked && !beforeChecked) {
				(props.onChange || (() => {}))(true);
			}
		}
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	};
	document.addEventListener('mousemove', handleMouseMove);
	document.addEventListener('mouseup', handleMouseUp);
	let lastValue = NaN;
	handleMouseMove({ pageX: mouseDownX });	// mouseDown 直接触发 mouseMove
}

const handleKeydown = (event: KeyboardEvent) => {
	if (event.key == 'ArrowLeft') {
		(props.onChange || (() => {}))(false);
	} else if (event.key == 'ArrowRight') {
		(props.onChange || (() => {}))(true);
	}
};
const handleKeyup = (event: KeyboardEvent) => {
	if (event.key == ' ' || event.key == 'Enter') {
		(props.onChange || (() => {}))(!props.checked);
	}
};

</script>

<template>
	<div class="checkbox-track" @mousedown="handleDragStart">
		<div class="checkbox-track-background" :style="props.checked ? 'width: 100%;' : 'width: 0%'"></div>
		<button
			v-if="props.checked !== undefined"
			ref="slipperRef"
			class="checkbox-slipper"
			:style="{ transform: props.checked ? 'translateX(64px) scale(1.25)' : 'translateX(0) scale(1.25)' }"
			@keydown="handleKeydown"
			@keyup="handleKeyup"
		/>
	</div>
</template>

<style scoped>
	.checkbox-track {
		position: relative;
		height: 24px;
		width: 88px;
		border-radius: 24px;
		background: var(--f7);
		border: #CCC 1px solid;
		box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.1) inset;
		transition: background-color var(--motion-standard) ease, border-color var(--motion-standard) ease;
	}
		.checkbox-track-background {
			position: absolute;
			height: 24px;
			border-radius: 24px;
			background: hsl(210, 85%, 60%);
			box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.1) inset;
			transition: width var(--motion-panel) var(--ease-elegant), background-color var(--motion-standard) ease;
		}
		.checkbox-slipper {
			position: absolute;
			top: 0;
			left: 0;
			height: 24px;
			width: 24px;
			border-radius: 50%;
			background: linear-gradient(180deg, #fefefe, #f0f0f0);
			box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.3);
			transition: transform var(--motion-panel) var(--ease-elegant), background var(--motion-standard) ease, box-shadow var(--motion-standard) ease;
			will-change: transform;
			border: none;
		}
		.checkbox-slipper:hover {
			background: linear-gradient(180deg, #ffffff, #fefefe);
		}
		.checkbox-slipper:active {
			background: linear-gradient(180deg, #f0f0f0, #ededed);								
			box-shadow: 0px 1px 2px 0px rgba(0, 0, 0, 0.35), 0 4px 8px rgba(0, 0, 0, 0.1) inset;
		}

</style>
