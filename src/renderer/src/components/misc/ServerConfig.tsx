import { computed, defineComponent, onMounted, ref } from "vue";
import { Server } from "@renderer/types";
import { useAppStore } from "@renderer/stores/appStore";
import { useTooltip } from "@renderer/common/tooltipUtil";
import nodeBridge from "@renderer/bridges/nodeBridge";
import { showServerUserConfig } from "./ServerUserConfig";
import { showServerCacheInfo } from "./ServerCacheInfo";
import Button from '@renderer/components/Button/Button';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue';
import { posIntegerFixer } from "@renderer/components/validatorAndFixer";
import { ButtonType } from "../Button/Button";
import Msgbox from "../Msgbox/Msgbox";
import css from './ServerConfig.module.less';

export function showServerConfig(serverId: string) {
	let compFuncs: any;
	const appStore = useAppStore();
	(document.activeElement as any)?.blur();
	// 如果是从菜单通过 Enter 进入的，不加延迟的情况下，会连带触发 Msgbox 的键盘事件监听，因此需要加延迟
	setTimeout(() => {
		Msgbox({
			container: document.body,
			title: '本地服务器配置',
			content: <Comp exportFunctions={(fs) => compFuncs = fs} serverId={serverId} />,
			buttons: [
				{ text: '保存', role: 'confirm', type: ButtonType.Primary, callback: async () => {
					const result = await compFuncs.exportData();
					const { maxThreads, customFFmpegPath, preserveUnfinishedTasks, deleteFinishedTasks } = result;
					const originalConfig = await nodeBridge.localConfig.get('service');
					nodeBridge.localConfig.set('service', { ...originalConfig, maxThreads, customFFmpegPath, preserveUnfinishedTasks, deleteFinishedTasks });
					const server = appStore.servers.find((server) => server.data.id === serverId) as Server;
					setTimeout(() => {
						// 留时间写盘完成后再通知服务器刷新
						server.entity.initSettings();
					}, 40);
				} },
				{ text: '取消', role: 'cancel' },
			]
		});
	}, 0);
}

interface P {
	serverId: string;
    exportFunctions: (fs: any) => void;
}
const Comp = defineComponent((props: P) => {
	const appStore = useAppStore();
	const maxThreadsValue = ref<string>();
	const customFFmpegPathValue = ref<string>();
	const preserveUnfinishedTasksValue = ref(true);
	const deleteFinishedTasksValue = ref(false);

	const exports = {
		exportData: async () => {
			return {
				maxThreads: +maxThreadsValue.value,
				customFFmpegPath: customFFmpegPathValue.value,
				preserveUnfinishedTasks: preserveUnfinishedTasksValue.value,
				deleteFinishedTasks: deleteFinishedTasksValue.value,
			};
		}
	};

	const maxThreadsLimit = computed(() => appStore.functionLevel < 40 ? 6 : appStore.functionLevel < 60 ? 9 : 0);

	onMounted(() => {
		props.exportFunctions(exports);
		(async () => {
			const serviceSettings = await nodeBridge.localConfig.get('service') || {};
			
			maxThreadsValue.value = (serviceSettings.maxThreads || 1) + '';
			customFFmpegPathValue.value = serviceSettings.customFFmpegPath || '';
			preserveUnfinishedTasksValue.value = serviceSettings.preserveUnfinishedTasks === false ? false : true;
			deleteFinishedTasksValue.value = serviceSettings.deleteFinishedTasks === true ? true : false;
		})();
    });

	return () => (
		<div class={css.serverConfig}>
			<BoxedNormalInput
				title="同时转码任务数量" value={maxThreadsValue.value} onChange={(value: string) => maxThreadsValue.value = value} inputFixer={posIntegerFixer} placeholder="1"
				{ ...useTooltip(`开始转码队列后，会使所有未完成任务进入排队状态，并持续挑选最靠前的任务开始运行。同时运行的任务数量受此控制${maxThreadsLimit.value ? `\n（您的用户等级最高支持同时运行 ${maxThreadsLimit.value} 个任务）` : ''}`, 't') }
			/>
			<BoxedSwitch
				title="保留未完成任务" checked={preserveUnfinishedTasksValue.value} onChange={(value: boolean) => preserveUnfinishedTasksValue.value = value}
				{ ...useTooltip('若转码服务意外退出，下次运行时将自动将转码途中未完成任务恢复到任务列表', 't')}
			/>
			<BoxedSwitch
				title="任务完成自动移除" checked={deleteFinishedTasksValue.value} onChange={(value: boolean) => deleteFinishedTasksValue.value = value}
				{ ...useTooltip('任务成功转码后自动从任务列表中移除。任务出错则不受此设置影响', 't')}
			/>
			<BoxedNormalInput
				title="ffmpeg 路径" value={customFFmpegPathValue.value} onChange={(value: string) => customFFmpegPathValue.value = value} placeholder="建议留空，自动检测" long={true}
				{ ...useTooltip('合法路径的规则受到操作系统影响。留空状态下，FFBox 将按操作系统自动检查 ffmpeg 位置', 't')}
			/>
			<div style={{ margin: '12px' }}>
				<Button onClick={() => showServerUserConfig(props.serverId)}>用户配置</Button>
				<Button onClick={() => showServerCacheInfo(props.serverId)}>缓存信息</Button>
			</div>
		</div>
	);
}, { props: ['serverId', 'exportFunctions'] });
