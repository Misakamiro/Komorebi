import { computed, defineComponent, onBeforeUnmount, ref, Transition, watch, onMounted, StyleValue, onRenderTracked, onRenderTriggered, onUpdated } from 'vue';
import { TaskStatus } from '@common/types';
import { UITask } from '@renderer/types'
import { getVideoRateControlParam } from '@common/params/vcodecs';
import { getAudioRateControlParam } from '@common/params/acodecs';
import { getOutputFileBaseName } from '@common/params/formats';
import { useAppStore } from '@renderer/stores/appStore';
import Tooltip from '@renderer/components/Tooltip/Tooltip';
import showMenu from '@renderer/components/Menu/Menu';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { getOutputDuration, formatTimeToFFmpegStyle, formatSize, parseTimeString, getOutputFileTime, getDefaultInputVideo, getDefaultInputAudio } from '@common/utils';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import IconInitializing from './initializing.svg';
import IconIdle from './idle.svg';
import IconIdleQueued from './idle_queued.svg';
import IconRunning from './running.svg';
import IconPaused from './paused.svg';
import IconPausedQueued from './paused_queued.svg';
import IconStopping from './stopping.svg';
import IconFinished from './finished.svg';
import IconError from './error.svg';
import IconRightArrow from '@renderer/assets/swap_right.svg';
import css from './TaskItem.module.less';

interface Props {
	task: UITask;
	id: number;
	index: number;
	show: boolean;
	selected?: boolean;
	shouldHandleHover?: boolean;	// 如果正在多选，或者单选但选的不是自己，那么不响应悬浮
	onClick?: (event: MouseEvent, id: number, index: number) => any;
	onBatchContextMenu?: (event: MouseEvent) => any;	// 如果单个任务右键菜单，直接在 taskItem 处理；如果多个任务右键菜单，则到外面处理
}

