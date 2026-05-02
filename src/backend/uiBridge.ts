import Http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import CryptoJS from 'crypto-js';
import Koa from 'koa';
import Router from 'koa-router';
import { koaBody } from 'koa-body';
import koaStatic from 'koa-static';
import koaMount from 'koa-mount';
// import formidable from 'formidable';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FFBoxServiceEventApi, FFBoxServiceEventParam, OutputParams, CreateWebhookRequest, UpdateWebhookRequest, NcmTaskParams } from '@common/types';
import { version } from '@common/constants';
import { getSingleArgvValue } from '@common/utils';
import localConfig from '@common/localConfig';
import { FFBoxService } from './FFBoxService';
import { getOs, log } from './utils';
import { sessionManager } from './utils/sessionManager';
import { webhookManager } from './utils/webhookManager';

interface Client {
	ws: WebSocket;
	sessionId: string;
	username: string;
	functionLevel: number;
}

let server: Http.Server | null;
let koa: Koa | null;
let wss: WebSocket.Server | null;
let clients = new Map<string, Client>();
let ffboxService: FFBoxService | null;

const uploadDir = os.tmpdir() + '/FFBoxUploadCache'; // 文件上传目录
const downloadDir = os.tmpdir() + '/FFBoxDownloadCache'; // 文件下载目录

const uiBridge = {
	init(self: FFBoxService): void {
		ffboxService = self;
		const uploadDirCheck = new Promise((resolve) => {
			fs.access(uploadDir, fs.constants.F_OK, (err) => {
				return resolve(err ? false : true);
			});
		});
		const downloadDirCheck = new Promise((resolve) => {
			fs.access(downloadDir, fs.constants.F_OK, (err) => {
				return resolve(err ? false : true);
			});
		});
		Promise.all([uploadDirCheck, downloadDirCheck]).then((values) => {
			if (!values.every((value) => value)) {
				log.info('创建缓存文件夹', uploadDir, downloadDir);
				fs.mkdir(uploadDir, () => {});
				fs.mkdir(downloadDir, () => {});
			}
		});
		// koaBody({
		// 	multipart: true,
		// 	formidable: {
		// 		maxFileSize: 1024 ** 4, // 设置上传文件大小最大限制为 1TiB，默认 2MB
		// 		uploadDir,
		// 	},
		// });
	},

	listen(): void {
		koa = new Koa();

		// 初始化响应头和响应码
		koa.use(async (ctx, next) => {
			const authHeader = ctx.get('Authorization');
			const sessionId = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
		
			log.dev('收到请求', sessionId, ctx.request.method, ctx.request.url);
			ctx.response.set('Access-Control-Allow-Origin', '*');
			ctx.response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			ctx.response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
			ctx.response.set('Access-Control-Max-Age', '999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999');
			if (ctx.request.method === 'OPTIONS') {
				ctx.response.status = 204;
				// ctx.response.message = '多 9 余';
				return;	// 直接返回，不走后续逻辑
			}
			if (ctx.path.startsWith('/download')) {
				const fileBaseName = ctx.query.fileBaseName as string || path.basename(ctx.path);
				ctx.response.set('Content-Disposition', `attachment; filename="${encodeURI(fileBaseName)}`);
			}
			try {
				await next();
			} catch (err) {
				console.log(err);
				ctx.status = 500;
				ctx.body = { error: 'Internal Server Error' };
			}
		});

		// 读取请求体 - 添加错误处理捕获不可解析的请求
		koa.use(async (ctx, next) => {
			try {
				await koaBody({
					multipart: true,
					formidable: {
						maxFileSize: 1024 ** 4, // 设置上传文件大小最大限制为 1TiB，默认 2MB
						uploadDir,
					},
				})(ctx, next);
			} catch (err: any) {
				// 客户端发送了不可解析的数据，返回 400 Bad Request
				log.warn('请求体解析失败', err.message, ctx.request.url);
				ctx.status = 400;
				ctx.body = { error: 'Request body is invalid data' };
			}
		});

		// 下载资源响应
		const staticServer = koaStatic(`${os.tmpdir()}/FFBoxDownloadCache`);
		koa.use(koaMount('/download', staticServer));

		// 路由
		const router = getRouter();
		koa.use(router.routes());

		server = Http.createServer(koa.callback());

		// WebSocket 改为 noServer 模式
		wss = new WebSocket.Server({ noServer: true });

		// 手动处理 WebSocket 升级请求
		server.on('upgrade', (request, socket, head) => {
			const pathname = new URL(request.url || '/', 'http://localhost').pathname;
			if (pathname === '/') {
				// 主 WebSocket（UI-Service 事件）
				wss!.handleUpgrade(request, socket, head, (ws) => {
					wss!.emit('connection', ws, request);
				});
			} else {
				// 拒绝其他路径的 WebSocket 升级
				socket.destroy();
			}
		});

		const port = +(getSingleArgvValue('--port') || 33269);
		server.listen(port, '::');
		log.info(`HTTP/WebSocket 服务开始监听端口 ${port}。`);

		// 挂载主 WebSocket 服务器相关事件
		wss.on('connection', mountWebSocketEvents);
		wss.on('error', function (error: Error) {
			log.error('WebSocket 服务出错，建议检查防火墙。', error);
			ffboxService!.emit('serverError', { error });
			wss = null;
		});
		wss.on('close', function () {
			ffboxService!.emit('serverClose');
			log.info('WebSocket 服务关闭。');
			wss = null;
		});

		setTimeout(() => {
			if (wss) {
				mountEventFromService();
				ffboxService!.emit('serverReady');
			}
		}, 0);
	},
};

