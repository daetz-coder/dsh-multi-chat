# 🧱 DSH 多窗口墙 · Multi-Window Wall

> **一个浏览器，并排盯住你所有的 AI 任务。** 让 DSH 从「一次一个对话」变成「一屏全景驾驶舱」，还能用手机躺着看进度。

给 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 官方 Web 界面装上一个**多窗口墙**：在一张网格里同时显示 N 个正在运行的 DSH 实例（每个实例独立跑一个任务），所有 Agent 的实时进度、对话、输出**一眼尽收**，不用在无数标签页/窗口之间切来切去。

## ✨ 它能做什么

| 能力 | 说明 |
|------|------|
| 📺 **多窗口墙** | 侧边栏一键进入，右侧对话区原位变成窗口网格，一个端口一格，并排看全部任务 |
| 🔍 **自动发现** | 扫描端口区间自动发现正在运行的 DSH 实例，也可手动管理 |
| ➕ **一键新建窗口** | 墙内直接启动全新 DSH 实例，凑成你的多任务矩阵 |
| 📱 **手机访问** | 点「手机访问」自动起一个**带口令认证的局域网网关**，手机扫码/输入口令即可看进度 |
| 🛑 **窗口控制** | 单窗口放大、刷新、新标签页打开、关闭实例、列数切换（自动/1/2/3/4/6）|

> **多任务 = 多端口。** 启动 N 个 `dsh web --port <n>`，每个实例独立跑一个任务；在任意一个实例里打开多窗口墙，即可并排看到全部。

## 🚀 30 秒上手

```bash
# 1. 安装（npm / npx，免手工打包补丁）
npx dsh-multi-chat install

# 2. 启动几个实例
npx dsh-multi-chat start --ports 3080,3081,3082

# 3. 打开任意实例，点侧边栏底部「多窗口墙」→ 完成 🎉
```

## 为什么这样做

- **不改动任何官方逻辑**：插件只注册两个**增量列表槽位**（`conversation.view` 视图环条目、`sidebar.footer.action` 侧边栏快捷入口）和只读 JSON 探活路由（`/multi/api/ports`、`/multi/api/status`、`/multi/api/stop`）。不替换任何既有槽位、不改写任何行、不触碰会话/代理/工具等核心逻辑。
- **界面就是官方界面**：墙是官方视图环的一个视图，渲染在对话主面板内（不是弹层），主题、字号、图标、控件全部走官方 `--dsw-*` token 与官方 primitives（Button/Input/Menu/StateDot）。
- **递归防护**：墙永远不嵌入自身端口；被嵌入页面带 `?multi-wall=embed` 标记，不注册任何墙界面，杜绝「墙中墙」无限递归。
- **最小改动**：新增一个 client 插件包 + 一个 patch 行。

## 目录结构

```
plugin/dsh-client-ui-multi-wall/   # 官方规范 client 插件包（node half + browser half）
  lib/                             # 已构建产物（lib/index.js + lib/client.js + 类型）
  src/                             # 源码（与官方 monorepo packages/client/ui-multi-wall 一致）
patches/multi-wall.yml             # 启用插件的 cordis.patch.yml insert 行
scripts/
  install-plugin.ps1               # 打包 + 装进 profile + 追加 patch + 提示重启
  start-multi.ps1 / stop-multi.ps1 # 启停多个 dsh web 实例（-Remote 可带认证网关）
  gateway.mjs                      # 带令牌认证 / 可选 TLS 的反向代理网关（手机/远程访问）
  gateway-hidden.vbs               # 无窗口启动器：用隐藏窗口方式启动 gateway.mjs（不弹控制台）
  gateway-start.ps1 / gateway-stop.ps1  # 一键静默启动/停止网关
bin/dsh-multi-chat.mjs             # 跨平台 npx CLI（install/start/stop/gateway）
harness-src/                       # 官方 deepseek-harness 源码（开发/构建用）
```

## 安装与启用（Windows）

```powershell
# 1) 打包并装进 web profile，自动追加 patch 行
.\scripts\install-plugin.ps1

# 2) 重启 dsh web，打开任意实例
dsh web --port 3084
# 浏览器打开 http://127.0.0.1:3084 ，侧边栏底部出现「多窗口墙」按钮
```

或手动：

```bash
cd plugin/dsh-client-ui-multi-wall && npm pack          # 得到 tarball
dsh plugin --profile web add <tarball>                  # 装进 profile
# 把 patches/multi-wall.yml 的 insert 行加进 ~/.dsh/profiles/web/cordis.patch.yml
```

## 使用

1. 先启动若干实例：`.\scripts\start-multi.ps1 -Ports "3080,3081,3082,3084"`（或手动 `dsh web --port <n>`）。
2. 打开任意实例，点侧边栏底部的「多窗口墙」快捷入口（或点对话区头部的「多窗口墙」标签页）。
3. 墙视图内：自动发现实例（自动排除自身端口）、列数切换（自动/1/2/3/4/6，默认横向铺满）、点标题放大、⟳ 单独刷新、↗ 新标签页打开、✕ 从视图移除、全部刷新、实时在线状态点。布局保存在 localStorage。
4. 退出墙：点工具栏**右上角的「退出」按钮**，一键切回对话视图。

