<script setup lang="ts">
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import NormalInput from './NormalInput.vue';

interface Props {
	title: string;
	description?: string;
	long?: boolean;
	value?: string;
	optionalDefault?: any;
	type?: 'text' | 'password';
	disabled?: boolean;
	placeholder?: string;
	validator?: (value: string) => string;
	inputFixer?: (value: string) => string;
	onChange?: (value: string) => any;
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
    <ControlBox :title="props.title" :description="props.description" :optional="props.optionalDefault !== undefined ? true : false" :hasValue="props.value !== undefined ? true : false" :onEnabledChange="handleEnabledChange" :long="$props.long">
        <NormalInput v-bind="$props" />
    </ControlBox>
</template>