// #region WebSocket 事件处理

/**
 * WebSocket 连接处理
 * 新流程：前端先通过 HTTP 登录获取 sessionId，然后建立 WebSocket 时在 URL query 中携带 sessionId
 */
function mountWebSocketEvents(ws: WebSocket, request: Http.IncomingMessage): void {
	const address = request.socket.remoteAddress;

	// 从 URL query 中获取 sessionId
	const url = new URL(request.url || '/', `http://localhost`);
	const sessionId = url.searchParams.get('sessionId');

	if (!sessionId) {
		log.warn(`客户端连接被拒绝：缺少 sessionId。地址：${address}`);
		ws.close(4001, 'Missing sessionId');
		return;
	}

	const session = sessionManager.verifySession(sessionId);
	if (!session) {
		log.warn(`客户端连接被拒绝：无效的 sessionId。地址：${address}`);
		ws.close(4001, 'Invalid sessionId');
		return;
	}

	// 检查是否已有该 sessionId 的连接，如果有则断开旧连接
	const existingClient = clients.get(sessionId);
	if (existingClient) {
		log.info(`客户端重复连接，断开旧连接。sessionId：${sessionId}`);
		existingClient.ws.close(4002, 'Replaced by new connection');
	}

	// 连接成功，绑定 client
	const client: Client = {
		ws,
		sessionId,
		username: session.username,
		functionLevel: session.functionLevel,
	};
	clients.set(sessionId, client);
	log.info(`新客户端接入：${address}。sessionId：${sessionId}，用户：${session.username || '(匿名)'}。当前客户端数量：${clients.size}。`);

	ws.on('close', function (code: number, reason: Buffer) {
		clients.delete(sessionId);
		log.info(`客户端连接关闭：${address}。当前客户端数量：${clients.size}。`, code, reason.toString());
	});
	ws.on('error', function (err: Error) {
		log.error(`客户端连接出错：${address}。`, err);
	});

	// 发送连接成功事件
	const data: FFBoxServiceEventApi = {
		event: 'connected',
		payload: { timestamp: Date.now() },
	};
	ws.send(JSON.stringify(data));
}

/**
 * 挂载 ffboxService 事件发送到 UI 的监听
 */
