/**
 * @file index.js
 * @description DeepSeek Harness (DSH) 彻底删除会话插件 - Host 服务端入口
 * 
 * 核心职责：
 * 1. 接收来自 Web 前端的删除请求并进行严格的安全防御校验；
 * 2. 优雅停滞与销毁运行中的智能体活会话；
 * 3. 解除会话在 Workspace 注册表中的关联，清理置顶与归档状态；
 * 4. 彻底物理擦除磁盘上的会话日志文件夹与投影缓存文件；
 * 5. 触发核心领域事件，广播通知所有客户端更新视图。
 */

import { rm, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { validateSessionId, isPathSafeWithin, locateSafeTargets } from "./security.js";

// Cordis 插件元信息与依赖注入声明
export const name = "dsh-plugin-session-cleaner";
export const inject = ["connection", "workspaceRegistry"];

/**
 * 插件生命周期挂载函数
 * @param {import("@deepseek-ai/cordis").Context} ctx - Cordis 上下文容器
 */
export function apply(ctx) {
	const connection = ctx.get("connection");
	const dshHome = resolve(homedir(), ".dsh");

	// 注册会话物理删除 API 路由
	connection.route({
		path: "/api/session-cleaner/delete",
		methods: ["POST"],
		requestBody: "buffered",
		fetch: async (request) => {
			let rawSessionId;

			// 1. 请求体解析与安全预检
			try {
				const body = await request.json();
				rawSessionId = body?.sessionId;
			} catch {
				return Response.json(
					{ ok: false, error: "请求格式错误：必须为合法 JSON (Invalid JSON payload)" },
					{ status: 400, headers: { "cache-control": "no-store" } }
				);
			}

			// 2. 严格校验 Session ID (防注入与路径穿越)
			let cleanSessionId;
			try {
				cleanSessionId = validateSessionId(rawSessionId);
			} catch (validationErr) {
				return Response.json(
					{ ok: false, error: validationErr.message },
					{ status: 400, headers: { "cache-control": "no-store" } }
				);
			}

			// 3. 执行彻底清理流水线
			try {
				const result = await purgeSession(ctx, dshHome, cleanSessionId);
				return Response.json(
					{ ok: true, sessionId: cleanSessionId, details: result },
					{ headers: { "cache-control": "no-store" } }
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				ctx.logger?.error(`[session-cleaner] 删除会话 "${cleanSessionId}" 失败:`, err);
				return Response.json(
					{ ok: false, error: `删除失败: ${message}` },
					{ status: 500, headers: { "cache-control": "no-store" } }
				);
			}
		}
	});

	ctx.logger?.info("[session-cleaner] 彻底删除会话服务已就绪 (Route /api/session-cleaner/delete registered)");
}

/**
 * 会话物理与逻辑彻底擦除流水线
 * 
 * @param {import("@deepseek-ai/cordis").Context} ctx 
 * @param {string} dshHome - ~/.dsh 根目录
 * @param {string} sessionId - 经过严格校验的干净 UUID
 */
async function purgeSession(ctx, dshHome, sessionId) {
	const registry = ctx.workspaceRegistry;
	const purgeReport = {
		stoppedActivity: false,
		detachedWorkspaces: 0,
		removedArchived: false,
		removedPinned: false,
		deletedSessionFolders: [],
		deletedProjCache: false
	};

	// ---------------------------------------------------------
	// 阶段 1：优雅终止可能正在运行的会话活动
	// ---------------------------------------------------------
	try {
		if (typeof registry.stopSessionActivity === "function") {
			await registry.stopSessionActivity(sessionId);
			purgeReport.stoppedActivity = true;
		}
	} catch (err) {
		ctx.logger?.warn(`[session-cleaner] 尝试停止会话活动时产生警告: ${err}`);
	}

	// 释放内存常驻活会话实例
	try {
		const liveSessions = ctx.get("sessions");
		const resident = liveSessions?.get?.(sessionId);
		if (resident) {
			if (typeof resident[Symbol.asyncDispose] === "function") {
				await resident[Symbol.asyncDispose]();
			} else if (typeof resident[Symbol.dispose] === "function") {
				resident[Symbol.dispose]();
			}
		}
	} catch {}

	// ---------------------------------------------------------
	// 阶段 2：解除 Workspace 实体所属关系与全局集合标记
	// ---------------------------------------------------------
	if (registry.entities) {
		for (const ws of registry.entities.values()) {
			if (ws.record?.sessionIds?.includes(sessionId)) {
				await ws.detachSession(sessionId);
				purgeReport.detachedWorkspaces += 1;
			}
		}
	}

	// 若处于已归档集合，则从已归档列表中剔除
	if (registry.archivedSessionIds?.includes(sessionId)) {
		await registry.unarchiveSession(sessionId);
		purgeReport.removedArchived = true;
	}

	// 若处于置顶集合，解除置顶
	if (registry.pinnedSessionIds?.includes(sessionId)) {
		await registry.unpinSession(sessionId);
		purgeReport.removedPinned = true;
	}

	// ---------------------------------------------------------
	// 阶段 3：安全定位并物理删除磁盘上的会话文件与投影缓存
	// ---------------------------------------------------------
	const safeTargets = locateSafeTargets(dshHome, sessionId);

	// 3.1 遍历扫描并在白名单内彻底删除 session 目录
	try {
		const wsEntries = await readdir(safeTargets.sessionsRootDir);
		for (const wsEntry of wsEntries) {
			const candidateDir = resolve(safeTargets.sessionsRootDir, wsEntry, safeTargets.expectedFolderName);

			// 严格防穿越检查：确保必须位于 sessionsRootDir 下子目录内
			if (isPathSafeWithin(candidateDir, safeTargets.sessionsRootDir)) {
				try {
					await rm(candidateDir, { recursive: true, force: true });
					purgeReport.deletedSessionFolders.push(candidateDir);
				} catch {}
			}
		}
	} catch (readErr) {
		ctx.logger?.warn(`[session-cleaner] 读取 sessions 目录失败: ${readErr}`);
	}

	// 3.2 物理删除投影缓存文件
	try {
		await rm(safeTargets.projCacheFile, { force: true });
		purgeReport.deletedProjCache = true;
	} catch {}

	// ---------------------------------------------------------
	// 阶段 4：系统级事件通知（触发客户端自动注销会话）
	// ---------------------------------------------------------
	// DSH 原生的 dsh-api-remotes 服务监听此事件，自动向前端推送注销帧
	ctx.emit("api-session/removed", sessionId);

	return purgeReport;
}
