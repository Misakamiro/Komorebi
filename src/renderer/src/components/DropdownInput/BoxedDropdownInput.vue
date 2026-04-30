<script setup lang="ts">
import { MenuItem } from '@common/menu';
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import DropdownInput from './DropdownInput.vue';

interface Props {
	title: string;
	description?: string;
	text?: string;
	optionalDefault?: any;
	list: MenuItem[];
	readonly?: boolean;
	disabled?: boolean;
	// deletable?: boolean;
	validator?: (value: string) => string;
	inputFixer?: (value: string) => string;
	onChange?: (value: string) => any;
	onEnter?: () => any;
	onDelete?: (index: number) => any;
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
    <ControlBox :title="props.title" :description="props.description" :optional="props.optionalDefault !== undefined ? true : false" :hasValue="props.text !== undefined ? true : false" :onEnabledChange="handleEnabledChange" >
        <DropdownInput v-bind="$props" />
    </ControlBox>
</template>
