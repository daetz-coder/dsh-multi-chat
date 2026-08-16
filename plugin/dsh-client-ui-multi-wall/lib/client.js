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
			"toggle": "多窗口墙",
			"toggle.aria": "打开或关闭多窗口墙",
			"overlay.title": "多窗口墙",
			"overlay.close": "关闭",
			"scan": "发现实例",
			"scan.from": "起始端口",
			"scan.to": "结束端口",
			"add": "添加窗口",
			"add.placeholder": "端口号",
			"columns": "列数",
			"columns.auto": "自动",
			"refresh": "全部刷新",
			"openTab": "新标签页打开",
			"reload": "重新加载",
			"remove": "关闭窗口",
			"zoom": "放大",
			"loading": "加载中",
			"empty": "没有检测到 DSH 实例",
			"empty.hint": "先启动若干 dsh web --port <n> 实例，再点击「发现实例」或手动添加端口。",
			"status.scanning": "扫描 {from}–{to} …",
			"status.found": "发现 {count} 个实例：{ports}",
			"status.none": "区间 {from}–{to} 未发现 DSH 实例",
			"status.added": "已添加 :{port}",
			"status.portRequired": "请输入端口号",
			"status.refreshed": "已刷新全部窗口"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"toggle": "Multi-Window Wall",
			"toggle.aria": "Toggle the multi-window wall",
			"overlay.title": "Multi-Window Wall",
			"overlay.close": "Close",
			"scan": "Discover",
			"scan.from": "Start port",
			"scan.to": "End port",
			"add": "Add window",
			"add.placeholder": "Port",
			"columns": "Columns",
			"columns.auto": "Auto",
			"refresh": "Refresh all",
			"openTab": "Open in new tab",
			"reload": "Reload",
			"remove": "Close window",
			"zoom": "Zoom",
			"loading": "Loading",
			"empty": "No DSH instances found",
			"empty.hint": "Start a few `dsh web --port <n>` instances first, then click \"Discover\" or add a port manually.",
			"status.scanning": "Scanning {from}–{to} …",
			"status.found": "Found {count} instance(s): {ports}",
			"status.none": "No DSH instances in {from}–{to}",
			"status.added": "Added :{port}",
			"status.portRequired": "Enter a port number",
			"status.refreshed": "Refreshed all windows"
		};
		//#endregion
		//#region src/client/store.ts
		/**
		* Wall store: which instances are shown and the grid columns. The ports list
		* is the wall's whole business state — discovery writes it, removal filters
		* it, and the grid renders from it. Shared across the sidebar footer toggle
		* (open/closed) and the overlay (renders the grid), so one handle rides both
		* registrations.
		*/
		/**
		* Create the wall store handle. Persisted under `dsh.multi-wall` so the wall
		* reopens on the last port set; a reload keeps discovery results.
		* @returns the store handle (spec + type + identity + factory in one).
		*/
		function createWallStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					open: false,
					ports: [],
					columns: "auto"
				}),
				persist: "dsh.multi-wall",
				actions: {
					toggle: (d) => {
						d.open = !d.open;
					},
					setOpen: (d, open) => {
						d.open = open;
					},
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
		//#region \0dsh-css:D:\2026AppDev\dsh-plugins-multi-task\harness-src\packages\client\ui-multi-wall\src\client\WallOverlay.module.css.mjs
		const css$1 = ".Muvhga_wall{z-index:50;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);flex-direction:column;display:flex;position:fixed;inset:0}.Muvhga_toolbar{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex-wrap:wrap;flex:none;align-items:center;gap:12px;padding:8px 14px;display:flex}.Muvhga_title{font-size:14px;font-weight:600}.Muvhga_status{color:var(--dsw-alias-label-secondary);flex:1;min-width:120px;font-size:12px}.Muvhga_controls{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.Muvhga_field{color:var(--dsw-alias-label-secondary);align-items:center;gap:4px;font-size:12px;display:inline-flex}.Muvhga_field input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);width:64px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px;padding:2px 6px;font-size:12px}.Muvhga_field select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px;padding:2px 6px;font-size:12px}.Muvhga_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;border-radius:6px;padding:3px 10px;font-size:12px}.Muvhga_btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.Muvhga_grid{flex:1;grid-auto-rows:minmax(260px,1fr);align-content:start;gap:8px;padding:8px;display:grid;overflow:auto}.Muvhga_grid[data-cols=auto]{grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}.Muvhga_grid[data-cols=\"1\"]{grid-template-columns:1fr}.Muvhga_grid[data-cols=\"2\"]{grid-template-columns:repeat(2,1fr)}.Muvhga_grid[data-cols=\"3\"]{grid-template-columns:repeat(3,1fr)}.Muvhga_grid[data-cols=\"4\"]{grid-template-columns:repeat(4,1fr)}.Muvhga_grid[data-cols=\"6\"]{grid-template-columns:repeat(6,1fr)}.Muvhga_pane{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:8px;flex-direction:column;min-width:0;min-height:0;display:flex;overflow:hidden}.Muvhga_pane.Muvhga_zoomed{grid-area:1/1/-1/-1}.Muvhga_paneHead{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);flex:none;align-items:center;gap:8px;padding:4px 8px;display:flex}.Muvhga_dot{background:var(--dsw-alias-label-secondary);border-radius:50%;flex:none;width:8px;height:8px}.Muvhga_dot.Muvhga_ok{background:var(--dsw-static-green-500)}.Muvhga_dot.Muvhga_bad{background:var(--dsw-static-amber-600)}.Muvhga_paneTitle{text-overflow:ellipsis;white-space:nowrap;font-family:Consolas,Cascadia Mono,monospace;font-size:12px;overflow:hidden}.Muvhga_paneActions{flex:none;gap:2px;margin-left:auto;display:flex}.Muvhga_action{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:4px;padding:2px 6px;line-height:1}.Muvhga_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.Muvhga_action.Muvhga_danger:hover{color:var(--dsw-static-amber-600)}.Muvhga_paneBody{flex:1;min-height:0;position:relative}.Muvhga_paneBody iframe{border:none;width:100%;height:100%;display:block}.Muvhga_empty{color:var(--dsw-alias-label-secondary);flex-direction:column;grid-column:1/-1;justify-content:center;align-items:center;gap:6px;display:flex}.Muvhga_empty .Muvhga_hint{font-size:12px}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-multi-wall/WallOverlay.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-multi-wall";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var WallOverlay_module_css_default = {
			"pane": "Muvhga_pane",
			"paneBody": "Muvhga_paneBody",
			"empty": "Muvhga_empty",
			"paneHead": "Muvhga_paneHead",
			"grid": "Muvhga_grid",
			"toolbar": "Muvhga_toolbar",
			"wall": "Muvhga_wall",
			"danger": "Muvhga_danger",
			"dot": "Muvhga_dot",
			"btn": "Muvhga_btn",
			"action": "Muvhga_action",
			"controls": "Muvhga_controls",
			"ok": "Muvhga_ok",
			"title": "Muvhga_title",
			"hint": "Muvhga_hint",
			"status": "Muvhga_status",
			"field": "Muvhga_field",
			"zoomed": "Muvhga_zoomed",
			"paneActions": "Muvhga_paneActions",
			"paneTitle": "Muvhga_paneTitle",
			"bad": "Muvhga_bad"
		};
		//#endregion
		//#region src/client/WallOverlay.tsx
		/**
		* WallOverlay: the full-screen wall surface, mounted through the
		* `shell.overlay` list slot (frame-wide, additive). Renders nothing while
		* the store is closed; when open it covers the app with a toolbar and a grid
		* of iframes — one pane per running DSH instance (127.0.0.1:<port>).
		*
		* Live data channels: the store owns open/ports/columns; discovery writes
		* `setPorts` from /multi/api/ports (same-origin, served by the node half);
		* per-pane liveness arrives from /multi/api/status polls. Components never
		* see ctx — the fetch helpers are injected through the registration.
		*/
		/** Grid column presets, driven by the toolbar select. */
		const COLUMN_PRESETS = [
			"auto",
			"1",
			"2",
			"3",
			"4",
			"6"
		];
		/**
		* One pane: header (port, liveness dot, zoom/refresh/open/remove) plus the
		* embedded original DSH UI.
		*/
		function WallPane(props) {
			const { port, alive, zoomed, onZoom, onRemove, t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: clsx(WallOverlay_module_css_default.pane, zoomed && WallOverlay_module_css_default.zoomed),
				"data-port": port,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WallOverlay_module_css_default.paneHead,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: clsx(WallOverlay_module_css_default.dot, alive ? WallOverlay_module_css_default.ok : WallOverlay_module_css_default.bad),
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: WallOverlay_module_css_default.paneTitle,
							children: ["127.0.0.1:", port]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WallOverlay_module_css_default.paneActions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallOverlay_module_css_default.action,
									title: t("zoom"),
									onClick: onZoom,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutline16, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallOverlay_module_css_default.action,
									title: t("reload"),
									onClick: (e) => {
										e.currentTarget.closest("section")?.querySelector("iframe")?.contentWindow?.location.reload();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallOverlay_module_css_default.action,
									title: t("openTab"),
									onClick: () => {
										window.open(`http://127.0.0.1:${port}/`, "_blank");
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: clsx(WallOverlay_module_css_default.action, WallOverlay_module_css_default.danger),
									title: t("remove"),
									onClick: onRemove,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 })
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: WallOverlay_module_css_default.paneBody,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						title: `DSH :${port}`,
						src: `http://127.0.0.1:${port}/`,
						loading: "lazy"
					})
				})]
			});
		}
		/**
		* Render the wall when open, nothing otherwise. Discovery runs on open;
		* liveness polls every 5s while open.
		* @param props - composed slot props.
		* @returns the wall surface or null.
		*/
		function WallOverlay({ useStore, actions, discover, probe, t }) {
			const open = useStore((s) => s.open);
			const ports = useStore((s) => s.ports);
			const columns = useStore((s) => s.columns);
			const [alive, setAlive] = (0, react.useState)({});
			const [zoomedPort, setZoomedPort] = (0, react.useState)(null);
			const [scanFrom, setScanFrom] = (0, react.useState)(3070);
			const [scanTo, setScanTo] = (0, react.useState)(3110);
			const [status, setStatus] = (0, react.useState)("");
			const aliveRef = (0, react.useRef)({});
			aliveRef.current = alive;
			(0, react.useEffect)(() => {
				if (!open) return;
				discover().then((ports) => {
					if (ports.length > 0) actions.setPorts(ports);
					setStatus(ports.length > 0 ? t("status.found").replace("{count}", String(ports.length)).replace("{ports}", ports.join(", ")) : "");
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
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKey = (e) => {
					if (e.key === "Escape") actions.setOpen(false);
				};
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("keydown", onKey);
				};
			}, [open, actions]);
			if (!open) return null;
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WallOverlay_module_css_default.wall,
				role: "dialog",
				"aria-modal": "true",
				"aria-label": t("overlay.title"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WallOverlay_module_css_default.toolbar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: WallOverlay_module_css_default.title,
							children: t("overlay.title")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: WallOverlay_module_css_default.status,
							children: status
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WallOverlay_module_css_default.controls,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: WallOverlay_module_css_default.field,
									children: [t("scan.from"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										value: scanFrom,
										onChange: (e) => setScanFrom(Number(e.target.value))
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: WallOverlay_module_css_default.field,
									children: [t("scan.to"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										value: scanTo,
										onChange: (e) => setScanTo(Number(e.target.value))
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallOverlay_module_css_default.btn,
									onClick: () => {
										runDiscovery();
									},
									children: t("scan")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: WallOverlay_module_css_default.field,
									value: columns,
									onChange: (e) => actions.setColumns(e.target.value),
									children: COLUMN_PRESETS.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: c,
										children: c === "auto" ? t("columns.auto") : c
									}, c))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallOverlay_module_css_default.btn,
									onClick: () => {
										document.querySelectorAll(`.${WallOverlay_module_css_default.paneBody} iframe`).forEach((f) => {
											f.contentWindow?.location.reload();
										});
										setStatus(t("status.refreshed"));
									},
									children: t("refresh")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WallOverlay_module_css_default.btn,
									onClick: () => {
										actions.setOpen(false);
									},
									children: t("overlay.close")
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WallOverlay_module_css_default.grid,
					"data-cols": columns,
					children: [ports.map((port) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WallPane, {
						port,
						alive: aliveRef.current[port] ?? true,
						zoomed: zoomedPort === port,
						onZoom: () => setZoomedPort(zoomedPort === port ? null : port),
						onRemove: () => actions.removePort(port),
						t
					}, port)), ports.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WallOverlay_module_css_default.empty,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("empty") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: WallOverlay_module_css_default.hint,
							children: t("empty.hint")
						})]
					})]
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:D:\2026AppDev\dsh-plugins-multi-task\harness-src\packages\client\ui-multi-wall\src\client\WallToggle.module.css.mjs
		const css = ".bmjS6q_row{width:100%;height:40px;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;background:0 0;border:none;align-items:center;gap:8px;padding:0 12px;display:flex}.bmjS6q_row:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.bmjS6q_label{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}";
		const tagId = "@deepseek-ai/dsh-client-ui-multi-wall/WallToggle.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-multi-wall";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WallToggle_module_css_default = {
			"row": "bmjS6q_row",
			"label": "bmjS6q_label"
		};
		//#endregion
		//#region src/client/WallToggle.tsx
		/**
		* WallToggle: the sidebar-foot action row. Wide columns render an icon plus
		* the label; the collapsed rail renders the icon only (the rail sizes by
		* icon). The click toggles the shared wall store.
		*/
		/**
		* Render the wall toggle row (icon; label only in the wide column).
		* @param props - composed slot props.
		* @returns the toggle row.
		*/
		function WallToggle({ wide, actions, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: WallToggle_module_css_default.row,
				"aria-label": t("toggle.aria"),
				title: t("toggle"),
				onClick: () => {
					actions.toggle();
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
		* Client plugin body: register the dictionaries and the two additive entries.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-multi-wall: dictionaries");
			const wallStore = createWallStore();
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "multi-wall",
				order: 10,
				locale: NS,
				store: wallStore,
				inject: () => createWallInjected()
			}, WallOverlay));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "multi-wall",
				order: 10,
				locale: NS,
				store: wallStore
			}, WallToggle));
		}
		//#endregion
		exports.WallOverlay = WallOverlay;
		exports.WallToggle = WallToggle;
		exports.apply = apply;
		exports.createWallStore = createWallStore;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map