# @deepseek-ai/dsh-client-ui-multi-wall

English | [中文](README.zh.md)

Multi-window wall plugin, browser half + node half: a grid of every running DSH instance, one pane per `127.0.0.1:<port>`, rendered inside the official web GUI as an additive `conversation.view` ring entry (order 20). The view swaps the chat panel in place for a wall of iframes, each loading the original DSH Web UI with a `?multi-wall=embed` flag that suppresses the wall UI inside the pane — recursion is stopped at the source. The sidebar foot gains a `sidebar.footer.action` shortcut (order 10) that clicks the header's view-ring tab for this plugin, so the switch goes through the official view-ring state machine rather than reaching into the chat store.

The wall's business state is a single store (`dsh.multi-wall`): the discovered port list and the grid column count, persisted across view switches and reloads. Discovery, liveness, create, and stop all flow through the node half's read-only JSON routes — `/multi/api/ports` (auto-discovery, excluding nothing so the serving instance is also watchable), `/multi/api/status` (liveness of a specific port list), `/multi/api/stop` (terminate a chosen instance), `/multi/api/create` (start a fresh instance, surfacing the child's stderr on failure), and `/multi/api/link` (phone access).

Phone/remote access: the official CLI forbids `--host 0.0.0.0` (it would expose remote code execution), so `/multi/api/link` lazily starts an **inline authenticated gateway** (raw `node:net` reverse proxy with an HMAC-signed session-cookie login, targets `127.0.0.1:<self-port>`, rewrites Host/Origin so the official `/api` browser-trust fence sees a local request, and passes WebSocket upgrades through). The route returns the LAN URLs plus the login token. The returned addresses drop virtual NICs (VMware/VirtualBox/WSL/Docker/Hyper-V/VPN — unreachable from a phone) and put physical NICs (Wi-Fi/Ethernet) first; the gateway falls back to an OS-assigned port when its intended port hits a Windows excluded range or is already bound.

The `/client` exports the plugin body (`apply`/`inject`), the `WallView`/`WallToggle` components, the wall store factory, and the injected probe-face types.

## Model Experience

None. The plugin adds no prompt content, no session event, and no model-visible input; the wall, its store, and every `/multi/api/*` route are UI/discovery surfaces only. No token or KV-cache effect.

#### KV Cache effect

None. Nothing the plugin owns reaches the history tail or the model context.

## Known Limitations and Deferred Work

- **Loopback-only panes** — the wall embeds `127.0.0.1:<port>` and probes the loopback; an instance bound to a non-loopback host needs external configuration.
- **Probe is a marker check** — liveness only checks that the served index carries `__DSH_BOOT__`; a non-DSH service squatting the same port reads as "not found".
- **Session-scoped view** — the wall is a `conversation.view` ring entry, so it renders only with an active session.
- **Inline gateway is plain HTTP** — on a trusted LAN the token over plain HTTP is acceptable; across the internet prefer `publicUrl` (an external TLS gateway) or a VPN.
