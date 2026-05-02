<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import RadioList, { Props as RadioListProps } from '@renderer/components/RadioList/RadioList.vue';
import { useTooltip } from '@renderer/common/tooltipUtil';
import i11n, { languageOptions } from '@common/i11n/i11n';

const appStore = useAppStore();

const dataRadixList: RadioListProps['list'] = [
	{ value: false, caption: '1000 进制 (SI)' },
	{ value: true, caption: '1024 进制 (IEC)' },
];
const tr = computed(() => {
	appStore.frontendSettings.language;
	return i11n.frontend.settings;
});
const languageList = computed<RadioListProps['list']>(() => languageOptions);
const colorThemeList = computed<RadioListProps['list']>(() => [
	{ value: 'light', caption: tr.value.light },
	{ value: 'dark', caption: tr.value.dark },
	{ value: 'system', caption: tr.value.system },
]);
const animationSpeedList = computed<RadioListProps['list']>(() => [
	{ value: 'default', caption: tr.value.animationDefault },
	{ value: 'fast', caption: tr.value.animationFast },
	{ value: 'slow', caption: tr.value.animationSlow },
]);
const useVirtualTaskListList = computed<RadioListProps['list']>(() => [
	{ value: true, caption: tr.value.enableVirtualTaskList },
	{ value: false, caption: tr.value.fullRenderTaskList },
]);

const handleSettingChange = (key: keyof typeof appStore.frontendSettings, value: any) => {
	(appStore.frontendSettings[key] as any) = value;
	appStore.applyFrontendSettings(true);
};
</script>

<template>
	<div class="localSettings">
		<div class="gridArea">
			<span>{{ tr.language }}</span>
			<RadioList :list="languageList" :value="appStore.frontendSettings.language" @change="(value) => handleSettingChange('language', value)" />
			<span>{{ tr.dataRadix }}</span>
			<RadioList :list="dataRadixList" :value="appStore.frontendSettings.useIEC" @change="(value) => handleSettingChange('useIEC', value)" />
			<span>{{ tr.colorTheme }}</span>
			<RadioList :list="colorThemeList" :value="appStore.frontendSettings.colorThemeMode" @change="(value) => handleSettingChange('colorThemeMode', value)" />
			<span>{{ tr.animationSpeed }}</span>
			<RadioList :list="animationSpeedList" :value="appStore.frontendSettings.animationSpeed" @change="(value) => handleSettingChange('animationSpeed', value)" />
			<span v-bind="useTooltip(tr.useVirtualTaskListDesc, 't')">{{ tr.taskListPerformance }}</span>
			<RadioList v-bind="useTooltip(tr.useVirtualTaskListDesc, 't')" :list="useVirtualTaskListList" :value="appStore.frontendSettings.useVirtualTaskList" @change="(value) => handleSettingChange('useVirtualTaskList', value)" />
		</div>
	</div>
</template>

<style lang="less">
	.localSettings {
		font-size: 15px;
		.gridArea {
			width: 100%;
			display: grid;
			grid-template-columns: minmax(150px, 240px) minmax(320px, 520px);
			justify-content: center;
			align-items: center;
			row-gap: 16px;
			column-gap: 20px;
			&>span {
				font-size: 15px;
			}
			.radioList {
				flex-direction: row;
				min-height: unset;
				padding: 0;
				justify-content: flex-start;
				align-content: flex-start;
			}
		}
	}
</style>
