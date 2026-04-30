import zhCN from './zh-CN';

export interface I11n {
	service: {
		功能限制_暂停转码: (taskName: string, byFrontend: boolean, reason: 'media' | 'working') => string;
		功能限制_不能继续: (taskName: string, byFrontend: boolean, reason: 'media' | 'working', pid: number) => string;
		功能限制_任务数上限: (maxTaskCount: string | number, byFrontend: boolean) => string;
		功能限制_滤镜图节点数上限: (maxNodeCount: string | number) => string;
	},
	ffmpeg: {
		文件不存在: string;
		内存或显存不足: string;
		无硬件解码设备_nvenc: string;
		硬件解码错误回退软件_nvenc: string;
		硬件编码器不存在: string;
		硬件编码器初始化失败_amd: string;
		复用器不支持某编码: (codecName: string) => string;
		编码无法识别: string;
		移动文件信息到文件头: string;
		编码器输出参数设置有误: string;
		输入文件无法识别: string;
		权限不足: string;
		外存已满: string;
		无法原地编辑: string;
	},
	frontend: {
		settings: {
			useVirtualTaskListDesc: string;
		},
		applicationMenu: {
			编辑: string;
			撤销: string;
			重做: string;
			剪切: string;
			复制: string;
			粘贴: string;
			删除: string;
			全选: string;
		},
	},
}

let currentLanguage = 'zh-CN';
const languageMap = {
	'zh-CN': zhCN,
} as {[key: string]: I11n};

export default new Proxy({} as I11n, {
	get(_, key) {
		return (languageMap[currentLanguage] as any)[key];
	}
});
