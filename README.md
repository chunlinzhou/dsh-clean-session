# DeepSeek Harness Session Cleaner Plugin (`dsh-plugin-session-cleaner`)

[中文说明](#中文说明) | [English Documentation](#english-documentation)

---

## 中文说明

### 📌 背景与痛点

在官方原版的 **DeepSeek Harness (DSH)** 中：
- 侧边栏对会话的操作仅有 **“归档会话” (Archive Session)**。
- 归档仅仅是将 `sessionId` 添加至 `~/.dsh/storages/workspace.json` 中的 `archivedSessionIds` 列表，并通过前端过滤器隐藏。切换“显示已归档”后，会话依然存在。
- 磁盘上的核心会话数据（`~/.dsh/sessions/<workspace>/session-<id>/`，包含 `session.v4.jsonl.zstd`、执行历史等）以及投影缓存（`~/.dsh/storages/session_projcache/sessions/<id>.json`）**永远不会被删除**，不仅持续占用磁盘空间，更存在敏感代码和上下文无法销毁的隐私泄露风险。

**`dsh-plugin-session-cleaner`** 是专为 DeepSeek Harness 设计的原生增强插件，赋予系统**彻底物理删除会话**的能力。

---

### ✨ 核心特性

1. **彻底物理擦除**：
   - 物理删除 `~/.dsh/sessions/*/session-<id>` 目录下的所有日志、锁文件与元数据。
   - 同步清除 `~/.dsh/storages/session_projcache/sessions/<id>.json` 投影缓存文件。
   - 自动触发 SQLite 全文检索索引自愈，彻底销毁历史残留。
2. **原生无缝交互**：
   - 借助 DSH 官方的 Slot 机制，无缝嵌入侧边栏会话的右键菜单。
   - 红色警示标记，配备二次确认模态弹窗，杜绝手滑误删。
3. **银行级安全防护**：
   - **严格 UUID 校验**：基于 RFC 4122 正则拦截任何非标准输入，防止注入。
   - **白名单路径防穿越 (Path Traversal Protection)**：所有物理操作均通过绝对路径归一化与白名单边界判定，坚决杜绝越界破坏。
   - **并发与优雅停滞**：删除前自动触发任务停止逻辑并释放内存句柄，防止文件占用死锁。
4. **路由防悬空守卫**：
   - 若被删除的会话正好是当前激活浏览的窗口，删除后自动安全重定向回主页，防止页面停留在 404 失效会话。

---

### 🚀 快速安装

#### 方式一：一键脚本安装 (推荐)

进入本插件根目录，直接运行安装脚本：
```bash
./install.sh
```
该脚本会自动：
1. 将插件软链接到 DSH 的桌面配置模块 `~/.dsh/profiles/desktop/node_modules/`；
2. 自动在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 中注册该插件。

安装完成后，**完全退出并重启 DeepSeek Harness** 桌面应用即可。

#### 方式二：手动配置安装

1. 将本仓库目录链接或复制到 DSH 桌面配置目录下：
   ```bash
   ln -s "$(pwd)" "${HOME}/.dsh/profiles/desktop/node_modules/dsh-plugin-session-cleaner"
   ```
2. 编辑 `~/.dsh/profiles/desktop/package.json`，在 `dependencies` 和 `dsh.profile.bundles` 中添加本插件：
   ```json
   {
     "dependencies": {
       "dsh-plugin-session-cleaner": "1.0.0"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "...",
           "dsh-plugin-session-cleaner"
         ]
       }
     }
   }
   ```
3. 重启 DeepSeek Harness 应用。

---

### 🖥️ 使用方法

1. 启动 DeepSeek Harness；
2. 在左侧工作区展开会话列表，鼠标右键点击任意需要彻底删除的会话；
3. 在弹出的菜单项底部，点击红色的 **「彻底删除会话」**；
4. 在弹出的确认弹窗中，点击 **「确认永久删除」**；
5. 该会话将瞬间从列表消失，磁盘文件被彻底擦除。

---

### 🛡️ 安全机制说明

| 潜在威胁 | 防御实现策略 |
| :--- | :--- |
| **路径遍历攻击 (如 `../../etc/passwd`)** | `lib/security.js` 中使用严格 UUID 正则，拦截任何包含 `/`、`\`、`..` 的非法输入 |
| **越界文件删除** | `isPathSafeWithin` 校验解析后的绝对路径必须严格从 `~/.dsh/sessions/` 或 `~/.dsh/storages/` 起始 |
| **正在运行的任务文件锁死** | 执行删除前调用 `registry.stopSessionActivity(sessionId)` 优雅中断活任务 |
| **已删除会话页面报错** | 前端检测 `window.location.hash`，匹配被删会话时自动推回主页 `# /` |

---

### 🗑️ 卸载插件

直接运行提供的卸载脚本：
```bash
./uninstall.sh
```
然后重启应用即可完全恢复原生状态。

---
---

## English Documentation

### 📌 Overview & Pain Point

In vanilla **DeepSeek Harness (DSH)**:
- Users only have the **"Archive Session"** option in the workspace sidebar.
- Archiving merely adds the session ID into `archivedSessionIds` in `~/.dsh/storages/workspace.json` and hides it using UI filter rules. Switching the filter to "Show Archived" reveals the session again.
- The physical session records on disk (`~/.dsh/sessions/<workspace>/session-<id>/`, containing `session.v4.jsonl.zstd`, locks, execution logs) and projection caches (`~/.dsh/storages/session_projcache/sessions/<id>.json`) **are never deleted**. This leads to unnecessary disk usage and potential privacy/data leak risks for sensitive code and instructions.

**`dsh-plugin-session-cleaner`** is an official-standard plugin for DeepSeek Harness that provides the capability to **permanently delete and physically purge sessions**.

---

### ✨ Key Features

1. **True Physical Purge**:
   - Recursively deletes session directories under `~/.dsh/sessions/*/session-<id>`.
   - Cleans up projection checkpoints in `~/.dsh/storages/session_projcache/sessions/<id>.json`.
   - Triggers SQLite full-text search index self-healing to eliminate stale search records.
2. **Native Seamless Integration**:
   - Integrates cleanly into the workspace session context menu using DSH's native Slot architecture.
   - Distinctive red warning item with a secondary confirmation modal dialog to avoid accidental clicks.
3. **Industrial-Grade Safety**:
   - **Strict UUID Validation**: Enforces RFC 4122 compliance to reject any malicious inputs.
   - **Path Traversal Protection**: All file operations are checked with path resolution and whitelist boundaries.
   - **Graceful Termination**: In-flight tasks are stopped (`stopSessionActivity`) and active handles disposed before file deletion.
4. **Navigation Guard**:
   - If the active session is deleted, the browser URL automatically routes back to the home page, preventing 404 or detached UI states.

---

### 🚀 Quick Start

#### Method 1: One-Click Script (Recommended)

Run the automated install script from the plugin directory:
```bash
./install.sh
```
This script will:
1. Create a symlink under `~/.dsh/profiles/desktop/node_modules/`;
2. Register the bundle inside `~/.dsh/profiles/desktop/package.json`.

After installation, **completely quit and relaunch DeepSeek Harness**.

#### Method 2: Manual Installation

1. Link or copy this directory into the DSH profile:
   ```bash
   ln -s "$(pwd)" "${HOME}/.dsh/profiles/desktop/node_modules/dsh-plugin-session-cleaner"
   ```
2. Update `~/.dsh/profiles/desktop/package.json`:
   ```json
   {
     "dependencies": {
       "dsh-plugin-session-cleaner": "1.0.0"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "...",
           "dsh-plugin-session-cleaner"
         ]
       }
     }
   }
   ```
3. Restart DeepSeek Harness.

---

### 🖥️ How to Use

1. Launch DeepSeek Harness;
2. Right-click on any session row in the left sidebar;
3. Click the red **"彻底删除会话" (Delete Session Permanently)** menu option;
4. Confirm the operation in the popup modal;
5. The session is immediately detached from the UI and erased from disk.

---

### 🗑️ Uninstallation

Run the provided uninstall script:
```bash
./uninstall.sh
```
Then restart DeepSeek Harness.
