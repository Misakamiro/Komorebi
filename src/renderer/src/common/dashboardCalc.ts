import { SingleProgressLog, TaskStatus } from '@common/types';
import { getOutputDuration, parseTimeString } from '@common/utils';
import { ServerData, UITask } from '@renderer/types';

/**
 * 计算整体进度的 timer，根据计算结果修改 currentServer.progress
 * （progressBar 的修改由 titlebar.vue 负责）
 */
export function overallProgressTimer(currentServer: ServerData) {
	let tasks = currentServer.tasks;
	let totalTime = 0.000001;
	let totalProcessedTime = 0;
	for (const task of Object.values(tasks)) {
		// 排除未在队列的
		if (!task.before[0]?.duration || [TaskStatus.idle].includes(task.status)) {
			continue;
		}
		totalTime += task.before[0].duration;
		totalProcessedTime += task.dashboard_smooth.progress * task.before[0].duration;
	}
	let progress = totalProcessedTime / totalTime;
	currentServer.progress = progress;
}

/**
 * 用于 dashboardTimer
 * 通过线性加权移动平均获取数值变化的速率（k 值）
 */
function getKbyLWMA_obj(sampleCount: number, xFactorName: string, yFactorsName: Array<string>, data: Array<any>): Array<number> {
	let deltaXFactorSum = 0;
	let deltaYFactorsSum = Array(yFactorsName.length).fill(0);
	// 对于数据，在区间 [data.length - sampleCount, data.length - 1] 内，其权重在 [1, sampleCount] 之间递增
	// 因为采样数可能大于总样本数，所以倒序遍历，先计算最大的权重（index 最大），直到无法继续计算
	for (let weight = sampleCount, index = data.length - 1; index > 0 && weight > 0; weight--, index--) {
		deltaXFactorSum += weight * (data[index][xFactorName] - data[index - 1][xFactorName]);
		yFactorsName.forEach((factorName, i) => {
			deltaYFactorsSum[i] += weight * (data[index][factorName] - data[index - 1][factorName]);
		});
	}
	// 分子分母都有 totalWeight，所以消了，因此算式里就没有 totalWeight 出现
	return yFactorsName.map((factorName, i) => {
		return deltaYFactorsSum[i] / deltaXFactorSum;
	})
}

/**
 * 用于 dashboardTimer
 * 通过线性加权移动平均获取数值变化的速率（k 值）
 * 如果采样数量少于 sampleCount，低权重的缺失值相当于填充 0
 */
function getKbyLWMA(sampleCount: number, data: SingleProgressLog): number {
	if (data.length < 2) {
		return 0;
	}
	// xFactor：时间　yFactor：参数值
	let deltaXFactorSum = 0;
	let deltaYFactorSum = 0;
	// 对于数据，在区间 [data.length - sampleCount, data.length - 1] 内，其权重在 [1, sampleCount] 之间递增
	// 因为采样数可能大于总样本数，所以倒序遍历，先计算最大的权重（index 最大），直到无法继续计算
	for (let weight = sampleCount, index = data.length - 1; index > 0 && weight > 0; weight--, index--) {
		deltaXFactorSum += weight * (data[index][0] - data[index - 1][0]);
		deltaYFactorSum += weight * (data[index][1] - data[index - 1][1]);
	}
	// 分子分母都有 totalWeight，所以消了，因此算式里就没有 totalWeight 出现
	if (!Number.isFinite(deltaXFactorSum) || Math.abs(deltaXFactorSum) < 0.000001) {
		return 0;
	}
	const value = deltaYFactorSum / deltaXFactorSum;
	return Number.isFinite(value) ? value : 0;
}

/**
 * 对单个数据计算数据变化速率（k）和初值（b），获得该数据在指定时间的预估值（current）
 * 将对整个数组进行采样。因此如果要限定采样长度，先对数组进行裁剪处理
 * 如果不需要取 currentValue，那么 elapsedTime 可以传任意值
 */
