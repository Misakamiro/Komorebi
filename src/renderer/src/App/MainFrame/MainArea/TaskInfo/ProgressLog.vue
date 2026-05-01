<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { TaskStatus } from '@common/types';
import { getOutputDuration } from '@common/utils';
import { calcDashboard } from '@renderer/common/dashboardCalc';
import RadioList, { Props as RadioListProps } from '@renderer/components/RadioList/RadioList.vue';

type ChartType = 'progress' | 'size' | 'bitrate' | 'speed';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], count: appStore.selectedTask.size }
);
const chartType = computed(() => (appStore.showTaskInfo[2] ?? 'progress') as ChartType);

const canvasRef = ref<HTMLCanvasElement>();

const totalTime_smooth = ref(10);	// 预计转码总耗时
const totalSize_smooth = ref(1000);	// 以字节为单位的预计输出大小
const totalTransferTime_smooth = ref(10);	// 预计传输总耗时
let refreshTimer = 0;
let rendering = 0;	// 0: 空闲　1: 渲染中　2: 渲染中重复调用 render 时变为此值，当前渲染完成后马上进行下一轮渲染　　本设计暂时无用，因为代码逻辑是同步渲染

const outputDuration = computed(() => selectedTasks.value.task ? getOutputDuration(selectedTasks.value.task) : 0);
const finitePositive = (value: number, fallback = 0) => Number.isFinite(value) && value > 0 ? value : fallback;
const safeDivide = (a: number, b: number, fallback = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(b) > 0.000001 ? a / b : fallback;
const isDark = computed(() => appStore.frontendSettings.colorTheme === 'themeDark');
const selectionList = computed(() => {
	const disableNormalChart = !selectedTasks.value.task || selectedTasks.value.task?.progressLog.time.length <= 1;
	// const disableTransferChart = selectedTasks.value.task.transferProgressLog.transferred.length <= 1;
	return [
		{ value: 'progress', caption: '进度', disabled: disableNormalChart },
		{ value: 'size', caption: '数据量', disabled: disableNormalChart },
		{ value: 'bitrate', caption: '码率分布', disabled: disableNormalChart },
		{ value: 'speed', caption: '速度分布', disabled: disableNormalChart },
	] as RadioListProps['list']
});
/** [转码时间, 媒体时间, 尺寸] */
const dedupProgressLogSize = computed(() => {
	const progressLog = selectedTasks.value.task.progressLog;
	if (!progressLog.size.length) {
		return [];
	}
	const ret: [number, number, number][] = [[progressLog.size[0][0], progressLog.time[0][1], progressLog.size[0][1]]];
	let lastSize = progressLog.size[0][1];
	for (let i = 1; i < progressLog.size.length; i++) {
		const nextTime = progressLog.time[i]?.[1];
		const nextSize = progressLog.size[i]?.[1];
		if (!Number.isFinite(nextTime) || !Number.isFinite(nextSize)) {
			continue;
		}
		if (nextSize !== lastSize) {
			lastSize = progressLog.size[i][1];
			ret.push([progressLog.size[i][0], nextTime, lastSize]);
		}
	}
	return ret;
});
/**
 * y 为 dedupProgressLogSize[][2] 两点之间的 diff，x 为 dedupProgressLogSize[][1] 两点的中间值
 * 单位为 kb/s
 */
const bitrateGraphData = computed(() => {
	const data: [number, number][] = [];
	const logSize = dedupProgressLogSize.value;
	let maxYDiff = 0;
	for (let i = 1; i < logSize.length; i++) {
		const xDiff = logSize[i][1] - logSize[i - 1][1];	// 两记录点之间的媒体时间差
		const yDiff = safeDivide(logSize[i][2] - logSize[i - 1][2], xDiff, 0);
		if (!Number.isFinite(yDiff) || yDiff < 0) {
			continue;
		}
		maxYDiff = yDiff > maxYDiff ? yDiff : maxYDiff;
		const xMid = (logSize[i][1] + logSize[i - 1][1]) / 2;
		data.push([xMid, yDiff * 8]);
	}
	return { data, maxY: maxYDiff * 8 };
});
/** y 为 / progressLog.time[][0] 两点之间的 diff（转码这么多花费了多少实际时间，倒数就是速度），x 为 progressLog.time[][1] 两点的中间值 */
const speedGraphData = computed(() => {
	const data: [number, number][] = [];
	const logTime = selectedTasks.value.task.progressLog.time;
	let maxYDiff = 0;
	for (let i = 1; i < logTime.length; i++) {
		const xDiff = logTime[i][1] - logTime[i - 1][1];	// 两记录点之间的媒体时间差
		const yDiff = safeDivide(xDiff, logTime[i][0] - logTime[i - 1][0], 0);
		if (!Number.isFinite(yDiff) || yDiff < 0) {
			continue;
		}
		maxYDiff = yDiff > maxYDiff ? yDiff : maxYDiff;
		const xMid = (logTime[i][1] + logTime[i - 1][1]) / 2;
		data.push([xMid, yDiff]);
	}
	return { data, maxY: maxYDiff };
});

// #region 字符串 filter

const graphSizeFilter = (kB: number) => {
	if (!Number.isFinite(kB) || kB < 0) {
		return '-';
	}
	const B = kB * 1000;
	if (window.frontendSettings.useIEC) {
		if (B >= 10 * 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(1) + ' GiB';
		} else if (B >= 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(2) + ' GiB';
		} else if (B >= 100 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(0) + ' MiB';
		} else if (B >= 10 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(1) + ' MiB';
		} else {
			return (B / 1024 ** 2).toFixed(2) + ' MiB';
		}
	} else {
		if (B >= 10 * 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(1) + ' GB';
		} else if (B >= 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(2) + ' GB';
		} else if (B >= 100 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(0) + ' MB';
		} else if (B >= 10 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(1) + ' MB';
		} else {
			return (B / 1000 ** 2).toFixed(2) + ' MB';
		}
	}
};
const beforeBitrateFilter = (kbps: number) => {
	if (!Number.isFinite(kbps) || kbps < 0) {
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
const transferrateFilter = (Bps: number) => {
	if (!Number.isFinite(Bps) || Bps < 0) {
		return '-';
	}
	if (window.frontendSettings.useIEC) {
		if (Bps >= 10 * 1024 ** 2) {
			return (Bps / 1024 ** 2).toFixed(1) + ' MiBps';
		} else {
			return (Bps / 1024).toFixed(0) + ' kiBps';
		}
	} else {
		if (Bps >= 10 * 1000 ** 2) {
			return (Bps / 1000 ** 2).toFixed(1) + ' MBps';
		} else {
			return (Bps / 1000).toFixed(0) + ' kBps';
		}
	}
}
const timeFilter = (value: number, withDecimal = true) => {
	if (!Number.isFinite(value) || value < 0) {
		return '-';
	}
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

// #endregion

const getLastSpeedBitrate = () => {
	const { progressLog, before, after } = selectedTasks.value.task;
	const { K: frameK, B: frameB, currentValue: currentFrame } = calcDashboard(progressLog.frame.slice(-5), 0);
	const { K: timeK, B: timeB, currentValue: currentTime } = calcDashboard(progressLog.time.slice(-5), 0);
	const { K: sizeK, B: sizeB, currentValue: currentSize } = calcDashboard(dedupProgressLogSize.value.slice(-5).map((value) => [value[1], value[2]]), 0);
	// const afterFramerate = after.outputs[0]?.video.framerate === '不改变' ? before.vframerate : +after.outputs[0]?.video.framerate;
	return {
		// speed: frameK / afterFramerate || timeK,	// 媒体时间相对真实时间。如果可以读出帧速，或者输出的是视频，用帧速算 speed 更准确；否则用时间算 speed
		speed: finitePositive(timeK, 0),
		bitrate: finitePositive(sizeK * 8, 0),	// 尺寸变化相对媒体时间
	}
};
/** 最大时间/尺寸的计算方法是：现在已经累积的转码时长/输出尺寸 + 根据最新速度和剩余任务时长算出的预计增量 */
const getEstimatedMaxTimeSize = () => {
	const lastSpeedBitrate = getLastSpeedBitrate();
	const { progressLog, status } = selectedTasks.value.task;
	const elapsedTime = progressLog.elapsed + (status === TaskStatus.running ? new Date().getTime() / 1000 - progressLog.lastStarted : 0);
	// 任务最新进度的时间和大小
	const currentTime = progressLog.time.length > 0 ? progressLog.time[progressLog.time.length - 1][1] : 0;
	const currentSize = progressLog.size.length > 0 ? progressLog.size[progressLog.size.length - 1][1] : 0;
	const durationLeft = Math.max(0, finitePositive(outputDuration.value, currentTime) - currentTime);
	const estimatedTime = lastSpeedBitrate.speed > 0 ? elapsedTime + durationLeft / lastSpeedBitrate.speed : elapsedTime;
	const estimatedSize = currentSize + durationLeft * lastSpeedBitrate.bitrate * 0.125;	// size 的单位是 kB，bitrate 的单位是 kbps
	return {
		time: finitePositive(estimatedTime, Math.max(elapsedTime, 10)),
		size: finitePositive(estimatedSize, Math.max(currentSize, 1000)),
	};
};

// 获取刻度线间隔
const getScaleUnit = (total: number, viewWidth: number, isClockUnit = false, threshold = 100, min = 1) => {
	if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(viewWidth) || viewWidth <= 0) {
		return min;
	}
	let currentScale = min;
	let step = 0;
	while (Number.isFinite(currentScale) && viewWidth / (total / currentScale) < threshold) {	// 如果按当前 scale 分割后产出的刻度线间隔不足阈值，那么降低密度
		if (isClockUnit) {
			currentScale *= [2, 2.5, 2, 1.5, 2, 2][step % 6];	// 1 2 5 10 15 30 60
		} else {
			currentScale *= [2, 2.5, 2][step % 3];	// 1 2 5 10
		}
		step++;
		if (step > 128) {
			break;
		}
	}
	return Number.isFinite(currentScale) && currentScale > 0 ? currentScale : min;
};

const render = () => {
	const canvasWidth = canvasRef.value.width / window.devicePixelRatio;
	const canvasHeight = canvasRef.value.height / window.devicePixelRatio;
	const context = canvasRef.value.getContext('2d');

	const task = selectedTasks.value.task;
	if (!task) {
		context.clearRect(0, 0, canvasWidth, canvasHeight);
		return;
	}
	if (rendering === 1) {
		rendering = 2;
	}
	if (rendering) {
		return;
	}
	rendering = 1;

	// 更新横纵轴端点
	if (task.progressLog.frame.length >= 5 && task.progressLog.size.length >= 2) {
		const latestMaxTimeSize = getEstimatedMaxTimeSize();
		totalTime_smooth.value = finitePositive(totalTime_smooth.value * 0.92 + latestMaxTimeSize.time * 0.08, 10);
		totalSize_smooth.value = finitePositive(totalSize_smooth.value * 0.92 + latestMaxTimeSize.size * 0.08, 1000);
	}
	
	// 绘画准备
	const horizontalMax = finitePositive([totalTime_smooth.value, outputDuration.value, outputDuration.value, outputDuration.value][
		['progress', 'size', 'bitrate', 'speed'].indexOf(chartType.value)
	], 1);
	const horizontalUnit = getScaleUnit(horizontalMax, canvasWidth, true, 70);
	const verticalMax = finitePositive([100, totalSize_smooth.value, bitrateGraphData.value.maxY, speedGraphData.value.maxY][
		['progress', 'size', 'bitrate', 'speed'].indexOf(chartType.value)
	], 1);
	const verticalUnit = getScaleUnit(verticalMax, canvasHeight, false, 40, chartType.value === 'speed' ? 0.1 : 1);

	context.clearRect(0, 0, canvasWidth, canvasHeight);

	// 横坐标和刻度线
	context.strokeStyle = '#77777777'; // 线颜色
	context.lineWidth = 1;
	context.textAlign = 'center';
	context.textBaseline = 'top';
	context.fillStyle = isDark.value ? '#eee' : '#333'; // 字体颜色
	context.font = '14px 华文中宋 black';
	for (let value = 0; value < horizontalMax; value += horizontalUnit) {
		const x = (value / horizontalMax) * (canvasWidth - 100) + 100;
		context.beginPath();
		context.moveTo(x, 0);
		context.lineTo(x, canvasHeight - 30);
		context.stroke();
		context.fillText(timeFilter(value, false), x, canvasHeight - 30 + 8);
	}

	// 纵坐标
	context.textAlign = 'right';
	context.textBaseline = 'middle';
	context.fillStyle = isDark.value ? '#eee' : '#333'; // 字体颜色
	context.font = '14px 华文中宋 black';
	for (let value = 0; value < verticalMax; value += verticalUnit) {
		const y = (1 - value / verticalMax) * (canvasHeight - 30);
		const displayText = [value + '%', graphSizeFilter(value), beforeBitrateFilter(value), value.toFixed(1) + '×', value + '%', transferrateFilter(value)][
			['progress', 'size', 'bitrate', 'speed', 'transferProgress', 'transferSpeed'].indexOf(chartType.value)
		];
		context.fillText(displayText, 100 - 8, y);
	}

	// 点
	context.lineWidth = 1.5;
	if (chartType.value === 'progress') {
		context.fillStyle = '#4499EE33';
		context.strokeStyle = '#4499EE';
		context.beginPath();
		for (let i = 0; i < task.progressLog.time.length; i++) {
			const elem = task.progressLog.time[i];
			const x = (elem[0] / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - safeDivide(elem[1], outputDuration.value, 0)) * (canvasHeight - 30);
			context.lineTo(x, y);
		}
		context.stroke();
		const lastX = task.progressLog.time[task.progressLog.time.length - 1][0] / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(100, canvasHeight - 30);
		context.fill();
	} else if (chartType.value === 'size') {
		context.fillStyle = '#9955EE33';
		context.strokeStyle = '#9955EE';
		context.beginPath();
		const logSize = dedupProgressLogSize.value;
		for (let i = 0; i < logSize.length; i++) {
			const elem = logSize[i];
			const x = (elem[1] / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - elem[2] / verticalMax) * (canvasHeight - 30);
			context.lineTo(x, y);
		}
		context.stroke();
		const lastX = logSize[logSize.length - 1][1] / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(100, canvasHeight - 30);
		context.fill();
	} else if (chartType.value === 'bitrate') {
		if (!bitrateGraphData.value.data.length) {
			rendering = 0;
			return;
		}
		context.fillStyle = '#66BB3333';
		context.strokeStyle = '#66BB33';
		context.beginPath();
		const data = bitrateGraphData.value.data;
		for (let i = 0; i < data.length; i++) {
			const elem = data[i];
			const x = (elem[0] / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - elem[1] / verticalMax) * (canvasHeight - 30);
			context.lineTo(x, y);
		}
		context.stroke();
		const lastX = data[data.length - 1][0] / horizontalMax * (canvasWidth - 100) + 100;
		const firstX = data[0][0] / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(firstX, canvasHeight - 30);
		context.fill();
	} else if (chartType.value === 'speed') {
		if (!speedGraphData.value.data.length) {
			rendering = 0;
			return;
		}
		context.fillStyle = '#DD884433';
		context.strokeStyle = '#DD8844';
		context.beginPath();
		const data = speedGraphData.value.data;
		for (let i = 0; i < data.length; i++) {
			const elem = data[i];
			const x = (elem[0] / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - elem[1] / verticalMax) * (canvasHeight - 30);
			if (i === 0) {
				context.moveTo(x, y);
			} else {
				context.lineTo(x, y);
			}
			context.lineTo(x, y);
		}
		context.stroke();
		const lastX = data[data.length - 1][0] / horizontalMax * (canvasWidth - 100) + 100;
		const firstX = data[0][0] / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(firstX, canvasHeight - 30);
		context.fill();
	}
	if (rendering === 2) {
		rendering = 0;
		render();
	}
	rendering = 0;
};

let resizeObserver: ResizeObserver | null = null;
const updateSize = () => {
	if (!canvasRef.value) return;
	const bounding = canvasRef.value.parentElement.getBoundingClientRect();
	canvasRef.value.width = bounding.width * window.devicePixelRatio;
	canvasRef.value.height = bounding.height * window.devicePixelRatio;
	canvasRef.value.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
	render();
};

onMounted(async () => {
	// 如果打开弹窗时已经有足够数据，那么马上算一下预计转码耗时，否则保持 10s、1000B 的初始大小
	if (selectedTasks.value.task?.progressLog.frame.length >= 5 && selectedTasks.value.task?.progressLog.size.length >= 2) {
		const latestMaxTimeSize = getEstimatedMaxTimeSize();
		totalTime_smooth.value = latestMaxTimeSize.time;
		totalSize_smooth.value = latestMaxTimeSize.size;
	}

	// 窗口大小变化监听
	await nextTick();
	updateSize();
	if (canvasRef.value) {
		resizeObserver = new ResizeObserver(() => updateSize());
		resizeObserver.observe(canvasRef.value.parentElement);
	}
	// resizeListener.value = () => {
	// 	const bounding = canvasRef.value.parentElement.getBoundingClientRect();
	// 	canvasRef.value.width = bounding.width * window.devicePixelRatio;
	// 	canvasRef.value.height = bounding.height * window.devicePixelRatio;
	// 	canvasRef.value.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
	// };
	// window.addEventListener('resize', resizeListener.value);
	// resizeListener.value(null);

	// 刷新
	refreshTimer = setInterval(render, 50) as any;
});

onBeforeUnmount(() => {
	clearInterval(refreshTimer);
	// window.removeEventListener('resize', resizeListener.value);
	if (resizeObserver && canvasRef.value) {
		resizeObserver.unobserve(canvasRef.value.parentElement);
	}
})

</script>

<template>
	<div class="ffmpegLog">
		<div class="title">{{ selectedTasks.count === 0 ? '您未选择任务' : selectedTasks.task.taskName }}</div>
		<div class="container">
			<div class="canvasContainer">
				<canvas ref="canvasRef" />
			</div>
			<RadioList class="radioList" :list="selectionList" :value="chartType" @change="(value: any) => appStore.showTaskInfo[2] = value" />
		</div>
	</div>
</template>

<style lang="less" scoped>
	.ffmpegLog {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		.title {
			font-size: 14px;
			padding: 4px;
		}
		.container {
			position: relative;
			width: 100%;
			height: 100%;
			box-sizing: border-box;
			display: flex;
			flex-direction: column;
			// outline: red 1px solid;
			.canvasContainer {
				position: absolute;
				top: 0;
				left: 12px;
				right: 12px;
				bottom: 44px;
				canvas {
					width: 100%;
					height: 100%;
				}
			}
			.radioList {
				position: absolute;
				bottom: 12px;
				height: 32px;
				min-height: unset;
				width: 100%;
				flex-direction: row;
			}
		}
	}
</style>
