# DeepSeek Harness Session Cleaner Plugin (`dsh-clean-session`)

[中文说明](#中文说明) | [English Documentation](#english-documentation)

---

## 中文说明

### 📌 背景与痛点

在官方原版的 **DeepSeek Harness (DSH)** 中：
- 侧边栏对会话的操作仅有 **“归档会话” (Archive Session)**。
- 归档仅仅是将 `sessionId` 添加至 `~/.dsh/storages/workspace.json` 中的 `archivedSessionIds` 列表，并通过前端过滤器隐藏。切换“显示已归档”后，会话依然存在。
- 磁盘上的核心会话数据（`~/.dsh/sessions/<workspace>/session-<id>/`，包含 `session.v4.jsonl.zstd`、执行历史等）以及投影缓存（`~/.dsh/storages/session_projcache/sessions/<id>.json`）**永远不会被删除**，不仅持续占用磁盘空间，更存在敏感代码和上下文无法销毁的隐私泄露风险。

**`dsh-clean-session`** 是专为 DeepSeek Harness 设计的原生增强插件，赋予系统**彻底物理删除会话**的能力。

---

### ✨ 核心特性

1. **彻底物理擦除（双重铁锁机制）**：
   - 物理删除 `~/.dsh/sessions/*/session-<id>` 目录下的所有日志、锁文件与执行历史。
   - 直接原子清洗 `~/.dsh/storages/workspace.json` 与投影缓存，彻底杜绝目录折叠重新展开时死灰复燃。
   - 同步清除 `~/.dsh/storages/session_projcache/sessions/<id>.json` 投影缓存文件。
2. **轻量丝滑交互（免弹窗打扰）**：
   - 借助 DSH 官方 Slot 扩展点，无缝嵌入侧边栏右键菜单。
   - 红色醒目警示，**点击即删、瞬时平滑折叠淡出**，免去多余弹窗烦恼。
3. **全平台无缝兼容**：
   - **macOS**：原生支持，提供 bash 脚本与 Node 命令；
   - **Ubuntu / Debian / Linux**：原生 POSIX 路径适配与权限支持；
   - **Windows**：自动使用 NTFS `junction` 目录联接（无需管理员权限），防御盘符大小写不一致与并发文件锁定。
4. **银行级安全防护**：
   - **严格 UUID 校验**：基于 RFC 4122 正则拦截任何非标准输入，防止注入。
   - **白名单路径防穿越 (Path Traversal Protection)**：所有物理操作均通过绝对路径归一化与白名单边界判定，坚决杜绝越界破坏。
   - **优雅停滞**：删除前自动触发任务停止逻辑并释放内存句柄。
5. **路由防悬空守卫**：
   - 若被删除的会话正好是当前激活浏览的窗口，删除后自动安全重定向回主页，防止页面停留在 404 失效会话。

---

### 🚀 快速安装（多系统支持）

#### 方式一：全平台通用命令 (推荐，macOS / Ubuntu / Windows 通用)

进入插件目录，使用 Node.js 运行安装：
```bash
npm run install-plugin
```
*或者直接执行：*
```bash
node scripts/install.mjs
```

#### 方式二：Windows 专属一键安装

- **CMD / 资源管理器**：双击运行 `install.bat`
- **PowerShell**：执行 `.\install.ps1`

#### 方式三：macOS / Ubuntu / Linux Bash 脚本

终端运行：
```bash
./install.sh
```

> **安装后生效**：完全退出并重新打开 DeepSeek Harness 桌面应用（macOS 请按 `Cmd + Q`）。

---

### 🖥️ 使用方法

1. 启动 DeepSeek Harness；
2. 在左侧工作区展开会话列表，鼠标右键点击任意需要彻底删除的会话；
3. 在弹出的菜单项底部，点击红色的 **「彻底删除会话」**；
4. 该会话条目将在 0.2 秒内平滑淡出，后台自动从物理存储和磁盘中彻底抹除。

---

### 🗑️ 卸载插件

全平台通用卸载命令：
```bash
npm run uninstall-plugin
```
*(在 Linux/macOS 上亦可运行 `./uninstall.sh`)*

---
---

## English Documentation

### 📌 Overview & Pain Point

In vanilla **DeepSeek Harness (DSH)**:
- Users only have the **"Archive Session"** option in the workspace sidebar.
- Archiving merely adds the session ID into `archivedSessionIds` in `~/.dsh/storages/workspace.json`. Switching the filter reveals the session again.
- The physical session records on disk (`~/.dsh/sessions/<workspace>/session-<id>/`) and projection caches (`~/.dsh/storages/session_projcache/sessions/<id>.json`) **are never deleted**.

**`dsh-clean-session`** is an official-standard plugin for DeepSeek Harness that provides the capability to **permanently delete and physically purge sessions**.

---

### 🚀 Cross-Platform Installation

#### Method 1: Universal npm command (macOS / Ubuntu / Windows)
```bash
npm run install-plugin
```

#### Method 2: Windows Native
- Double-click `install.bat`
- Or in PowerShell: `.\install.ps1`

#### Method 3: Linux / macOS
```bash
./install.sh
```

Then restart DeepSeek Harness completely.
