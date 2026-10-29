/**
 * @file client.js
 * @description DeepSeek Harness (DSH) 彻底删除会话插件 - Web Client 前端注入入口
 * 
 * 核心职责：
 * 1. 在侧边栏会话条目的右键操作菜单中注入「彻底删除」选项；
 * 2. 弹出高危险级确认模态框，提供防误触二次确认；
 * 3. 异步调用 Host 彻底删除端点，处理错误态与 Loading 态；
 * 4. 防悬空路由导航守卫：若被删除的会话正好是当前浏览窗口，自动切回主页。
 */

window.__ModuleLoader__.load({
	id: "dsh-clean-session",
	factory: (require) => {
		const React = require("react");
		const { useState, useEffect } = React;
		const jsxRuntime = require("react/jsx-runtime");
		const { jsx: _jsx, jsxs: _jsxs } = jsxRuntime;
		const Primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		const moduleExports = {};

		// =========================================================
		// 全局待处理删除事件调度总线
		// =========================================================
		let activeDeleteTarget = null;
		const changeListeners = new Set();

		function setDeleteTarget(target) {
			activeDeleteTarget = target;
			for (const listener of changeListeners) {
				listener(activeDeleteTarget);
			}
		}

		// =========================================================
		// 插件前端生命周期挂载
		// =========================================================
		function apply(ctx) {
			// 1. 注入会话右键操作菜单 (sidebar.workspaces.session.menu.item)
			ctx.slots.inject("sidebar.workspaces.session.menu.item", function* () {
				yield ctx.slots.register(
					{
						name: "sidebar.workspaces.session.menu.item",
						id: "cleaner.delete-permanently",
						order: 500 // 排在默认的 archive(400) 和 session-id(450) 之后
					},
					DeleteSessionMenuItem
				);
			});

			// 2. 注入全局确认模态对话框 (shell.overlay)
			ctx.slots.inject("shell.overlay", function* () {
				yield ctx.slots.register(
					{
						name: "shell.overlay",
						id: "session-cleaner.confirm-overlay"
					},
					DeleteConfirmOverlay
				);
			});
		}

		// =========================================================
		// 组件定义
		// =========================================================

		/**
		 * 会话菜单项组件
		 */
		function DeleteSessionMenuItem({ sessionId, useMenuOpenState }) {
			const [, setMenuOpen] = useMenuOpenState ? useMenuOpenState() : [null, () => {}];

			return _jsx(Primitives.MenuItemButton, {
				// 警告红色高亮，明确提示破坏性操作
				style: { color: "#ef4444" },
				icon: _jsx(Primitives.IconTrashOutlineRegular, { size: 14 }),
				onSelect: () => {
					setMenuOpen(false);
					setDeleteTarget({ sessionId });
				},
				children: "彻底删除会话"
			});
		}

		/**
		 * 彻底删除确认模态框组件
		 */
		function DeleteConfirmOverlay() {
			const [target, setTarget] = useState(activeDeleteTarget);
			const [submitting, setSubmitting] = useState(false);
			const [errorMessage, setErrorMessage] = useState(null);

			useEffect(() => {
				const update = (val) => setTarget(val);
				changeListeners.add(update);
				return () => changeListeners.delete(update);
			}, []);

			if (!target) return null;

			const handleClose = () => {
				if (submitting) return;
				setDeleteTarget(null);
				setErrorMessage(null);
			};

			const handleConfirm = async () => {
				setSubmitting(true);
				setErrorMessage(null);

				try {
					const response = await fetch("/api/session-cleaner/delete", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ sessionId: target.sessionId })
					});

					const data = await response.json();

					if (!response.ok || !data.ok) {
						throw new Error(data.error || "服务端删除会话失败");
					}

					// 路由防悬空守卫：如果当前正在查看此会话，重置回默认会话或主页
					if (window.location.hash.includes(target.sessionId) || window.location.pathname.includes(target.sessionId)) {
						window.location.hash = "#/";
					}

					setDeleteTarget(null);
				} catch (err) {
					setErrorMessage(err.message || String(err));
				} finally {
					setSubmitting(false);
				}
			};

			return _jsxs(Primitives.Modal, {
				open: true,
				onClose: handleClose,
				title: "彻底删除会话",
				description: "此操作将永久抹除该会话在磁盘上的所有对话日志、执行记录及缓存数据，不可撤销。确定要永久删除吗？",
				footer: _jsxs(React.Fragment, {
					children: [
						_jsx(Primitives.Button, {
							variant: "outline",
							disabled: submitting,
							onClick: handleClose,
							children: "取消"
						}),
						_jsx(Primitives.Button, {
							variant: "danger",
							disabled: submitting,
							onClick: handleConfirm,
							children: submitting ? "正在物理清理..." : "确认永久删除"
						})
					]
				}),
				children: [
					errorMessage &&
						_jsx("div", {
							style: {
								color: "#dc2626",
								fontSize: "13px",
								marginTop: "8px",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(239, 68, 68, 0.1)"
							},
							role: "alert",
							children: errorMessage
						})
				]
			});
		}

		moduleExports.apply = apply;
		return moduleExports;
	}
});