function mountEventFromService(): void {
	if (!ffboxService || !wss) {
		throw new Error('uiBridge 使用前应 init()');
	}
	const eventsEnum: Array<keyof FFBoxServiceEventParam> = [
		'ffmpegInfo',
		"workingStatusUpdate",
		"tasklistUpdate",
		"taskUpdate",
		"cmdUpdate",
		"progressUpdate",
		"notificationUpdate",
	];
	for (const event of eventsEnum) {
		ffboxService.on(event, (payload: FFBoxServiceEventParam[keyof FFBoxServiceEventParam]) => {
			for (const client of clients.values()) {
				if (client.ws.readyState === WebSocket.OPEN) {
					const data: FFBoxServiceEventApi = {
						event,
						payload,
					};
					log.dev('触发信息：', data);
					client.ws.send(JSON.stringify(data));
				}
			}
		});
	}
}

// #endregion

// #region HTTP 路由

/**
 * 可选鉴权中间件
 * - 有 sessionId 时验证 sessionId
 * - 无 sessionId 时检查是否允许无密码访问
 */
async function optionalAuth(ctx: Koa.Context, next: () => Promise<void>): Promise<void> {
	const authHeader = ctx.get('Authorization');
	const sessionId = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

	if (sessionId) {
		const session = sessionManager.verifySession(sessionId);
		if (session) {
			ctx.state.session = session;
			ctx.state.functionLevel = session.functionLevel;
			await next();
			return;
		}
		ctx.status = 401;
		ctx.body = { error: 'Invalid session' };
		return;
	}

	async function isPasswordlessAllowed(): Promise<boolean> {
		const users = await localConfig.get('service.users') as any[];
		const defaultAdmin = users?.find((u: any) => u.username === '');
		return !defaultAdmin || !defaultAdmin.passkey;
	}
	
	// 无 sessionId 时检查是否允许无密码访问
	if (await isPasswordlessAllowed()) {
		ctx.state.isAnonymous = true;
		ctx.state.functionLevel = 100;
		await next();
		return;
	}

	ctx.status = 401;
	ctx.body = { error: 'Authentication required' };
}

