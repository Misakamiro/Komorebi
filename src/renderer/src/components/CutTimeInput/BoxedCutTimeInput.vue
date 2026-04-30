<script setup lang="ts">
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import CutTimeInput from './CutTimeInput.vue';

interface Props {
	title: string;
	description?: string;
	value?: [string, string];
	optionalDefault?: any;
	disabled?: boolean;
	placeholder?: [string, string];
	onChange?: (value: [string, string]) => any;
	onButtonClick?: () => any;
	onEnter?: () => any;
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
    <ControlBox class="controlBox" :title="props.title" :description="props.description" :optional="props.optionalDefault !== undefined ? true : false" :hasValue="props.value !== undefined ? true : false" :onEnabledChange="handleEnabledChange">
        <CutTimeInput v-bind="$props" />
    </ControlBox>
</template>

<style scoped>
	.controlBox {
		width: 330px;
	}
</style>
