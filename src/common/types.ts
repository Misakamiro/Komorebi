import type { FFmpeg } from '@backend/FFmpegInvoke';

// #region 软件功能及版本等信息

export enum NotificationLevel {
	info = 0,
	ok = 1,
	warning = 2,
	error = 3,
}

export interface Notification {
	time: number;
	taskId?: number;
	content: string;
	level: NotificationLevel;
}

export interface FFBoxVersion {
	version: string;
	buildNumber: number;
}

export interface FFmpegInfo {
	version: string;
	scanning: boolean;
	videoEncodersCount: number;
	audioEncodersCount: number;
	muxersCount: number;
	demuxersCount: number;
	filtersCount: number;
}

// #endregion

// #region FFBoxService

export interface FFBoxServiceInterface {
	initSettings(): Promise<void>;
	initFFmpeg(): void;
	taskAdd(taskName: string, outputParams?: OutputParams): Promise<number>;
	taskAddNcm(params: NcmTaskParams): Promise<number>;
	setNcmParameters(ids: number[], params: NcmTaskParams): Promise<void>;
	mergeUploaded(id: number, hashs: string[], fileBaseName: string, inputName: string, fileTime?: { accessTime: number, createTime: number, modifyTime: number }): Promise<void>;
	setUploadStatus(id: number, isUploading: boolean): Promise<void>;
	taskDelete(id: number): Promise<void>;
	taskStart(id: number): Promise<void>;
	taskReady(id: number): Promise<void>;
	taskPause(id: number): Promise<void>;
	taskResume(id: number): Promise<void>;
	taskReset(id: number): Promise<void>;
	queueStart(): Promise<void>;
	queuePause(): Promise<void>;
	deleteNotification(notificationId: number): Promise<void>;
	setParameters(ids: number[], params: OutputParams[]): Promise<void>;
	trailLimit_stopTranscoding(id: number, reason: 'media' | 'working', byFrontend?: boolean): Promise<void>;
	getMediaFrameInfo(id: number, fileIndex: number, videoStreamIndex: number): Promise<void>;
	refreshTaskMetadata(id: number): Promise<InputInfo[]>;
}

export interface FFBoxServiceEventParam {
	ffmpegInfo: FFmpegInfo;
	workingStatusUpdate: { value: 'start' | 'stop' | 'pause' };	// 此处不使用 WorkingStatus 的原因是：任务列表与任务状态是通过两个消息传送的，到达顺序不可保证，因此需要由后端告知工作状态停止是暂停还是停止，否则前端无法判断
	tasklistUpdate: { content: number[] };
	taskUpdate: { taskId: number; task: Task };
	cmdUpdate: { taskId: number; content: string; append: boolean };	// 由 append 确定是增量还是全量更新
	progressUpdate: { taskId: number; time: number; status?: FFmpegProgress };	// 增量更新（status 未定义则为清空）
	notificationUpdate: { notificationId: number; notification?: Notification };	// 增量（notification 未定义则为删除）
}

export type FFBoxServiceEvent = {
	[K in keyof FFBoxServiceEventParam]: (arg: FFBoxServiceEventParam[K]) => void;
};

// FFBoxService emit 到前端
export type FFBoxServiceEventApi = {
	event: keyof FFBoxServiceEventParam;
	payload: FFBoxServiceEventParam[keyof FFBoxServiceEventParam];
} | {
	event: 'connected';
	payload: { timestamp: number };
};

export interface NormalApiWrapper<T> {
	status: number;
	message: string;
	data: T;
}

export type TaskKind = 'ffmpeg' | 'ncm';

export interface NcmTaskParams {
	inputs: string[];
	outputDir?: string;
	outputNameTemplate?: string;
	recursive: boolean;
	deleteSource: boolean;
	targetFormat?: 'auto' | 'mp3' | 'flac' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'opus' | 'wma' | 'ac3' | 'mp2';
	qualityMode?: 'copy' | 'standard' | 'small';
}

// #endregion

// #region 编码器及滤镜

export interface EncoderDetail {
	generalCapabilities?: string[];		// 视频 + 音频
	threadingCapabilities?: string;		// 视频 + 音频
	supportedPixelFormats?: string[];	// 视频
	supportedSampleRates?: number[];	// 音频
	supportedSampleFormats?: string[];	// 音频
	supportedChannelLayouts?: string[];	// 音频
	commonExtensions?: string[];	// 一个 muxer 可能对应多个扩展名。此时格式中的 value 应表达为 拓展 (muxer)
	mineType?: string;	// 混流
	defaultVideoCodec?: string;	// 混流
	defaultAudioCodec?: string;	// 混流
	options: {
		name: string;
		type: 'int' | 'int64' | 'float' | 'double' | 'boolean' | 'string' | 'dictionary' | 'flags' | 'color' | 'duration' | 'image_size' | 'rational' | 'sample_fmt[]' | 'int[]' | 'channel_layout[]';
		description: string;
		options?: { name?: string, value: string | number, description?: string }[];
		min?: number;
		max?: number;
		default?: string | number | boolean;
	}[];
}

