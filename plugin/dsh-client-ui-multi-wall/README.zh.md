# @deepseek-ai/dsh-client-ui-multi-wall

[English](README.md) | 中文

多窗口墙插件（浏览器端 + 服务端）：把每一个正在运行的 DSH 实例铺成一张网格，一个窗口对应一个 `127.0.0.1:<port>`，作为增量 `conversation.view` 视图环条目（order 20）渲染在官方 Web 界面内。该视图将对话区原位替换为一张 iframe 墙，每个 iframe 加载带 `?multi-wall=embed` 标记的原版 DSH Web UI，该标记会在被嵌入页面内抑制墙界面——从根上杜绝「墙中墙」无限递归。侧边栏底部新增 `sidebar.footer.action` 快捷入口（order 10），点击后触发头部本插件的视图环标签页，从而经官方视图环状态机完成切换，而非直接读写对话 store。

墙的业务状态只有一个 store（`dsh.multi-wall`）：已发现的端口列表与网格列数，跨视图切换与重载均可持久化。发现、探活、新建与关闭全部经服务端只读 JSON 路由完成——`/multi/api/ports`（自动发现，不排除任何端口，因此服务实例自身也可被监视）、`/multi/api/status`（指定端口列表的存活探活）、`/multi/api/stop`（终止所选实例）、`/multi/api/create`（启动全新实例，失败时回传子进程 stderr 等真实原因）、以及 `/multi/api/link`（手机访问）。

手机/远程访问：官方 CLI 出于安全禁止 `--host 0.0.0.0`（会暴露远程代码执行），因此 `/multi/api/link` 会懒启动一个**内联带令牌认证的网关**（基于 `node:net` 的反向代理，HMAC 签名的会话 Cookie 登录，目标为 `127.0.0.1:<self-port>`，重写 Host/Origin 使官方 `/api` 浏览器信任栅栏判定为本地请求，并原样透传 WebSocket 升级）。该路由返回局域网 URL 与登录口令；返回的地址会过滤掉虚拟网卡（VMware/VirtualBox/WSL/Docker/Hyper-V/VPN 等，手机无法直达），并把物理网卡（Wi-Fi／以太网）排在最前。当目标端口落入 Windows 排除段或已被占用时，网关自动回退到 OS 分配的端口。

`/client` 导出接口包括插件本体（`apply`/`inject`）、`WallView`/`WallToggle` 组件、墙 store 工厂，以及注入的探活面类型。

## 模型体验

无影响。本插件不添加任何提示词内容、不产生会话事件、不注入任何模型可见输入；墙、其 store 以及所有 `/multi/api/*` 路由都只是 UI／发现面。无 token 或 KV-cache 影响。

#### KV Cache 影响

无影响。本插件拥有的任何内容都不会进入历史尾部或模型上下文。

## 已知限制与暂缓事项

- **仅回环窗口**——墙内嵌 `127.0.0.1:<port>` 并探测回环地址；绑定到非回环主机的实例需在外部自行配置。
- **探活仅做标记检查**——存活判定只检查所服务页面的 index 是否含 `__DSH_BOOT__`；同端口被非 DSH 服务占用会误报为「未发现」。
- **会话作用域视图**——墙是 `conversation.view` 视图环条目，故仅在存在活跃会话时渲染。
- **内联网关为明文 HTTP**——受信任的局域网内明文输送口令可接受；跨公网时优先使用 `publicUrl`（外部 TLS 网关）或 VPN。
