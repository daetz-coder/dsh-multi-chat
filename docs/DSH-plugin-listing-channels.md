# DSH 插件曝光渠道报告 v2（聚焦：awesome-dsh-plugin 之后）

> 调研对象：`daetz-coder/dsh-multi-chat`（npm `dsh-multi-chat` v0.6.5；bundle 形态：
> `dsh.bundle.patch=./cordis.patch.yml` + `dsh.client` + `dsh.marketplace`；topics 含 `dsh-plugin`）。
> 状态：**awesome-dsh-plugin/awesome-dsh-plugin 收录已由用户自行完成（PR #1263）**，本报告不再覆盖。
> 全部结论来自一手读取各仓库 README/CONTRIBUTING/PR 模板/SKILL.md/registry JSON + GitHub/npm API 核实。
> 调研日期：2026-08-17。工作副本在 `research/channels/`。

---

## 1. dsh-market / dsh-market（npm `dshmarket`）—— 自动同步，零注册

- **是否需要主动动作**：❌ 不需要注册/提交。
- **机制**：它是「装在 DSH 设置页里的插件市场」本体，**不是目录仓库**。数据源实时取自
  `https://awesome-dsh-plugin.com/plugins.json`（精选条目 + npm 映射 + star，每日 CI 刷新），
  内置 `data/registry-snapshot.json` 离线兜底（含每条目的 `/p/<owner>/<repo>/` 详情页 URL）。
  README 原话：「This repo is the market app, not the catalog. …… Please don't PR plugin entries
  against this repo.」
- **对我们**：你的 PR #1263 合并后，dshmarket **约 1 天内自动收录**（其 README 承诺）；
  安装时它优先走 npm 版（registry 核实防抢注）——我们 npm 已发布且无生命周期脚本，属最优路径。
- **建议**：无动作。PR 合并后可在 dshmarket 里人工复核一眼（搜索 dsh-multi-chat、看详情/截图、试一键安装）。
- URL: https://github.com/dsh-market/dsh-market

## 2. awesome-dsh-plugin/dsh-find-plugin —— 自动同步，零注册

- **是否需要主动动作**：❌。
- **机制**：会话内找插件工具。实时 GitHub `dsh-plugin` topic 搜索、按 star 重排（5 分钟每查询缓存、
  匿名 API）；**仅当某插件已收录于 awesome-dsh-plugin 时**，才用其人工双语描述（plugins.json）替换
  GitHub 描述（`lang` 参数选语言），排序不受影响。
- **对我们**：已打 topic → 本来就搜得到；PR #1263 合并后描述会被本站手工描述增强。
- **建议**：无动作。URL: https://github.com/awesome-dsh-plugin/dsh-find-plugin

## 3. whyihaveyou/dsh-suite —— 需要主动（开收录 Issue）

- **是否需要主动动作**：✅ 是（它不会自动收录新仓库；`data/plugins.json` 由维护者人工写入，
  小时级刷新只更新 star 不新增条目）。
- **提交步骤**（CONTRIBUTING.md + `.github/ISSUE_TEMPLATE/plugin-submission.md`）：
  1. 开 Issue（标题 `[收录] …`，labels 自动带 `catalog, needs-compat-check`），填写：
     - npm 包名：`dsh-multi-chat`
     - 仓库：`daetz-coder/dsh-multi-chat`
     - 一句话描述：**中英双语各 ≤140 字符**（schema 要求 `description.en` + `description.zh` 缺一报错）
     - 分类：`ui`（docs/categories.md 11 类：tools/skills/ui/session/llm/sandbox/orchestration/storage/acp/preset/utility；`ui` = Web UI 扩展，示例 dsh-web-ui / DSH-better-sidebar）
     - DSH 最低版本（如已知）；是否已实测。
  2. 维护者核实（repo/stars 用 gh api 验证）后写入 `data/plugins.json`（`compat.status=unknown`、`featured=false`）。
  3. 维护者跑 `npm run gen:readme`（README 表格自动生成，**严禁手改表格**）+ 兼容检查 → PR → CI 合并。
  4. 收录后建议把徽章挂回自己 README：
     `[![featured on dsh-suite](https://img.shields.io/badge/featured%20on-dsh--suite-4d6bfe)](https://whyihaveyou.github.io/dsh-suite/)`
- **对我们**：目前 plugins(1473) 与 watchlist(785) 中均**无** dsh-multi-chat（已核实）。
  兼容日检：无 `@deepseek-ai/cordis/dsh` peer 时判 `unknown`，可接受，不影响收录。
- **收益**：活目录（每小时刷新 + 每日真实安装兼容实测）+ DSH 设置内 Store 标签页（`@dsh-suite/plugin-manager`）。
- **建议**：P1，开这个 Issue。URL: https://github.com/whyihaveyou/dsh-suite

