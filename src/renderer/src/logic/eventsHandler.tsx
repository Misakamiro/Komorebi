import nodeBridge from '@renderer/bridges/nodeBridge';
import { FFmpegInfo, FFmpegProgress, Notification, Task, TaskStatus, WorkingStatus } from '@common/types';
import { Server, UITask } from '@renderer/types';
import { getInitialUITask, mergeTaskFromService } from '@common/utils';
import { dashboardTimer, overallProgressTimer } from '@renderer/common/dashboardCalc';
import { useAppStore } from '../stores/appStore';
import { getLimitaion } from './limitaions';
import Popup from '@renderer/components/Popup/Popup';
import Msgbox from '@renderer/components/Msgbox/Msgbox';
import { ButtonType } from '@renderer/components/Button/Button';
import ImageExitConfirm from '@renderer/assets/komorebi-guides/exit-confirm.png';
import i11n from '@common/i11n/i11n';

// #region server events

const OVERALL_PROGRESS_INTERVAL_MS = 250;
const TASK_DASHBOARD_INTERVAL_MS = 200;

function clearTaskDashboardTimer(task?: UITask) {
	if (task?.dashboardTimer) {
		clearInterval(task.dashboardTimer);
		task.dashboardTimer = NaN;
	}
}

export function clearServerRuntimeTimers(serverData: { overallProgressTimerID: any; tasks: Array<UITask | undefined> | Record<string, UITask | undefined> }) {
	if (serverData.overallProgressTimerID) {
		clearInterval(serverData.overallProgressTimerID);
		serverData.overallProgressTimerID = NaN;
	}
	for (const task of Object.values(serverData.tasks)) {
		clearTaskDashboardTimer(task);
	}
}

export function handleFFmpegInfo(server: Server, info: FFmpegInfo) {
	server.data.ffmpegInfo = info;
};
export function handleWorkingStatusUpdate(server: Server, workingStatus: 'start' | 'stop' | 'pause') {
	const serverData = server.data;
	serverData.workingStatus = workingStatus === 'start' ? WorkingStatus.running : WorkingStatus.idle;
	// 处理 overallProgressTimer
	if (serverData.workingStatus === WorkingStatus.running && !serverData.overallProgressTimerID) {
		let timerID = setInterval(overallProgressTimer, OVERALL_PROGRESS_INTERVAL_MS, serverData);
		serverData.overallProgressTimerID = timerID;
		overallProgressTimer(serverData);
	} else if (serverData.workingStatus === WorkingStatus.idle && serverData.overallProgressTimerID) {
		clearInterval(serverData.overallProgressTimerID);
		serverData.overallProgressTimerID = NaN;
		overallProgressTimer(serverData);
		// if (nodeBridge.remote && nodeBridge.remote.getCurrentWindow().isFocused()) {
		if (workingStatus === 'stop') {
			nodeBridge.flashFrame(true);
		}
		// }
	}
};
export function handleTasklistUpdate(server: Server, content: Array<number>) {
	const 这 = useAppStore();
	const serverData = server.data;
	let localI = 0;
	let remoteI = 0;
	let localKeys = Object.keys(serverData.tasks).map(Number).filter((value) => value >= 0);	// [1,3,4,5]
	let remoteKeys = content.filter((value) => value >= 0);										// [1,3,5,6,7]
	let newTaskIds: Array<number> = [];
	let newTaskList: Array<UITask> = [];
	while (localI < localKeys.length || remoteI < remoteKeys.length) {
		let localKey = localKeys[localI];
		let remoteKey = remoteKeys[remoteI];
		if (localI >= localKeys.length) {
			// 本地下标越界，说明远端添加任务了
			let newTask = getInitialUITask('');
			// newTask = mergeTaskFromService(newTask, ffboxService.getTask(remoteKey) as Task);
			// 先用一个 InitialUITask 放在新位置，完成列表合并后再统一 getTask() 获取任务信息
			newTaskIds.push(remoteKey);
			newTaskList[remoteKey] = newTask;
			remoteI++;
		} else if (remoteI >= remoteKeys.length) {
			// 远端下标越界，说明远端删除了最后面的若干个任务
			for (let i = localI; i < localKeys.length; i++) {
				clearTaskDashboardTimer(serverData.tasks[localKeys[i]]);
				这.selectedTask.delete(localKeys[i]);
			}
			break;
		} else if (localKey < remoteKey) {
			// 远端跳号了，说明远端删除了中间的任务
			clearTaskDashboardTimer(serverData.tasks[localKey]);
			这.selectedTask.delete(localKey);
			localI++;
		} else if (localKey === remoteKey) {
			// 从 local 处直接复制
			newTaskList[localKey] = serverData.tasks[localKey];
			localI++;
			remoteI++;
		}
	}
	serverData.tasks = newTaskList;
	// 依次获取所有新增任务的信息
	// 为什么要加延迟？在不加延迟的情况下，会产生这样的错误：
	// 添加远程任务时，服务器会发送 tasklist update 来到此处更新任务（返回一个 idle 的任务），同时上传模块会通过 setUploadStatus 使服务器发送 task update（返回一个 initializing 的任务），也就是产生两次 task update
	// 但神奇的是，这.updateTask 的时候，还没执行 setUploadStatus，所以返回的是 idle，但请求还没来得及返回，setUploadStatus 就先走一步，把 initializing 更新到本地了。也就是说，updateTask 这个操作被插队了，导致把旧状态带了回来 = =
	setTimeout(() => {
		for (const newTaskId of newTaskIds) {
			这.updateTask(server, newTaskId);
		}
	}, 20);
};
/**
 * 更新整个 task
 * 通过广播事件收到的 task 有可能是不完整的，不包含 cmdData，mergeTaskFromService 只会进行 Object.assign，不会清空
 */