## 手机 / 远程访问（认证网关）

官方 `dsh web` 出于安全**刻意禁止 `--host 0.0.0.0`**（会向网络暴露远程代码执行）。因此跨设备访问的正确姿势是：实例保持仅本机回环，在实例前挂一个**带令牌认证的网关**，由网关对外监听 `0.0.0.0`。

```bash
# 一个实例 + 一个认证网关（手机在同一内网时打开 http://<局域网IP>:8443 登录）
node scripts/gateway.mjs --target 127.0.0.1:3080 --listen 0.0.0.0:8443 --token <口令>

# 加密：提供证书即走 HTTPS（跨公网必须，否则用 VPN）
node scripts/gateway.mjs --target 127.0.0.1:3080 --listen 0.0.0.0:8443 --token <口令> --tls-cert cert.pem --tls-key key.pem
```

网关的安全模型：HMAC 签名的 HttpOnly/SameSite 会话 Cookie（默认 12h）、`Authorization: Bearer` 与 `?token=` 供脚本使用、按 IP 限流登录失败；所有代理请求把 Host/Origin 重写为回环目标，官方 `/api` 浏览器信任栅栏（DNS-rebinding 防线）因此判定为本地请求，无需重启加 `--trusted-host`；WebSocket 升级与 SSE 流原样透传。

`start-multi.ps1` 也能一键带网关启动：

```powershell
.\scripts\start-multi.ps1 -Ports "3080,3081" -Remote -Token "my-secret"
# 或自签名加密：-TlsCert cert.pem -TlsKey key.pem
```

## 分发与安装

仓库内置跨平台 CLI `dsh-multi-chat`（`bin/dsh-multi-chat.mjs`），下面三种渠道都可安装。CLI 的 `install` 会探测 `$DSH_HOME`（缺省 `~/.dsh`）并幂等地追加启用 patch（与 `install-plugin.ps1` 行为一致）。

### 渠道一：npm / npx（推荐，最省事）

```bash
# 发布到 npm 后，任意机器一句话安装
npx dsh-multi-chat install

# 或直接 npx 跑单条命令（无需安装）
npx dsh-multi-chat start --remote --token <口令> --ports 3080,3081
npx dsh-multi-chat gateway --target 127.0.0.1:3080 --token <口令>
```

维护者发布：`npm publish`（无作用域公开包 `dsh-multi-chat`）。

### 渠道二：GitHub Release

从 [Releases](https://github.com/daetz-coder/dsh-multi-chat/releases) 下载源码 zip/tarball，解压后进目录：

```bash
node bin/dsh-multi-chat.mjs install           # 打包 + dsh plugin add + 追加启用 patch
node bin/dsh-multi-chat.mjs start --ports 3080,3081
```

> 打 tag 后，GitHub 会自动生成 source zip/tarball 资产；也可在 Release 附加 `npm pack` 产出的 `.tgz` 作为离线安装包。

### 渠道三：git 直接安装

```bash
git clone https://github.com/daetz-coder/dsh-multi-chat.git
cd dsh-multi-chat

node bin/dsh-multi-chat.mjs install           # 装插件
node bin/dsh-multi-chat.mjs start --ports 3080,3081
node bin/dsh-multi-chat.mjs gateway --target 127.0.0.1:3080 --token <口令>
```

### 本仓库直接运行（开发）

```bash
node bin/dsh-multi-chat.mjs install
node bin/dsh-multi-chat.mjs start --ports 3080,3081
node bin/dsh-multi-chat.mjs stop
node bin/dsh-multi-chat.mjs gateway --target 127.0.0.1:3080 --token <口令>
```

## 🔍 发现与生态

本插件遵循 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方 client 插件规范：

- **在 GitHub 插件生态中被发现**：给本仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic，即可在官方 [`dsh-plugin` topic 页](https://github.com/topics/dsh-plugin) 被搜索到（官方推荐的第三方插件发现方式）。
- **三语技术文档**：插件包 `plugin/dsh-client-ui-multi-wall/` 下提供 `README.md`（英文）、`README.zh.md`（中文）与 `README.i18n.yaml`（双语一致性记录），结构与官方 `packages/client/*` 插件一致。
- **纯增量、不碰核心**：只注册 `conversation.view` / `sidebar.footer.action` 两个列表槽位 + `/multi/api/*` 只读路由，不改动任何官方核心逻辑。

## 在官方 monorepo 中的位置

`packages/client/ui-multi-wall` 是遵循官方 client 插件规范的包（tsconfig host/client 分离、tsdown clientBundle、locales zh/en、invariant 伴随、HMR 安全测试），并已接入 `packages/bundle/web-app` 的 dsh.client roster 与 `tsconfig.client.json` 聚合。构建：

```bash
cd harness-src
pnpm install
pnpm --filter @deepseek-ai/dsh-client-ui-multi-wall bundle   # 产出 lib/client.js
npx vitest run packages/client/ui-multi-wall                 # 14 项测试
```

## License

MIT
