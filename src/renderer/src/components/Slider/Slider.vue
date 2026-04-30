<script setup lang="ts">
import { computed, ref, VNodeRef, watch } from 'vue';
import type { SliderOptions } from '@common/params/parameter';
import { useAppStore } from '@renderer/stores/appStore';

const appStore = useAppStore();

interface Props {
	value?: number | string;
	min?: number;	// 不填为 0
	max?: number;	// 不填为 1
	tags?: [number, string][] | Map<number, string>;
	mode?: 'number' | 'string';	// 决定了 onChange 返回时的值类型、tags 是否用于列表选项
	arrowKeyStep?: number;	// 键盘方向键，不指定时按整数进行调整，指定时按步长倒数进行调整
	adsorption?: 'int' | 'tags' | ((value: number) => number);	// 鼠标或触屏调整时吸附值，不指定时自动选择 tags
	valueToDisplay?: { base?: number, type?: 'bitrate' | 'integer' | 'revertInteger' } | ((value: number | string) => string);	// 仅在 mode 为 number 时有效，指定显示在滑块旁边的结果
	onChange?: (value: number | string) => any;
}

const props = defineProps<Props>();

const sortedTags = computed(() => {
	if (props.tags instanceof Map) {
		return [...props.tags.entries()].sort((a, b) => a[0] - b[0]);
	} else if (Array.isArray(props.tags)) {
		return props.tags.sort((a, b) => a[0] - b[0]);
	} else {
		return undefined;
	}
});

// 如果 props.value 是字符串，那么此处根据 tags 将其转换为对应值或者 undefined
const numericalValue = computed(() => {
	if (typeof props.value === 'string') {
		if (sortedTags.value?.length) {
			const item = sortedTags.value.find((item) => item[1] === props.value);
			return item?.[0];
		}
	} else {
		return props.value;
	}
});
const limitedValue = computed(() => {
	if (typeof numericalValue.value === 'number') {
		return (numericalValue.value - (props.min ?? 0)) / ((props.max ?? 1) - (props.min ?? 0));
	}
});

const slipperRef = ref<VNodeRef>(null);

const valueToDisplayConverter = (setting?: Props['valueToDisplay']) => {
	if (setting instanceof Function) {
		return setting(props.value);
	} else if (setting) {
		if (setting.type === 'bitrate') {
			const bps = Math.round((setting.base ?? 0) * 2 ** (props.value as number));
			if (window.frontendSettings.useIEC) {
				if (bps >= 10 * 1024 ** 2) {
					return (bps / 1024 ** 2).toFixed(1) + ' Mibps';
				} else {
					return (bps / 1024).toFixed(0) + ' kibps';
				}
			} else {
				if (bps >= 10 * 1000 ** 2) {
					return (bps / 1000 ** 2).toFixed(1) + ' Mbps';
				} else {
					return (bps / 1000).toFixed(0) + ' kbps';
				}
			}
		} else if (setting.type === 'integer') {
			return (props.value as number).toFixed(0);
		} else if (setting.type === 'revertInteger') {
			return ((props.max ?? 0) - (props.value as number)).toFixed(0);
		} else {
			return props.value;
		}
	} else {
		if (props.mode === 'string') {
			if (sortedTags.value?.length) {
				const item = sortedTags.value.find((item) => item[1] === props.value);
				return item?.[1];
			}
		} else {
			return props.value;
		}
	}
}

const emitNewValue = (realValue: number | string) => {
	const emitValue = (() => {
		// 与 numericalValue 互为反逻辑
		if (props.mode === 'string') {
			if (sortedTags.value?.length) {
				const item = sortedTags.value.find((item) => item[0] === realValue);
				return item?.[1];
			}
		} else {
			return realValue;
		}
	})();
	(props.onChange || (() => {}))(emitValue);
};

