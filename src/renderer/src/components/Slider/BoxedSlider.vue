<script setup lang="ts">
import type { SliderOptions } from '@common/params/parameter';
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import Slider from './Slider.vue';

interface Props {
    title: string;
	description?: string;
	value?: number | string;
	optionalDefault?: any;
	min?: number;	// 不填为 0
	max?: number;	// 不填为 1
	tags?: [number, string][] | Map<number, string>;
	mode?: 'number' | 'string';	// 决定了 onChange 返回时的值类型、tags 是否用于列表选项
	arrowKeyStep?: number;	// 键盘方向键，不指定时按整数进行调整，指定时按步长倒数进行调整
	adsorption?: 'int' | 'tags' | ((value: number) => number);	// 鼠标或触屏调整时吸附值，不指定时自动选择 tags
	valueToDisplay?: { power?: number, type?: 'bitrate' | 'integer' | 'revertInteger' } | ((value: number | string) => string);	// 仅在 mode 为 number 时有效，指定显示在滑块旁边的结果
	onChange?: (value: number | string) => any;
}

const props = defineProps<Props>();
const handleEnabledChange = (checked: boolean) => {
	if (checked) {
		props.onChange && props.onChange(props.optionalDefault);
	} else {
		props.onChange && props.onChange(undefined);
	}
};

</script>

<template>
    <ControlBox :title="props.title" :description="props.description" :optional="props.optionalDefault !== undefined ? true : false" :hasValue="props.value !== undefined ? true : false" :onEnabledChange="handleEnabledChange" :long="true">
        <Slider v-bind="$props" />
    </ControlBox>
</template>
