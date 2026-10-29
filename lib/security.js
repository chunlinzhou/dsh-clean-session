/**
 * @file security.js
 * @description 安全防线模块：负责输入参数校验、路径越界防护及目标资源白名单判定
 */

import { resolve, normalize, sep } from "node:path";
import { readdir, stat } from "node:fs/promises";

/**
 * 标准 UUID 正则表达式 (RFC 4122)
 * 仅允许小写/大写 16 进制数字与连字符，防止任何路径遍历字符 (如 ../ 或斜杠)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 校验并规范化 Session ID
 * @param {unknown} rawId - 用户输入的原始 Session ID
 * @returns {string} 校验通过的标准 UUID 字符串
 * @throws {TypeError|Error} 当输入非法或格式不匹配时抛出
 */
export function validateSessionId(rawId) {
	if (typeof rawId !== "string" || rawId.trim() === "") {
		throw new TypeError("Session ID 必须是非空字符串 (Session ID must be a non-empty string)");
	}

	const trimmed = rawId.trim();

	// 兼容处理可能带有的 'session-' 前缀
	const cleanId = trimmed.startsWith("session-") ? trimmed.slice("session-".length) : trimmed;

	if (!UUID_REGEX.test(cleanId)) {
		throw new Error(
			`非法的 Session ID 格式: "${trimmed}"。必须是标准的 UUID 格式，禁止包含路径遍历字符。`
		);
	}

	return cleanId.toLowerCase();
}

/**
 * 严格校验目标路径是否完全包含在基础目录之内 (防止路径穿越 / Path Traversal)
 * @param {string} targetPath - 待检查的目标路径
 * @param {string} baseDir - 允许操作的基准目录
 * @returns {boolean} 若目标在基准目录内且不为基准目录本身则返回 true
 */
export function isPathSafeWithin(targetPath, baseDir) {
	const resolvedTarget = resolve(normalize(targetPath));
	const resolvedBase = resolve(normalize(baseDir));

	// 必须以 baseDir + 分隔符 开头，确保不能是 baseDir 本身，也不能通过相对路径跳出
	return resolvedTarget.startsWith(resolvedBase + sep);
}

/**
 * 安全定位与该会话相关的物理磁盘文件列表
 * 仅搜索白名单路径：
 *  1. ~/.dsh/sessions/<workspace>/session-<cleanId>
 *  2. ~/.dsh/storages/session_projcache/sessions/<cleanId>.json
 *
 * @param {string} dshHome - ~/.dsh 根目录路径
 * @param {string} cleanId - 已经过 validateSessionId 校验的安全 UUID
 * @returns {Promise<{ sessionDirs: string[], projCacheFile: string }>} 验证安全的待清理文件路径
 */
export function locateSafeTargets(dshHome, cleanId) {
	const safeDshHome = resolve(dshHome);

	// 1. 投影缓存文件安全路径
	const projCacheDir = resolve(safeDshHome, "storages", "session_projcache", "sessions");
	const projCacheFile = resolve(projCacheDir, `${cleanId}.json`);

	if (!isPathSafeWithin(projCacheFile, projCacheDir)) {
		throw new Error(`投影缓存路径安全性校验失败: ${projCacheFile}`);
	}

	// 2. 会话存储目录路径
	const sessionsRootDir = resolve(safeDshHome, "sessions");

	return {
		sessionsRootDir,
		projCacheFile,
		expectedFolderName: `session-${cleanId}`
	};
}