const handleDragStart = (event: MouseEvent | TouchEvent) => {
	event.preventDefault();
	let mouseDownX = (event as MouseEvent).pageX || (event as TouchEvent).touches[0].pageX;	// 鼠标在页面（窗口）内的坐标
	let slipper = event.target! === slipperRef.value ? true : false;
	let sliderLeft: number, sliderWidth: number, slipperOffsetX: number;
	if (slipper) {
		sliderLeft = event.target!.parentElement!.getBoundingClientRect().left;
		sliderWidth = event.target!.parentElement!.offsetWidth;
		slipperOffsetX = (event as MouseEvent).offsetX - event.target!.offsetWidth / 2;
		event.target!.focus();
	} else {
		sliderLeft = event.target!.getBoundingClientRect().left;
		sliderWidth = event.target!.offsetWidth;
		slipperOffsetX = 0;
	}
	let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
		// 算出 limitedValue 和 realValue
		let limitedValue = (Math.floor((event as MouseEvent).pageX ?? (event as TouchEvent).touches?.[0].pageX) - sliderLeft - slipperOffsetX) / sliderWidth;
		if (limitedValue > 1) {
			limitedValue = 1;
		} else if (limitedValue < 0) {
			limitedValue = 0;
		}
		const range = (props.max ?? 1) - (props.min ?? 0);
		let realValue = (props.min ?? 0) + range * limitedValue;
		realValue = range <= 1 ? Number(realValue.toFixed(6)) : Number(realValue.toFixed(3));	// 限制最长小数点后数量，因为用不上
		// 根据 realValue 和配置进行吸附
		if (props.adsorption == 'int') {
			realValue = Math.round(realValue);
		} else if (props.adsorption instanceof Function) {
			realValue = props.adsorption(realValue);
		} else if (props.mode === 'string') {
			// 如果是字符串模式，吸附到 tags 上
			if (sortedTags.value?.length) {
				let minTag = [Number.MAX_VALUE, undefined];	// 距离，值
				for (const tag of sortedTags.value) {
					if (Math.abs(realValue - tag[0]) <= minTag[0]) {
						minTag = [Math.abs(realValue - tag[0]), tag[0]];
					}					
				}
				realValue = minTag[1];
			}
		} else if (sortedTags.value?.length) {
			function approximation (number: number, numList: number[], threshold = 0.01) {
				for (const num of numList) {
					if (Math.abs(num - number) < threshold) {
						number = num;
					}
				}
				return number;
			}
			const range = (props.max ?? 1) - (props.min ?? 0);
			realValue = approximation(realValue, sortedTags.value.map((item) => item[0]), 0.01 * range);
		}
		if (realValue != lastValue) {
			emitNewValue(realValue);
			lastValue = realValue;
		}
	}
	const handleMouseUp = (event: MouseEvent | TouchEvent) => {
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	};
	document.addEventListener('mousemove', handleMouseMove);
	document.addEventListener('mouseup', handleMouseUp);
	let lastValue = NaN;
	handleMouseMove({ pageX: mouseDownX });	// mouseDown 直接触发 mouseMove
}

const handleKeypress = (event: KeyboardEvent) => {
	if (event.key == 'ArrowLeft' || event.key == 'ArrowRight') {
		let direction, delta, newRealValue;
		if (event.key == 'ArrowLeft') {
			direction = -1;
		} else {
			direction = 1;
		}
		const originalValue = numericalValue.value ?? ((props.max ?? 1) + (props.min ?? 0)) / 2;
		const range = (props.max ?? 1) - (props.min ?? 0);
		if (props.arrowKeyStep) {
			delta = range / props.arrowKeyStep;
		} else {
			delta = 1;
		}
		newRealValue = originalValue + direction * delta;
		newRealValue = Number(newRealValue.toFixed(6));	// 避免精度丢失导致超长小数问题
		if (newRealValue < (props.min ?? 0)) {
			newRealValue = props.min ?? 0;
		} else if (newRealValue > (props.max ?? 1)) {
			newRealValue = props.max ?? 1;
		}
		emitNewValue(newRealValue);
	}
};

