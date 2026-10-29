/**
 * @file security.test.js
 * @description 核心安全逻辑自动化测试套件
 */

import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { validateSessionId, isPathSafeWithin, locateSafeTargets } from "../lib/security.js";

test("安全校验: 合法 UUID 正常识别并规范化", () => {
	const validUuid = "4eb521df-a1db-4f73-b0ec-e620b4b02b42";
	const res = validateSessionId(validUuid);
	assert.equal(res, validUuid);

	// 支持 session- 前缀
	const withPrefix = "session-4eb521df-a1db-4f73-b0ec-e620b4b02b42";
	assert.equal(validateSessionId(withPrefix), validUuid);

	// 大写字母自动转小写
	const upper = "4EB521DF-A1DB-4F73-B0EC-E620B4B02B42";
	assert.equal(validateSessionId(upper), validUuid);
});

test("安全校验: 坚决防御路径穿越与恶意输入 (Path Traversal Protection)", () => {
	const dangerousInputs = [
		"../../etc/passwd",
		"../sessions",
		"4eb521df-a1db-4f73-b0ec-e620b4b02b42/../..",
		"4eb521df-a1db-4f73-b0ec-e620b4b02b42/sub",
		"session-../../secret",
		"session-*; rm -rf /",
		"",
		"   ",
		null,
		undefined,
		12345,
		{},
		"invalid-uuid-string"
	];

	for (const input of dangerousInputs) {
		assert.throws(
			() => validateSessionId(input),
			(err) => err instanceof Error,
			`输入 "${input}" 未被安全拦截！`
		);
	}
});

test("路径越界校验: isPathSafeWithin 严格限定在基准目录内", () => {
	const baseDir = "/Users/test/.dsh/sessions";

	// 合法内部路径
	assert.equal(
		isPathSafeWithin("/Users/test/.dsh/sessions/workspace1/session-1", baseDir),
		true
	);

	// 非法穿越路径
	assert.equal(isPathSafeWithin("/Users/test/.dsh/sessions/../storages", baseDir), false);
	assert.equal(isPathSafeWithin("/Users/test/.dsh/sessions/..", baseDir), false);
	assert.equal(isPathSafeWithin("/Users/test/.dsh/sessions", baseDir), false); // 不能是 baseDir 本身
	assert.equal(isPathSafeWithin("/etc/passwd", baseDir), false);
});

test("目标文件安全定位: locateSafeTargets 输出白名单内安全路径", () => {
	const fakeHome = "/Users/test/.dsh";
	const validId = "4eb521df-a1db-4f73-b0ec-e620b4b02b42";

	const targets = locateSafeTargets(fakeHome, validId);

	assert.equal(targets.expectedFolderName, `session-${validId}`);
	assert.equal(
		targets.projCacheFile,
		resolve("/Users/test/.dsh/storages/session_projcache/sessions", `${validId}.json`)
	);
	assert.equal(targets.sessionsRootDir, resolve("/Users/test/.dsh/sessions"));
});
