<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

interface Props {
	value?: string;
	type?: 'text' | 'password';
	disabled?: boolean;
	placeholder?: string;
	validator?: (value: string) => string;
	inputFixer?: (value: string) => string;
	onChange?: (value: string) => any;
	onEnter?: () => any;
};

const props = defineProps<Props>();

const focused = ref(false);
const inputText = ref('-');
const invalidMsg = ref<string>(undefined);

const selectorStyle = computed(() => {
	const ret: any = {};
	if (props.value === undefined) {
		return ret;
	}
	// 校验有误的情况下背景和边框都变红
	if (invalidMsg.value) {
		ret.border = 'var(--errorBorder) 1px solid';
		ret.boxShadow = '0 0 12px hsla(0, 100%, 60%, 0.3), 0px 4px 8px rgba(0, 0, 0, 0.05)';
		if (focused.value) {
			ret.background = 'var(--errorBgActive)';
		} else {
			ret.background = 'var(--errorBg)';
		}
	} else {
		if (focused.value) {
			ret.background = 'var(--ff)';
		}
	}
	// 禁用的情况下整体变透明，并且固定背景颜色
	if (props.disabled) {
		ret.opacity = 0.6;
		ret.color = 'var(--66)'; // 默认，20% 亮度黑色，变灰 40% 亮度黑色
		ret.background = 'var(--f7)';
	}
	return ret;
});

const handleBlur = (event: FocusEvent) => {
	focused.value = false;
};
const handleFocus = (event: FocusEvent) => {
	event.target!.selectionEnd = event.target!.selectionStart;
	focused.value = true;
};
const handleInput = (event: KeyboardEvent) => {
	if (props.inputFixer) {
		inputText.value = props.inputFixer(event.target.value);
	}
	(props.onChange || (() => {}))(inputText.value ?? '');	// 使用输入法时会出现 inputText 为空的现象
};
const handleKeydown = (event: KeyboardEvent) => {
	if (props.onEnter && event.key === 'Enter') {
		props.onEnter();
	}
};

// 监听 props 中的 text，并在其更新时依此更新 data 中的 inputText（与输入框双向绑定）
watch(() => props.value, (newValue, oldValue) => {
	inputText.value = newValue;
});
watch(inputText, (newValue, oldValue) => {
	if (props.validator) {
		invalidMsg.value = props.validator(newValue ?? '');
	} else {
		invalidMsg.value = undefined;
	}
}, { immediate: true });

onMounted(() => {
	inputText.value = props.value;
});

</script>

<template>
	<div class="inputbox-selector" :style="selectorStyle">
		<input :type="$props.type || 'text'" :disabled="props.disabled" v-model="inputText" @blur="handleBlur" @focus="handleFocus" @input="handleInput" @keydown="handleKeydown" :placeholder="placeholder">
	</div>
</template>

<style scoped>
	.inputbox-selector {
		position: relative;
		height: 24px;
		flex-grow: 1;
		margin: 15px 0;
		border-radius: 24px;
		background: var(--f7);
		border: #AAA 1px solid;
		box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
		transition: box-shadow var(--motion-standard) ease, border-color var(--motion-standard) ease, background var(--motion-standard) ease;
	}
	.inputbox-selector:hover {
		background: var(--ff);
	}
	.inputbox-selector:active {
		background: var(--e7);
	}
		.inputbox-selector>input {
			position: absolute;
			left: 6px;
			width: calc(100% - 12px);
			height: 24px;
			line-height: 24px;
			background: none;
			border: none;
			margin: 0;
			padding: 0;
			outline: none;
			font-family: inherit;
			font-size: 13px;
			color: inherit;
		}
		.inputbox-selector>input::placeholder {
			font-size: 13px;
			opacity: 0.1;
			font-style: italic;
			transition: opacity var(--motion-quick) ease;
		}
		.inputbox-selector>input:hover::placeholder {
			font-size: 13px;
			opacity: 0.25;
		}

</style>
