#!/usr/bin/env bash
# ==============================================================================
# dsh-plugin-session-cleaner 一键卸载脚本 (Uninstall Script)
# ==============================================================================

set -euo pipefail

TARGET_PROFILE="${HOME}/.dsh/profiles/desktop"
PLUGIN_NAME="dsh-clean-session"

echo "=========================================================="
echo "   卸载 DeepSeek Harness 彻底删除会话插件"
echo "   Uninstalling ${PLUGIN_NAME}..."
echo "=========================================================="

TARGET_LINK="${TARGET_PROFILE}/node_modules/${PLUGIN_NAME}"
if [ -L "${TARGET_LINK}" ] || [ -d "${TARGET_LINK}" ]; then
  rm -rf "${TARGET_LINK}"
  echo "[1/2] 移除插件模块链接: ${TARGET_LINK}"
else
  echo "[1/2] 未发现插件模块链接，跳过。"
fi

PROFILE_PKG="${TARGET_PROFILE}/package.json"
if [ -f "${PROFILE_PKG}" ]; then
  echo "[2/2] 从 ${PROFILE_PKG} 中注销插件..."
  node -e "
    const fs = require('fs');
    const path = '${PROFILE_PKG}';
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

    if (pkg.dependencies) {
      delete pkg.dependencies['${PLUGIN_NAME}'];
    }

    if (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)) {
      pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter(name => name !== '${PLUGIN_NAME}');
    }

    fs.writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('      配置文件已更新。');
  "
fi

echo "=========================================================="
echo " 卸载完成！重启 DeepSeek Harness 后插件将不再生效。"
echo "=========================================================="