export function calcDashboard(progressLog: SingleProgressLog, elapsedTime: number) {
	if (progressLog.length < 2) {
		const fallback = progressLog[0]?.[1] ?? 0;
		return { K: 0, B: fallback, currentValue: fallback };
	}
	const K = getKbyLWMA(progressLog.length, progressLog);
	const B = progressLog[progressLog.length - 1][1] - K * progressLog[progressLog.length - 1][0];	// b = y - k * x
	// const systime = new Date().getTime() / 1000;
	const currentValue = elapsedTime * K + B;
	return {
		K: Number.isFinite(K) ? K : 0,
		B: Number.isFinite(B) ? B : 0,
		currentValue: Number.isFinite(currentValue) ? currentValue : 0,
	};
}

/**
 * 计算单个任务的 timer 函数，根据计算结果原地修改 progress 和 progress_smooth
 */
export function dashboardTimer(task: UITask) {
	const progressLog = task.progressLog;
	if (progressLog.time.length <= 2) {
		// 任务刚开始时显示的数据不准确
		return;
	}

	const elapsedTime = new Date().getTime() / 1000 - progressLog.lastStarted + progressLog.elapsed;
	const { K: frameK, B: frameB, currentValue: currentFrame } = calcDashboard(progressLog.frame.slice(-5), elapsedTime);
	const { K: timeK, B: timeB, currentValue: currentTime } = calcDashboard(progressLog.time.slice(-5), elapsedTime);
	const { K: sizeK, B: sizeB, currentValue: currentSize } = calcDashboard(progressLog.size.slice(-5), elapsedTime);
	// console.log("frameK: " + frameK + ", timeK: " + timeK + ", sizeK: " + sizeK);
	// console.log("currentFrame: " + currentFrame + ", currentTime: " + currentTime + ", currentSize: " + currentSize);

	// 任务进度计算
	let progress: number;
	if (task.before[0].duration !== -1) {
		progress = currentTime / getOutputDuration(task);
		progress = !Number.isFinite(progress) || progress < 0 ? 0 : Math.min(progress, 1);
	} else {
		progress = 0;
	}
	const currentBitrate = timeK > 0 ? (sizeK / timeK) * 8 : 0;

	// 进度细节计算
	// const afterFramerate = task.after.outputs[0]?.video.framerate === '不改变' ? task.before[0].vframerate : +task.after.outputs[0]?.video.framerate;
	if (progress < 0.995) {
		task.dashboard = {
			...task.dashboard,
			progress,
			bitrate: Number.isFinite(currentBitrate) && currentBitrate > 0 ? currentBitrate : 0,
			// speed: frameK / afterFramerate || timeK,	// 如果可以读出帧速，或者输出的是视频，用帧速算 speed 更准确；否则用时间算 speed
			speed: Number.isFinite(timeK) && timeK > 0 ? timeK : 0,
			time: Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0,
			frame: Number.isFinite(currentFrame) && currentFrame > 0 ? currentFrame : 0,
			size: Number.isFinite(currentSize) && currentSize > 0 ? currentSize : 0,
		};

		// 平滑处理
		let { bitrate, speed, time, frame, size } = task.dashboard_smooth;
		progress = progress * 0.7 + task.dashboard.progress * 0.3;
		bitrate  = bitrate * 0.9 + task.dashboard.bitrate * 0.1;
		speed    = speed * 0.6 + task.dashboard.speed * 0.4;
		time     = time * 0.7 + task.dashboard.time * 0.3;
		frame    = frame * 0.7 + task.dashboard.frame * 0.3;
		size    = size * 0.9 + task.dashboard.size * 0.1;
		if (!Number.isFinite(progress) || progress < 0) { progress = 0 }
		if (!Number.isFinite(bitrate) || bitrate < 0) { bitrate = 0 }
		if (!Number.isFinite(speed) || speed < 0) { speed = 0 }
		if (!Number.isFinite(time) || time < 0) { time = 0 }
		if (!Number.isFinite(frame) || frame < 0) { frame = 0 }
		if (!Number.isFinite(size) || size < 0) { size = 0 }
		task.dashboard_smooth = { ...task.dashboard_smooth, progress, bitrate, speed, time, frame, size };
	} else {
		// 进度满了就别更新了
		task.dashboard.progress = 1;
	}
	// task.progress_smooth = Object.assign({}, task.progress_smooth); 
}
