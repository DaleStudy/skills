---
name: dsh-profile-builder
description: "按 DSH 官方约定创建、改造、迁移、升级、体检 profile，并可为 profile 增加与官方 4 模式并列的第 5 个 agent 模式（自定义 preset）。以下情况激活：(1) 用户提到 dsh profile、profile 搭建、制作 profile、新建 profile 时；(2) 要把现有 profile 按官方基线重建、迁移到另一台机器、分享或升级时；(3) 需要排查 profile 启动失败、检查 profile 纯净性与合规性时；(4) 要给 web 类 profile 增加自定义 agent 模式、自定义 agent 预设、agent-preset 时；(5) 用户要求在 DSH NEXT 里做一个独立运行环境时。流程强制先访谈取证、产出 ≤5 行契约并获用户明确确认后才写盘；全程不修改、不切换 desktop profile。"
license: MIT
compatibility: "Requires DSH (DeepSeek Harness) with $DSH_HOME/profiles; Node.js 20+; macOS or Linux"
metadata:
  author: DaleStudy
  version: "1.0.1"
allowed-tools: Bash(node:*) Bash(pnpm:*) Bash(npx:*) Bash(dsh:*) Bash(git:*) Bash(gh:*) Bash(mkdir:*) Bash(cp:*) Bash(ls:*) Bash(cat:*)
---

# dsh-profile-builder

把一个"想法"变成**可复现、可迁移、可升级、可验收**的 DSH profile：从官方模板长出来，定制只走 patch 层，每一步有脚本可验、有备份可退。核心资产是 `~/.dsh/skills/dsh-profile-builder/scripts/` 下的六个 Node 脚本（离线可跑、无网络依赖）。

## 1. 核心原则（违反任何一条就停）

1. **官方模板做基线**：永远用官方模板 init（`web` 默认），不 clone `desktop`、不手拼 bundle 列表。
2. **未确认契约 = 零写入**：没有用户明确的"确认契约"，不建目录、不改文件、不装依赖、不跑会写盘的命令。
3. **desktop 只读**：不修改 desktop profile、不切 active、不打开/关闭桌面设置；所有验证走隔离 `DSH_HOME` 或"保留但不激活"的验收 profile。
4. **纯净四检硬失败**：机器绑定值、明文密钥、生成物、冗余插件集 → `static-check` 报错即中止，不允许"先带着、回头清"。
5. **升级只在明确要求时**：仅用户明说"升级 / 进化 / 跟进新版本"才动 W4；默认只记录当前运行时版本。
6. **证据分层，不夸大**：L0 静态 / L1 dump / L2 隔离启动 / L3 负例回归；`dump` 通过 ≠ 已启动，未做的验收层必须写进报告。

## 2. Phase 0：硬门访谈（每次任务的第一个动作）

先读 `references/10-interview-tree.md`（决策树全文），按其中的节点与轮次执行：

1. **只读取证**：自己查 active profile、profile 清单、DSH 版本、bundles、已有模式、日志、命名占用——事实不问用户。
2. **按 frontier 成轮提问**：N1 目标 → N2 名字 → N3 基线 → N4 定制 → N5 第 5 模式 → N6 纯净 → N7 迁移 → N8 验收 → N9 演化；每问必须带推荐答案与一句理由。
3. **产出 ≤5 行契约**（profile / 基线 / patch 清单 / 迁移包 / 验收与回滚点），逐字向用户复述。
4. **拿到明确确认**（"确认契约"/"按这个做"/"OK 开工"）才解锁写盘；只回答完问题不算确认。
5. **零写入清单**（确认前禁止）：不建 `$DSH_HOME/profiles/<name>`、不改 package.json / cordis.patch.yml / compatibility.json / pnpm-lock.yaml、不跑 pnpm install / dsh plugin、不生成模式 insert 与账本、不跑会写盘的 `--dump-config` / `mode-base emit --write` / export / import、不切 active、不删任何东西。唯一允许的写前提是用户单独确认"先 dump 现有 profile 看看"。

## 3. 决策树摘要（细节见 references/10-interview-tree.md）

| 节点 | 要定的事 | 推荐默认 | 落点 |
|---|---|---|---|
| N1 目标 | 新建 / 改造 / 迁移 / 升级 / 排障 / 只要模式 | 新建（W1） | W1–W6 路由 |
| N2 名字 | 用途×稳定度、目录名 | `main` 或 `lab`，kebab-case | 契约第 1 行 |
| N3 基线 | `web` / `headless` / `acp` / `sdk` / `sdk-minimal` | `web`（可桌面切换、可做第 5 模式） | 契约第 2 行 |
| N4 定制 | 模型路由 / 主题 / 插件 / MCP / skill / workspace | 全不配；点名的才配 | patch 清单 |
| N5 第 5 模式 | 显示名 / 描述 / id 后缀 / order | 第一版不做；要做则 Phase A 纯 fork 先验收 | patch insert |
| N6 纯净 | 四检标准 | 硬失败 | static-check |
| N7 迁移 | 不做 / git / 远端+标签 | 本机自用不打包；要共享走 git | 迁移包 |
| N8 验收 | a 形式 / b 发布 / c 运行级 | a + c；模式追加用户 UI 亲眼确认 | 契约第 5 行 |
| N9 演化 | 跟最新 / 锁版本 | 跟最新但只在明确要求时升级 | 模式基线版本 |