## 4. Dominic789654/awesome-deepseek-harness —— 已收录，无需动作

- **当前状态**：✅ 已收录。EN `README.md` L1345（位于 `## UI / Clients` 分类，L943–1373），
  中文 `README.zh-CN.md` L1328。描述：`Multi-chat plugin for DeepSeek Harness.`
- **PR/提交规范**（CONTRIBUTING.md）：
  - PR 同时改 `README.md`（英文，分隔符 ` — `）与 `README.zh-CN.md`（中文，` —— `），两边各加一行保持同步；
  - 格式 `- [Name](https://link) — 一句话描述。`；分类内尽量按字母序；每个逻辑变更一个 PR；
  - 仓库需带 `dsh` / `dsh-plugin` / `deepseek-harness` topic（自动检查会验证）；
  - 自动检查只查你新增的行：格式、描述非空、链接可达（404 即失败）、topic、**只允许触碰两个 README**；
  - `main` 受保护：需 PR + 通过检查；建议开启「Allow edits by maintainers」、rebase 前推送。
- **对我们**：无需动作。可选：以后想改描述（如 "Run & monitor N DSH conversations side-by-side, with a LAN gateway"）按上述规范开一个 PR 即可。
- URL: https://github.com/Dominic789654/awesome-deepseek-harness

## 5. beancookie/awesome-dsh-plugin —— 需要主动（PR 改双 README）

- **是否需要主动动作**：✅ 是（未收录，已核实）。
- **提交步骤**（contributing.md + AGENTS.md + `.github/pull_request_template.md`）：
  1. Fork；在 `README.md`（中文，GitHub 默认展示）与 `README.en.md`（英文）**「🎨 UI 增强 UI Enhancements」分类下各加同一行**：
     ```markdown
     - [daetz-coder/dsh-multi-chat](https://github.com/daetz-coder/dsh-multi-chat) - 一句话描述，以句号结尾。
     ```
     - URL 必须是 `https://github.com/...`（其他域名解析器不认）；
     - 分隔符 ` - `（英文）/ ` — `（中文）均可；分类取最近 `###` 标题，只允许 11 个固定分类（ui/theme/session/memory/tools/skill/workflow/notify/model/dev/fun）；
     - **两个文件必须同步**，否则构建报 `missing: <url>` 失败；不要手改 `docs/`、`data/`（脚本生成）；不要改计数行。
  2. 可选本地验证：`node scripts/probe-npm.mjs` + `node scripts/build-site.mjs`（PR 分支不触发 CI，合并到 main 后 CI 自动重建站点）。
  3. 开 PR（模板核对：`dsh.bundle` ✅ / 双文件各一行 ✅ / 无营销词 ✅ / `dsh-plugin` topic ✅；推荐：npm ✅、
     官方包用 peerDependencies——我们无依赖，天然合规）。
- **对我们**：收益 = 双语网站（beancookie.github.io/awesome-dsh-plugin，324 插件）+ 它的 dsh-plugin-registry
  会话内安装器。分类归 UI 增强。
- **建议**：P1，发起这个 PR。URL: https://github.com/beancookie/awesome-dsh-plugin

## 6. HubaKing/dsh-community-plugins —— 非收录渠道（skill 型插件）

- **注册方式/机制**：它**不是目录或市场**，而是一个注册**全局 skill** 的 bundle 插件：
  - `package.json` 声明 `dsh.bundle.patch`；`cordis.patch.yml` 把插件挂进 loader（装完需重启）；
  - `index.js` 把 `skills/dsh-community-plugins/` 注册进 `ctx.skills`，每个会话的 `<available_skills>` 都会出现该 skill；
  - SKILL.md 教 agent：① 先读本机 `$DSH_HOME/profiles/web/package.json` 的 bundles/dependencies 确认已装什么；② 按可靠性排序的发现渠道（本机市场工具 → 目录索引 Oh-My-DSH like-study1 `data/plugins.json`、awesome-dsh-plugin → web_search → GitHub topic API → npm）；③ 评估（危险信号清单，如 install 脚本/child_process/网络外发）；④ 安装（bundle 需重启、client-only/纯 cordis 可热挂载；npm-first、批量、minimumReleaseAge 供应链策略）；⑤ 装后验证。
- **对插件作者的意义**：**没有面向单个插件的注册/提交入口**。成为「可被这个 skill 推荐」的条件 = 出现在它引用的渠道里：`dsh-plugin` topic（✅ 已有）、npm（✅ 已发布）、awesome-dsh-plugin（PR #1263 合并后 ✅）、like-study1/Oh-My-DSH 目录（见渠道 8c）。不建议给它的 SKILL.md 加插件条目（通用指南，改动影响所有用户）。
- **我们可做的可选动作**：装它只是为了让 Agent 会话自己具备发现/评估能力，与曝光无关。
- URL: https://github.com/HubaKing/dsh-community-plugins

