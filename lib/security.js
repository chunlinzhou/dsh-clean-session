/**
 * @file security.js
 * @description 安全防线模块：负责输入参数校验、路径越界防护及目标资源白名单判定
 */

import { resolve, normalize, sep } from "node:path";

/**
 * 标准 UUID 正则表达式 (RFC 4122)
 * 仅允许小写/大写 16 进制数字与连字符，防止任何路径遍历字符 (如 ../ 或斜杠)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 解析并校验 Session ID，返回纯 UUID 与带前缀的标准 canonicalId
 * @param {unknown} rawId - 用户输入的原始 Session ID
 * @returns {{ uuid: string, canonicalId: string }} 校验通过的纯 UUID 与带前缀的标准 ID
 * @throws {TypeError|Error} 当输入非法或格式不匹配时抛出
 */
export function parseSessionIdentifiers(rawId) {
	if (typeof rawId !== "string" || rawId.trim() === "") {
		throw new TypeError("Session ID 必须是非空字符串 (Session ID must be a non-empty string)");
	}

	const trimmed = rawId.trim();
	const cleanUuid = (trimmed.startsWith("session-") ? trimmed.slice("session-".length) : trimmed).toLowerCase();

	if (!UUID_REGEX.test(cleanUuid)) {
		throw new Error(
			`非法的 Session ID 格式: "${trimmed}"。必须是标准的 UUID 格式，禁止包含路径遍历字符。`
		);
	}

	return {
		uuid: cleanUuid,
		canonicalId: `session-${cleanUuid}`
	};
}

/**
 * 校验并规范化 Session ID (保持旧接口兼容)
 * @param {unknown} rawId - 用户输入的原始 Session ID
 * @returns {string} 纯小写 UUID 字符串
 */
export function validateSessionId(rawId) {
	return parseSessionIdentifiers(rawId).uuid;
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
 * 白名单路径：
 *  1. ~/.dsh/sessions/<workspace>/session-<cleanId>
 *  2. ~/.dsh/storages/session_projcache/sessions/<cleanId>.json 与 session-<cleanId>.json
 *
 * @param {string} dshHome - ~/.dsh 根目录路径
 * @param {string|{ uuid: string, canonicalId?: string }} idInput - 校验过的 UUID 或标识对象
 * @returns {{ sessionsRootDir: string, projCacheFiles: string[], projCacheFile: string, expectedFolderName: string }} 验证安全的待清理文件路径
 */
export function locateSafeTargets(dshHome, idInput) {
	const safeDshHome = resolve(dshHome);
	const cleanUuid = typeof idInput === "string" ? validateSessionId(idInput) : idInput.uuid;

	// 1. 投影缓存文件安全路径 (兼容 cleanId.json 与 session-cleanId.json)
	const projCacheDir = resolve(safeDshHome, "storages", "session_projcache", "sessions");
	const projCacheFile1 = resolve(projCacheDir, `${cleanUuid}.json`);
	const projCacheFile2 = resolve(projCacheDir, `session-${cleanUuid}.json`);

	if (!isPathSafeWithin(projCacheFile1, projCacheDir) || !isPathSafeWithin(projCacheFile2, projCacheDir)) {
		throw new Error(`投影缓存路径安全性校验失败: ${projCacheFile1}`);
	}

	// 2. 会话存储目录路径
	const sessionsRootDir = resolve(safeDshHome, "sessions");

	return {
		sessionsRootDir,
		projCacheFile: projCacheFile1,
		projCacheFiles: [projCacheFile1, projCacheFile2],
		expectedFolderName: `session-${cleanUuid}`
	};
}
