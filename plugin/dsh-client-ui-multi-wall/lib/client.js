window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-multi-wall",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		/** `multiWall` namespace dictionaries. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"toggle": "多窗口",
			"toggle.aria": "打开或关闭多窗口",
			"view.multiWall": "多窗口墙",
			"overlay.title": "多窗口墙",
			"overlay.close": "关闭",
			"scan": "发现实例",
			"scan.from": "起始端口",
			"scan.to": "结束端口",
			"create": "新建窗口",
			"create.done": "已创建 :{port}",
			"create.failed": "创建失败：{error}",
			"create.unknown": "未知原因",
			"exit": "退出",
			"exit.aria": "退出多窗口墙，返回对话",
			"link": "手机访问",
			"link.aria": "获取手机访问链接",
			"link.fetching": "正在获取链接…",
			"link.none": "未检测到局域网地址",
			"link.copy": "复制链接",
			"link.copied": "已复制",
			"link.hint": "提示：{hint}",
			"link.reachable": "手机在同一网络时可用：{urls}",
			"link.unreachable": "当前实例仅绑定本机，手机无法访问。{hint}",
			"link.token": "口令：{token}",
			"columns": "列数",
			"columns.auto": "自动",
			"refresh": "全部刷新",
			"openTab": "新标签页打开",
			"reload": "重新加载",
			"remove": "从视图移除",
			"stop": "关闭实例",
			"stop.confirm": "确定关闭？",
			"stop.self": "即将关闭当前实例（本页面将断开）",
			"stop.done": "已关闭 :{port}",
			"stop.failed": "关闭 :{port} 失败：{error}",
			"zoom": "放大",
			"loading": "加载中",
			"empty": "没有检测到 DSH 实例",
			"empty.hint": "先启动若干 dsh web --port <n> 实例，再点击「发现实例」或手动添加端口。",
			"status.scanning": "扫描 {from}–{to} …",
			"status.found": "发现 {count} 个实例：{ports}",
			"status.none": "区间 {from}–{to} 未发现 DSH 实例",
			"status.refreshed": "已刷新全部窗口"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"toggle": "Multi-Window",
			"toggle.aria": "Toggle multi-window",
			"view.multiWall": "Multi-Window Wall",
			"overlay.title": "Multi-Window Wall",
			"overlay.close": "Close",
			"scan": "Discover",
			"scan.from": "Start port",
			"scan.to": "End port",
			"create": "New window",
			"create.done": "Created :{port}",
			"create.failed": "Create failed: {error}",
			"create.unknown": "unknown reason",
			"exit": "Exit",
			"exit.aria": "Exit the wall and return to chat",
			"link": "Phone access",
			"link.aria": "Get phone access link",
			"link.fetching": "Fetching link…",
			"link.none": "No LAN address detected",
			"link.copy": "Copy link",
			"link.copied": "Copied",
			"link.hint": "Hint: {hint}",
			"link.reachable": "Reachable on the same network: {urls}",
			"link.unreachable": "This instance binds loopback only; phones cannot reach it. {hint}",
			"link.token": "Token: {token}",
			"columns": "Columns",
			"columns.auto": "Auto",
			"refresh": "Refresh all",
			"openTab": "Open in new tab",
			"reload": "Reload",
			"remove": "Remove from view",
			"stop": "Stop instance",
			"stop.confirm": "Confirm stop?",
			"stop.self": "Stopping the current instance (this page will disconnect)",
			"stop.done": "Stopped :{port}",
			"stop.failed": "Failed to stop :{port}: {error}",
			"zoom": "Zoom",
			"loading": "Loading",
			"empty": "No DSH instances found",
			"empty.hint": "Start a few `dsh web --port <n>` instances first, then click \"Discover\" or add a port manually.",
			"status.scanning": "Scanning {from}–{to} …",
			"status.found": "Found {count} instance(s): {ports}",
			"status.none": "No DSH instances in {from}–{to}",
			"status.refreshed": "Refreshed all windows"
		};
		//#endregion
		//#region src/client/store.ts
		/**
		* Wall store: which instances are shown and the grid columns. The ports list
		* is the wall's whole business state — discovery writes it, removal filters
		* it, and the grid renders from it. Open/closed is NOT stored here: the wall
		* is a `conversation.view` ring entry, so the active view (chat store's
		* `view` field) decides whether it renders.
		*/
		/**
		* Create the wall store handle. Persisted under `dsh.multi-wall` so the port
		* set and column choice survive view switches and reloads.
		* @returns the store handle (spec + type + identity + factory in one).
		*/
		function createWallStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					ports: [],
					columns: "auto"
				}),
				persist: "dsh.multi-wall",
				actions: {
					setPorts: (d, ports) => {
						d.ports = ports;
					},
					addPort: (d, port) => {
						if (!d.ports.includes(port)) d.ports = [...d.ports, port];
					},
					removePort: (d, port) => {
						d.ports = d.ports.filter((p) => p !== port);
					},
					setColumns: (d, columns) => {
						d.columns = columns;
					}
				}
			});
		}
		//#endregion
		//#region src/client/wall-injected.ts
		/**
		* Build the probe face bound to this origin's /multi/api routes.
		* @param mount - the API base path ('' at the root, '/multi' when mounted).
		* @returns the injected callbacks.
		*/
		function createWallInjected(mount = "") {
			const base = mount.replace(/\/+$/, "");
			return {
				discover: async () => {
					const res = await fetch(`${base}/multi/api/ports`);
					if (!res.ok) return [];
					return ((await res.json()).ports ?? []).filter((p) => p.alive).map((p) => p.port);
				},
				probe: async (ports) => {
					const res = await fetch(`${base}/multi/api/status?ports=${ports.join(",")}`);
					if (!res.ok) return [];
					return (await res.json()).ports ?? [];
				},
				stop: async (port) => {
					const res = await fetch(`${base}/multi/api/stop?port=${port}`, { method: "POST" });
					if (!res.ok) return {
						port,
						ok: false,
						error: `HTTP ${res.status}`
					};
					return (await res.json()).ports?.[0] ?? {
						port,
						ok: false,
						error: "no result"
					};
				},
				create: async () => {
					const res = await fetch(`${base}/multi/api/create`, { method: "POST" });
					if (!res.ok) return {
						ok: false,
						error: `HTTP ${res.status}`
					};
					const text = await res.text();
					let data;
					try {
						data = JSON.parse(text);
					} catch {
						const snippet = text.trim().slice(0, 120);
						return {
							ok: false,
							error: `invalid response: ${snippet === "" ? "<empty body>" : snippet}`
						};
					}
					if (data.ok === true) return data.port !== void 0 ? {
						ok: true,
						port: data.port
					} : {
						ok: false,
						error: "no port in response"
					};
					return {
						ok: false,
						...typeof data.error === "string" ? { error: data.error } : { error: "server returned no reason" }
					};
				},
				link: async () => {
					const data = await (await fetch(`${base}/multi/api/link`)).json().catch(() => ({}));
					return {
						port: data.port ?? 0,
						host: data.host ?? "unknown",
						lan: data.lan ?? [],
						reachable: data.reachable === true,
						...typeof data.gatewayPort === "number" ? { gatewayPort: data.gatewayPort } : {},
						...typeof data.token === "string" ? { token: data.token } : {},
						...typeof data.hint === "string" ? { hint: data.hint } : {}
					};
				}
			};
		}
		//#endregion
		//#region C:/Users/ASUS/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:D:\2026AppDev\dsh-plugins-multi-task\harness-src\packages\client\ui-multi-wall\src\client\WallView.module.css.mjs
		const css$1 = "[data-conversation-scroll]:has([data-wall-view]) [data-composer-seat]{display:none}.ouhzTG_wall{background:var(--dsw-alias-bg-base);min-width:0;min-height:0;color:var(--dsw-alias-label-primary);flex-direction:column;flex:1;display:flex}.ouhzTG_toolbar{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex-wrap:wrap;flex:none;align-items:center;gap:12px;padding:8px 14px;display:flex}.ouhzTG_title{font-size:14px;font-weight:600}.ouhzTG_linkBar{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex-wrap:wrap;flex:none;align-items:center;gap:10px;padding:6px 14px;display:flex}.ouhzTG_linkText{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;flex:1;min-width:160px;font-size:12px}.ouhzTG_status{color:var(--dsw-alias-label-secondary);flex:1;min-width:120px;font-size:12px}.ouhzTG_controls{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.ouhzTG_field{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;font-size:12px;display:inline-flex}.ouhzTG_field>span{width:76px}.ouhzTG_grid{flex:1;grid-auto-rows:minmax(280px,1fr);align-content:start;gap:8px;padding:8px;display:grid;overflow:auto}.ouhzTG_grid[data-cols=auto]{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.ouhzTG_grid[data-cols=\"1\"]{grid-template-columns:1fr}.ouhzTG_grid[data-cols=\"2\"]{grid-template-columns:repeat(2,1fr)}.ouhzTG_grid[data-cols=\"3\"]{grid-template-columns:repeat(3,1fr)}.ouhzTG_grid[data-cols=\"4\"]{grid-template-columns:repeat(4,1fr)}.ouhzTG_grid[data-cols=\"6\"]{grid-template-columns:repeat(6,1fr)}.ouhzTG_pane{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:8px;flex-direction:column;min-width:0;min-height:0;display:flex;overflow:hidden}.ouhzTG_pane.ouhzTG_zoomed{grid-area:1/1/-1/-1}.ouhzTG_paneHead{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);flex:none;align-items:center;gap:8px;padding:4px 8px;display:flex}.ouhzTG_dot{flex:none}.ouhzTG_paneTitle{text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.ouhzTG_paneActions{flex:none;gap:2px;margin-left:auto;display:flex}.ouhzTG_action{color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:4px;padding:2px 6px;line-height:1}.ouhzTG_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ouhzTG_action.ouhzTG_danger:hover{color:var(--dsw-static-amber-600)}.ouhzTG_action.ouhzTG_danger.ouhzTG_confirm{background:var(--dsw-static-amber-500);color:var(--dsw-static-neutral-00);padding:2px 8px;font-size:11px}.ouhzTG_action.ouhzTG_danger.ouhzTG_confirm:hover{background:var(--dsw-static-amber-600);color:var(--dsw-static-neutral-00)}.ouhzTG_paneBody{flex:1;min-height:0;position:relative}.ouhzTG_paneBody iframe{border:none;width:100%;height:100%;display:block}.ouhzTG_empty{color:var(--dsw-alias-label-secondary);flex-direction:column;grid-column:1/-1;justify-content:center;align-items:center;gap:6px;display:flex}.ouhzTG_empty .ouhzTG_hint{font-size:12px}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-multi-wall/WallView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-multi-wall";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var WallView_module_css_default = {
			"hint": "ouhzTG_hint",
			"empty": "ouhzTG_empty",
			"title": "ouhzTG_title",
			"dot": "ouhzTG_dot",
			"confirm": "ouhzTG_confirm",
			"wall": "ouhzTG_wall",
			"pane": "ouhzTG_pane",
			"field": "ouhzTG_field",
			"linkBar": "ouhzTG_linkBar",
			"paneBody": "ouhzTG_paneBody",
			"controls": "ouhzTG_controls",
			"linkText": "ouhzTG_linkText",
			"status": "ouhzTG_status",
			"paneActions": "ouhzTG_paneActions",
			"grid": "ouhzTG_grid",
			"zoomed": "ouhzTG_zoomed",
			"paneHead": "ouhzTG_paneHead",
			"action": "ouhzTG_action",
			"paneTitle": "ouhzTG_paneTitle",
			"danger": "ouhzTG_danger",
			"toolbar": "ouhzTG_toolbar"
		};
		//#endregion
		//#region src/client/WallView.tsx
		/**
		* WallView: the multi-window wall as a `conversation.view` ring entry. When
		* the header's "多窗口墙" tab is selected, the right panel swaps from the
		* chat to this view — a toolbar plus a grid of iframes, one pane per running
		* DSH instance (127.0.0.1:<port>). Pure additive UI; no existing slot is
		* replaced.
		*
		* Recursion guard: panes embed `?multi-wall=embed` (the embedded page
		* registers no wall UI). The serving instance is itself a pane, so the user
		* can watch — or stop — the very instance they are in.
		*
		* Live data channels: the store owns ports/columns; discovery writes
		* `setPorts` from /multi/api/ports (same-origin, served by the node half);
		* per-pane liveness arrives from /multi/api/status polls. Components never
		* see ctx — the fetch helpers are injected through the registration.
		*/
		/** Grid column presets, driven by the toolbar menu. 'auto' fills the row. */
		const COLUMN_PRESETS = [
			"auto",
			"1",
			"2",
			"3",
			"4",
			"6"
		];
		/** Embed flag appended to every pane URL; such pages register no wall UI. */
		const EMBED_FLAG = "multi-wall=embed";
		/**
		* One pane: header (port, liveness dot, zoom/refresh/open/stop/remove) plus
		* the embedded original DSH UI.
		*/
		function WallPane(props) {
			const { port, alive, zoomed, stopping, onZoom, onStop, onRemove, t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: clsx(WallView_module_css_default.pane, zoomed && WallView_module_css_default.zoomed),
				"data-port": port,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WallView_module_css_default.paneHead,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: alive ? "done" : "warning",
							size: 8,
							className: WallView_module_css_default.dot
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: WallView_module_css_default.paneTitle,
							children: ["127.0.0.1:", port]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WallView_module_css_default.paneActions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallView_module_css_default.action,
									title: t("zoom"),
									onClick: onZoom,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutline16, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallView_module_css_default.action,
									title: t("reload"),
									onClick: (e) => {
										e.currentTarget.closest("section")?.querySelector("iframe")?.contentWindow?.location.reload();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallView_module_css_default.action,
									title: t("openTab"),
									onClick: () => {
										window.open(`http://127.0.0.1:${port}/`, "_blank");
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: clsx(WallView_module_css_default.action, WallView_module_css_default.danger, stopping && WallView_module_css_default.confirm),
									title: t("stop"),
									onClick: onStop,
									children: stopping ? t("stop.confirm") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconStopFill16, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallView_module_css_default.action,
									title: t("remove"),
									onClick: onRemove,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 })
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WallView_module_css_default.paneBody,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						title: `DSH :${port}`,
						src: `http://127.0.0.1:${port}/?${EMBED_FLAG}`,
						loading: "lazy"
					})
				})]
			});
		}
		/**
		* Render the wall: toolbar plus the horizontally-filled pane grid. Discovery
		* runs on mount and liveness polls every 5s; the store's persisted ports
		* survive view switches and reloads.
		* @param props - composed slot props.
		* @returns the wall surface.
		*/
		function WallView({ useStore, actions, discover, probe, stop, create, link, t }) {
			const ports = useStore((s) => s.ports);
			const columns = useStore((s) => s.columns);
			const [alive, setAlive] = (0, react.useState)({});
			const [zoomedPort, setZoomedPort] = (0, react.useState)(null);
			const [confirmingStop, setConfirmingStop] = (0, react.useState)(null);
			const [scanFrom, setScanFrom] = (0, react.useState)(3070);
			const [scanTo, setScanTo] = (0, react.useState)(3110);
			const [colsMenuOpen, setColsMenuOpen] = (0, react.useState)(false);
			const [creating, setCreating] = (0, react.useState)(false);
			const [linkOpen, setLinkOpen] = (0, react.useState)(false);
			const [linkInfo, setLinkInfo] = (0, react.useState)(null);
			const [linkCopied, setLinkCopied] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)("");
			const aliveRef = (0, react.useRef)({});
			aliveRef.current = alive;
			(0, react.useEffect)(() => {
				discover().then((found) => {
					if (found.length > 0) actions.setPorts(found);
					setStatus(found.length > 0 ? t("status.found").replace("{count}", String(found.length)).replace("{ports}", found.join(", ")) : "");
				});
				const timer = setInterval(() => {
					if (ports.length === 0) return;
					probe(ports).then((rows) => {
						const next = {};
						for (const row of rows) next[row.port] = row.alive;
						setAlive(next);
					});
				}, 5e3);
				return () => {
					clearInterval(timer);
				};
			}, []);
			const handleStop = async (port) => {
				if (confirmingStop !== port) {
					setConfirmingStop(port);
					return;
				}
				setConfirmingStop(null);
				const result = await stop(port);
				if (result.ok) {
					actions.removePort(port);
					setAlive((current) => ({
						...current,
						[port]: false
					}));
					setStatus(t("stop.done").replace("{port}", String(port)));
				} else setStatus(t("stop.failed").replace("{port}", String(port)).replace("{error}", result.error ?? ""));
			};
			const runDiscovery = async () => {
				setStatus(t("status.scanning").replace("{from}", String(scanFrom)).replace("{to}", String(scanTo)));
				const found = await discover();
				if (found.length === 0) {
					setStatus(t("status.none").replace("{from}", String(scanFrom)).replace("{to}", String(scanTo)));
					return;
				}
				actions.setPorts(found);
				setStatus(t("status.found").replace("{count}", String(found.length)).replace("{ports}", found.join(", ")));
			};
			const handleCreate = async () => {
				setCreating(true);
				setStatus("");
				try {
					const result = await create();
					if (result.ok && result.port !== void 0) {
						actions.addPort(result.port);
						setAlive((current) => ({
							...current,
							[result.port]: true
						}));
						setStatus(t("create.done").replace("{port}", String(result.port)));
					} else setStatus(t("create.failed").replace("{error}", result.error ?? t("create.unknown")));
				} catch (error) {
					setStatus(t("create.failed").replace("{error}", error instanceof Error ? error.message : String(error)));
				} finally {
					setCreating(false);
				}
			};
			const exitWall = () => {
				document.querySelector("[role=\"tablist\"] [role=\"tab\"]")?.click();
			};
			const handleLink = async () => {
				if (linkInfo === null) {
					setStatus(t("link.fetching"));
					setLinkInfo(await link());
				}
				setLinkOpen(true);
				setLinkCopied(false);
				setStatus("");
			};
			const copyFirstLink = async () => {
				if (linkInfo === null || linkInfo.lan.length === 0) return;
				try {
					await navigator.clipboard.writeText(linkInfo.lan[0] ?? "");
					setLinkCopied(true);
				} catch {
					setLinkCopied(false);
				}
			};
			const shown = ports;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WallView_module_css_default.wall,
				role: "region",
				"aria-label": t("overlay.title"),
				"data-wall-view": "",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WallView_module_css_default.toolbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: WallView_module_css_default.title,
								children: t("overlay.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: WallView_module_css_default.status,
								children: status
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: WallView_module_css_default.controls,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: WallView_module_css_default.field,
										children: [t("scan.from"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											type: "number",
											value: scanFrom,
											onChange: (e) => setScanFrom(Number(e.target.value))
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: WallView_module_css_default.field,
										children: [t("scan.to"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											type: "number",
											value: scanTo,
											onChange: (e) => setScanTo(Number(e.target.value))
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "toolbar",
										size: "sm",
										onClick: () => {
											runDiscovery();
										},
										children: t("scan")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "toolbar",
										size: "sm",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
										disabled: creating,
										onClick: () => {
											handleCreate();
										},
										children: t("create")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
										open: colsMenuOpen,
										anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "toolbar",
											size: "sm",
											icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, { size: 14 }),
											onClick: () => {
												setColsMenuOpen(true);
											},
											children: columns === "auto" ? t("columns.auto") : columns
										}),
										items: COLUMN_PRESETS.map((c) => ({
											id: c,
											label: c === "auto" ? t("columns.auto") : c
										})),
										selectedId: columns,
										onSelect: (id) => {
											actions.setColumns(id);
											setColsMenuOpen(false);
										},
										onClose: () => {
											setColsMenuOpen(false);
										},
										compact: true
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "toolbar",
										size: "sm",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, { size: 14 }),
										onClick: () => {
											document.querySelectorAll(`.${WallView_module_css_default.paneBody} iframe`).forEach((f) => {
												f.contentWindow?.location.reload();
											});
											setStatus(t("status.refreshed"));
										},
										children: t("refresh")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "toolbar",
										size: "sm",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: 14 }),
										"aria-label": t("link.aria"),
										onClick: () => {
											handleLink();
										},
										children: t("link")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "toolbar",
										size: "sm",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 }),
										"aria-label": t("exit.aria"),
										title: t("exit"),
										onClick: () => {
											exitWall();
										},
										children: t("exit")
									})
								]
							})
						]
					}),
					linkOpen && linkInfo !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WallView_module_css_default.linkBar,
						children: [linkInfo.reachable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: WallView_module_css_default.linkText,
							children: [t("link.reachable").replace("{urls}", linkInfo.lan.join("  ")), linkInfo.token !== void 0 && linkInfo.token !== "" ? `  ${t("link.token").replace("{token}", linkInfo.token)}` : ""]
						}), linkInfo.lan.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: () => {
								copyFirstLink();
							},
							children: linkCopied ? t("link.copied") : t("link.copy")
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: WallView_module_css_default.linkText,
							children: t("link.unreachable").replace("{hint}", linkInfo.hint ?? "")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							size: "sm",
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 }),
							onClick: () => {
								setLinkOpen(false);
							},
							children: t("overlay.close")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WallView_module_css_default.grid,
						"data-cols": columns,
						children: [shown.map((port) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WallPane, {
							port,
							alive: aliveRef.current[port] ?? true,
							zoomed: zoomedPort === port,
							stopping: confirmingStop === port,
							onZoom: () => setZoomedPort(zoomedPort === port ? null : port),
							onStop: () => {
								handleStop(port);
							},
							onRemove: () => {
								setConfirmingStop(null);
								actions.removePort(port);
							},
							t
						}, port)), shown.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WallView_module_css_default.empty,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("empty") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: WallView_module_css_default.hint,
								children: t("empty.hint")
							})]
						})]
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:D:\2026AppDev\dsh-plugins-multi-task\harness-src\packages\client\ui-multi-wall\src\client\WallToggle.module.css.mjs
		const css = ".bmjS6q_row{box-sizing:border-box;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:4px -4px;padding:6px 2px 6px 10px;display:flex;overflow:hidden}.bmjS6q_row:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.bmjS6q_label{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}";
		const tagId = "@deepseek-ai/dsh-client-ui-multi-wall/WallToggle.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-multi-wall";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WallToggle_module_css_default = {
			"label": "bmjS6q_label",
			"row": "bmjS6q_row"
		};
		//#endregion
		//#region src/client/WallToggle.tsx
		/**
		* WallToggle: the sidebar-foot shortcut. Clicking it opens the wall view —
		* the `conversation.view` ring switches to the 'multi-wall' entry, which the
		* header renders as the "多窗口墙" tab. The click is a plain user-equivalent
		* activation: it finds the header's view-ring tab for this plugin's label and
		* clicks it, so the official view-ring state machine (the chat store's active
		* view field) performs the switch. No store is declared: the ring decides
		* what renders, so this row owns no state.
		*
		* Session-scoped by design: the view ring (and its header tabs) only renders
		* with an active session, so the shortcut is inert on the empty-hero screen —
		* the user first opens or creates a session (the official flow), after which
		* the tab is present and the click lands.
		*/
		/**
		* Render the wall shortcut row (icon; label only in the wide column).
		* @param props - composed slot props.
		* @returns the shortcut row.
		*/
		function WallToggle({ wide, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: WallToggle_module_css_default.row,
				"aria-label": t("toggle.aria"),
				title: t("toggle"),
				onClick: () => {
					const label = t("view.multiWall");
					Array.from(document.querySelectorAll("[role=\"tab\"]")).find((el) => el.textContent?.trim() === label)?.click();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutline16, { size: wide ? 16 : 18 }), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: WallToggle_module_css_default.label,
					children: t("toggle")
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "multiWall";
		/** Required services: slots for both registrations, locale for copy. */
		const inject = ["slots", "locale"];
		/**
		* Whether this page is an embedded wall pane. Panes load
		* `?multi-wall=embed`; such pages register no wall UI at all, which stops a
		* wall inside a wall (the pane would otherwise recursively embed the
		* serving instance).
		* @returns true when the query flag is present.
		*/
		function isEmbeddedPane() {
			return new URLSearchParams(window.location.search).has("multi-wall");
		}
		/**
		* Client plugin body: register the dictionaries, the view-ring entry (the
		* wall), and the sidebar footer shortcut. Embedded panes register nothing.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			if (isEmbeddedPane()) return;
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-multi-wall: dictionaries");
			const t = ctx.locale.bind(NS);
			const wallStore = createWallStore();
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "multi-wall",
				order: 20,
				label: () => t("view.multiWall"),
				locale: NS,
				store: wallStore,
				inject: () => createWallInjected()
			}, WallView));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "multi-wall",
				order: 10,
				locale: NS
			}, WallToggle));
		}
		//#endregion
		exports.WallToggle = WallToggle;
		exports.WallView = WallView;
		exports.apply = apply;
		exports.createWallStore = createWallStore;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map