// 由 service 向前端报告的编码器详情（将会在前端转换为 MenuItem）
export interface FFmpegCodecDetail {
	name: string;
	description: string;
	encoders: (EncoderDetail & { name: string; })[];
}

// 由 service 向前端报告的复用器详情（将会在前端转换为 MenuItem）
export interface FFmpegDemuxerDetail {
	name: string;
	description: string;
	extensions: string[];
	isDevice: boolean;
	options: EncoderDetail['options'];
};
export interface FFmpegMuxerDetail {
	name: string;
	description: string;
	extensions: string[];
	defaultVideoCodec?: string;
	defaultAudioCodec?: string;
	options: EncoderDetail['options'];
};

// 由 service 向前端报告的滤镜详情（将会在前端转换为 MenuItem）
export interface FFmpegFilterDetail {
	name: string;
	description: string;
	inputType: string;
	outputType: string;
	options: EncoderDetail['options'];
}

// #endregion

// #region 输入参数

export interface Frame {
	n: number;			// 帧号
	pts: number;		// 时间戳
	pts_time: number;	// 换算为秒的时间戳
	// pos?: number;	// 字节偏移（使用 -map 的时候它会不存在）
	// fmt?: string;	// 像素格式
	// sar?: string;
	// s?: string;		// 分辨率，由于统计前经过了滤镜，所以这里不要
	// i?: string;
	// iskey?: boolean;
	type: 'I' | 'P' | 'B';	// 帧类型
	// checksum?: string;
	// plane_checksum?: string;
	mean: number[];        // YUV 平均值（可能是 2 或 3 个数字）
	stdev: number[];       // YUV 标准差（可能是 2 或 3 个数字）
}

export interface StreamInfo {
	infoText?: string;	// 原文
	type: string;	// video, audio, subtitle, data, attachment
	metadata: { [key: string]: string };
	sidedata: string[];
	isDefault?: boolean;
	language?: string;
	codec?: string;
	pixelFormat?: string;
	resolution?: string;
	bitrate?: number;
	fps?: number;
	sampleRate?: number;
	channel?: string;
	frames?: Frame[];	// 帧信息数组（仅 video 类型使用）
}
export interface ChapterInfo {
	infoText?: string;	// 原文
	start: number;
	end: number;
	metadata: { [key: string]: string };
}
export interface InputInfo {
	demuxer: string;
	path: string;
	duration?: number;
	bitrate?: number;
	size?: number;
	start?: number;
	metadata: { [key: string]: string };
	streams: StreamInfo[];
	chapters: ChapterInfo[];
	accessTime?: number,
	createTime?: number,
	modifyTime?: number,
}

// #endregion

// #region 输出参数

export interface InputFile {
	// type: 'url';	// 将来支持 lavfi
	hwaccel?: string;
	filePath?: string;		// 本地模式下直接是文件全路径，网络模式下 merge 之后获得的文件名填充到此处
	demuxer?: string;
	begin?: string;
	end?: string;
	realtime?: boolean;
	detail?: Record<string, any>;
	custom?: string;
}

export interface FilterNode {
	id: number;
	name: string;	// 如果是滤镜节点，这里是滤镜本体名字；如果是输入节点，这里是 in_\d；如果是输出节点，这里是 out_\d
	params: Record<string, any>;
	x: number;
	y: number;
	// type: 'input' | 'output' | 'v' | 'a' | 's' | 'd' | 't';	// s: subtitle, d: data, t: attachment	// 目前来看似乎可以用 name 代替此功能
	// inputPortNames: string[];	// 记录目的地的端口名。大多数节点仅支持单种类型，比如 v、a，此种情况为 ['0', '1', ...]；但输入节点可以由用户填写“流类型:流编号”
	// outputPortNames: string[];	// 记录目的地的端口名。大多数节点仅支持单种类型，比如 v、a，此种情况为 ['1', '2', ...]；但输出节点可以由用户填写“流类型:流编号”
	// inputPortConnections?: FilterNode[];	// 仅内部使用，表示它到上一个节点的引用。此项与 inputPortNames 按下标一一对应
	// outputPortConnections?: FilterNode[];	// 仅内部使用，表示它到下一个节点的引用。此项与 outputPortNames 按下标一一对应
	prevs?: FilterLine[];	// 仅内部使用，表示入口连接线的引用
	nexts?: FilterLine[];	// 仅内部使用，表示出口连接线的引用
	detail?: FFmpegFilterDetail;	// 仅内部使用，连接到 FFmpegFilterDetail 的引用
}

