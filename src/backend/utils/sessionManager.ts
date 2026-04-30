import { randomString } from '@common/utils';

interface SessionData {
	sessionId: string;
	username: string;
	loginTime: number;
	functionLevel: number;
}

const sessions = new Map<string, SessionData>();

export const sessionManager = {
	/**
	 * 创建 Session
	 * @param username 用户名
	 * @param functionLevel 功能等级
	 * @returns sessionId
	 */
	createSession(username: string, functionLevel: number): string {
		const sessionId = randomString(32);
		sessions.set(sessionId, {
			sessionId,
			username,
			loginTime: Date.now(),
			functionLevel,
		});
		return sessionId;
	},

	/**
	 * 验证 Session
	 * @param sessionId 会话 ID
	 * @returns Session 数据，如果不存在则返回 null
	 */
	verifySession(sessionId: string): SessionData | null {
		return sessions.get(sessionId) || null;
	},

	/**
	 * 删除 Session（登出或掉线时调用）
	 * @param sessionId 会话 ID
	 */
	removeSession(sessionId: string): void {
		sessions.delete(sessionId);
	},

	/**
	 * 更新 Session 的功能等级
	 * @param sessionId 会话 ID
	 * @param functionLevel 新的功能等级
	 */
	updateFunctionLevel(sessionId: string, functionLevel: number): void {
		const session = sessions.get(sessionId);
		if (session) {
			session.functionLevel = functionLevel;
		}
	},

	/**
	 * 获取所有 Session（调试用）
	 */
	getAllSessions(): Map<string, SessionData> {
		return new Map(sessions);
	},

	/**
	 * 获取 Session 数量
	 */
	getSessionCount(): number {
		return sessions.size;
	},
};