export const TaskItem = defineComponent((props: Props) => {
	const appStore = useAppStore();
	const settings = appStore.taskViewSettings;

	// const usedKeys = new Set();
	// onRenderTracked(e => {
	// 	console.log('[TRACKED]', props.task.taskName, e);
	// 	usedKeys.add(String(e.key));
	// })
	// onRenderTriggered(e => {
	// 	console.log('[TRIGGERED]', props.task.taskName, usedKeys.has(String(e.key)), e);
	// 	// if (usedKeys.has(String(e.key))) {
	// 	// 	console.log(`组件 ${props.id} 因 key=${String(e.key)} 变化而更新`);
	// 	// }
	// })
	// onUpdated(() => {
	// 	console.log('[UPDATED] rendered', props.task.taskName)
	// })

	// #region 预先计算以减少下方计算量

	const outputDuration = computed(() => getOutputDuration(props.task));
	const uploadFiles = computed(() => appStore.currentServer.data.uploadFiles.filter((uploadFile) => uploadFile.taskId === props.id));
	const uploadStatus = computed(() => {
		if (uploadFiles.value.length > 0 && props.task.status === TaskStatus.initializing) {
			if (uploadFiles.value.every((file) => file.status !== 'error')) {
				return 'uploading';
			}
			return 'error';
		}
		return 'fine';
	});
	const transferInfo = computed(() => {
		const _uploadFiles = uploadFiles.value;
		const totalSize = _uploadFiles.reduce((prev, curr) => prev + (curr.size || Number.MAX_SAFE_INTEGER / 1024), 0);
		const totalRead = _uploadFiles.reduce((prevFileRead, currFile) => {
			const fileRead = currFile.chunks.reduce((prev, curr) => prev + curr.size, 0);
			return prevFileRead + fileRead;
		}, 0);
		const totalHash = _uploadFiles.reduce((prevFileHash, currFile) => {
			const fileHash = currFile.chunks.reduce((prev, curr) => prev + (curr.hash ? curr.size : 0), 0);
			return prevFileHash + fileHash;
		}, 0);
		const totalUpload = _uploadFiles.reduce((prevFileUpload, currFile) => {
			const fileUpload = currFile.chunks.reduce((prev, curr) => prev + curr.transferred, 0);
			return prevFileUpload + fileUpload;
		}, 0);
		return { totalSize, totalRead, totalHash, totalUpload };
	});
	const defaultVideo = computed(() => getDefaultInputVideo(props.task));
	const defaultAudio = computed(() => getDefaultInputAudio(props.task));

	// #endregion

	// #region 参数

	const beforeBitrateFilter = (kbps: number) => {
		if (isNaN(kbps)) {
			return '读取中';
		} else {
			const bps = kbps * 1000;
			if (window.frontendSettings.useIEC) {
				if (bps >= 10 * 1024 ** 2) {
					return (bps / 1024 ** 2).toFixed(1) + ' Mibps';
				} else {
					return (bps / 1024).toFixed(0) + ' kibps';
				}
			} else {
				if (bps >= 10 * 1000 ** 2) {
					return (bps / 1000 ** 2).toFixed(1) + ' Mbps';
				} else {
					return (bps / 1000).toFixed(0) + ' kbps';
				}
			}
		}
	};
	const durationBefore = computed(() => formatTimeToFFmpegStyle(props.task.before[0]?.duration ?? NaN));
	const durationAfter = computed(() => formatTimeToFFmpegStyle(outputDuration.value));
	const smpteBefore = computed(() => defaultVideo.value?.resolution && defaultVideo.value?.fps ? `${defaultVideo.value?.resolution}@${defaultVideo.value?.fps}` : '-');
	const videoRateControlValue = computed(() => getVideoRateControlParam(props.task.after.outputs[0]?.video)?.value);
	const audioRateControlValue = computed(() => getAudioRateControlParam(props.task.after.outputs[0]?.audio)?.value);
	const videoRateControl = computed(() => (videoRateControlValue.value === '-' ? '' : `@${props.task.after.outputs[0]?.video.ratecontrol} ${videoRateControlValue.value}`));
	const audioRateControl = computed(() => (audioRateControlValue.value === '-' ? '' : `@${props.task.after.outputs[0]?.audio.ratecontrol} ${audioRateControlValue.value}`));
	const videoInputBitrate = computed(() => defaultVideo.value?.bitrate > 0 ? `@${beforeBitrateFilter(defaultVideo.value?.bitrate)}` : '');
	const audioInputBitrate = computed(() => defaultAudio.value?.bitrate > 0 ? `@${beforeBitrateFilter(defaultAudio.value?.bitrate)}` : '');

	// #endregion

	// #region 仪表盘

	const graphBitrateFilter = (kbps: number) => {
		const bps = kbps * 1000;
		if (window.frontendSettings.useIEC) {
			if (bps >= 10 * 1024 ** 2) {
				return (bps / 1024 ** 2).toFixed(1) + ' M';
			} else {
				return (bps / 1024 ** 2).toFixed(2) + ' M';
			}
		} else {
			if (bps >= 10 * 1000 ** 2) {
				return (bps / 1000 ** 2).toFixed(1) + ' M';
			} else {
				return (bps / 1000 ** 2).toFixed(2) + ' M';
			}
		}
	};
	const graphBitrate = computed(() => graphBitrateFilter(props.task.dashboard_smooth.bitrate));
	const speedFilter = (value: number) => {
		if (value < 10) {
			return value.toFixed(2) + ' ×';
		} else {
			return value.toFixed(1) + ' ×';
		}
	};
	const graphSpeed = computed(() => speedFilter(props.task.dashboard_smooth.speed));
	const timeFilter = (value: number, withDecimal = true) => {
		let left = value;
		let hour = Math.floor(left / 3600); left -= hour * 3600;
		let minute = Math.floor(left / 60); left -= minute * 60;
		let second = left;
		if (hour) {
			return `${hour}:${minute.toString().padStart(2, '0')}:${second.toFixed(0).toString().padStart(2, '0')}`;
		} else if (minute) {
			return `${minute}:${withDecimal ? second.toFixed(1).padStart(4, '0') : second.toFixed(0).padStart(2, '0')}`;
		} else {
			return withDecimal ? second.toFixed(2) : `${second.toFixed(0)} s`;
		}
	};
	const graphTime = computed(() => timeFilter(props.task.dashboard_smooth.time));
	const graphLeftTime = computed(() => {
		const totalDuration = outputDuration.value;
		if (props.task.dashboard_smooth.speed > 0) {
			const needTime = totalDuration / props.task.dashboard_smooth.speed;
			const remainTime = (totalDuration - props.task.dashboard_smooth.time) / totalDuration * needTime;	// 剩余进度比例 * 全进度耗时
			return timeFilter(remainTime, false);
		}
		return '-';
	});
	const graphSize = computed(() => formatSize(props.task.dashboard_smooth.size * 1000, window.frontendSettings.useIEC));
	const graphUploadRead = computed(() => formatSize(transferInfo.value.totalRead, window.frontendSettings.useIEC));
	const graphUploadHash = computed(() => formatSize(transferInfo.value.totalHash, window.frontendSettings.useIEC));
	const graphUploadUpload = computed(() => formatSize(transferInfo.value.totalUpload, window.frontendSettings.useIEC));

	/** 圆环 style 部分
	 *  计算方式：(log(数值) / log(底，即每增长多少倍数为一格) + 数值为 1 时偏移多少格) / 格数
	 *  　　　或：(log(数值 / 想要以多少作为最低值) / log(底，即每增长多少倍数为一格)) / 格数
	 */
	const graphBitrateStyle = computed(() => {
		let value = Math.log(props.task.dashboard_smooth.bitrate / 62.5) / Math.log(8) / 4;		// 62.5K, 500K, 4M, 32M, 256M
		value = Math.min(Math.max(value, 0), 1);
		return `background: conic-gradient(hwb(var(--primaryColor)) 0%, hwb(var(--primaryColor)) ${value * 75}%, hwb(var(--opposite80) / 0.1) ${value * 75}%, hwb(var(--opposite80) / 0.1) 75%, transparent 75%)`;
	});
	const graphSpeedStyle = computed(() => {
		let value = Math.log(props.task.dashboard_smooth.speed / 0.04) / Math.log(5) / 6;			// 0.04, 0.2, 1, 5, 25, 125, 625
		value = Math.min(Math.max(value, 0), 1);
		return `background: conic-gradient(hwb(var(--primaryColor)) 0%, hwb(var(--primaryColor)) ${value * 75}%, hwb(var(--opposite80) / 0.1) ${value * 75}%, hwb(var(--opposite80) / 0.1) 75%, transparent 75%)`;
	});

	const overallProgress = computed(() => uploadStatus.value !== 'fine'
		? (transferInfo.value.totalRead * 0.1 + transferInfo.value.totalHash * 0.1 + transferInfo.value.totalUpload * 0.8) / transferInfo.value.totalSize
		: props.task.dashboard_smooth.progress
	);
	// const overallProgress = { value: 0.99 };
	const overallProgressDescription = computed(() => uploadStatus.value !== 'fine' ? '上传进度' : '转码进度');

	// #endregion

	// #region 其他样式

	const showDashboard = computed(() => [TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finishing].includes(props.task.status) || uploadStatus.value !== 'fine');
	const dashboardType = computed(() => showDashboard ? (uploadStatus.value !== 'fine' ? 'transfer' : 'convert') : 'none');

	const taskNameStyle = computed(() => {
		const width = (() => {
			if (windowWidth.value >= 930) {
				let shrinkSpace = 80;
				shrinkSpace += [0, 13 + 96, 13 + 96 + 14 + 120 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.audio)];
				shrinkSpace += [0, 13 + 96, 13 + 96 + 14 + 120 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.video)];
				shrinkSpace += [0, 13 + 88, 13 + 88 + 14 + 88 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.smpte)];
				shrinkSpace += [0, 13 + 36, 13 + 36 + 14 + 36 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.format)];
				shrinkSpace += [0, 13 + 64, 13 + 64 + 14 + 64 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.duration)];
				if (showDashboard.value) {
					shrinkSpace = Math.max(shrinkSpace, 720);
				}
				return `max(calc(100% - ${shrinkSpace}px), 64px)`;
			} else {
				return 'calc(100% - 188px)';
			}
		})();
		return {
			...(showDashboard.value && windowWidth.value >= 930 ? {} : { maxHeight: '26px', '-webkit-line-clamp': 1 }),
			width: isFirstRender.value ? 'calc(0% + 0px)' : width,
			...(!showDashboard.value ? { fontSize: '16px', lineHeight: '23px' } : {}),	// 不显示 dashboard 时不允许文字放大
			...(props.shouldHandleHover ? { pointerEvents: 'all' } : undefined),
		};
	}) as any;

	const deleteButtonBackgroundPositionX = computed(() => {
		switch (props.task.status) {
			case TaskStatus.idle:
				return '0px';	// 删除按钮
			case TaskStatus.paused_queued: case TaskStatus.running:
				return '-100%';	// 暂停按钮
			case TaskStatus.idle_queued: case TaskStatus.paused: case TaskStatus.stopping: case TaskStatus.finishing: case TaskStatus.finished: case TaskStatus.error:
				return '-200%';	// 重置按钮
		}
		return '';
	});

	/** 整个任务项的高度，包括上下 margin */
	const taskHeight = computed(() => {
		let height = 4;
		height += settings.showParams ? 24 : 0;
		height += showDashboard.value ? 72 : 0;
		height += settings.showCmd ? 64 : 0;
		height = Math.max(24, height);
		return height;
	});

	const taskBackgroundStyle = computed(() => {
		if (props.selected) {
			return {
				background: 'hwb(var(--menuItemHovered))',
				border: 'hwb(var(--menuItemSelected)) 1px solid',
			};
		} else {
			return {};
		}
	});

	const taskBackgroundProgressStyle = computed(() => {
		const taskProgress = (props.task.dashboard_smooth.progress) * 100 + '%';
		const transferProgress = ((transferInfo.value.totalRead * 0.1 + transferInfo.value.totalHash * 0.1 + transferInfo.value.totalUpload * 0.8) / transferInfo.value.totalSize) * 100 + '%';
		return {
			green: { width: taskProgress, opacity: [TaskStatus.running, TaskStatus.finishing].includes(props.task.status) ? 1 : 0},
			yellow: { width: taskProgress, opacity: [TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping].includes(props.task.status) ? 1 : 0},
			gray: { width: taskProgress, opacity: [TaskStatus.finished, TaskStatus.idle].includes(props.task.status) ? 1 : 0},
			red: { width: uploadStatus.value === 'error' ? transferProgress : taskProgress, opacity: uploadStatus.value === 'error' || props.task.status === TaskStatus.error ? 1 : 0},
			blue: { width: transferProgress, opacity: uploadStatus.value === 'uploading' ? 1 : 0 },
		} as { [key: string]: StyleValue };
	});

	const taskStatusIcon = computed(() => (
		[
			[TaskStatus.initializing, <IconInitializing />],
			[TaskStatus.idle, <IconIdle />],
			[TaskStatus.idle_queued, <IconIdleQueued />],
			[TaskStatus.running, <IconRunning />],
			[TaskStatus.paused, <IconPaused />],
			[TaskStatus.paused_queued, <IconPausedQueued />],
			[TaskStatus.stopping, <IconStopping />],
			[TaskStatus.finished, <IconFinished />],
			[TaskStatus.error, <IconError />],
		].map(([taskStatus, icon]) => (
			<Transition
				leaveFromClass={css['statusIconAnimation-leave-from']}
				leaveToClass={css['statusIconAnimation-leave-to']}
				leaveActiveClass={css['statusIconAnimation-leave-active']}
				enterFromClass={css['statusIconAnimation-enter-from']}
				enterToClass={css['statusIconAnimation-enter-to']}
				enterActiveClass={css['statusIconAnimation-enter-active']}
			>
				{props.task.status === taskStatus ? icon : null}
			</Transition>
		))
	));

	// #endregion

	// #region 体验优化

	const cmdRef = ref<HTMLTextAreaElement>(null);
	function lastNLines(str: string, n: number) {
		let count = 0;
		let i = str.length - 1;
		while (i >= 0) {
			if (str[i] === '\n') {
				count++;
				if (count === n + 1) break;
			}
			i--;
		}
		return str.slice(i + 1);
	}	
	const cmdText = computed(() => settings.cmdDisplay === 'input'
		? ['ffmpeg', ...props.task.paraArray].join(' ')
		: props.task.cmdData.length >= 12000 ? '（此处只显示最后 120 行。请双击此处打开“输出日志”面板查看全文）\n' + lastNLines(props.task.cmdData, 120) : props.task.cmdData
	);
	watch(() => props.task.cmdData, () => {
		const elem = cmdRef.value;
		if (elem) {
			const scrollBottom = elem?.scrollTop + elem.getBoundingClientRect().height;
			if (elem.scrollHeight - scrollBottom < 1) {
				setTimeout(() => {
					elem.scrollTo(0, Number.MAX_SAFE_INTEGER);
				}, 0);
			}
		}
	});
	watch(() => settings.cmdDisplay, (value) => {
		const elem = cmdRef.value;
		if (value === 'output' && elem) {
			setTimeout(() => {
				elem.scrollTo(0, Number.MAX_SAFE_INTEGER);
			}, 0);
		}
	})

	const taskNameRef = ref<HTMLDivElement>(null);
	const paramAreaRef = ref<HTMLDivElement>(null);
	const isFirstRender = ref(true);
	// 监听窗口宽度变化
	const windowWidth = ref(0);
	const windowWidthListener = ref<() => void>(() => {
		windowWidth.value = window.innerWidth;
	});
	onMounted(() => {
		window.addEventListener('resize', windowWidthListener.value);
		windowWidthListener.value();
		setTimeout(() => {
			isFirstRender.value = false;
		}, 33.33);	// 这个延迟小了的话一些进场效果会不生效
	});
	onBeforeUnmount(() => {
		window.removeEventListener('resize', windowWidthListener.value);
	});

	// #endregion

	// #region 操作响应

	const openFile = (filePath: string, outputIndex?: number) => {
		const entity = appStore.currentServer.entity;
		if (entity.ip === 'localhost') {
			nodeBridge.openFile(`"${filePath}"`);
		} else {
			const task = props.task;
			const newFileBaseName = getOutputFileBaseName(props.task.after.outputs[outputIndex].mux, task.taskName);
			const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
			if (nodeBridge.env === 'electron') {
				let fileTime = undefined;
				const output = task.after.outputs[outputIndex];
				const mux = output.mux;
				if (mux.keepFileTime) {
					let { accessTime, createTime, modifyTime, ok } = getOutputFileTime(task, outputIndex);
					fileTime = { accessTime, createTime, modifyTime };
				}
				nodeBridge.ipcRenderer?.send('downloadFile', { url, sessionId: entity.sessionId, finalFileBaseName: newFileBaseName, fileTime });
				appStore.downloadMap.set(url, appStore.currentServer.data.id);
			} else {
				const elem = document.createElement('a');
				elem.href = `${url}?fileBaseName=${newFileBaseName}`;	// 目前只对浏览器环境添加此参数控制响应的 header。electron 环境会涉及 encodeURI 的操作，因此较方便的做法是分开处理
				elem.click();
			}
		}
	};

	const handleCmdDblClicked = (event: MouseEvent) => {
		appStore.showTaskInfo = [props.id, 1];
		appStore.showTransferCenter = false;
		event.stopPropagation();
	};

	const handleTaskDblClicked = (event: MouseEvent) => {
		appStore.showTaskInfo = [props.id, 0];
		appStore.showTransferCenter = false;
		event.stopPropagation();
	};

	const handleTaskContextMenu = (event: MouseEvent) => {
		event.preventDefault();
		if (appStore.selectedTask.size > 1) {
			(props.onBatchContextMenu || (() => {}))(event);
			return;
		}
		const hasQueuedTask = appStore.currentServer.data.tasks.some((task) => [TaskStatus.idle_queued, TaskStatus.paused_queued].includes(task.status));	// 暂停或停止某个任务可能会导致另一任务启动，此时给予侧面提示
		showMenu({
			menu: [
				{ type: 'normal', label: props.task.taskName, value: '状态', disabled: true,
					icon: [<IconInitializing />, <IconIdle />, <IconIdleQueued />, <IconRunning />, <IconPaused />, <IconPausedQueued />, <IconStopping />, <IconFinished />, <IconError />][
						[TaskStatus.initializing, TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finished, TaskStatus.error].indexOf(props.task.status)
					],
					tooltip: ['状态：正在初始化', '状态：空闲', '状态：空闲（等待开始）', '状态：运行中', '状态：已暂停', '状态：已暂停（等待恢复）', '状态：正在停止', '状态：已完成', '状态：出错'][
						[TaskStatus.initializing, TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finished, TaskStatus.error].indexOf(props.task.status)
					],
				},
				{ type: 'separator' },
				...([TaskStatus.idle, TaskStatus.idle_queued].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>▶️</span>, label: props.task.status === TaskStatus.idle ? '开始转码' : '立即开始转码', value: '开始', onClick: () => { appStore.currentServer.entity.taskStart(props.id) } },
				] : []),
				...([TaskStatus.paused, TaskStatus.paused_queued].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>▶️</span>, label: props.task.status === TaskStatus.paused ? '继续转码' : '立即继续转码', value: '继续', onClick: () => { appStore.currentServer.entity.taskResume(props.id) } },
				] : []),
				...([TaskStatus.idle, TaskStatus.paused].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>⏳</span>, label: props.task.status === TaskStatus.idle ? '准备转码（排队）' : '准备继续转码（排队）', value: '准备', onClick: () => { appStore.currentServer.entity.taskReady(props.id) } },
				] : []),
				...([TaskStatus.running, TaskStatus.paused_queued].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>⏸️</span>, label: props.task.status === TaskStatus.running ? '暂停转码' : '保持暂停（取消排队）', value: '暂停', onClick: () => { appStore.currentServer.entity.taskPause(props.id) }, tooltip: hasQueuedTask ? '暂停当前任务\n（有其他排队中任务，如有空闲名额则会被调度器启动）' : undefined },
				] : []),
				...([TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.running].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>⏹️</span>, label: '软停止转码', value: '停止', onClick: () => { appStore.currentServer.entity.taskReset(props.id) }, tooltip: `中止解码，完成收尾工作并停止${ hasQueuedTask ? '\n（有其他排队中任务，如有空闲名额则会被调度器启动）' : '' }` },
				] : []),
				...([TaskStatus.stopping].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>🛑</span>, label: '硬停止转码', value: '硬停止', onClick: () => { appStore.currentServer.entity.taskReset(props.id) }, tooltip: `调用系统级 kill 立即结束 ffmpeg，可能会导致输出文件无法播放${ hasQueuedTask ? '\n（有其他排队中任务，如有空闲名额则会被调度器启动）' : '' }` },
				] : []),
				...([TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>🔙</span>, label: props.task.status === TaskStatus.idle_queued ? '重置任务（取消排队）' : '重置任务', value: '重置', onClick: () => { appStore.currentServer.entity.taskReset(props.id) } },
				] : []),
				...([TaskStatus.initializing, TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>🗑️</span>, label: '删除任务', value: '停止', onClick: () => { appStore.deleteTasks([props.id]) } },
				] : []),
				{ type: 'normal' as const, icon: <span>➕</span>, label: '复制任务', value: '复制任务', onClick: () => {
					const entity = appStore.currentServer.entity;
					if (entity?.status === ServiceBridgeStatus.Connected) {
						entity.taskAdd(props.task.taskName, props.task.after);
					}
				} },
				{ type: 'separator' as const },
				{ type: 'normal' as const, icon: <span>📈</span>, label: '查看任务信息', value: '查看任务信息', onClick: () => appStore.showTaskInfo = [props.id, 0] },
				...(props.task.outputFiles?.length && [TaskStatus.finished, TaskStatus.error].includes(props.task.status) ? [
					{ type: 'separator' as const },
					{ type: 'submenu' as const, label: appStore.currentServer.entity.ip === 'localhost' ? '打开输出文件' : '下载输出文件', subMenu: props.task.outputFiles.map((file, index) => ({
						type: 'normal' as const, label: file, value: file, onClick: () => openFile(file, index)
					})) },
				] : []),
			],
			type: 'action',
			triggerRect: { xMin: event.pageX - 110, xMax: event.pageX + 110, yMin: event.pageY, yMax: event.pageY },
		})
	};

	const handlePauseNremove = (event: MouseEvent) => {
		event.stopPropagation();
		const entity = appStore.currentServer.entity;
		let task = props.task;
		if ([TaskStatus.running, TaskStatus.paused_queued].includes(task.status)) {
			entity.taskPause(props.id);
		} else if ([TaskStatus.idle_queued, TaskStatus.paused, TaskStatus.stopping, TaskStatus.finished, TaskStatus.error].includes(task.status)) {
			entity.taskReset(props.id);
		} else if (task.status === TaskStatus.idle || task.status === TaskStatus.initializing) {
			appStore.deleteTasks([props.id]);
		}
	};

	const handleParaAreaMouseEnter = (event: MouseEvent) => {
		const paramAreaPos = paramAreaRef.value.getBoundingClientRect();
		const position = window.innerWidth >= 920 ? { right: `${Math.min(window.innerWidth - event.pageX, window.innerWidth - 400)}px`, top: `${paramAreaPos.top}px` } : { right: '48px', top: `${paramAreaPos.top}px` };
		const firstOutput = props.task.after.outputs[0];
		Tooltip.show({
			content: <span>
				时长：{durationBefore.value} → {durationAfter.value}<br />
				容器：{props.task.before[0]?.demuxer ?? '🈚'} → {firstOutput.mux.format}<br />
				规格：{defaultVideo.value ? smpteBefore.value : '🈚'} → {firstOutput.video.resolution}@{firstOutput.video.framerate}<br />
				视频：{defaultVideo.value ? `${defaultVideo.value.codec}${videoInputBitrate.value}` : '🈚'} → {firstOutput.video.vcodec}{videoRateControl.value}<br />
				音频：{defaultAudio.value ? `${defaultAudio.value.codec}${audioInputBitrate.value}` : '🈚'} → {firstOutput.audio.acodec}{audioRateControl.value}<br />
				{props.task.before.length > 1 || props.task.after.outputs.length > 1 ? '以上信息仅显示默认输入和首个输出，并不代表完整情况' : null}
			</span>,
			style: position,
			class: css.paraAreaTip,
		});
	};

	const handleTaskNameMouseEnter = (event: MouseEvent) => {
		const taskNamePos = taskNameRef.value.getBoundingClientRect();
		const position = { left: `44px`, top: `${taskNamePos.top}px`, maxWidth: `calc(100% - 88px)` };
		Tooltip.show({
			content: props.task.taskName ?? '读取中',
			style: position,
			class: css.taskNameTip,
		});
	};

	// #endregion

	return () => {
		// console.log('render', props.task.taskName);
		if (!props.show) return (<div style={{ height: `${taskHeight.value}px`, marginBottom: '2px' }} data-index={props.index} data-id={props.id} />)
		return (
		<div class={`${css.taskWrapper} ${isFirstRender.value ? css.firstRender : ''}`} style={{ '--height': `${taskHeight.value}px` }} data-color_theme={appStore.frontendSettings.colorTheme} data-index={props.index} data-id={props.id} onClick={(event) => props.onClick(event, props.id, props.index)}>
			<div class={`${css.taskBackground} ${isFirstRender.value ? css.firstRender : ''}`}>
				<div class={css.backgroundWhite} style={taskBackgroundStyle.value} />
				<div class={css.backgroundProgress}>
					<div class={css.progressGreen} style={taskBackgroundProgressStyle.value.green} />
					<div class={css.progressYellow} style={taskBackgroundProgressStyle.value.yellow} />
					<div class={css.progressGray} style={taskBackgroundProgressStyle.value.gray} />
					<div class={css.progressRed} style={taskBackgroundProgressStyle.value.red} />
					<div class={css.progressBlue} style={taskBackgroundProgressStyle.value.blue} />
				</div>
			</div>
			<div
				class={css.task}
				// style={{ height: `${taskHeight.value}px` }}
				// onMouseenter={handleTaskMouseEnter}
				onMouseleave={() => Tooltip.hide()}
				onDblclick={handleTaskDblClicked}
				onContextmenu={handleTaskContextMenu}
			>
				<div class={css.previewIcon} style={{ height: showDashboard.value ? '96px' : '24px'}}>
					{taskStatusIcon.value}
				</div>
				<div
					class={css.taskName}
					style={taskNameStyle.value}
					ref={taskNameRef}
					onMouseenter={handleTaskNameMouseEnter}
					onMouseleave={() => Tooltip.hide()}
				>
					{props.task.taskName ?? '读取中'}
				</div>
				{settings.showParams && (
					<div
						class={`${css.paraArea} ${isFirstRender.value ? css.firstRender : ''}`}
						style={{ maxWidth: windowWidth.value >= 930 ? 'min(calc(100% - 128px), 764px)' : 'calc(0% + 120px)', pointerEvents: props.shouldHandleHover ? 'all' : undefined }}
						ref={paramAreaRef}
						onMouseenter={handleParaAreaMouseEnter}
						onMouseleave={() => Tooltip.hide()}
					>
						{props.task.after.input.files.length === 1 && props.task.after.outputs.length === 1 ? (
							windowWidth.value >= 930 ? (
								<>
									{/* 时间 */}
									<div class={css.divider}><div></div></div>
									<div class={css.durationBefore}>{durationBefore.value}</div>
									{settings.paramsVisibility.duration === 'all' && (
										<>
											<div class={css.durationTo}><IconRightArrow /></div>
											<div class={css.durationAfter}>{durationAfter.value}</div>
										</>
									)}
									{/* 容器 */}
									<div class={css.divider}><div></div></div>
									<div class={css.formatBefore}>{props.task.before[0]?.demuxer}</div>
									{settings.paramsVisibility.format === 'all' && (
										<>
											<div class={css.formatTo}><IconRightArrow /></div>
											<div class={css.formatAfter}>{props.task.after.outputs[0].mux.format}</div>
										</>
									)}
									{/* 分辨率码率 */}
									{settings.paramsVisibility.smpte !== 'none' && (
										<>
											<div class={css.divider}><div></div></div>
											<div class={css.smpteBefore}>{smpteBefore.value}</div>
											{settings.paramsVisibility.smpte === 'all' && (
												<>
													<div class={css.smpteTo}><IconRightArrow /></div>
													<div class={css.smpteAfter}>{props.task.after.outputs[0].video.resolution}@{props.task.after.outputs[0].video.framerate}</div>
												</>
											)}
										</>
									)}
									{/* 视频 */}
									{settings.paramsVisibility.video !== 'none' && (
										<>
											<div class={css.divider}><div></div></div>
											<div class={css.videoBefore}>{defaultVideo.value ? `${defaultVideo.value.codec}${videoInputBitrate.value}` : '-'}</div>
											{settings.paramsVisibility.video === 'all' && (
												<>
													<div class={css.videoTo}><IconRightArrow /></div>
													<div class={css.videoAfter}>{props.task.after.outputs[0].video.vcodec}{videoRateControl.value}</div>
												</>
											)}
										</>
									)}
									{/* 音频 */}
									{settings.paramsVisibility.audio !== 'none' && (
										<>
											<div class={css.divider}><div></div></div>
											<div class={css.audioBefore}>{defaultAudio.value ? `${defaultAudio.value.codec}${audioInputBitrate.value}` : '-'}</div>
											{settings.paramsVisibility.audio === 'all' && (
												<>
													<div class={css.audioTo}><IconRightArrow /></div>
													<div class={css.audioAfter}>{props.task.after.outputs[0].audio.acodec}{audioRateControl.value}</div>
												</>
											)}
										</>
									)}
								</>
							) : (
								<>
									{/* 预设 */}
									<div class={css.divider}><div></div></div>
									<div class={css.videoBefore}>{props.task.after.extra?.presetName === undefined ? '查看配置' : props.task.after.extra.presetName || '自定义配置'}</div>
								</>
							)
						) : (
							<>
								<div class={css.divider}><div></div></div>
								<div class={css.videoBefore}>{`${props.task.after.input.files.length} 个输入，${props.task.after.outputs.length} 个输出`}</div>
							</>
						)}
					</div>
				)}
				<Transition enterActiveClass={css['dashboardTrans-enter-active']} leaveActiveClass={css['dashboardTrans-leave-active']}>
					{showDashboard.value && (
						<div class={css.dashboardArea} style={{ pointerEvents: props.shouldHandleHover ? 'all' : undefined }}>
							{dashboardType.value === 'convert' ? (
								<>
									<div class={css.linearGraphItems} onClick={() => appStore.showTaskInfo = [props.id, 2, 'progress']}>
										<div class={css.linearGraphItem}>
											<span class={css.data}>{ graphTime.value }</span>
											<span class={css.description}>时间</span>
										</div>
										<div class={css.linearGraphItem}>
											<span class={css.data}>{ props.task.dashboard_smooth.frame.toFixed(0) }</span>
											<span class={css.description}>帧</span>
										</div>
									</div>
									<div class={css.roundGraphItem} onClick={() => appStore.showTaskInfo = [props.id, 2, 'bitrate']}>
										<div class={css.ring} style={graphBitrateStyle.value}></div>
										<span class={css.data}>{ graphBitrate.value }</span>
										<span class={css.description}>码率</span>
									</div>
									<div class={css.roundGraphItem} onClick={() => appStore.showTaskInfo = [props.id, 2, 'speed']}>
										<div class={css.ring} style={graphSpeedStyle.value}></div>
										<span class={css.data}>{ graphSpeed.value }</span>
										<span class={css.description}>速度</span>
									</div>
									<div class={css.textItem} onClick={() => appStore.showTaskInfo = [props.id, 2, 'size']}>
										<span class={css.data}>{ graphSize.value }</span>
										<span class={css.description}>输出大小</span>
									</div>
									<div class={css.textItem} onClick={() => appStore.showTaskInfo = [props.id, 2, 'progress']}>
										<span class={css.data}>{ graphLeftTime.value }</span>
										<span class={css.description}>预计剩余时间</span>
									</div>
								</>
							) : (
								<>
									<div class={`${css.textItem} ${css.disabled}`}>
										<span class={css.data}>{graphUploadRead.value}</span>
										<span class={css.description}>读取总量</span>
									</div>
									<div class={`${css.textItem} ${css.disabled}`}>
										<span class={css.data}>{graphUploadHash.value}</span>
										<span class={css.description}>校验总量</span>
									</div>
									<div class={`${css.textItem} ${css.disabled}`}>
										<span class={css.data}>{graphUploadUpload.value}</span>
										<span class={css.description}>上传总量</span>
									</div>
								</>
							)}
							<div
								class={`${css.textItem} ${dashboardType.value === 'transfer' ? css.disabled : ''}`}
								onClick={() => dashboardType.value === 'convert' && (appStore.showTaskInfo = [props.id, 2, 'progress'])}
							>
								<span class={`${css.data} ${css.dataLarge}`}>{ overallProgress.value === 1 ? '🆗' : `${(overallProgress.value * 100).toFixed(1)}%` }</span>
								<span class={css.description}>{ overallProgressDescription.value }</span>
							</div>
						</div>
					)}
				</Transition>
				{settings.showCmd && (
					<div class={css.cmdArea} style={{ top: `${(settings.showParams ? 1 : 0) * 24 + (showDashboard.value ? 1 : 0) * 72 + 2}px` }} onDblclick={handleCmdDblClicked}>
						<div class={css.margin}>
							<div class={css.switch}>
								<button
									class={`${css.item} ${settings.cmdDisplay === 'input' ? css.itemSelected : ''}`}
									onMousedown={() => settings.cmdDisplay = 'input'}
								>
									输入
								</button>
								<button
									class={`${css.item} ${settings.cmdDisplay === 'output' ? css.itemSelected : ''}`}
									onMousedown={() => settings.cmdDisplay = 'output'}
								>
									输出
								</button>
							</div>
							<div class={css.code}>
								<textarea
									aria-label="任务命令行"
									readonly
									value={cmdText.value}
									ref={cmdRef}
								/>
							</div>
						</div>
					</div>
				)}
				<div class={css.vline} style={{ bottom: settings.showCmd ? '66px' : undefined}}><div></div></div>
				<button aria-label='重置或删除任务' class={css.button} style={{ height: showDashboard.value ? '100px' : '28px'}} onClick={handlePauseNremove} onDblclick={(e) => e.stopPropagation()}>
					<div style={{ backgroundPositionX: deleteButtonBackgroundPositionX.value }}></div>
				</button>
			</div>
		</div>)
	};
}, {
	props: ['task', 'id', 'index', 'show', 'selected', 'shouldHandleHover', 'onClick', 'onBatchContextMenu'],
});
