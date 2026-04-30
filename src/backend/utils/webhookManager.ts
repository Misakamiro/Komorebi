import crypto from 'crypto';
import {
	Webhook,
	WebhookEventType,
	WebhookPayload,
	WebhookEventDataMap,
	WebhookFilter,
	CreateWebhookRequest,
	UpdateWebhookRequest,
	TaskEventType,
	QueueEventType,
	TaskListEventType,
	NotificationEventType,
} from '@common/types';
import localConfig from '@common/localConfig';
import { log } from '../utils';

const WEBHOOK_CONFIG_KEY = 'webhooks';
const MAX_RETRIES = 3;
const BASE_DELAY = 5000;    // 基础延迟 5 秒
const MAX_DELAY = 60000;    // 最大延迟 60 秒
const TIMEOUT = 10000;      // 请求超时 10 秒

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export class WebhookManager {
	private webhooks: Map<string, Webhook> = new Map();	// 所有 webhooks

	// 索引（优化查找性能）
	private eventIndex: Map<WebhookEventType, Set<string>> = new Map();	// 按事件类型索引
	private taskIndex: Map<number, Set<string>> = new Map();	// 按 taskId 索引（仅用于任务相关事件）
	private globalWebhooks: Set<string> = new Set();	// 全局 webhook（无 filter 的）（仅通过重建索引的方式操作）

	constructor() {
		// 构造时不自动加载，需要显式调用 load()
	}

	// #region 本地存储

	async load(): Promise<void> {
		try {
			const webhooksArray = await localConfig.get(WEBHOOK_CONFIG_KEY) as Webhook[] | undefined;
			if (Array.isArray(webhooksArray)) {
				for (const webhook of webhooksArray) {
					this.webhooks.set(webhook.id, webhook);
					this.rebuildIndex(webhook.id, webhook);
				}
			}
		} catch (error) {
			log.error('[WebhookManager] 加载 webhooks 失败', error);
		}
	}

	private async save(): Promise<void> {
		try {
			const webhooksArray = Array.from(this.webhooks.values());
			await localConfig.set(WEBHOOK_CONFIG_KEY, webhooksArray);
		} catch (error) {
			log.error('[WebhookManager] 保存 webhooks 失败', error);
		}
	}

	// #endregion

	// #region CRUD 操作

	create(data: CreateWebhookRequest): Webhook {
		const id = crypto.randomUUID();
		const webhook: Webhook = {
			id,
			name: data.name,
			url: data.url,
			secret: data.secret,
			events: data.events,
			filter: data.filter,
			enabled: data.enabled ?? true,
			createdAt: Date.now(),
			failureCount: 0,
		};
		this.webhooks.set(id, webhook);
		this.rebuildIndex(id, webhook);
		this.save();
		return webhook;
	}

	get(id: string): Webhook | undefined {
		return this.webhooks.get(id);
	}

	getAll(): Webhook[] {
		return Array.from(this.webhooks.values());
	}

	update(id: string, data: UpdateWebhookRequest): Webhook | undefined {
		const webhook = this.webhooks.get(id);
		if (!webhook) return undefined;

		// 先从索引中移除
		this.removeFromIndex(id, webhook);

		// 更新字段
		if (data.name !== undefined) webhook.name = data.name;
		if (data.url !== undefined) webhook.url = data.url;
		if (data.secret !== undefined) webhook.secret = data.secret;
		if (data.events !== undefined) webhook.events = data.events;
		if (data.filter !== undefined) webhook.filter = data.filter;
		if (data.enabled !== undefined) webhook.enabled = data.enabled;

		// 重新建立索引
		this.rebuildIndex(id, webhook);
		this.save();
		return webhook;
	}

	delete(id: string): boolean {
		const webhook = this.webhooks.get(id);
		if (!webhook) return false;

		this.webhooks.delete(id);
		this.removeFromIndex(id, webhook);
		this.save();
		return true;
	}

	// #endregion

	// #region 索引维护

	private rebuildIndex(id: string, webhook: Webhook): void {
		// 更新事件索引
		for (const event of webhook.events) {
			if (!this.eventIndex.has(event)) {
				this.eventIndex.set(event, new Set());
			}
			this.eventIndex.get(event)!.add(id);
		}

		// 更新任务索引
		if (webhook.filter?.task_id) {
			for (const taskId of webhook.filter.task_id) {
				if (!this.taskIndex.has(taskId)) {
					this.taskIndex.set(taskId, new Set());
				}
				this.taskIndex.get(taskId)!.add(id);
			}
		} else {
			// 无 filter 的加入全局集合
			this.globalWebhooks.add(id);
		}
	}

	private removeFromIndex(id: string, webhook: Webhook): void {
		// 从事件索引移除
		for (const event of webhook.events) {
			this.eventIndex.get(event)?.delete(id);
		}

		// 从任务索引移除
		if (webhook.filter?.task_id) {
			for (const taskId of webhook.filter.task_id) {
				this.taskIndex.get(taskId)?.delete(id);
			}
		} else {
			this.globalWebhooks.delete(id);
		}
	}

	// #endregion

	// #region 事件触发（分层优化）

	/**
	 * 触发任务相关事件 - 使用索引快速查找
	 */
	async triggerTaskEvent<E extends TaskEventType>(event: E, taskId: number, data: WebhookEventDataMap[E]): Promise<void> {
		const webhookIds = new Set<string>();

		// 1. 一次过滤，获取订阅了此事件的 webhook id 合集
		const eventWebhooks = this.eventIndex.get(event);	
		if (eventWebhooks) {
			for (const id of eventWebhooks) {
				webhookIds.add(id);
			}
		}

		// 2. 二次过滤：只保留匹配 taskId 的 webhook
		const toTrigger: Webhook[] = [];
		for (const id of webhookIds) {
			const webhook = this.webhooks.get(id);
			if (!webhook || !webhook.enabled) continue;

			const filterTaskIds = webhook.filter?.task_id;
			if (!filterTaskIds || filterTaskIds.includes(taskId)) {
				toTrigger.push(webhook);
			}
		}

		if (toTrigger.length === 0) return;

		// 3. 构建载荷
		const payload: WebhookPayload = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			event,
			data,
		};

		// 4. 异步发送（不阻塞主流程）
		Promise.allSettled(
			toTrigger.map((webhook) => this.sendWithRetry(webhook, payload))
		).catch(err => {
			log.error('[WebhookManager] triggerTaskEvent 异常', err);
		});
	}

	/**
	 * 触发全局事件（队列、通知等）- 只进行一次过滤
	 */
	async triggerGlobalEvent<E extends QueueEventType | TaskListEventType | NotificationEventType>(event: E, data: WebhookEventDataMap[E]): Promise<void> {
		const eventWebhooks = this.eventIndex.get(event);
		if (!eventWebhooks || eventWebhooks.size === 0) return;

		// 构建载荷
		const payload: WebhookPayload = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			event,
			data,
		};

		// 获取要触发的 webhook 列表
		const toTrigger = Array.from(eventWebhooks)
			.map(id => this.webhooks.get(id))
			.filter((w): w is Webhook => w?.enabled ?? false);

		if (toTrigger.length === 0) return;

		// 异步发送
		Promise.allSettled(
			toTrigger.map(webhook => this.sendWithRetry(webhook, payload))
		).catch(err => {
			log.error('[WebhookManager] triggerGlobalEvent 异常', err);
		});
	}

	// #endregion

	// region HTTP 发送

	/**
	 * 发送 webhook 请求
	 */
	private async send(webhook: Webhook, payload: WebhookPayload): Promise<boolean> {
		const body = JSON.stringify(payload);
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-FFBox-Event': payload.event,
			'X-FFBox-Delivery': payload.id,
		};

		if (webhook.secret) {
			headers['X-FFBox-Signature'] = `sha256=${this.sign(body, webhook.secret)}`;
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

			const response = await fetch(webhook.url, {
				method: 'POST',
				headers,
				body,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);
			return response.ok;
		} catch (error) {
			return false;
		}
	}

	/**
	 * 带重试的发送
	 */
	private async sendWithRetry(webhook: Webhook, payload: WebhookPayload, attempt = 0): Promise<boolean> {
		const success = await this.send(webhook, payload);

		if (success) {
			// 成功：重置失败计数，更新最后触发时间
			webhook.failureCount = 0;
			webhook.lastTriggeredAt = Date.now();
			this.save();
			return true;
		}

		if (attempt >= MAX_RETRIES) {
			// 达到最大重试次数：标记为不可用
			webhook.failureCount++;
			if (webhook.failureCount >= MAX_RETRIES) {
				webhook.enabled = false;
				log.warn(`[WebhookManager]: Webhook ${webhook.id} 已被禁用（连续失败 ${webhook.failureCount} 次）`);
			}
			this.save();
			return false;
		}

		// 指数退避重试
		const delay = this.getRetryDelay(attempt);
		log.warn(`[WebhookManager] ${webhook.name} 发送到 ${webhook.url} 失败，等待 ${delay}ms 后重试 (attempt ${attempt + 1}/${MAX_RETRIES})`);
		await sleep(delay);
		return this.sendWithRetry(webhook, payload, attempt + 1);
	}

	/**
	 * 计算重试延迟（指数退避 + 随机抖动）
	 */
	private getRetryDelay(attempt: number): number {
		const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
		return delay + Math.random() * 1000; // 添加随机抖动避免惊群
	}

	/**
	 * 生成 HMAC-SHA256 签名
	 */
	private sign(payload: string, secret: string): string {
		return crypto.createHmac('sha256', secret).update(payload).digest('hex');
	}

	// #endregion

	// #region 测试功能

	/**
	 * 测试 Webhook 连通性
	 */
	async test(id: string): Promise<{ success: boolean; message: string }> {
		const webhook = this.webhooks.get(id);
		if (!webhook) {
			return { success: false, message: 'Webhook 不存在' };
		}

		const testPayload: WebhookPayload = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			event: 'notification',
			data: {
				notificationId: 0,
				notification: {
					time: Date.now(),
					content: '这是一条测试消息',
					level: 0,
				},
			},
		};

		try {
			const success = await this.send(webhook, testPayload);
			return {
				success,
				message: success ? '测试成功' : '请求失败（非 2xx 响应）',
			};
		} catch (error) {
			return {
				success: false,
				message: `请求异常: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * 验证签名（供客户端使用）
	 */
	static verifySignature(payload: string, signature: string, secret: string): boolean {
		const expectedSignature = crypto
			.createHmac('sha256', secret)
			.update(payload)
			.digest('hex');
		return `sha256=${expectedSignature}` === signature;
	}

	// #endregion
}

export const webhookManager = new WebhookManager();