export interface FilterLine {
	name: string;	// 相当于 ffmpeg 中括号内的内容。如果从输入节点出来，是 输入编号:流类型:流编号；如果从滤镜节点出来，这里是给 ffmpeg 用的一个随机或用户定义名字
	prevNodeId: number;
	prevNodePortIndex: number;
	nextNodeId: number;
	nextNodePortIndex: number;
	// 对于普通滤镜的输出结果，name 是唯一的；只有对于输入节点的输出结果可以用 输入编号:流类型:流编号 反复使用。而对于媒体输入的输出节点，或者媒体输出的输出节点，并不需要关心 index，因为次序是没影响的
	prevXY?: [number, number];	// 仅用于前端展示
	nextXY?: [number, number];	// 仅用于前端展示
	type?: 'V' | 'A' | 'N' | 'U';	// 仅用于前端展示
	invisiblePort?: 'prev' | 'next';	// 仅用于前端展示，用于创建中的线段
}

export interface OutputParams {
	input: OutputParams_input;
	filter: OutputParams_filter;
	outputs: {
		video: OutputParams_video;
		audio: OutputParams_audio;
		mux: OutputParams_mux;
	}[];
	extra: OutputParams_extra;
}

export type OutputParams_input = {
	// mode: 'standalone';
	// } & {
	files: InputFile[];
};

export type OutputParams_filter = {
	nodes: FilterNode[];
	lines: FilterLine[];
};

export type OutputParams_video = {
	vcodec: string;
	resolution?: string;
	framerate?: string;
	ratecontrol?: string;
	ratevalue?: number | string;
	detail: Record<string, any>;
	custom?: string;
}

export type OutputParams_audio = {
	acodec: string;
	ratecontrol?: string;
	ratevalue?: number | string;
	vol?: number;
	detail: Record<string, any>;
	custom?: string;
};

export type OutputParams_mux = {
	format: string;
	moveflags: boolean;
	filePath: string;
	begin?: string;
	end?: string;
	detail: Record<string, any>;
	keepMetadata?: false | 'map' | 'movflags' | 'both';
	keepFileTime?: false | 'original' | 'autoShift' | 'fixCTbyMTandShift' | 'fixByFilenameAndShift';
	custom?: string;
};

export type OutputParams_extra = {
	presetName?: string;
	[key: string]: any;
}

// #endregion

// #region 任务

export enum TaskStatus {
	deleted = 'deleted',
	initializing = 'initializing',
	idle = 'idle',
	idle_queued = 'idle_queued',
	running = 'running',
	paused = 'paused',
	paused_queued = 'paused_queued',
	stopping = 'stopping',
	finishing = 'finishing',
	finished = 'finished',
	error = 'error',
}

export interface FFmpegProgress {
	frame: number;
	fps: number;
	q: number;
	size: number;		// kB
	time: number;		// 秒
	bitrate: number;	// kbps
	speed: number;
}

export type SingleProgressLog = Array<[number, number]>;
/**
 * 文件路径处理规则：
 * 添加任务时调用 mainVue 的 addTask，传入 baseName，并且把输入添加到 input.files 中。但此项中的 filePath 属性，本地任务直接添加绝对路径，远程任务则留空
 * FFBoxService 收到指令后直接加入到任务列表。然后，本地任务直接 gen 一个 paraArray，远程任务需要马上 gen 一个 outputFile，然后才 gen paraArray
 * 远程任务上传完成后调用 mergeUploaded，然后把刚才留空的路径用 hash 补上。
 * 此时，任务均具有 fileBaseName 属性。对于本地任务，input.files 具有绝对路径，outputFile 暂时留空；对于远程任务，input.files 具有绝对路径（但文件名是 hash），outputFile 具有绝对路径（但文件名是 hash.[ext]）
 * 任务开始时，本地任务根据输出参数 gen 一个 outputFile（不参与到 paraArray 中，只是为了后续打开文件），远程任务直接使用之前计算的 outputFile 对 paraArray 进行 override
 * 任务结束后，双击任务时，本地任务直接打开 outputFile 的文件，远程任务则弹出文件保存窗口，然后通过 IPC 触发 webContents.downloadURL，继而触发 will-download 事件
 */

export interface Task {
	kind?: TaskKind;
	taskName: string;
	before: InputInfo[];
	after: OutputParams;
	ncm?: NcmTaskParams;
	paraArray: Array<string>;
	status: TaskStatus;
	progressLog: {
		time: SingleProgressLog;
		frame: SingleProgressLog;
		size: SingleProgressLog;
		// 涉及到的时间单位均为 s
		lastStarted: number;
		elapsed: number;		// 暂停才更新一次，因此记录的并不是实时的任务时间
		lastPaused: number;		// 既用于暂停后恢复时计算速度，也用于统计任务耗时
	};
	cmdData: string;
	errorInfo: Array<string>;
	// notifications: Array<Notification>;
	outputFiles: string[];		// 对于本地任务，表示生成文件的绝对路径；对于远程任务，则为 fileName（自动生成的字符串） + ext，在 taskAdd 和调节参数之后生成文件名，注意不包含目录。
}

