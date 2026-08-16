# dsh-plugins-multi-task — DSH 多窗口墙（官方界面内嵌）

在 **官方 DSH Web 界面内**显示所有正在运行的 DSH 实例：侧边栏底部新增一个「多窗口墙」按钮，点击后打开**全屏墙视图**——一个窗口对应一个端口（`127.0.0.1:<port>`），每个窗口就是**原版 DSH Web UI**（iframe 嵌入），所有任务的进度同时可见，不用切换任务栏标签。

> 多任务 = 多端口。启动 N 个 `dsh web --port <n>`，每个实例独立跑一个任务；在任意一个实例里打开多窗口墙，即可并排看到全部。

## 为什么这样做

- **不改动任何官方逻辑**：插件只注册两个**增量列表槽位**（`sidebar.footer.action`、`shell.overlay`）和两个只读 JSON 探活路由（`/multi/api/ports`、`/multi/api/status`）。不替换任何既有槽位、不改写任何行、不触碰会话/代理/工具等核心逻辑。
- **界面就是官方界面**：墙视图渲染在官方 AppFrame 的 overlay 层内，主题、字号、图标全部走官方 `--dsw-*` token。
- **最小改动**：新增一个 client 插件包 + 一个 patch 行。

## 目录结构

```
plugin/dsh-client-ui-multi-wall/   # 官方规范 client 插件包（node half + browser half）
  lib/                             # 已构建产物（lib/index.js + lib/client.js + 类型）
  src/                             # 源码（与官方 monorepo packages/client/ui-multi-wall 一致）
patches/multi-wall.yml             # 启用插件的 cordis.patch.yml insert 行
scripts/
  install-plugin.ps1               # 打包 + 装进 profile + 追加 patch + 提示重启
  start-multi.ps1 / stop-multi.ps1 # 启停多个 dsh web 实例
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
2. 打开任意实例，点侧边栏底部的「多窗口墙」。
3. 墙视图内：自动发现实例 / 手动添加端口、列数切换（自动/1/2/3/4/6）、点标题放大（Esc 退出）、⟳ 单独刷新、↗ 新标签页打开、✕ 关闭窗口、全部刷新、实时在线状态点。布局保存在 localStorage。

## 在官方 monorepo 中的位置

`packages/client/ui-multi-wall` 是遵循官方 client 插件规范的包（tsconfig host/client 分离、tsdown clientBundle、locales zh/en、invariant 伴随、HMR 安全测试），并已接入 `packages/bundle/web-app` 的 dsh.client roster 与 `tsconfig.client.json` 聚合。构建：

```bash
cd harness-src
pnpm install
pnpm --filter @deepseek-ai/dsh-client-ui-multi-wall bundle   # 产出 lib/client.js
npx vitest run packages/client/ui-multi-wall                 # 9 项测试
```

## License

MIT