命名硬约束：目录名匹配 `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`；不是保留名（`node_modules`、`con`、`prn`、`aux`、`nul`、`com1`–`com9`、`lpt1`–`lpt9`）；不叫 `desktop`；不与现有 profile 重名；目录必须是 `$DSH_HOME/profiles/<name>` 下的真实目录。

## 4. 工作流路由（W1–W6，细节与完整命令见 references/20-workflows.md）

| 工作流 | 触发 | 要点 |
|---|---|---|
| **W1 create** 新建 | 用户要做新 profile（默认） | 契约 → 官方 CLI init → patch 层 → 可选 W6 → L0–L2 → 报告；**不切换** |
| **W2 adopt** 改造 | 把非 desktop 旧 profile 按官方基线重建 | 只读盘点旧 profile → 意图提取 → 备份 → 官方基线重建 → 官方通道重建能力 → 对照 → L0–L2；原 profile 不动 |
| **W3 migrate** 迁移 | 跨机/共享 | 源 static-check → export → 包核对 → git → 目标机 import → static-check → dump → mode verify；不切 profile |
| **W4 upgrade** 升级 | 用户明确说升级/跟进新版 | 记录版本 → pre dump → 备份 → 升 bundles/deps → post dump 差异 → 模式 refresh → L0–L2 → 失败回滚 |
| **W5 doctor** 排障 | 启动失败/怀疑坏 | 只读日志与 recovery 快照 → 诊断 → 修复计划逐条确认；**永不自动删** |
| **W6 mode** 第 5 模式 | 要自定义 agent preset | extract → emit → verify → L0/L1；Phase B 用 ops 账本二次验收 |

**W1 标准命令序列**（已验证）：

```bash
# 0) 契约已确认，先记录回滚点（若 profile 已存在则 cp -a 备份）
# 1) 官方模板 init（同时写出可 dump 的 cordis.yml）
DSH_APP="${DSH_APP:-/Applications/DSH NEXT.app}"
ELECTRON_RUN_AS_NODE=1 "$DSH_APP/Contents/MacOS/DSH NEXT" --expose-internals \
  "$DSH_APP/Contents/Resources/app.asar/lib/desktop-cli.js" \
  --profile <name> --from-default-profile web --dump-config

# 2) L0 静态
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"
# 3) L1 权威
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-dump.yml
# 4) 可选 W6 → L2 隔离启动（见 references/30-verification.md）
```

> 没有 `dsh profile ...` 子命令：创建只能走 `--from-default-profile`；安装插件走 `dsh plugin --profile <name> <pnpm 参数>`；`dsh <name>` 是"启动该 profile"的简写。

## 5. 脚本与命令路由

全部脚本用 `node` 直接调用（相对技能根目录），参数一律用 `--长参数` 形式：

| 脚本 | 用途 | 关键命令 |
|---|---|---|
| `scripts/static-check.mjs` | L0 静态检查（只读） | `--profile-dir <dir> [--migration] [--json]`；退出码 0 通过 / 1 错误 / 2 用法 |
| `scripts/dump.mjs` | L1 权威 dump 检查 | `--profile <name> [--dsh-home <dir>] [--raw-out <file>] [--mode <modeId> --profile-dir <dir>] [--expect-default <modeId>]` |
| `scripts/mode-base.mjs` | 第 5 模式基线/账本 | 子命令 `extract` / `emit` / `verify` / `replay` / `refresh`，见 `references/60-agent-modes.md` |
| `scripts/export.mjs` | 打迁移包 | `--profile-dir <dir> --out <dir> [--force] [--runtime-version <v>]` |
| `scripts/import.mjs` | 落迁移包 | `--from <package-dir> --profile-name <name> [--dsh-home <dir>] [--dry-run] [--install]` |
| `scripts/selftest.mjs` | 全离线回归（39 项） | `node scripts/selftest.mjs`（无 app、无网络） |

必备环境变量/路径：`DSH_APP`（默认 `/Applications/DSH NEXT.app`）、`DSH_HOME`（默认 `~/.dsh`）、bin=`Contents/MacOS/DSH NEXT`、cli=`Contents/Resources/app.asar/lib/desktop-cli.js`。任何 dsh 调用都必须带 `ELECTRON_RUN_AS_NODE=1` 与 `--expose-internals`。

## 6. 验收门

按顺序过，前一层不过不进下一层；报告里逐层写"做了/没做 + 证据"。

| 层 | 内容 | 通过判据 |
|---|---|---|
| **L0** 静态 | `static-check`（+ 打包时 `--migration`） | 退出码 0；无纯度/结构错误 |
| **L1** 权威 | `dump.mjs`（真实 app.asar 跑 `--dump-config`） | 退出码 0、stderr 空、必需行齐全、无 skip/incompatible 标记；模式再加 MODE-SHA |
| **L2** 运行级 | 复制到隔离 `DSH_HOME` 冒烟启动 / 真实验收 profile `dsh-lab`（保留不激活） | 启动成功并打印 `dsh web: http://...`；模式可见性由用户 UI 亲眼确认 |
| **L3** 负例回归 | `selftest.mjs` + 负例矩阵（见 references/30-verification.md） | 39/39 通过；每个负例得到预期错误 id |

