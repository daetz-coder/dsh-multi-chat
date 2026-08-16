# @deepseek-ai/dsh-client-ui-multi-wall

多窗口墙（Multi-Window Wall）：在官方 DSH Web 界面内显示所有正在运行的 DSH 实例。

- **侧边栏底部**新增一个「多窗口墙」按钮（`sidebar.footer.action` 列表槽位，纯增量）。
- 点击后打开**全屏墙视图**（`shell.overlay` 列表槽位）：一个窗口对应一个端口（`127.0.0.1:<port>`），每个窗口就是原版 DSH Web UI（iframe 嵌入），所有任务的进度同时可见，无需切换任务栏。
- 支持自动发现（扫描端口区间）、手动添加/关闭窗口、列数切换、单窗口放大、单独/全部刷新、新标签页打开、实时在线状态点。

## 不改动任何官方逻辑

本插件只做两件事：

1. **node half**：在 `webServer` 上注册两个只读 JSON 路由 `/multi/api/ports`（自动发现存活 DSH 实例）和 `/multi/api/status`（指定端口探活）。
2. **browser half**：注册两个**增量列表槽位**（`sidebar.footer.action`、`shell.overlay`），渲染墙界面。

不替换任何既有槽位、不改写任何行（row）、不触碰会话/代理/工具等核心逻辑。

## 配置（可选）

```yaml
# 覆盖自动发现区间或固定端口列表（默认扫描 3070–3110）
- id: ui-multi-wall
  name: '@deepseek-ai/dsh-client-ui-multi-wall'
  config:
    scanFrom: 3070
    scanTo: 3110
    ports: []        # 设置后不再自动扫描
```

## Model Experience

本插件不向模型请求注入任何内容，不改变模型可见输入，无 token/KV-cache 影响。

## Known Limitations and Deferred Work

- 墙视图依赖各实例 `127.0.0.1:<port>` 可直接访问；若某实例绑定到其它 host，请在外部自行配置。
- 探活只检查 index 是否含 `__DSH_BOOT__` 标记；非 DSH 服务同端口会误报为「未发现」。