---

## 7. 其他渠道

| 渠道 | 收录方式 | 是否需要主动动作 | 我们的状态 |
|---|---|---|---|
| a. hikariming/dshfind（dshfind.com） | 自动聚合 `dsh-plugin` topic（`pnpm gen:data` 用 gh CLI）；README 明示「加 topic，下次刷新自动出现」 | ❌ | ✅ 已收录（数据 src/lib/plugins-real.ts L4476）；可选把徽章挂 README：`https://dshfind.com/api/badge/daetz-coder/dsh-multi-chat?lang=zh` |
| b. dsh-external/hub（中枢） | —— | ❌（已失效） | `git ls-remote https://github.com/dsh-external/hub.git` → **Repository not found**；fendouai README 亦证实 dsh-external org 于 2026 年中清空/重定向；vlln 文档注明 hub 私有、匿名 404。**不可作为渠道，无需动作** |
| c. like-study1/Oh-My-DSH | ① 主题登记（4h 初筛 + **人工策展择优**）；② 开 Issue 登记；③ PR 修改 `data/curated.json`（详见其 CONTRIBUTING.md） | 可选 | topic 已在监测范围（1760 个），但**精选目录未收录**（已核实 data/plugins.json 无 dsh-multi-chat）；若要收录走 Issue 或 PR |
| d. fendouai/awesome-deepseek-harness | PR 改 `data/`（YAML：name/repository/type/category/description/capabilities/status/license）或开 `.github/ISSUE_TEMPLATE/submit-project.yml` issue；最简单加 topic + PR 到 data/ | 可选（P2） | 未收录（已核实） |
| e. dsh.pub（dsh-pub/dsh-pub） | ① 网页表单 https://dsh.pub/submit（无需 fork，Turnstile→Worker→GitHub App 自动开 submission PR→CI 校验→自动合并→listed 徽章）；② 每日 01:00(Asia/Shanghai) topic 同步自动钉 commit | 可选（P2） | topic 命中日同步；checkout 快照中未见 |
| f. 纯 topic 自动类：AwesomeHou/dsh-plugin-marketplace、YELEBAI/dsh-plugin-marketplace、NoWint/Oh-My-DSH、w2112515/dsh-plugin-marketplace、bradeGithub/DSH-Plugins-Marketplace | 全部基于 `dsh-plugin` topic 自动扫描/同步，无手动提交 | ❌ | 均已命中：YELEBAI 已收录（guided 模式，security-scan pending 转直装）；AwesomeHou 自动可见；其余由 topic 覆盖，无需动作 |
| g. **deepseek-harness-plugin.com**（独立社区目录） | **网页表单** `POST https://deepseek-harness-plugin.com/api/submit`（JSON：`type=plugin, repo=owner/repo, name, category, description, contact, website(honeypot 蜜罐留空)`）；**人工审核**（usually within a few days，页面原话）；Astro 静态站，非目录仓库而是独立站点，footer 只链官方 upstream | ✅（已提交） | **2026-08-17 已成功提交**，接收 ID `submissions:2026-08-17:1786939764449`，category=ui；等待人工审核收录（页面上 82 个 UI 增强插件），收录后自动展示 |

---

## 行动清单（awesome-dsh-plugin PR #1263 之后）

1. **P1（主动提交）**：whyihaveyou/dsh-suite —— 开 `[收录]` Issue（模板填 npm 名/仓库/双语描述/分类 ui/实测状态）。
2. **P1（主动提交）**：beancookie/awesome-dsh-plugin —— PR 在 `README.md` 与 `README.en.md` 的 UI 增强分类各加一行。
3. **P2（可选主动）**：like-study1/Oh-My-DSH —— Issue 登记或 PR 改 `data/curated.json`；fendouai/awesome-deepseek-harness —— PR 到 data/；dsh.pub —— 网页表单提交。
4. **零动作**：dsh-market、dsh-find-plugin（等 PR #1263 合并自动同步）；Dominic（已收录）；HubaKing（非收录渠道）；hikariming dshfind（已收录，可选挂徽章）；所有 topic 自动类（AwesomeHou/YELEBAI/NoWint/w2112515/bradeGithub）；dsh-external/hub（已失效）。

**通用提醒**：各列表描述均要求「只说功能、无营销词、以句号结尾、尽量双语」；保持 npm 版本与已提交产物同步（当前 0.6.5）可解锁所有市场的直装/免构建通道；PR 合并后 1-2 天内在 dshmarket / dshfind / awesome-dsh-plugin.com 复核可见性。