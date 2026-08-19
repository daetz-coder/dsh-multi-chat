# 💬 dsh-multi-chat —— 多对话，一屏驾驭

[English](README.md) | **中文**

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-multi-chat"><img src="https://img.shields.io/npm/v/dsh-multi-chat" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-multi-chat"><img src="https://img.shields.io/npm/dm/dsh-multi-chat" alt="npm downloads"></a>
  <a href="https://github.com/daetz-coder/dsh-multi-chat/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/dsh--plugin-community-brightgreen" alt="dsh-plugin"></a>
</p>

<p align="center">
  <a href="https://awesome-dsh-plugin.com/p/daetz-coder/dsh-multi-chat/"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="awesome-dsh-plugin"></a>
  <a href="https://dshfind.com/plugins/daetz-coder/dsh-multi-chat"><img src="https://dshfind.com/api/badge/daetz-coder/dsh-multi-chat" alt="dshfind"></a>
  <a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin"><img src="https://img.shields.io/badge/listed%20on-awesome--dsh--plugin-4d6bfe" alt="listed on awesome-dsh-plugin"></a>
</p>

> **在 DeepSeek Harness 里同时开 N 个对话，并排盯住每一个 Agent 的实时进度，还能用手机/平板躺着看。** 一个浏览器，从「一次一个对话」升级成「全景多对话驾驶舱」。

给 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 官方 Web 界面装上一面**多窗口墙**：在一张网格里同时显示 N 个正在运行的 DSH 对话实例（每个实例独立跑一个任务），所有 Agent 的实时进度、对话、输出**一眼尽收**，不用在无数标签页/窗口之间切来切去。

## ✨ 它能做什么

| 能力 | 说明 |
|------|------|
| 📺 **多窗口** | 侧边栏一键进入，右侧对话区原位变成窗口网格，一个端口一格，并排看全部任务 |
| 🔍 **自动发现** | 扫描端口区间自动发现正在运行的 DSH 实例，也可手动管理 |
| ➕ **一键新建窗口** | 墙内直接启动全新 DSH 实例，凑成你的多对话矩阵 |
| 📱 **手机访问** | 点「手机访问」自动起一个**内置带口令认证的局域网网关**，手机打开 URL、输入口令即可看进度 |
| 🛑 **窗口控制** | 单窗口放大、刷新、新标签页打开、关闭实例、列数切换（自动/1/2/3/4/6）|

> **多对话 = 多端口。** 启动 N 个 `dsh web --port <n>`，每个实例独立跑一个对话/任务；在任意一个实例里打开多窗口墙，即可并排看到全部。

## 📸 运行效果

**🖥️ Windows · 双对话并排** —— 两个正在运行的 DSH 实例并排列出，每格都是完整的官方对话界面，带实时在线状态点与单窗控制（放大 / 刷新 / 新标签页 / 移除）：

![Windows 双对话：两个 DSH 实例并排显示](assets/01-windows-dual-chat.png)

**📱 iPad · 双对话移动端** —— 同一局域网内，iPad 打开带口令认证的网关地址，即可在平板上一屏并排盯住两个 Agent 的实时进度：

![iPad 双对话：平板端并排显示两个 DSH 实例](assets/02-ipad-dual-chat.png)

**🖥️ Windows · 三对话全景** —— 3 列网格并排显示 3 个正在运行的实例，一屏尽收全部 Agent，把「一次一个对话」升级成「全景多对话驾驶舱」：

![Windows 三对话：3 列网格并排显示 3 个 DSH 实例](assets/03-windows-triple-chat.png)

## 🚀 30 秒上手

```bash
# 1. 安装 —— 从 npm 官方源一条命令搞定（无需下载任何 CLI）：
dsh plugin --profile web add dsh-multi-chat

#    ……或通过插件自带的 npx CLI（先打包再安装）：
npx dsh-multi-chat install

# 2. 启动几个实例
npx dsh-multi-chat start --ports 3080,3081,3082

# 3.（重新）打开任意实例，点侧边栏底部「多窗口」→ 完成 🎉
```

## 为什么这样做