**正式验收 A1–A5**：A1 技能形式（frontmatter/≤500 行/描述含触发词/version 递增）；A2 发布（fork + `npx skills add` 预验收 + PR）；A3 运行（沙箱正负例 + `dsh-lab` 保留不激活 + 不切 desktop）；A4 TDD 证据（RED/GREEN/REFACTOR 记录 + selftest 输出）；A5 第 5 模式全链路（insert 与账本通过 L0、dump 出模式行、Phase A 插件与官方 PTC 逐字相同、重放一致、冲突有预期错误、UI 可见）。任何未做项必须写进"未验证"清单。

> 纪律：`dump` 通过 ≠ 已启动；"已验证"只能由真实启动证据或用户亲眼确认给出。

## 7. 安全、备份与回滚

- 写 `$DSH_HOME` 下的文件前先在回复里说明将写什么；用户已在契约中同意的路径不算额外授权，但**新路径**要再确认。
- 改动 patch / 账本前自动备份：脚本自身产出 `cordis.patch.yml.bak-<epoch-ms>`；手工改动前先 `cp -a` 整个 profile 目录。
- `$DSH_HOME/recovery/<epoch-ms>-<uuid>/` 是桌面自动 checkpoint：只读引用，**永不删除、永不修改**。
- 失败回滚顺序：`.bak-<ts>` → profile 目录级备份 → recovery 快照（只读复制，不动桌面当前状态）。
- 任何情况下不删除用户 profile；删除只给命令与风险说明，由用户自己做。

## 8. references 索引（本技能自带，按需加载）

| 文件 | 内容 | 何时读 |
|---|---|---|
| `references/00-facts.md` | profile 定义、目录结构、模板/bundle、层序、切换、日志/recovery、证据索引 | 需要事实基线时 |
| `references/10-interview-tree.md` | Phase 0 决策树全文、契约模板、零写入硬门、已决 Q1–Q26 | **每次任务开始必读** |
| `references/20-workflows.md` | W1–W6 完整可执行步骤与命令 | 进入具体工作流时 |
| `references/30-verification.md` | L0–L3 验收、负例矩阵、回滚、A1–A5 | 写验收报告前 |
| `references/40-migration.md` | 迁移包规范、git 通道、目标机要求、export/import | 做 W3 时 |
| `references/50-publish.md` | 上游仓库布局、fork、`npx skills add` 预验收、PR | 做 A2 发布时 |
| `references/60-agent-modes.md` | 第 5 模式机制、官方 PTC 声明、基线/账本、多模式 | 做 W6 / A5 时 |

## 9. 常见错误（全部真实踩过或脚本能捕获）

- 把 `--dump-config` 当只读：它会重写目标 profile 的 `cordis.yml` 锚点，契约确认前跑就是违例。
- clone desktop 或手拼 bundles 当新 profile：层序与桌面 overlay 不同，必坏；只能官方模板 init。
- `dsh profile create`：不存在这个子命令；用 `--from-default-profile`。
- 直接跑抽取出来的 `app.asar` 副本：会 `ERR_MODULE_NOT_FOUND`；必须用真实安装包。
- 迁移包里带 `node_modules` / `cordis.yml` / `desktop-next.*.json`：`static-check --migration` 会硬失败。
- 手工改模式插件后不刷新基线：`MODE-SYNC` / `VERIFY-SHA` 会报 "hand edit or stale baseline"，用 `mode-base refresh`。
- Phase B 定制后直接 `dump --mode` 会误报 `MODE-SHA`：先 `mode-base replay` 生成期望基线，再 `dump --baseline`（见 30-verification）。
- 目标机没启动过 DSH 就 import：没有 `profiles/` 目录，`IO-DSH-HOME` 报错；先启动一次桌面。
- 把 L1 dump 通过写成"已验证/可启动"：验收报告必须区分。
- 在 desktop（或别的）profile 的桌面里找不到自定义模式：新会话的预设 chip 只列**当前运行 profile** 的 roster；先确认你是在**注册了该模式的那个 profile** 里看（桌面：菜单栏 `DSH NEXT → Profile：…` 切换后重开；CLI：`--profile <name>`）。在别的 profile 下看不到不是"注册失败"。

## 10. 完成判据（向用户报告前自检）

1. 契约 ≤5 行且已被用户明确确认（报告里引用日期与版本）。
2. 实际执行的工作流与契约一致；超出契约的写已停下并重新确认。
3. L0/L1 证据为命令 + 退出码 + 关键输出；L2 为启动日志或用户 UI 确认；未做层写"未验证"。
4. 回滚点已记录（`.bak-<ts>` / profile 备份 / recovery 快照）。
5. 报告给出：profile 路径、基线模板、patch 清单、模式信息（如有）、验收级别、未验证项、删除/回滚命令；**不切换、不删除**。