export interface ServiceTask extends Task {
	ffmpeg: FFmpeg | {
		process?: { pid?: number } | null;
		messages?: Array<any>;
		pause(): void;
		resume(): void;
		exit(callback: () => void): void;
		forceKill(callback: () => void): void;
	} | null;
	// TODO
	// ffmpeg: any | null;
	remoteTask: boolean;	// 本地/远程任务对于 service 来说，对输出文件名的处理方式不同；对于 UI 来说，只需要判断 IP 是否为 localhost 即决定是下载还是直接打开了
}

export enum WorkingStatus {
	idle = 'idle',
	running = 'running',
}

// #endregion

// #region Webhook

// 任务相关事件
export type TaskEventType =
	| 'task.created'        // 任务创建
	| 'task.started'        // 任务开始
	| 'task.paused'         // 任务暂停
	| 'task.resumed'        // 任务继续
	| 'task.completed'      // 任务完成
	| 'task.error'          // 任务出错
	| 'task.deleted'        // 任务删除
	| 'task.progress'       // 任务进度更新（包含转码进度和命令行输出）
	;

// 队列相关事件
export type QueueEventType =
	| 'queue.started'       // 队列启动
	| 'queue.paused'        // 队列暂停
	;

// 任务列表相关事件
export type TaskListEventType =
	| 'tasklist.changed'    // 任务列表变化（通用）
	| 'tasklist.added'      // 任务添加
	| 'tasklist.removed'    // 任务删除
	;

// 通知事件
export type NotificationEventType =
	| 'notification'        // 通知消息
	;

// 所有 Webhook 事件类型
export type WebhookEventType = TaskEventType | QueueEventType | TaskListEventType | NotificationEventType;


// Webhook 事件过滤器
export interface WebhookFilter {
	task_id?: number[];     // 订阅特定任务 ID 列表
	// 未来可扩展其他过滤器：
}

export interface Webhook {
	id: string;                    // 唯一标识符 (UUID)
	name: string;                  // Webhook 名称
	url: string;                   // 回调地址
	secret?: string;               // 签名密钥（可选）
	events: WebhookEventType[];    // 订阅的事件类型
	filter?: WebhookFilter;        // 事件过滤器
	enabled: boolean;              // 是否启用
	createdAt: number;             // 创建时间
	lastTriggeredAt?: number;      // 最后触发时间
	failureCount: number;          // 连续失败次数
}


export interface WebhookEventDataMap {
	// 任务事件
	'task.created': { taskId: number; task: Task };
	'task.started': { taskId: number; task: Task };
	'task.paused': { taskId: number; task: Task };
	'task.resumed': { taskId: number; task: Task };
	'task.completed': { taskId: number; task: Task };
	'task.error': { taskId: number; task: Task; error?: string };
	'task.deleted': { taskId: number };
	'task.progress': { taskId: number; progress?: FFmpegProgress };

	// 队列事件
	'queue.started': { timestamp: number };
	'queue.paused': { timestamp: number };

	// 任务列表事件
	'tasklist.changed': { taskIds: number[] };
	'tasklist.added': { taskId: number; task: Task };
	'tasklist.removed': { taskId: number };

	// 通知事件
	'notification': { notificationId: number; notification: Notification };
}

export interface WebhookPayload<E extends WebhookEventType = WebhookEventType> {
	id: string;                    // 载荷唯一 ID (UUID)
	timestamp: number;             // 发送时间戳
	event: E;                      // 事件类型
	data: WebhookEventDataMap[E];  // 类型安全的事件数据
}

export interface CreateWebhookRequest {
	name: string;
	url: string;
	secret?: string;
	events: WebhookEventType[];
	filter?: WebhookFilter;
	enabled?: boolean;
}

export interface UpdateWebhookRequest {
	name?: string;
	url?: string;
	secret?: string;
	events?: WebhookEventType[];
	filter?: WebhookFilter;
	enabled?: boolean;
}

// #endregion

// #region 预览 WebSocket 消息协议

// 前端 -> 后端
export interface PreviewWsMessage {
	type: 'start' | 'stop' | 'ping' | 'continue';
	startTime?: number;  // 仅用于 start
}

// 后端 -> 前端
export interface PreviewWsResponse {
	type: 'connected' | 'started' | 'streamEnd' | 'error' | 'pong';
	sessionId?: string;
	taskId?: number;
	startTime?: number;
	stats?: {
		bytesReceived: number;
		bytesSent: number;
		bytesBuffered: number;
		waitingForContinue: boolean;
	};
	message?: string;
}

// #endregion