- **不改动任何官方逻辑**：插件只注册两个**增量列表槽位**（`conversation.view` 视图环条目、`sidebar.footer.action` 侧边栏快捷入口）和五个只读 JSON 路由（`/multi/api/ports`、`/multi/api/status`、`/multi/api/stop`、`/multi/api/create`、`/multi/api/link`）。不替换任何既有槽位、不改写任何行、不触碰会话/代理/工具等核心逻辑。
- **界面就是官方界面**：墙是官方视图环的一个视图，渲染在对话主面板内（不是弹层），主题、字号、图标、控件全部走官方 `--dsw-*` token 与官方 primitives（Button/Input/Menu/StateDot）。
- **递归防护**：墙永远不嵌入自身端口；被嵌入页面带 `?multi-wall=embed` 标记，不注册任何墙界面，杜绝「墙中墙」无限递归。
- **最小改动**：一个声明式 client 插件包 —— 包内自带 `dsh.bundle.patch` + `cordis.patch.yml`，DSH 启动时自动作为 bundle 层挂载，无需手改任何文件。

## 目录结构

```
dsh-multi-chat/                    # 单包结构
  lib/                             # 已构建产物（lib/index.js + lib/client.js + 类型）
  src/                             # 源码（node half + browser half）
  bin/dsh-multi-chat.mjs           # 跨平台 npx CLI（install/start/stop/gateway）
  scripts/
    install-plugin.ps1             # 打包 + 装进 profile（DSH 自动挂载 bundle 层）
    start-multi.ps1 / stop-multi.ps1 # 启停多个 dsh web 实例
    gateway.mjs                    # 带令牌认证的反向代理网关（手机/远程访问）
  cordis.patch.yml                 # DSH bundle 层声明
  harness-src/                     # 官方 deepseek-harness 源码（开发/构建用）
```

## 安装与启用（Windows）

```powershell
# 1) 打包并装进 web profile。插件声明了 dsh.bundle.patch，
#    DSH 会自动挂载其 bundle 层 —— 无需手改 patch。
.\scripts\install-plugin.ps1

# 2) 重启 dsh web，打开任意实例
dsh web --port 3084
# 浏览器打开 http://127.0.0.1:3084 ，侧边栏底部出现「多窗口」按钮
```

或手动：

```bash
npm pack                                                  # 得到 tarball (dsh-multi-chat-1.0.1.tgz)
dsh plugin --profile web add dsh-multi-chat-1.0.1.tgz     # DSH 自动把包加入 bundle 层栈
```

卸载（一条命令，无需手动清理任何文件 —— 重启 `dsh web` 后生效）：

```bash
dsh plugin --profile web remove dsh-multi-chat
```

## 使用

1. 先启动若干实例：`.\scripts\start-multi.ps1 -Ports "3080,3081,3082,3084"`（或手动 `dsh web --port <n>`）。
2. 打开任意实例，点侧边栏底部的「多窗口」快捷入口（或点对话区头部的「多窗口」标签页）。
3. 墙视图内：自动发现实例（自动排除自身端口）、列数切换（自动/1/2/3/4/6，默认横向铺满）、点标题放大、⟳ 单独刷新、↗ 新标签页打开、✕ 从视图移除、全部刷新、实时在线状态点。布局保存在 localStorage。
4. 退出墙：点工具栏**右上角的「退出」按钮**，一键切回对话视图。

## 手机 / 远程访问（内置认证网关）

官方 `dsh web` 出于安全**刻意禁止 `--host 0.0.0.0`**（会向网络暴露远程代码执行）。本插件内置了一个**带令牌认证的内联网关**：点工具栏「手机访问」按钮，它会**自动**为本实例启动一个网关（监听 `0.0.0.0`，反向代理到 `127.0.0.1:<本实例端口>`），并返回局域网 URL + 登录口令。

```text
点击「手机访问」→ 得到：
  手机在同一网络时可用：http://10.105.7.204:9477  口令：2efb23eade16
```

手机打开该 URL、输入口令即可进入完整 DSH 界面。网关的安全模型：

- HMAC 签名的 HttpOnly/SameSite 会话 Cookie（默认 12h），`?token=` 供脚本快捷使用，按 IP 限流登录失败
- 所有代理请求把 Host/Origin 重写为回环目标，官方 `/api` 浏览器信任栅栏（DNS-rebinding 防线）判定为本地请求，无需重启加 `--trusted-host`
- WebSocket 升级与 SSE 流原样透传
- 目标端口撞上 Windows 排除段或已占用时，自动回退到 OS 分配的空闲端口

> 也有独立的 `scripts/gateway.mjs`（带可选 TLS）供进阶场景手动使用。

## 分发与安装

