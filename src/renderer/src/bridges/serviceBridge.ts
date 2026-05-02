import EventEmitter from 'events';
import CryptoJS from 'crypto-js';
import { TypedEventEmitter } from '@common/utils';
import { FFBoxServiceEvent, FFBoxServiceEventApi, FFBoxServiceInterface, InputInfo, NcmTaskParams, Notification, OutputParams, Task } from '@common/types';

export interface ServeiceBridgeEvent {
	connected: () => void;
	disconnected: () => void;
	error: (reason: string) => void;
	message: (event: MessageEvent<any>) => void;
};

export enum ServiceBridgeStatus {
	Idle = 'Idle',
	Connecting = 'Connecting',
	Connected = 'Connected',
	Disconnected = 'Disconnected',
	Reconnecting = 'Reconnecting',
};

export class ServiceBridge extends (EventEmitter as new () => TypedEventEmitter<FFBoxServiceEvent & ServeiceBridgeEvent>) implements FFBoxServiceInterface {
	private ws: WebSocket | null = null;
	private readonly requestTimeoutMs = 8000;
	private readonly connectTimeoutMs = 2500;
	public ip: string;
	public port: number;
	public username: string;
	public password: string;
	public status = ServiceBridgeStatus.Idle;
	public sessionId?: string;
	public functionLevel: number = NaN;

	constructor(ip?: string, port?: number) {
		super();
		setTimeout(() => {
			if (ip && port) {
				this.connect(ip, port);
			}
		}, 0);
	}

	// #region HTTP 请求封装