</script>

<template>
	<div class="slider" :data-color_theme="appStore.frontendSettings.colorTheme">
		<div class="slider-module" @mousedown="handleDragStart">
			<div class="slider-module-track"></div>
			<div class="slider-module-track-background" :style="{ width: Math.max(0, (limitedValue ?? 0) * 100) + '%' }"></div>
			<span
				v-for="(tag, index) in tags"
				:key="index" class="slider-module-mark"
				:style="{ left: (tag[0] - (props.min ?? 0)) / ((props.max ?? 1) - (props.min ?? 0)) * 100 + '%' }"
			>
				{{ tag[1] }}
			</span>
			<button v-if="props.value !== undefined" class="slider-module-slipper" v-bind:style="{ left: limitedValue * 100 + '%' }" ref="slipperRef" @keydown="handleKeypress" aria-label="滑块"></button>
		</div>
		<div class="slider-text">{{ valueToDisplayConverter(props.valueToDisplay) }}</div>
	</div>
</template>

<style lang="less" scoped>
	.slider {
		position: relative;
		flex-grow: 1;
		height: 56px;
		display: flex;
		align-items: center;
		transition: all 0.5s;
		.slider-module {
			position: relative;
			flex-grow: 1;
			height: 100%;
			margin: 0 16px;
			font-size: 14px;
			.slider-module-track {
				position: absolute;
				top: 17px;
				width: 100%;
				height: 6px;
				border-radius: 8px;
				box-shadow: 0px 2px 2px 0px rgba(0, 0, 0, 0.15) inset;
			}
			.slider-module-track-background {
				position: absolute;
				top: 17px;
				height: 6px;
				background: #49e;
				border-radius: 8px;
				box-shadow: 0px 2px 2px 0px rgba(0, 0, 0, 0.15) inset;
				pointer-events: none;
			}
			.slider-module-slipper {
				position: absolute;
				top: 4px;
				transform: translateX(-50%);
				width: 18px;
				height: 30px;
				background: linear-gradient(180deg, #fefefe, #f0f0f0);
				border-radius: 4px;
				box-shadow: 0px 2px 2px 0px rgba(0, 0, 0, 0.2);
				border: none;
				outline: none;
			}
			.slider-module-slipper:hover {
				background: linear-gradient(180deg, #ffffff, #fefefe);
			}
			.slider-module-slipper:active {
				background: linear-gradient(180deg, #f0f0f0, #ededed);
			}
			/*
			.slider-module-slipper:before {
				position: absolute;
				display: inline-block;
				left: 0;
				content: "";
				width: 18px;
				height: 15px;
				background: linear-gradient(-90deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3));
				border-radius: 1px 1px 18px 18px / 1px 1px 3px 3px;
			}
			*/
			.slider-module-mark {
				position: absolute;
				bottom: 0px;
				transform: translateX(-50%);
				width: 96px;
				font-size: 10px;
				text-align: center;
				opacity: 0.7;
				pointer-events: none;
			}
			.slider-module-mark:before {
				content: "";
				position: absolute;
				left: calc(50% - 2px);
				top: -8px;
				width: 4px;
				height: 4px;
				border-radius: 4px;
				box-shadow: 0px 1px 1px 0px rgba(0, 0, 0, 0.2) inset;
				z-index: -10;
			}
		}
		.slider-text {
			width: 88px;
			font-size: 14px;
			text-align: center;
		}
	}

	// 主题
	.slider[data-color_theme="themeLight"] {
		.slider-module-track {
			background: #FFF;
		}
		.slider-module-mark:before {
			background: #FFF;
		}
	}
	.slider[data-color_theme="themeDark"] {
		.slider-module-track {
			background: #444;
		}
		.slider-module-mark:before {
			background: #777;
		}
	}

</style>
