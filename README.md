# dsh-plugins-multi-task — DSH 多窗口墙 (Multi-Window Wall)

在一个页面里**同时显示多个 DSH 实例**（每个实例一个窗口，`127.0.0.1:<port>` 一个端口），像 tmux 一样平铺排列，不用切换任务栏标签就能看到所有任务的实时进度。**完全不改动 DSH 原有交互逻辑** —— 每个窗口就是原汁原味的 DSH Web UI（iframe 嵌入），本扩展只负责把它们并排摆出来。

> 背景：多任务 = 多端口。启动 N 个 `dsh web --port <n>`，每个实例独立跑一个任务；墙页面自动发现这些实例并全部显示。

---

## 快速开始（独立服务器，零改动，推荐）

```bash
# 1) 已有若干 dsh web 实例在跑（如 3080/3081/3082/3084）
# 2) 启动墙服务器
node wall/server.mjs            # 默认 :3999，自动扫描 3070-3110 端口
# 3) 浏览器打开
http://127.0.0.1:3999
```

页面会自动发现所有运行中的 DSH 实例并铺成网格；也可以手动「添加端口」。每个窗口可：
- 点击标题 / ⛶ 放大到全屏（再按 Esc 还原）
- ⟳ 单独刷新、↗ 新标签页打开、✕ 关闭窗口
- 调整列数（自动 / 1 / 2 / 3 / 4 / 6），布局保存在 localStorage

### 一键启动 / 停止多个实例 + 墙（Windows）

```powershell
.\scripts\start-multi.ps1 -Ports "3080,3081,3082,3084"   # 启动 4 个 dsh web + 墙 + 打开浏览器
.\scripts\start-multi.ps1 -WallOnly                      # 只开墙，复用已在运行的实例
.\scripts\stop-multi.ps1                                  # 停止上述全部
```

## 集成进 DSH（可选插件）

把同一面墙挂到现有实例的 `/multi` 路径：见 [plugin/dsh-plugin-multi-wall/README.md](plugin/dsh-plugin-multi-wall/README.md)。

| 方式 | 地址 | 改动量 |
| --- | --- | --- |
| 独立墙服务器（推荐） | `http://127.0.0.1:3999` | 不碰 DSH |
| 插件挂载 | `http://127.0.0.1:<现有端口>/multi` | 新增一个插件行 |

## 目录结构

```
wall/                    独立墙服务器（零依赖 node:http）
  server.mjs             静态服务 + /api/ports /api/status /api/config
  public/                墙页面（index.html / wall.css / wall.js）
plugin/
  dsh-plugin-multi-wall/ 可选插件：把墙挂到现有实例 /multi
  sync-assets.mjs        同步 wall/public -> 插件 assets
scripts/
  start-multi.ps1        启动多个 dsh web 实例 + 墙 + 打开浏览器
  stop-multi.ps1         停止 start-multi 启动的全部进程
```

## 原理

- 每个窗口 = `<iframe src="http://127.0.0.1:<port>/">`，即完整未改动的 DSH Web UI（DSH 响应头无 X-Frame-Options/CSP，可被嵌入）。
- 墙服务器只做两件事：提供静态页面、探测哪些端口是存活的 DSH 实例（检查响应体含 `__DSH_BOOT__`）。
- 多任务并行靠多个 `dsh web` 实例本身（多端口），本扩展不替代、不修改任何 DSH 内部逻辑。

## 开发

```bash
node plugin/sync-assets.mjs                      # 改过 wall/public 后同步插件资源
npm test                                         # wall 服务器 + 插件冒烟测试 + 插件 e2e（真实 webserver）
node wall/test/headless-check.mjs                # 真实浏览器（headless）验证页面自动发现并渲染窗口
```

## License

MIT
