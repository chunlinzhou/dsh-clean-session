/**
 * @file uninstall.mjs
 * @description 跨平台一键卸载脚本 (支持 Windows、Ubuntu/Linux、macOS)
 */

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const PLUGIN_NAME = "dsh-clean-session";
const TARGET_PROFILE = join(homedir(), ".dsh", "profiles", "desktop");
const TARGET_LINK = join(TARGET_PROFILE, "node_modules", PLUGIN_NAME);
const PROFILE_PKG = join(TARGET_PROFILE, "package.json");

console.log("==========================================================");
console.log(`   卸载 DeepSeek Harness 彻底删除会话插件 (${platform()})`);
console.log(`   Uninstalling ${PLUGIN_NAME}...`);
console.log("==========================================================");

// 1. 删除插件链接
if (existsSync(TARGET_LINK)) {
	console.log(`[1/2] 正在移除插件链接: ${TARGET_LINK}...`);
	try {
		rmSync(TARGET_LINK, { recursive: true, force: true });
		console.log("      插件链接已移除。");
	} catch (err) {
		console.error(`      移除链接失败: ${err.message}`);
	}
} else {
	console.log("[1/2] 未检测到插件安装链接，跳过。");
}

// 2. 从 package.json 移除 bundle
if (existsSync(PROFILE_PKG)) {
	console.log(`[2/2] 正在从 ${PROFILE_PKG} 注销插件...`);
	try {
		const pkg = JSON.parse(readFileSync(PROFILE_PKG, "utf8"));

		if (pkg.dependencies && pkg.dependencies[PLUGIN_NAME]) {
			delete pkg.dependencies[PLUGIN_NAME];
		}

		if (pkg.dsh?.profile && Array.isArray(pkg.dsh.profile.bundles)) {
			pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter((b) => b !== PLUGIN_NAME);
		}

		writeFileSync(PROFILE_PKG, JSON.stringify(pkg, null, 2), "utf8");
		console.log("      配置文件已成功清理。");
	} catch (err) {
		console.error(`      清理配置失败: ${err.message}`);
	}
}

console.log("==========================================================");
console.log(" 插件已成功卸载！");
console.log(" 请完全重启 DeepSeek Harness 应用以恢复原始状态。");
console.log("==========================================================");
