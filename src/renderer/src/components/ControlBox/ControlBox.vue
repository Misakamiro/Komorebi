<script setup lang="ts">
import { useTooltip } from '@renderer/common/tooltipUtil';
import Checkbox from '@renderer/components/Checkbox/Checkbox.vue';
import { watch } from 'vue';

const props = defineProps<{
    title: string;
	description?: string;
	long?: boolean;
	optional?: boolean;
	hasValue?: boolean;
	onEnabledChange?: (checked: boolean) => any;
}>();
</script>

<template>
    <div class="controlBox" :style="{ '--width': props.long ? '100%' : '210px', '--marginRight': !props.optional && !props.long ? '28px' : (props.optional && props.long ? '8px' : '20px') }">
		<Checkbox v-if="props.optional" :checked="props.hasValue" @change="props.onEnabledChange" />
		<div class="controlBox-title" v-bind="props.description ? useTooltip(props.description) : undefined" :style="{ opacity: props.optional && hasValue === false ? 0.5 : 1 }">
			{{ props.title }}
		</div>
        <slot></slot>
	</div>
</template>

<style>
	.controlBox {
		height: 56px;
		width: var(--width);
		margin: 4px 20px;
		margin-right: var(--marginRight);
        display: flex;
		justify-content: space-between;
        align-items: center;
		gap: 4px;
	}
		.controlBox-title {
			min-width: 88px;
			font-size: 14px;
			text-align: center;
		}

</style>
