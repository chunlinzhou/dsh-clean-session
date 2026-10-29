#!/usr/bin/env bash
# ==============================================================================
# dsh-plugin-session-cleaner 一键安装与配置脚本 (Install Script)
# ==============================================================================

set -euo pipefail

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_PROFILE="${HOME}/.dsh/profiles/desktop"
PLUGIN_NAME="dsh-plugin-session-cleaner"

echo "=========================================================="
echo "   安装 DeepSeek Harness 彻底删除会话插件"
echo "   Installing ${PLUGIN_NAME}..."
echo "=========================================================="

if [ ! -d "${TARGET_PROFILE}" ]; then
  echo "错误: 未检测到 DSH 桌面配置文件目录: ${TARGET_PROFILE}"
  echo "请确保已安装并至少启动过一次 DeepSeek Harness。"
  exit 1
fi

# 1. 软链接插件到 desktop 的 node_modules 目录
NODE_MODULES_DIR="${TARGET_PROFILE}/node_modules"
mkdir -p "${NODE_MODULES_DIR}"

TARGET_LINK="${NODE_MODULES_DIR}/${PLUGIN_NAME}"
if [ -L "${TARGET_LINK}" ] || [ -d "${TARGET_LINK}" ]; then
  echo "[1/3] 检测到已存在插件链接，正在更新..."
  rm -rf "${TARGET_LINK}"
fi

ln -s "${CURRENT_DIR}" "${TARGET_LINK}"
echo "[1/3] 插件目录软链接已建立: ${TARGET_LINK} -> ${CURRENT_DIR}"

# 2. 更新 desktop profile 的 package.json，注册 bundle
PROFILE_PKG="${TARGET_PROFILE}/package.json"

if [ -f "${PROFILE_PKG}" ]; then
  echo "[2/3] 配置 ${PROFILE_PKG} 注册插件 bundle..."
  node -e "
    const fs = require('fs');
    const path = '${PROFILE_PKG}';
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

    // 确保 dependencies 中有记录
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies['${PLUGIN_NAME}'] = '1.0.0';

    // 确保 dsh.profile.bundles 中包含此插件
    if (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)) {
      if (!pkg.dsh.profile.bundles.includes('${PLUGIN_NAME}')) {
        pkg.dsh.profile.bundles.push('${PLUGIN_NAME}');
      }
    }

    fs.writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('      配置文件已成功写入。');
  "
else
  echo "[2/3] 警告: 未找到 ${PROFILE_PKG}，跳过 bundle 注册。"
fi

echo "[3/3] 安装完成！"
echo "=========================================================="
echo " 插件安装成功！"
echo " 请完全退出并重启 DeepSeek Harness 桌面应用以生效。"
echo " 在左侧边栏右键任意会话，即可看到红色的「彻底删除会话」选项。"
echo "=========================================================="