function getRouter(): Router {
	const router = new Router();

	// #region 认证模块

	/**
	 * @openapi
	 * /api/v1/auth/login:
	 *   post:
	 *     summary: 用户登录
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               username:
	 *                 type: string
	 *               passkey:
	 *                 type: string
	 *                 description: SHA256 哈希后的密码
	 *     responses:
	 *       200:
	 *         description: 登录结果
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 isUserExist:
	 *                   type: boolean
	 *                 isSuccess:
	 *                   type: boolean
	 *                   description: 密码不正确则失败
	 *                 sessionId:
	 *                   type: string
	 *                 functionLevel:
	 *                   type: integer
	 *                   description: 暂无实际作用
	 */
	router.post('/api/v1/auth/login', async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}

		const { username, passkey } = ctx.request.body;
		const users = await localConfig.get('service.users') as any[]
			|| [{ username: "", passkey: "", maxFunctionLevel: 100 }];

		// 查找用户（空用户名匹配默认管理员）
		const user = users.find((u: any) => u.username === (username || ''));

		if (!user) {
			ctx.body = { isUserExist: false, isSuccess: false };
			return;
		}

		// 验证密码（空密码直接通过）
		if (!user.passkey || user.passkey === passkey) {
			const sessionId = sessionManager.createSession(user.username || '', user.maxFunctionLevel);
			ctx.body = {
				isUserExist: true,
				isSuccess: true,
				sessionId,
				functionLevel: user.maxFunctionLevel,
			};
		} else {
			ctx.body = { isUserExist: true, isSuccess: false };
		}
	});

	// #endregion

	// #region 任务管理模块

	/**
	 * @openapi
	 * /api/v1/tasks:
	 *   get:
	 *     summary: 获取任务 ID 列表
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 任务 ID 列表
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 type: integer
	 */
	router.get('/api/v1/tasks', optionalAuth, async function (ctx) {
		ctx.body = Object.keys(ffboxService!.tasklist).map(Number);
	});

	/**
	 * @openapi
	 * /api/v1/tasks:
	 *   post:
	 *     summary: 创建新任务
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               taskName:
	 *                 type: string
	 *               outputParams:
	 *                 $ref: '#/components/schemas/OutputParams'
	 *     responses:
	 *       200:
	 *         description: 返回新创建的任务 ID
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 taskId:
	 *                   type: integer
	 */
	router.post('/api/v1/tasks', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const { taskName, outputParams } = ctx.request.body;
		const isRemote = ctx.URL.hostname !== 'localhost' && ctx.URL.hostname !== '127.0.0.1';
		const result = await ffboxService!.taskAdd(taskName, outputParams as OutputParams, isRemote);
		ctx.body = result;
	});

	router.post('/api/v1/tasks/ncm', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const result = await ffboxService!.taskAddNcm(ctx.request.body as NcmTaskParams);
		ctx.body = result;
	});

	router.put('/api/v1/tasks/ncm/parameters', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const { ids, params } = ctx.request.body;
		await ffboxService!.setNcmParameters(ids, params as NcmTaskParams);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}:
	 *   get:
	 *     summary: 获取单个任务详情
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 任务详情
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Task'
	 *       404:
	 *         description: 任务未找到
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/ErrorResponse'
	 */
	router.get('/api/v1/tasks/:id', optionalAuth, async function (ctx) {
		const task = ffboxService!.tasklist[+ctx.params.id];
		if (!task) {
			ctx.status = 404;
			ctx.body = { error: 'Task not found' };
			return;
		}
		ctx.body = task;
	});

	router.post('/api/v1/tasks/:id/metadata', optionalAuth, async function (ctx) {
		const task = ffboxService!.tasklist[+ctx.params.id];
		if (!task) {
			ctx.status = 404;
			ctx.body = { error: 'Task not found' };
			return;
		}
		ctx.body = await ffboxService!.refreshTaskMetadata(+ctx.params.id);
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}:
	 *   delete:
	 *     summary: 删除任务
	 *     description: 【initializing / idle / idle_queued / finished / error】 => 【deleted】
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 删除成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.delete('/api/v1/tasks/:id', optionalAuth, async function (ctx) {
		ffboxService!.taskDelete(+ctx.params.id);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/start:
	 *   post:
	 *     summary: 启动单个任务
	 *     description: 【idle / idle_queued / error】 => 【running】 => 【finished / error】
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 启动成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/tasks/:id/start', optionalAuth, async function (ctx) {
		ffboxService!.taskStart(+ctx.params.id);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/ready:
	 *   post:
	 *     summary: 准备任务（加入队列）
	 *     description: 将单个任务进入排队状态（不会启动调度系统改变当前的执行/暂停状态）\n【idle / paused】 => 【idle_queued / paused_queued】 => 【running】
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 操作成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/tasks/:id/ready', optionalAuth, async function (ctx) {
		ffboxService!.taskReady(+ctx.params.id);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/pause:
	 *   post:
	 *     summary: 暂停任务
	 *     description: 暂停单个任务\n【running / paused_queued】 => 【paused】
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 暂停成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/tasks/:id/pause', optionalAuth, async function (ctx) {
		await ffboxService!.taskPause(+ctx.params.id);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/resume:
	 *   post:
	 *     summary: 继续执行单个任务
	 *     description: 【paused / paused_queued】 => 【running】
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 恢复成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/tasks/:id/resume', optionalAuth, async function (ctx) {
		await ffboxService!.taskResume(+ctx.params.id);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/reset:
	 *   post:
	 *     summary: 重置任务
	 *     description: 重置任务（收尾/强行，根据状态决定） 【paused / paused_queued / stopping / finished / error】 => 【idle】
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 重置成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/tasks/:id/reset', optionalAuth, async function (ctx) {
		await ffboxService!.taskReset(+ctx.params.id);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/parameters:
	 *   put:
	 *     summary: 设置任务参数
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               ids:
	 *                 type: array
	 *                 items:
	 *                   type: integer
	 *               params:
	 *                 type: array
	 *                 items:
	 *                   $ref: '#/components/schemas/OutputParams'
	 *     responses:
	 *       200:
	 *         description: 设置成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.put('/api/v1/tasks/parameters', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const { ids, params } = ctx.request.body;
		ffboxService!.setParameters(ids, params);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/merge-upload:
	 *   post:
	 *     summary: 合并上传的文件
	 *     description: 对于远程文件，上传完成后调用此函数合并文件\n前端无论检查到已缓存还是未缓存都使用相同的参数调用。前端和后端各自判断文件是否已上传过。若使用过，前端不再上传，后端不再进行分片读取合并
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               hashs:
	 *                 type: array
	 *                 items:
	 *                   type: string
	 *               fileBaseName:
	 *                 type: string
	 *                 description: 文件名参数不包含 hash，仅用于作为 input.files[].filePath 最终文件名的一部分供用户识别。相同 hash 但文件名不同的话，服务器会保留多份
	 *               inputName:
	 *                 type: string
	 *                 description: 在新建任务上传文件之前，或添加输入文件上传之前，hash 尚未得知，因此前端应发起修改输入参数的调用，生成这个上传文件的一个临时占位符。上传完毕后，往 inputName 传入生成的占位符，以便后端将其替换为真实文件名
	 *               fileTime:
	 *                 type: object
	 *     responses:
	 *       200:
	 *         description: 合并成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/tasks/:id/merge-upload', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const { hashs, fileBaseName, inputName, fileTime } = ctx.request.body;
		await ffboxService!.mergeUploaded(+ctx.params.id, hashs, fileBaseName, inputName, fileTime);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/upload-status:
	 *   put:
	 *     summary: 设置上传状态
	 *     description: 切换任务状态的初始化或待命状态\n如果设置为完成，还会进行一次 getFileMetadata
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               isUploading:
	 *                 type: boolean
	 *     responses:
	 *       200:
	 *         description: 设置成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.put('/api/v1/tasks/:id/upload-status', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const { isUploading } = ctx.request.body;
		ffboxService!.setUploadStatus(+ctx.params.id, isUploading);
		ctx.body = { success: true };
	});

	/**
	 * 此接口无需进行 openapi 定义
	 */
	router.post('/api/v1/tasks/:id/stop', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const { reason } = ctx.request.body;
		ffboxService!.trailLimit_stopTranscoding(+ctx.params.id, reason, true);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/tasks/{id}/frame-info:
	 *   post:
	 *     summary: 扫描视频帧信息
	 *     description: 使用 FFmpeg showinfo 滤镜扫描指定视频流的帧信息，等待扫描完成后返回，结果存储在 StreamInfo.frames 中
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               fileIndex:
	 *                 type: integer
	 *                 description: 输入文件索引
	 *               videoStreamIndex:
	 *                 type: integer
	 *                 description: 视频流索引（第 n 个 type 为 video 的 stream）
	 *     responses:
	 *       200:
	 *         description: 帧扫描完成
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *       404:
	 *         description: 任务或输入文件不存在
	 */
	router.post('/api/v1/tasks/:id/frame-info', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const { fileIndex, videoStreamIndex } = ctx.request.body;
		if (fileIndex === undefined || videoStreamIndex === undefined) {
			ctx.status = 400;
			ctx.body = { error: 'Missing fileIndex or videoStreamIndex' };
			return;
		}
		const task = ffboxService!.tasklist[+ctx.params.id];
		if (!task) {
			ctx.status = 404;
			ctx.body = { error: 'Task not found' };
			return;
		}

		try {
			await ffboxService!.getMediaFrameInfo(+ctx.params.id, fileIndex, videoStreamIndex);
			ctx.body = { success: true };
		} catch (errorCode) {
			ctx.body = { status: 500, errorCode };
		}
	});


	// #endregion

	// #region 队列管理模块

	/**
	 * @openapi
	 * /api/v1/queue/start:
	 *   post:
	 *     summary: 启动队列
	 *     description: 首先将【空闲_已排队】【已暂停_已排队】的任务启动，然后将所有【空闲】【已暂停】的任务进入【空闲_已排队】【已暂停_已排队】状态，再次进行任务安排\n也就是优先启动已排队的任务，再将空闲任务加入排队
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 启动成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/queue/start', optionalAuth, async function (ctx) {
		ffboxService!.queueStart();
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/queue/pause:
	 *   post:
	 *     summary: 暂停队列
	 *     description: 暂停处理队列，将所有【正在运行】的任务暂停、【空闲_已排队】的任务重置
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 暂停成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/queue/pause', optionalAuth, async function (ctx) {
		await ffboxService!.queuePause();
		ctx.body = { success: true };
	});

	// #endregion

	// #region 系统信息模块

	/**
	 * @openapi
	 * /api/v1/system/version:
	 *   get:
	 *     summary: 获取 FFBoxService 版本号
	 *     responses:
	 *       200:
	 *         description: 版本号
	 *         content:
	 *           text/plain:
	 *             schema:
	 *               type: string
	 */
	router.get('/api/v1/system/version', async function (ctx) {
		ctx.body = version;
	});

	/**
	 * @openapi
	 * /api/v1/system/properties:
	 *   get:
	 *     summary: 获取系统属性信息
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 系统属性
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 os:
	 *                   type: string
	 *                 isSandboxed:
	 *                   type: boolean
	 *                 machineId:
	 *                   type: string
	 *                 functionLevel:
	 *                   type: integer
	 *                 ffmpegInfo:
	 *                   $ref: '#/components/schemas/FFmpegInfo'
	 */
	router.get('/api/v1/system/properties', optionalAuth, async function (ctx) {
		ctx.body = {
			os: getOs(),
			isSandboxed: process.cwd() === '/',
			machineId: ffboxService!.machineId,
			functionLevel: ffboxService!.functionLevel,
			ffmpegInfo: ffboxService!.ffmpegInfo,
		};
	});

	/**
	 * @openapi
	 * /api/v1/system/codecs:
	 *   get:
	 *     summary: 获取已缓存的 ffmpeg 编解码器信息
	 *     description: 如果未扫描并缓存，或者想要刷新，可通过更新服务器配置中的 ffmpeg 路径的方法触发扫描
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 编解码器、复用器、滤镜列表
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 codecs:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/FFmpegCodecDetail'
	 *                 formats:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/FFmpegMuxerDetail'
	 *                 filters:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/FFmpegFilterDetail'
	 */
	router.get('/api/v1/system/codecs', optionalAuth, async function (ctx) {
		ctx.body = {
			codecs: ffboxService!.ffmpegCodecs,
			formats: ffboxService!.ffmpegFormats,
			filters: ffboxService!.ffmpegFilters,
		};
	});

	/**
	 * @openapi
	 * /api/v1/system/working-status:
	 *   get:
	 *     summary: 获取工作状态
	 *     description: 返回当前队列的工作状态，只有 idle（空闲）和 running（运行中）两种状态
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 工作状态
	 *         content:
	 *           text/plain:
	 *             schema:
	 *               type: string
	 *               enum: [idle, running]
	 */
	router.get('/api/v1/system/working-status', optionalAuth, async function (ctx) {
		ctx.body = ffboxService!.workingStatus;
	});

	/**
	 * @openapi
	 * /api/v1/system/notifications:
	 *   get:
	 *     summary: 获取通知列表
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 通知列表
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 $ref: '#/components/schemas/Notification'
	 */
	router.get('/api/v1/system/notifications', optionalAuth, async function (ctx) {
		ctx.body = ffboxService!.notifications;
	});

	/**
	 * @openapi
	 * /api/v1/system/notifications/{id}:
	 *   delete:
	 *     summary: 删除通知
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: integer
	 *     responses:
	 *       200:
	 *         description: 删除成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.delete('/api/v1/system/notifications/:id', optionalAuth, async function (ctx) {
		ffboxService!.deleteNotification(+ctx.params.id);
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/system/settings/reload:
	 *   post:
	 *     summary: 重新加载服务器配置
	 *     description: 从本地存储初始化设置
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 重载成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/system/settings/reload', optionalAuth, async function (ctx) {
		await ffboxService!.initSettings();
		ctx.body = { success: true };
	});

	// #endregion

	// #region 文件传输模块（下载不走此处路由）

	/**
	 * @openapi
	 * /api/v1/upload/check:
	 *   post:
	 *     summary: 批量检查给定 hash 的文件是否已缓存
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               hashs:
	 *                 type: array
	 *                 description: 要检查的文件 hash 数组
	 *                 items:
	 *                   type: string
	 *     responses:
	 *       200:
	 *         description: 检查结果（已缓存返回奇数）
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 type: integer
	 *                 description: 1 代表已缓存，0 代表未缓存
	 */
	router.post('/api/v1/upload/check', optionalAuth, async function (ctx) {
		if (!ctx.request.body || !(ctx.request.body.hashs instanceof Array)) {
			ctx.status = 400;
			ctx.body = { error: 'Invalid request' };
			return;
		}
		log.info('检查文件缓存性', ctx.request.body.hashs);
		const hashs = ctx.request.body.hashs as Array<string>;
		const ret: Array<number> = [];
		for (const hash of hashs) {
			const filePath = uploadDir + '/' + hash;
			if (fs.existsSync(filePath)) {
				ret.push(1);
			} else {
				ret.push(0);
			}
		}
		ctx.body = ret;
	});

	/**
	 * @openapi
	 * /api/v1/upload/file:
	 *   post:
	 *     summary: 上传文件
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               file:
	 *                 type: string
	 *                 format: binary
	 *               name:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: 上传成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.post('/api/v1/upload/file', optionalAuth, async function (ctx) {
		if (!ctx.request.files || !ctx.request.files.file) {
			ctx.status = 400;
			ctx.body = { error: 'Missing file' };
			return;
		}
		const file = ctx.request.files.file as any;
		const body = ctx.request.body;
		log.info('收到文件', file.originalFilename);
		const destPath = uploadDir + '/' + body.name;
		try {
			fs.renameSync(file.filepath, destPath);
			log.info('文件已缓存至', destPath);
			ctx.body = { success: true };
		} catch (error) {
			log.error('文件重命名失败', error);
			ctx.status = 500;
			ctx.body = { error: 'Failed to save file' };
		}
	});

	// #endregion

	// ==================== 人品模块 ====================

	/**
	 * @openapi
	 * /api/v1/activation:
	 *   post:
	 *     summary: 激活 FFBoxService
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               userInput:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: 激活结果
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: string
	 *       400:
	 *         description: 激活码无效
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 error:
	 *                   type: string
	 */
	router.post('/api/v1/activation', async function (ctx) {
		if (!ctx.request.body?.userInput) {
			ctx.status = 400;
			ctx.body = { error: 'Missing activation code' };
			return;
		}
		const userInput = ctx.request.body.userInput;
		const fixedCode = 'd324c697ebfc42b7';
		const key = ffboxService!.machineId + fixedCode;
		const decrypted = CryptoJS.AES.decrypt(userInput, key);
		const activationResult = CryptoJS.enc.Utf8.stringify(decrypted);
		if (parseInt(activationResult).toString() === activationResult) {
			ffboxService!.functionLevel = parseInt(activationResult);
			localConfig.set('userInfo.activationCode', userInput);
			const returnEncrypted = CryptoJS.AES.encrypt(activationResult, fixedCode).toString();
			ctx.body = returnEncrypted;
		} else {
			ctx.status = 400;
			ctx.body = { error: 'Unrecognizable activation code' };
		}
	});

	// #endregion

	// #region 缓存管理模块

	/**
	 * @openapi
	 * /api/v1/cache:
	 *   get:
	 *     summary: 获取上传下载缓存信息
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 缓存信息
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CacheInfo'
	 */
	router.get('/api/v1/cache', optionalAuth, async function (ctx) {
		ctx.body = await ffboxService!.getCacheInfo(false);
	});

	/**
	 * @openapi
	 * /api/v1/cache:
	 *   delete:
	 *     summary: 清除上传下载缓存
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: 清除结果
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CacheInfo'
	 */
	router.delete('/api/v1/cache', optionalAuth, async function (ctx) {
		ctx.body = await ffboxService!.getCacheInfo(true);
	});

	// #endregion

	// #region Webhook 模块

	/**
	 * @openapi
	 * /api/v1/webhooks:
	 *   get:
	 *     summary: 获取所有 Webhook
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Webhook 列表
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 $ref: '#/components/schemas/Webhook'
	 */
	router.get('/api/v1/webhooks', optionalAuth, async function (ctx) {
		const webhooks = webhookManager.getAll();
		// 不返回 secret 字段
		ctx.body = webhooks.map(w => ({ ...w, secret: undefined as string | undefined }));
	});

	/**
	 * @openapi
	 * /api/v1/webhooks:
	 *   post:
	 *     summary: 创建 Webhook
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CreateWebhookRequest'
	 *     responses:
	 *       200:
	 *         description: 创建成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Webhook'
	 */
	router.post('/api/v1/webhooks', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const webhook = webhookManager.create(ctx.request.body as CreateWebhookRequest);
		ctx.body = { ...webhook, secret: undefined as string | undefined };
	});

	/**
	 * @openapi
	 * /api/v1/webhooks/{id}:
	 *   get:
	 *     summary: 获取单个 Webhook
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Webhook 详情
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Webhook'
	 *       404:
	 *         description: Webhook 未找到
	 */
	router.get('/api/v1/webhooks/:id', optionalAuth, async function (ctx) {
		const webhook = webhookManager.get(ctx.params.id);
		if (!webhook) {
			ctx.status = 404;
			ctx.body = { error: 'Webhook not found' };
			return;
		}
		ctx.body = { ...webhook, secret: undefined as string | undefined };
	});

	/**
	 * @openapi
	 * /api/v1/webhooks/{id}:
	 *   put:
	 *     summary: 更新 Webhook
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/UpdateWebhookRequest'
	 *     responses:
	 *       200:
	 *         description: 更新成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Webhook'
	 *       404:
	 *         description: Webhook 未找到
	 */
	router.put('/api/v1/webhooks/:id', optionalAuth, async function (ctx) {
		if (!ctx.request.body) {
			ctx.status = 400;
			ctx.body = { error: 'Missing request body' };
			return;
		}
		const webhook = webhookManager.update(ctx.params.id, ctx.request.body as UpdateWebhookRequest);
		if (!webhook) {
			ctx.status = 404;
			ctx.body = { error: 'Webhook not found' };
			return;
		}
		ctx.body = { ...webhook, secret: undefined as string | undefined };
	});

	/**
	 * @openapi
	 * /api/v1/webhooks/{id}:
	 *   delete:
	 *     summary: 删除 Webhook
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: 删除成功
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessResponse'
	 */
	router.delete('/api/v1/webhooks/:id', optionalAuth, async function (ctx) {
		const success = webhookManager.delete(ctx.params.id);
		if (!success) {
			ctx.status = 404;
			ctx.body = { error: 'Webhook not found' };
			return;
		}
		ctx.body = { success: true };
	});

	/**
	 * @openapi
	 * /api/v1/webhooks/{id}/test:
	 *   post:
	 *     summary: 测试 Webhook 连通性
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: 测试结果
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 */
	router.post('/api/v1/webhooks/:id/test', optionalAuth, async function (ctx) {
		const result = await webhookManager.test(ctx.params.id);
		ctx.body = result;
	});

	// #endregion

	return router;
}

// #endregion

export default uiBridge;
