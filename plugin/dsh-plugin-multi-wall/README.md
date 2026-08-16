# @daetz-coder/dsh-plugin-multi-wall

把「多窗口墙」挂载到现有 `dsh web` 实例的 `/multi` 路径下：同一个浏览器页面里并排显示**所有**正在运行的 DSH 实例（每个实例占一个窗口，`127.0.0.1:<port>` 一个），像 tmux 一样，不用切换任务栏标签就能同时看到所有任务的进度。

纯增量扩展：只通过 `webServer` 注册新路由，**不改动任何既有行（row）或原有交互逻辑**。

## 安装

在 DSH 的 web profile 里安装本插件（`<repo>` 是本仓库路径，或用任意 git/npm 包地址）：

```bash
cd <repo>/plugin/dsh-plugin-multi-wall
pnpm pack            # 或 npm pack，得到 tarball

# 装进 web profile（等价于在该 profile 目录下 pnpm add <tarball>）
dsh plugin --profile web add <path-to-tarball>
```

然后在 profile 的 `cordis.patch.yml`（`~/.dsh/profiles/web/cordis.patch.yml`）末尾追加：

```yaml
- insert:
    - id: multi-wall
      name: '@daetz-coder/dsh-plugin-multi-wall'
```

重启 `dsh web`，打开 `http://127.0.0.1:<port>/multi` 即可看到多窗口墙。

## 配置（可选）

默认扫描 `3070–3110` 区间的端口，自动发现所有 DSH 实例。可在 patch 里覆盖：

```yaml
- id: multi-wall
  name: '@daetz-coder/dsh-plugin-multi-wall'
  config:
    mount: '/multi'        # 挂载路径
    scanFrom: 3070
    scanTo: 3110
    ports: [3080, 3081]    # 固定端口列表（设置后不再自动扫描）
    extraHosts: []         # 额外实例 host:port
```

## 与独立 wall 服务器的区别

| 方式 | 地址 | 改动量 |
| --- | --- | --- |
| 独立 wall 服务器（推荐，零改动） | `http://127.0.0.1:3999` | 不碰 DSH，直接 `node wall/server.mjs` |
| 本插件 | `http://127.0.0.1:<现有端口>/multi` | 新增一个插件行，无核心改动 |

两者共用同一套 `wall/public` 页面（见 `plugin/sync-assets.mjs`）。
