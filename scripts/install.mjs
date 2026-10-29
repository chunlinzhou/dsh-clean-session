/**
 * @file install.mjs
 * @description 跨平台一键安装脚本 (支持 Windows、Ubuntu/Linux、macOS)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir, platform } from "node:os";

const PLUGIN_NAME = "dsh-clean-session";
const CURRENT_DIR = resolve(".");
const TARGET_PROFILE = join(homedir(), ".dsh", "profiles", "desktop");
const NODE_MODULES_DIR = join(TARGET_PROFILE, "node_modules");
const TARGET_LINK = join(NODE_MODULES_DIR, PLUGIN_NAME);
const PROFILE_PKG = join(TARGET_PROFILE, "package.json");

console.log("==========================================================");
console.log(`   安装 DeepSeek Harness 彻底删除会话插件 (${platform()})`);
console.log(`   Installing ${PLUGIN_NAME}...`);
console.log("==========================================================");

if (!existsSync(TARGET_PROFILE)) {
	console.error(`错误: 未检测到 DSH 桌面配置文件目录: ${TARGET_PROFILE}`);
	console.error("请确保已安装并至少启动过一次 DeepSeek Harness。");
	process.exit(1);
}

// 1. 创建 node_modules 目录与符号链接
mkdirSync(NODE_MODULES_DIR, { recursive: true });

if (existsSync(TARGET_LINK)) {
	console.log("[1/3] 检测到已存在插件链接，正在清理旧版本...");
	rmSync(TARGET_LINK, { recursive: true, force: true });
}

try {
	// 在 Windows 上使用 junction 目录联接 (无需管理员权限)；在 Linux / macOS 上使用 dir 符号链接
	const symlinkType = platform() === "win32" ? "junction" : "dir";
	symlinkSync(CURRENT_DIR, TARGET_LINK, symlinkType);
	console.log(`[1/3] 插件目录链接建立成功 (${symlinkType}): ${TARGET_LINK} -> ${CURRENT_DIR}`);
} catch (err) {
	console.error(`[1/3] 建立链接失败: ${err.message}`);
	process.exit(1);
}

// 2. 更新 desktop profile 的 package.json，注册 bundle
if (existsSync(PROFILE_PKG)) {
	console.log(`[2/3] 配置 ${PROFILE_PKG} 注册插件 bundle...`);
	try {
		const pkg = JSON.parse(readFileSync(PROFILE_PKG, "utf8"));

		pkg.dependencies = pkg.dependencies || {};
		pkg.dependencies[PLUGIN_NAME] = "1.0.0";

		if (pkg.dsh?.profile && Array.isArray(pkg.dsh.profile.bundles)) {
			if (!pkg.dsh.profile.bundles.includes(PLUGIN_NAME)) {
				pkg.dsh.profile.bundles.push(PLUGIN_NAME);
			}
		}

		writeFileSync(PROFILE_PKG, JSON.stringify(pkg, null, 2), "utf8");
		console.log("      配置文件已成功写入。");
	} catch (err) {
		console.error(`      写入配置失败: ${err.message}`);
		process.exit(1);
	}
} else {
	console.warn(`[2/3] 警告: 未找到 ${PROFILE_PKG}，跳过 bundle 注册。`);
}

console.log("[3/3] 安装完成！");
console.log("==========================================================");
console.log(" 插件安装成功！");
console.log(" 请完全退出并重启 DeepSeek Harness 桌面应用以生效。");
console.log(" 在左侧边栏右键任意会话，即可看到红色的「彻底删除会话」选项。");
console.log("==========================================================");
