<script setup lang="ts">
import { useAppStore } from '@renderer/stores/appStore';
import RadioList, { Props as RadioListProps } from '@renderer/components/RadioList/RadioList.vue';
import { useTooltip } from '@renderer/common/tooltipUtil';
import i11n from '@common/i11n/i11n';

const appStore = useAppStore();

const dataRadixList: RadioListProps['list'] = [
	{ value: false, caption: '1000 进制 (SI)' },
	{ value: true, caption: '1024 进制 (IEC)' },
];
const colorThemeList: RadioListProps['list'] = [
	{ value: 'light', caption: '浅色' },
	{ value: 'dark', caption: '深色' },
	{ value: 'system', caption: '跟随系统' },
];
const useVirtualTaskListList: RadioListProps['list'] = [
	{ value: true, caption: '启用虚拟列表（强优化）' },
	{ value: false, caption: '完整渲染（弱优化）' },
];

const handleSettingChange = (key: keyof typeof appStore.frontendSettings, value: any) => {
	(appStore.frontendSettings[key] as any) = value;
	appStore.applyFrontendSettings(true);
};
</script>

<template>
	<div class="localSettings">
		<div class="gridArea">
			<span>数据量进制和词头</span>
			<RadioList :list="dataRadixList" :value="appStore.frontendSettings.useIEC" @change="(value) => handleSettingChange('useIEC', value)" />
			<span>颜色主题</span>
			<RadioList :list="colorThemeList" :value="appStore.frontendSettings.colorThemeMode" @change="(value) => handleSettingChange('colorThemeMode', value)" />
			<span v-bind="useTooltip(i11n.frontend.settings.useVirtualTaskListDesc, 't')">任务列表性能优化</span>
			<RadioList v-bind="useTooltip(i11n.frontend.settings.useVirtualTaskListDesc, 't')" :list="useVirtualTaskListList" :value="appStore.frontendSettings.useVirtualTaskList" @change="(value) => handleSettingChange('useVirtualTaskList', value)" />
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