export function handleTaskUpdate(server: Server, id: number, content: Task) {
	const serverData = server.data;
	const localTask = serverData.tasks[id];
	if (!localTask) {
		// 本地不存在此任务，则新增
		serverData.tasks[id] = getInitialUITask('');
	}
	const task = mergeTaskFromService(serverData.tasks[id], content);
	serverData.tasks[id] = task;
	// Object.assign(serverData.tasks[id], task);
	// timer 相关处理（开始运行时添加定时器，结束或暂停运行时取消定时器）
	if (task.status === TaskStatus.running && !task.dashboardTimer) {
		task.dashboardTimer = setInterval(dashboardTimer, TASK_DASHBOARD_INTERVAL_MS, task) as any;
		if (task.progressLog.time.length <= 1) {
			task.dashboard_smooth = {
				progress: 0,
				bitrate: 0,
				speed: 0,
				time: 0,
				frame: 0,
				size: 0,
			}
		}
	} else if (task.status !== TaskStatus.running && task.dashboardTimer) {
		clearInterval(task.dashboardTimer);
		task.dashboardTimer = NaN;
	}
	// 进度条相关处理
	if (task.status === TaskStatus.finished || task.status === TaskStatus.error) {
		task.dashboard.progress = 1;
		task.dashboard_smooth.progress = 1;
	} else if (task.status === TaskStatus.idle) {
		task.dashboard.progress = 0;
		task.dashboard_smooth.progress = 0;
	}
	// serverData.tasks = Object.assign({}, serverData.tasks);
};
/**
 * 增量更新 cmdData
 */
export function handleCmdUpdate(server: Server, id: number, content: string, append: boolean) {
	let task = server.data.tasks[id];
	if (append) {
		task.cmdData += content;
	} else {
		task.cmdData = content;
	}
};
/**
 * 增量更新 progressLog
 */
export function handleProgressUpdate(server: Server, id: number, time: number, status: FFmpegProgress | undefined, functionLevel: number) {
	const task = server.data.tasks[id];
	if (status) {
		for (const parameter of ['time', 'frame', 'size']) {
			const _parameter = parameter as 'time' | 'frame' | 'size';
			const previous = task.progressLog[_parameter].at(-1)?.[1] ?? 0;
			const value = status[_parameter];
			task.progressLog[_parameter].push([time, Number.isFinite(value) && value >= 0 ? value : previous]);
		}
	} else {
		task.progressLog = {
			time: [],
			frame: [],
			size: [],
			lastStarted: time,
			elapsed: 0,
			lastPaused: time,
		};
	}
	// server.data.tasks[id].progressLog = progressLog;
	if (functionLevel < 50 && task.progressLog.time.length > 0) {
		if (task.progressLog.time.slice(-1)[0][1] > 671) {
			server.entity.trailLimit_stopTranscoding(id, 'media');
			return;
		}
	}
	const maxWorkingDuration = getLimitaion('maxWorkingDuration');
	if (task.progressLog.time.length > 0) {
		if (task.progressLog.elapsed + new Date().getTime() / 1000 - task.progressLog.lastStarted > maxWorkingDuration) {
			server.entity.trailLimit_stopTranscoding(id, 'working');
			return;
		}
	}
};
/**
 * 增量更新 notifications
 */
export function handleNotificationUpdate(server: Server, notificationId: number, notification?: Notification) {
	const 这 = useAppStore();
	if (notification) {
		server.data.notifications[notificationId] = notification;
		const serverNameString = 这.servers.length > 1 ? `${server.data.name}：` : '';
		Popup({
			message: serverNameString + notification.content,
			level: notification.level,
		});
		这.setUnreadNotifationCount();
	} else {
		delete server.data.notifications[notificationId];
	}
};

// #endregion

// #region ipc events

export function handleCloseConfirm() {
	const 这 = useAppStore();
	const localServer = 这.localServer;
	function readyToClose () {
		nodeBridge.ipcRenderer?.send('exitConfirm');
		setTimeout(() => {
			nodeBridge.ipcRenderer?.send('close');
		}, 0);
	}
	// getQueueTaskCount 拷贝自 FFBoxService
	function getQueueTaskCount(server: Server) {
		let count: number = 0;
		for (const task of Object.values(server.data.tasks)) {
			if (task && [TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finishing].includes(task.status)) {
				count++;
			}
		}
		return count;
	}
	if (!localServer) {
		readyToClose();
	} else {
		let queueTaskCount = getQueueTaskCount(localServer as any);
		if (queueTaskCount > 0) {
			const exitContent = i11n.frontend.dialogs.exitContent(queueTaskCount).split('\n');
			Msgbox({
				container: document.body,
				// container: containerRef.value,
				image: <img src={ImageExitConfirm} alt="" />,
				title: i11n.frontend.dialogs.exitTitle,
				content: <>{exitContent.map((line, index) => <>{index > 0 && <br />}{line}</>)}</>,
				buttons: [
					{ text: i11n.frontend.dialogs.exitConfirm, callback: readyToClose, type: ButtonType.Danger, role: 'confirm' },
					{ text: i11n.frontend.dialogs.exitCancel, role: 'cancel' },
				]
			})
		} else {
			readyToClose();
		}
	}
}

// #endregion