	/**
	 * 发送 HTTP 请求
	 */
	private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = this.requestTimeoutMs): Promise<Response> {
		const controller = new AbortController();
		const timer = window.setTimeout(() => controller.abort(), timeoutMs);
		try {
			return await fetch(url, {
				...options,
				signal: controller.signal,
			});
		} finally {
			window.clearTimeout(timer);
		}
	}

	private async httpRequest<T>(method: string, path: string, body?: any): Promise<T> {
		const headers: HeadersInit = { 'Content-Type': 'application/json' };
		if (this.sessionId) {
			headers['Authorization'] = `Bearer ${this.sessionId}`;
		}
		const response = await this.fetchWithTimeout(`http://${this.ip}:${this.port}${path}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!response.ok) {
			// throw new Error(`HTTP ${response.status}`);
		}
		const text = await response.text();
		try {
			return JSON.parse(text);
		} catch {
			return text as T;
		}
	}

	// #endregion

	// #region 连接/断开/WebSocket 监听

	public async connect(ip?: string, port?: number, username?: string, password?: string) {
		if (ip && port) {
			this.ip = ip;
			this.port = port;
		}
		if (this.status === ServiceBridgeStatus.Idle) {
			this.status = ServiceBridgeStatus.Connecting;
		} else if (this.status === ServiceBridgeStatus.Disconnected) {
			this.status = ServiceBridgeStatus.Reconnecting;
		} else {
			return;
		}

		const finalResult = await new Promise<boolean>(async (connectResult) => {
			let settled = false;
			let wsTimer: number | undefined;
			const finish = (result: boolean, reason?: string) => {
				if (settled) {
					return;
				}
				settled = true;
				if (wsTimer !== undefined) {
					window.clearTimeout(wsTimer);
				}
				if (!result && reason) {
					this.emit('error', reason);
				}
				connectResult(result);
			};

			// 4.4 版本后的服务器具有登录系统。不支持以前版本的服务器
			// 5.3 版本大量改用 HTTP request，并且版本接口新增 /api/v1 前缀

			// 1. 检查服务器版本
			console.log(`serviceBridge: 正在检查服务器版本 http://${this.ip}:${this.port}/api/v1/system/version 或 /version`);
			const requestOK1 = await new Promise<boolean>((resolve) => {
				// 并行发送两个请求，取其中一个成功结果
				const newVersionRequest = this.fetchWithTimeout(`http://${this.ip}:${this.port}/api/v1/system/version`, { method: 'get' }, this.connectTimeoutMs)
					.then((response) => response.ok)
					.catch(() => false);
				const oldVersionRequest = this.fetchWithTimeout(`http://${this.ip}:${this.port}/version`, { method: 'get' }, this.connectTimeoutMs)
					.then((response) => response.ok)
					.catch(() => false);
				
				Promise.all([newVersionRequest, oldVersionRequest]).then(([newResult, oldResult]) => {
					resolve(newResult || oldResult);
				});
			});
			if (!requestOK1) {
				finish(false, '连接失败：获取服务器版本失败（可能是本地服务未启动、端口被占用，或前后端版本不匹配）');
				return;
			}

			// 2. HTTP 登录获取 sessionId
			console.log(`serviceBridge: 正在登录 http://${this.ip}:${this.port}/api/v1/auth/login`);
			const [loginSuccess, loginResult] = await new Promise<[boolean, any]>((resolve) => {
				this.fetchWithTimeout(`http://${this.ip}:${this.port}/api/v1/auth/login`, {
					method: 'post',
					body: JSON.stringify({
						username: username || '',
						passkey: password ? CryptoJS.SHA256(password).toString() : '',
					}),
					headers: new Headers({
						'Content-Type': 'application/json'
					}),
				}).then((response) => {
					response.json().then((result) => {
						resolve([result.isSuccess, result]);
					}).catch(() => {
						resolve([false, null]);
					});
				}).catch(() => {
					resolve([false, null]);
				});
			});

			if (!loginSuccess) {
				if (loginResult?.isUserExist === false) {
					finish(false, '登录失败：用户名错误');
				} else {
					finish(false, '登录失败：密码错误');
				}
				return;
			}

			this.sessionId = loginResult.sessionId;
			this.functionLevel = loginResult.functionLevel;
			console.log(`serviceBridge: 登录成功，sessionId: ${this.sessionId}, functionLevel: ${this.functionLevel}`);

			// 3. 建立 WebSocket 连接（携带 sessionId）
			console.log(`serviceBridge: 正在连接 WebSocket ws://${this.ip}:${this.port}/?sessionId=${this.sessionId}`);
			const ws = new WebSocket(`ws://${this.ip}:${this.port}/?sessionId=${this.sessionId}`);
			this.ws = ws;
			const 这 = this;
			wsTimer = window.setTimeout(() => {
				try {
					ws.close();
				} catch {}
				这.sessionId = undefined;
				这.functionLevel = NaN;
				finish(false, 'WebSocket 连接超时');
			}, this.connectTimeoutMs);

			ws.onopen = async function (event) {
				console.log(`serviceBridge: WebSocket 连接成功`, event);
				这.status = ServiceBridgeStatus.Connected;
				这.emit('connected');
				finish(true);
			};

			ws.onclose = function (event) {
				// close 事件在 error 事件后触发
				if (这.status === ServiceBridgeStatus.Connected) {
					// 掉线
					这.status = ServiceBridgeStatus.Disconnected;
				} else {
					// 未连接成功，由 onerror 处理过，这里不需处理
					if (!settled) {
						finish(false, 'WebSocket 连接已关闭');
					}
				}
				这.sessionId = undefined;
				这.functionLevel = NaN;
				if (这.status === ServiceBridgeStatus.Disconnected) {
					这.emit('disconnected');
				}
			};

			ws.onerror = function (event) {
				finish(false, 'WebSocket 连接失败');
				// return;
			};

			ws.onmessage = function (event) {
				// console.log(`serviceBridge: ws://${这.ip}:${这.port}/ 服务器发来消息`, event);
				// 这.emit('message', event);
				这.handleWsEvents(event);
			};
		});

		if (!finalResult) {
			if (this.status === ServiceBridgeStatus.Connecting || this.status === ServiceBridgeStatus.Reconnecting) {
				this.status = ServiceBridgeStatus.Disconnected;
			}
		}
	}

	public disconnect() {
		console.log(`serviceBridge: 正在断开服务器 ws://${this.ip}:${this.port}/`);
		this.ws?.close();
		this.ws = null;
		this.status = ServiceBridgeStatus.Idle;
	}

	/**
	 * 接受 service 事件入口（来自 ws.onmessage）
	 */
	private handleWsEvents(event: MessageEvent<any>) {
		const data: FFBoxServiceEventApi = JSON.parse(event.data);
		if (data.event === 'connected') {
			console.log(`serviceBridge: 收到 connected 事件`, data.payload);
		} else {
			this.emit(data.event, data.payload as any);
		}
	}

	// #endregion

	// #region 流式请求

	/**
	 * 发送流式 HTTP 请求（用于视频预览等场景）
	 * 返回原始 Response 对象，可通过 response.body.getReader() 控制读取节奏
	 */
	public fetchStream(path: string): Promise<Response> {
		const headers: HeadersInit = {};
		if (this.sessionId) {
			headers['Authorization'] = `Bearer ${this.sessionId}`;
		}
		return fetch(`http://${this.ip}:${this.port}${path}`, { headers });
	}

	// #endregion

	// #region 任务管理

	public taskAdd(taskName: string, outputParams?: OutputParams): Promise<number> {
		return this.httpRequest<number>('POST', '/api/v1/tasks', { taskName, outputParams });
	}

	public taskAddNcm(params: NcmTaskParams): Promise<number> {
		return this.httpRequest<number>('POST', '/api/v1/tasks/ncm', params);
	}

	public setNcmParameters(ids: number[], params: NcmTaskParams): Promise<void> {
		return this.httpRequest<void>('PUT', '/api/v1/tasks/ncm/parameters', { ids, params });
	}

	public taskDelete(id: number): Promise<void> {
		return this.httpRequest<void>('DELETE', `/api/v1/tasks/${id}`);
	}

	public taskStart(id: number): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/start`);
	}

	public taskReady(id: number): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/ready`);
	}

	public taskPause(id: number): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/pause`);
	}

	public taskResume(id: number): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/resume`);
	}

	public taskReset(id: number): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/reset`);
	}

	public mergeUploaded(id: number, hashs: string[], fileBaseName: string, inputName?: string, fileTime?: { accessTime: number, createTime: number, modifyTime: number }): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/merge-upload`, { hashs, fileBaseName, inputName, fileTime });
	}

	public setUploadStatus(id: number, isUploading: boolean): Promise<void> {
		return this.httpRequest<void>('PUT', `/api/v1/tasks/${id}/upload-status`, { isUploading });
	}

	public setParameters(ids: number[], params: OutputParams[]): Promise<void> {
		return this.httpRequest<void>('PUT', `/api/v1/tasks/parameters`, { ids, params });
	}

	public trailLimit_stopTranscoding(id: number, reason: 'media' | 'working', byFrontend?: boolean): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/stop`, { reason });
	}

	public getMediaFrameInfo(id: number, fileIndex: number, videoStreamIndex: number): Promise<void> {
		return this.httpRequest<void>('POST', `/api/v1/tasks/${id}/frame-info`, { fileIndex, videoStreamIndex });
	}

	public refreshTaskMetadata(id: number): Promise<InputInfo[]> {
		return this.httpRequest<InputInfo[]>('POST', `/api/v1/tasks/${id}/metadata`);
	}

	// #endregion

	// #region 队列管理

	public queueStart(): Promise<void> {
		return this.httpRequest<void>('POST', '/api/v1/queue/start');
	}

	public queuePause(): Promise<void> {
		return this.httpRequest<void>('POST', '/api/v1/queue/pause');
	}

	// #endregion

	// #region 通知管理

	public deleteNotification(notificationId: number): Promise<void> {
		return this.httpRequest<void>('DELETE', `/api/v1/system/notifications/${notificationId}`);
	}

	// #endregion

	// #region 信息获取

	public getProperties(): Promise<any> {
		return this.httpRequest<any>('GET', '/api/v1/system/properties');
	}

	public getWorkingStatus(): Promise<string> {
		return this.httpRequest<string>('GET', '/api/v1/system/working-status');
	}

	public getTaskList(): Promise<number[]> {
		return this.httpRequest<number[]>('GET', '/api/v1/tasks');
	}

	public getTask(taskId: number): Promise<Task> {
		return this.httpRequest<Task>('GET', `/api/v1/tasks/${taskId}`);
	}

	public getNotifications(): Promise<Notification[]> {
		return this.httpRequest<Notification[]>('GET', '/api/v1/system/notifications');
	}

	public getAVOptions(): Promise<any> {
		return this.httpRequest<any>('GET', '/api/v1/system/codecs');
	}

	// #endregion

	// #region 激活与缓存

	public activate(activationCode: string): Promise<string | false> {
		return this.httpRequest<string | false>('POST', '/api/v1/activation', { userInput: activationCode });
	}

	public getCacheInfo(needDelete: boolean): Promise<{ uploadCount: number, uploadSize: number, downloadCount: number, downloadSize: number }> {
		return this.httpRequest<{ uploadCount: number, uploadSize: number, downloadCount: number, downloadSize: number }>(
			needDelete ? 'DELETE' : 'GET',
			'/api/v1/cache'
		);
	}

	// #endregion

	// #region 初始化方法（后端内部调用，前端无需调用）

	public initSettings(): Promise<void> {
		return this.httpRequest<void>('POST', '/api/v1/system/settings/reload');
	}

	public initFFmpeg(): void {
		// 后端内部调用，前端无需实现
	}

	// #endregion
}
