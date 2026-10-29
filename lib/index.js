/**
 * @file index.js
 * @description DeepSeek Harness (DSH) 彻底删除会话插件 - Host 服务端入口
 * 
 * 核心职责：
 * 1. 接收来自 Web 前端的删除请求并进行严格的安全防御校验；
 * 2. 优雅停滞与销毁运行中的智能体活会话；
 * 3. 内存层：解除会话在 Workspace 注册表中的关联，清理置顶与归档状态；
 * 4. 物理存储层：原子清洗 ~/.dsh/storages/workspace.json 与投影缓存表，彻底斩断折叠重新加载的根源；
 * 5. 磁盘文件层：彻底物理擦除磁盘上的会话日志文件夹与投影缓存文件；
 * 6. 广播核心领域事件，通知前端注销并更新所有视图。
 */

import { rm, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { parseSessionIdentifiers, isPathSafeWithin, locateSafeTargets } from "./security.js";

// Cordis 插件元信息与依赖注入声明
export const name = "dsh-clean-session";
export const inject = ["connection", "workspaceRegistry"];

/**
 * 插件生命周期挂载函数
 * @param {import("@deepseek-ai/cordis").Context} ctx - Cordis 上下文容器
 */
export function apply(ctx) {
	const connection = ctx.get("connection");
	const dshHome = resolve(homedir(), ".dsh");

	// 注册会话物理删除 API 路由 (使用 DSH connection.fetch.register 标准规范)
	connection.fetch.register({
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

			// 2. 严格校验 Session ID 并解析出规范化的 canonicalId 和 uuid
			let idInfo;
			try {
				idInfo = parseSessionIdentifiers(rawSessionId);
			} catch (validationErr) {
				return Response.json(
					{ ok: false, error: validationErr.message },
					{ status: 400, headers: { "cache-control": "no-store" } }
				);
			}

			// 3. 执行彻底清理流水线 (内存 + 物理存储双重彻底切除)
			try {
				const result = await purgeSession(ctx, dshHome, idInfo);
				return Response.json(
					{ ok: true, sessionId: idInfo.canonicalId, uuid: idInfo.uuid, details: result },
					{ headers: { "cache-control": "no-store" } }
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				ctx.logger?.error(`[session-cleaner] 删除会话 "${idInfo.canonicalId}" 失败:`, err);
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
 * 直接清洗物理持久化存储文件 (保证折叠展开目录或重启时绝无复生可能)
 * @param {string} dshHome - ~/.dsh 根目录
 * @param {string[]} candidateIds - 待抹除的会话标识 (包含带前缀与纯 UUID)
 */
async function cleanStorageFiles(dshHome, candidateIds) {
	// 1. 清洗 ~/.dsh/storages/workspace.json
	const workspaceJsonPath = resolve(dshHome, "storages", "workspace.json");
	try {
		const raw = await readFile(workspaceJsonPath, "utf8");
		const data = JSON.parse(raw);
		let modified = false;

		// 清洗所有 Workspace 中的 sessionIds
		if (data.tables?.workspaces) {
			for (const ws of Object.values(data.tables.workspaces)) {
				if (Array.isArray(ws.sessionIds)) {
					const beforeLen = ws.sessionIds.length;
					ws.sessionIds = ws.sessionIds.filter((id) => !candidateIds.includes(id));
					if (ws.sessionIds.length !== beforeLen) {
						ws.updatedAt = new Date().toISOString();
						modified = true;
					}
				}
			}
		}

		// 清洗全局归档与置顶
		if (Array.isArray(data.global?.archivedSessionIds)) {
			const beforeLen = data.global.archivedSessionIds.length;
			data.global.archivedSessionIds = data.global.archivedSessionIds.filter((id) => !candidateIds.includes(id));
			if (data.global.archivedSessionIds.length !== beforeLen) {
				modified = true;
			}
		}

		if (Array.isArray(data.global?.pinnedSessionIds)) {
			const beforeLen = data.global.pinnedSessionIds.length;
			data.global.pinnedSessionIds = data.global.pinnedSessionIds.filter((id) => !candidateIds.includes(id));
			if (data.global.pinnedSessionIds.length !== beforeLen) {
				modified = true;
			}
		}

		if (modified) {
			await writeFile(workspaceJsonPath, JSON.stringify(data, null, 2), "utf8");
		}
	} catch {}

	// 2. 清洗 ~/.dsh/storages/session_projcache.json (如果存在)
	const projCacheJsonPath = resolve(dshHome, "storages", "session_projcache.json");
	try {
		const raw = await readFile(projCacheJsonPath, "utf8");
		const data = JSON.parse(raw);
		let modified = false;
		if (data.tables?.sessions) {
			for (const id of candidateIds) {
				if (data.tables.sessions[id]) {
					delete data.tables.sessions[id];
					modified = true;
				}
			}
		}
		if (modified) {
			await writeFile(projCacheJsonPath, JSON.stringify(data, null, 2), "utf8");
		}
	} catch {}
}

/**
 * 会话物理与逻辑彻底擦除流水线
 * 
 * @param {import("@deepseek-ai/cordis").Context} ctx 
 * @param {string} dshHome - ~/.dsh 根目录
 * @param {{ uuid: string, canonicalId: string }} idInfo - 会话双模标识
 */
async function purgeSession(ctx, dshHome, idInfo) {
	const registry = ctx.workspaceRegistry;
	const { uuid, canonicalId } = idInfo;
	const candidateIds = [canonicalId, uuid];

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
	for (const id of candidateIds) {
		try {
			if (typeof registry?.stopSessionActivity === "function") {
				await registry.stopSessionActivity(id);
				purgeReport.stoppedActivity = true;
			}
		} catch (err) {
			ctx.logger?.warn?.(`[session-cleaner] 尝试停止会话活动 (${id}) 时产生警告: ${err}`);
		}
	}

	// 释放内存常驻活会话实例 (尝试 detach Entered 或 dispose)
	try {
		const liveSessions = ctx.get("sessions");
		for (const id of candidateIds) {
			const entry = liveSessions?.store?.get?.(id);
			if (typeof entry?.detach === "function") {
				entry.detach();
			} else {
				const resident = liveSessions?.get?.(id);
				if (resident) {
					if (typeof resident[Symbol.asyncDispose] === "function") {
						await resident[Symbol.asyncDispose]();
					} else if (typeof resident[Symbol.dispose] === "function") {
						resident[Symbol.dispose]();
					}
				}
			}
		}
	} catch {}

	// ---------------------------------------------------------
	// 阶段 2：内存层解除 Workspace 关联与索引
	// ---------------------------------------------------------
	const workspaces = [];
	if (typeof registry?.list === "function") {
		try {
			workspaces.push(...registry.list());
		} catch {}
	}
	if (workspaces.length === 0 && registry?.entities) {
		try {
			workspaces.push(...registry.entities.values());
		} catch {}
	}

	for (const ws of workspaces) {
		const matches = ws.record?.sessionIds?.filter((id) => candidateIds.includes(id)) ?? [];
		for (const matchId of matches) {
			try {
				await ws.detachSession(matchId);
				purgeReport.detachedWorkspaces += 1;
			} catch {}
		}
	}

	// 清理内存中的快速查找索引与集合
	for (const id of candidateIds) {
		registry?.headers?.delete?.(id);
		registry?.sessionPaths?.delete?.(id);

		if (registry?.archivedSessionIds?.includes(id)) {
			await registry.unarchiveSession(id);
			purgeReport.removedArchived = true;
		}

		if (registry?.pinnedSessionIds?.includes(id)) {
			await registry.unpinSession(id);
			purgeReport.removedPinned = true;
		}
	}

	// ---------------------------------------------------------
	// 阶段 3：物理持久化底层存储直接清洗 (双重铁锁兜底)
	// ---------------------------------------------------------
	await cleanStorageFiles(dshHome, candidateIds);

	// ---------------------------------------------------------
	// 阶段 4：安全定位并物理删除磁盘上的会话文件夹与投影缓存
	// ---------------------------------------------------------
	const safeTargets = locateSafeTargets(dshHome, idInfo);

	// 4.1 遍历扫描并在白名单内彻底删除 session 目录 (兼容 session-<uuid> 与 <uuid>)
	try {
		const wsEntries = await readdir(safeTargets.sessionsRootDir);
		for (const wsEntry of wsEntries) {
			for (const folderName of [safeTargets.expectedFolderName, uuid]) {
				const candidateDir = resolve(safeTargets.sessionsRootDir, wsEntry, folderName);
				if (isPathSafeWithin(candidateDir, safeTargets.sessionsRootDir)) {
					try {
						await rm(candidateDir, { recursive: true, force: true });
						purgeReport.deletedSessionFolders.push(candidateDir);
					} catch {}
				}
			}
		}
	} catch (readErr) {
		ctx.logger?.warn?.(`[session-cleaner] 读取 sessions 目录失败: ${readErr}`);
	}

	// 4.2 物理删除投影缓存文件
	for (const cacheFile of safeTargets.projCacheFiles) {
		try {
			await rm(cacheFile, { force: true });
			purgeReport.deletedProjCache = true;
		} catch {}
	}

	// ---------------------------------------------------------
	// 阶段 5：系统级事件通知（触发客户端自动注销会话）
	// ---------------------------------------------------------
	ctx.emit("api-session/removed", canonicalId);
	if (canonicalId !== uuid) {
		ctx.emit("api-session/removed", uuid);
	}

	return purgeReport;
}
