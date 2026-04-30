<script setup lang="ts">
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import Switch from './Switch.vue';

interface Props {
	title: string;
	description?: string;
	checked?: boolean;
	optionalDefault?: any;
	onChange?: (value: boolean) => any;
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
    <ControlBox :title="props.title" :description="props.description" :optional="props.optionalDefault !== undefined ? true : false" :hasValue="props.checked !== undefined ? true : false" :onEnabledChange="handleEnabledChange">
        <Switch v-bind="$props" />
    </ControlBox>
</template>
