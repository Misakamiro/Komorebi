import { Task, WorkingStatus, Notification, FFmpegInfo } from '@common/types';
import { ServiceBridge } from '@renderer/bridges/serviceBridge'
import { SingleTaskScheduler } from './logic/transferManager2';

export interface UITask extends Task {
	dashboard: {
		progress: number;
		bitrate: number;
		speed: number;
		time: number;
		frame: number;
		size: number;	// kB
	};
	dashboard_smooth: {
		progress: number;
		bitrate: number;
		speed: number;
		time: number;
		frame: number;
		size: number;	// kB
	};
	dashboardTimer: number;
}

export interface UploadFile {
	taskId: number;
	fileBaseName: string;
	chunks: UploadChunk[];
	url?: string;	// 使用字符串输入
	blob?: File;	// 拖入文件输入
	size?: number;	// B
	status: 'waiting' | 'reading' | 'hashing' | 'uploading' | 'paused' | 'finished' | 'error';
	readTask?: SingleTaskScheduler;		// 用于暂停
	hashTask?: SingleTaskScheduler;
	uploadTask?: SingleTaskScheduler;
}
export interface UploadChunk {
	file?: UploadFile;
	abortController: AbortController;
	buffer?: ArrayBuffer;
	status: 'waiting' | 'reading' | 'hashing' | 'uploading' | 'paused' | 'finished' | 'error';
	tryCount: number;
	transferred: number;	// B
	size: number;			// B
	hash?: string;
}
export interface DownloadFile {
	url: string;
	finalFilePath?: string;
	transferred: number;	// B
	size: number;			// B
	status: 'downloading' | 'paused' | 'finished' | 'error';
}

export interface ServerData {
	id: string;			// 仅供前端一次性使用
	name: string;		// 默认为空
	nickName?: string;	// 暂不支持
	tasks: UITask[];
	notifications: Notification[];
	uploadFiles: UploadFile[];
	downloadFiles: DownloadFile[];
	ffmpegInfo: FFmpegInfo;
	version?: string;
	os?: 'Windows' | 'Linux' | 'MacOS' | 'unknown';
	isSandboxed?: boolean;
	machineId?: string;
	functionLevel?: number;
	workingStatus: WorkingStatus;
	progress: number;	// 由每个任务更新时计算出来
	overallProgressTimerID: any;
}

export interface Server {
	data: ServerData;
	entity: ServiceBridge;
}