`dsh-multi-chat` 已发布到 npm（无作用域公开包），并在 GitHub 按 tag 发布 Release（源码 zip/tarball）。下面每条渠道殊途同归：包成为 web profile 的依赖 → DSH 自动调和进 bundle 层栈（包声明了 `dsh.bundle.patch`，自带 `cordis.patch.yml` 自动挂载，无需手改任何文件）→ 重启 `dsh web` 生效。

### 安装 / 卸载速查表

| 渠道 | 安装 | 卸载 |
|------|------|------|
| **一条命令（npm 官方源）** | `dsh plugin --profile web add dsh-multi-chat` | `dsh plugin --profile web remove dsh-multi-chat` |
| **npx（免下载）** | `npx dsh-multi-chat install` | `dsh plugin --profile web remove dsh-multi-chat` |
| **全局 CLI（npm）** | `npm i -g dsh-multi-chat` 然后 `dsh-multi-chat install` | `dsh plugin --profile web remove dsh-multi-chat` 然后 `npm rm -g dsh-multi-chat` |
| **Tarball（离线）** | `npm pack` → `dsh plugin --profile web add ./dsh-multi-chat-1.0.1.tgz` | `dsh plugin --profile web remove dsh-multi-chat` |
| **Git clone** | `node bin/dsh-multi-chat.mjs install` | `dsh plugin --profile web remove dsh-multi-chat` |

> `dsh plugin --profile web remove dsh-multi-chat` 是**所有渠道统一的卸载命令**：
> 它从 profile 移除依赖，DSH 会自动把它从 `dsh.profile.bundles` 层栈里剔除
> （层栈按已安装依赖实时调和，详见 `dsh plugin --help`）。之后重启 `dsh web` 卸载生效。

仓库还内置了一个跨平台 CLI `dsh-multi-chat`（`bin/dsh-multi-chat.mjs`）。它的 `install` 命令会探测 `$DSH_HOME`（缺省 `~/.dsh`），把包打包进 profile 的 `plugins/` 目录，再执行 `dsh plugin --profile web add <tarball>`（与 `install-plugin.ps1` 行为一致）。

### 渠道一：npm / npx（推荐，最省事）

```bash
# 已发布到 npm —— 任意机器一句话安装（需 node + pnpm）
npx dsh-multi-chat install

# 或全局装 CLI，再从任意目录安装插件
npm i -g dsh-multi-chat
dsh-multi-chat install

# 或直接用 npx 跑单条命令（无需安装插件）
npx dsh-multi-chat start --remote --token <口令> --ports 3080,3081
npx dsh-multi-chat gateway --target 127.0.0.1:3080 --token <口令>
```

维护者发布/再发布：`npm publish`（无作用域公开包 `dsh-multi-chat`）。

### 渠道二：GitHub Release

从 [Releases](https://github.com/daetz-coder/dsh-multi-chat/releases) 下载源码 zip/tarball，解压后进目录：

```bash
node bin/dsh-multi-chat.mjs install           # 打包 + dsh plugin add（见速查表）
node bin/dsh-multi-chat.mjs start --ports 3080,3081
```

> 打 tag 后，GitHub 会自动生成 source zip/tarball 资产；也可在 Release 附加 `npm pack` 产出的 `.tgz` 作为离线安装包。

### 渠道三：git 直接安装

```bash
git clone https://github.com/daetz-coder/dsh-multi-chat.git
cd dsh-multi-chat

node bin/dsh-multi-chat.mjs install           # 打包 + dsh plugin add（见速查表）
node bin/dsh-multi-chat.mjs start --ports 3080,3081
node bin/dsh-multi-chat.mjs gateway --target 127.0.0.1:3080 --token <口令>
```

> 在 git clone 出来的仓库里也可以直接走一条命令：`dsh plugin --profile web add dsh-multi-chat` —— 直接从已发布版本安装，无需自己打包。

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
- **双语技术文档**：本仓库在根目录提供 `README.md`（英文）和 `README.zh.md`（中文），与官方 `packages/client/*` 插件的双语惯例一致。
- **纯增量、不碰核心**：只注册 `conversation.view` / `sidebar.footer.action` 两个列表槽位 + `/multi/api/*` 只读路由，不改动任何官方核心逻辑。

## 从源码构建

单包结构使用 `tsdown` 进行打包，`tsc` 生成类型声明：

```bash
npm install
npm run build          # tsc + tsdown → lib/
npx vitest run         # 测试
```

开发时可借助 `harness-src/` 目录（完整 DSH 源码）作为构建和参考工作区。

## License

MIT
