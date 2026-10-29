import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Context, Service } from "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/cordis/lib/index.js";

class SlotsService extends Service {
	constructor(ctx) {
		super(ctx, "slots");
	}
	inject(key, cb) {
		return cb();
	}
	register(opts, comp) {
		return () => {};
	}
}

describe("dsh-clean-session 插件生命周期与健康检测", () => {
	it("前端客户端插件加载与激活测试 (单菜单槽位注入，免弹窗打扰)", async () => {
		// 1. 模拟浏览器环境与 ModuleLoader
		global.window = global;
		global.document = { querySelector: () => null };
		let registeredDef = null;
		global.__ModuleLoader__ = {
			load: (def) => {
				registeredDef = def;
			}
		};

		// 动态加载客户端脚本
		await import("../lib/client.js?t=" + Date.now());

		assert.ok(registeredDef, "lib/client.js 必须调用 window.__ModuleLoader__.load 注册模块");
		assert.equal(registeredDef.id, "dsh-clean-session", "模块 id 必须为 dsh-clean-session");

		// 模拟 require
		const mockRequire = (id) => {
			if (id === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}) };
			if (id === "@deepseek-ai/dsh-client-ui-primitives") return {
				MenuItemButton: () => ({}),
				IconTrashOutlineRegular: () => ({})
			};
			return {};
		};

		const plugin = registeredDef.factory(mockRequire);
		assert.ok(plugin, "factory 执行必须返回插件导出对象");

		// 必须显式声明 inject: ["slots"]
		assert.ok(
			Array.isArray(plugin.inject) && plugin.inject.includes("slots"),
			"客户端插件导出对象必须显式声明 inject: ['slots']"
		);

		// 2. 模拟 Cordis 容器并挂载 SlotsService
		const ctx = new Context();
		await ctx.plugin(SlotsService).await();

		// 3. 挂载插件并等待生命周期 settle
		const fork = ctx.plugin(plugin);
		await fork.await();

		assert.equal(fork.state, 2, `客户端插件激活状态必须为 ACTIVE (2)，当前为: ${fork.state}`);
		assert.equal(fork._error, undefined, "客户端插件激活时不得产生任何错误");
	});

	it("后端 Host 插件加载、路由注册及 Workspace 脱钩全链路测试", async () => {
		const hostModule = await import("../lib/index.js?t=" + Date.now());
		assert.equal(hostModule.name, "dsh-clean-session");
		assert.ok(Array.isArray(hostModule.inject), "后端插件必须声明 inject");

		const ctx = new Context();
		let registeredRoute = null;

		// 模拟 connection 服务
		class ConnectionService extends Service {
			constructor(c) {
				super(c, "connection");
			}
			get fetch() {
				return {
					register: (route) => {
						registeredRoute = route;
						return () => {};
					}
				};
			}
		}

		// 模拟带有真实 sessionIds (包含 session- 前缀) 的 workspaceRegistry 服务
		const targetSessionId = "session-4eb521df-a1db-4f73-b0ec-e620b4b02b42";
		let detachedSessionId = null;

		class WorkspaceRegistryService extends Service {
			constructor(c) {
				super(c, "workspaceRegistry");
			}
			entities = new Map([
				[
					"ws-1",
					{
						id: "ws-1",
						record: {
							path: "/Users/test/workspace",
							sessionIds: [targetSessionId, "session-other"]
						},
						detachSession: async (id) => {
							detachedSessionId = id;
						}
					}
				]
			]);
			archivedSessionIds = [targetSessionId];
			pinnedSessionIds = [targetSessionId];
			unarchiveSession = async (id) => {
				this.archivedSessionIds = this.archivedSessionIds.filter((x) => x !== id);
			};
			unpinSession = async (id) => {
				this.pinnedSessionIds = this.pinnedSessionIds.filter((x) => x !== id);
			};
		}

		await ctx.plugin(ConnectionService).await();
		await ctx.plugin(WorkspaceRegistryService).await();

		// 挂载后端插件
		const fork = ctx.plugin(hostModule);
		await fork.await();

		assert.equal(fork.state, 2, "后端插件激活状态必须为 ACTIVE (2)");
		assert.ok(registeredRoute, "后端插件必须通过 connection.fetch.register 注册路由");

		// 捕获系统事件
		const emittedEvents = [];
		ctx.on("api-session/removed", (id) => {
			emittedEvents.push(id);
		});

		// 模拟调用 API 接口删除带 session- 前缀的会话
		const fakeRequest = new Request("http://localhost/api/session-cleaner/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sessionId: targetSessionId })
		});

		const response = await registeredRoute.fetch(fakeRequest);
		assert.equal(response.status, 200, "删除接口必须返回 200 OK");
		const data = await response.json();
		assert.equal(data.ok, true, "接口响应 ok 必须为 true");

		// 验证核心修复：Workspace 必须成功脱钩！
		assert.equal(
			detachedSessionId,
			targetSessionId,
			"必须正确调用 ws.detachSession 成功脱钩 Workspace 中的带前缀会话 ID！"
		);
		assert.equal(data.details.detachedWorkspaces, 1, "detachedWorkspaces 计数必须为 1");
		assert.equal(data.details.removedArchived, true, "归档列表必须被清理");
		assert.equal(data.details.removedPinned, true, "置顶列表必须被清理");

		// 验证必须广播 api-session/removed
		assert.ok(
			emittedEvents.includes(targetSessionId),
			"必须向客户端广播 api-session/removed 事件以触发视图注销！"
		);
	});
});
