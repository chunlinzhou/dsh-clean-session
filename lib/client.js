/**
 * @file client.js
 * @description DeepSeek Harness (DSH) 彻底删除会话插件 - Web Client 前端注入入口
 * 
 * 核心职责：
 * 1. 在侧边栏会话条目的右键操作菜单中注入「彻底删除」选项；
 * 2. 免二次弹窗打扰：点击后立即触发侧边栏条目瞬时平滑淡出与折叠；
 * 3. 防悬空路由导航守卫：若删除的为当前浏览会话，自动重定向至主页；
 * 4. 异步调用 Host 彻底删除端点，物理抹除磁盘文件与工作区存储。
 */

window.__ModuleLoader__.load({
	id: "dsh-clean-session",
	factory: (require) => {
		const jsxRuntime = require("react/jsx-runtime");
		const { jsx: _jsx } = jsxRuntime;
		const Primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		const moduleExports = {};

		// =========================================================
		// 插件前端生命周期挂载
		// =========================================================
		function apply(ctx) {
			// 仅注入会话右键操作菜单，免弹窗打扰
			ctx.slots.inject("sidebar.workspaces.session.menu.item", () =>
				ctx.slots.register(
					{
						name: "sidebar.workspaces.session.menu.item",
						id: "cleaner.delete-permanently",
						order: 500 // 排在默认的 archive(400) 和 session-id(450) 之后
					},
					DeleteSessionMenuItem
				)
			);
		}

		// =========================================================
		// 组件定义
		// =========================================================

		/**
		 * 会话菜单项组件 (点击即删，平滑退出)
		 */
		function DeleteSessionMenuItem({ sessionId, useMenuOpenState }) {
			const [, setMenuOpen] = useMenuOpenState ? useMenuOpenState() : [null, () => {}];

			const handleDelete = () => {
				// 1. 关闭上下文右键菜单
				if (typeof setMenuOpen === "function") {
					setMenuOpen(false);
				}

				const rawId = String(sessionId || "");
				const cleanUuid = (rawId.startsWith("session-") ? rawId.slice("session-".length) : rawId).toLowerCase();
				const canonicalId = `session-${cleanUuid}`;

				// 2. DOM 瞬时平滑过渡淡出并移除，无感秒删体验
				try {
					const selectors = [
						`[data-row-key="session:${canonicalId}"]`,
						`[data-row-key="session:${cleanUuid}"]`,
						`[data-row-key="session:${rawId}"]`
					];
					for (const selector of selectors) {
						const element = document.querySelector(selector);
						if (element) {
							element.style.transition = "opacity 0.2s ease, transform 0.2s ease, max-height 0.2s ease";
							element.style.opacity = "0";
							element.style.transform = "translateX(-8px)";
							element.style.pointerEvents = "none";
							setTimeout(() => element.remove(), 220);
						}
					}
				} catch {}

				// 3. 路由防悬空守卫：如果当前正停留在该会话，立刻切回主页
				try {
					const currentHash = window.location.hash || "";
					const currentPath = window.location.pathname || "";
					if (
						currentHash.includes(cleanUuid) ||
						currentHash.includes(canonicalId) ||
						currentPath.includes(cleanUuid) ||
						currentPath.includes(canonicalId)
					) {
						window.location.hash = "#/";
					}
				} catch {}

				// 4. 后台静默调用 Host 物理彻底抹除端点
				fetch("/api/session-cleaner/delete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId: rawId })
				})
					.then((res) => res.json())
					.then((data) => {
						if (!data.ok) {
							console.error("[dsh-clean-session] 删除失败:", data.error);
						}
					})
					.catch((err) => {
						console.error("[dsh-clean-session] 请求物理删除异常:", err);
					});
			};

			return _jsx(Primitives.MenuItemButton, {
				// 醒目红标警示，清晰提示物理删除意图
				style: { color: "#ef4444" },
				icon: _jsx(Primitives.IconTrashOutlineRegular, { size: 14 }),
				onSelect: handleDelete,
				children: "彻底删除会话"
			});
		}

		moduleExports.name = "dsh-clean-session";
		moduleExports.inject = ["slots"];
		moduleExports.apply = apply;
		return moduleExports;
	}
});
