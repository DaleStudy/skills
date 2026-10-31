# RED / GREEN / REFACTOR：dsh-profile-builder 的 TDD 证据

writing-skills 铁律：没有失败测试就不写技能。本文件记录技能诞生前后的对照实验、由此产生的实现改动，以及可复现的脚本级回归结果。

- 实验日期：2026-10-31（Asia/Shanghai）
- 同一用户原话（两个被试都只看到这一句）：
  > 帮我做一个 dsh profile，我日常 vibe coding 和实验想分开。
- 被试：两个 fresh subagent，互不共享上下文；RED 无技能目录，GREEN 提供本技能目录并要求先加载。
- 隔离约束（两个被试相同）：产物只能写 `/tmp/<被试目录>`；`~/.dsh` 只读；不切换、不修改 desktop profile。

## 1. RED —— 没有技能时发生了什么

被试目录：`/tmp/red-baseline`。产物：`/tmp/red-baseline/home/profiles/{vibe-coding,experiments}`，每个 profile 6 个文件，共 12 个。

观察到的行为（按发生顺序）：

| # | 失败行为 | 对应本技能中的硬门 |
|---|---|---|
| 1 | **第一个动作就是写文件**，没有访谈、没有契约、没有等待确认 | §2 Phase 0 硬门：未确认契约零写入 |
| 2 | 找不到 `dsh` 命令后读 `DSH_PROFILE=desktop`，直接**照 desktop 复制**，没有使用官方模板（`--from-default-profile`）或官方 CLI | §1 原则 1：新 profile 只从官方模板/bundle 栈生长 |
| 3 | 复制了 desktop 的 `desktop-next.cordis.patch.json` / `desktop-next.runtime.patch.json` 等 4 类配置到两个自定义 profile | §1 原则 3：desktop 只读；W1 新建流程不含 desktop overlay |
| 4 | 凭猜测从 vibe-coding 的 bundles 里**删插件**（35 → 26），两个 profile 的插件集都来自 clone 而不是可解释的最小集 | §2 纯净四检 + N5 最小插件集：删除必须能说出理由并有 L1 证据 |
| 5 | 没有跑 `dump-config`、没有 `pnpm install`、没有启动冒烟，直接宣告"完成" | §6 验收阶梯 L0–L3：dump 通过 ≠ 已启动 |
| 6 | 生成了 `PROFILE-NOTES.md` 当作交付物，其中自评暴露了全部问题 | §10 完成判据：证据分层，未验证必须写"未验证" |

被试自评（原文摘录，未修改）：

> "没问差异就猜着删插件……切换后大概率起不来……给的是看起来像的目录。"

**RED 结论**：在没有技能时，模型会跳过需求对齐、以 clone 代替官方基线、把"看起来像 profile 的目录"当成交付。这正是本技能要用硬门和校验阶梯拦截的行为，因此技能不是"写个教程"，而是把失败模式变成可执行的门。

## 2. GREEN —— 加载技能后的同一场景

被试：`green-check`（fresh subagent；工作目录内提供 `dsh-profile-builder` 技能目录，要求先加载技能再执行同一句话）；日期同上。

| 观察点 | RED（无技能） | GREEN（有技能） |
|---|---|---|
| 第一个动作 | 直接复制 desktop、写目录 | 加载技能 → 读 `references/10-interview-tree.md` 全文 → 只读取证 |
| 需求对齐 | 无访谈、无契约 | 按 Phase 0 准备第 1 轮问题（N1 目标 / N2 命名 / N3 基线），每题带推荐 |
| 写盘 | 12 个文件 | **0 个文件**（未确认契约 = 零写入；`/tmp/green-check` 都未创建） |
| 基线来源 | clone desktop，含 desktop overlay | 计划用官方 `--from-default-profile web`；明确不 clone desktop |
| desktop | 复制其配置 | 只读侦察（package.json / cordis.patch.yml / cordis.yml / preferences），跑只为只读的 L0 演练 |
| 校验 | 无 dump、无 install、无启动 | 对现有 desktop 只读跑 `static-check`（exit 0 / errors [] / warnings [] / modes []）；声明新 profile 的 L0/L1 在契约确认后做 |
| 诚实边界 | 自评"大概率起不来" | 如实标注未验证项（L2 需隔离启动、实验禁止 GUI）、未实际发出提问（无用户通道） |

GREEN 报告中的契约草案（未确认、未施工，正好证明硬门生效）：

```
profile：lab（$DSH_HOME/profiles/lab；实验内写入只能落 /tmp/green-check 沙箱）
基线：官方 web 模板（--from-default-profile web）
patch 清单：无定制行（模型/主题/插件/MCP/skill/workspace 均不配；第 5 模式第一版不做）
迁移包：不做（本机自用）
验收：L0 static-check + L1 dump（L2 需隔离启动，本实验禁止 GUI，未验证）
```

**GREEN 结论**：技能把行为从"直接造目录"改写为"先访谈 → 给契约 → 等确认 → 零写入"。硬门在无法获得用户确认时表现为拒绝施工，而不是偷偷生成文件。实验限制（无用户通道、`~/.dsh` 只读）本身就构成 GREEN 的负向证据：没有确认就没有写入。

## 3. REFACTOR —— GREEN 之前就已经由 RED 触发的一处补强

RED 的第 3 条（desktop overlay 残留）是静态检查原先**不会发现**的：`desktop-next.*.json` 不在隐藏目录里，也不是生成物，L0 会静默放过。补强：

- `scripts/static-check.mjs`：当 profile 目录名不是 `desktop` 且根条目存在 `desktop-next.*.json` 时，报 warning `PROFILE-DESKTOP-OVERLAY`（"desktop overlay files present in a non-desktop profile … desktop-only config; a fresh profile must come from the official template, and export never packs these"）。
- `scripts/selftest.mjs` 新增第 39 项：构造同时带两个 desktop-next 文件的临时 profile，断言 L0 仍 `ok` 且 warnings 含 `PROFILE-DESKTOP-OVERLAY`。
- `references/30-verification.md` §5 负例矩阵新增对应行（selftest #39）；全套文档同步 38→39。
- 选择 warning 而非 error 的理由：desktop overlay 是"来源可疑"信号而非语法错误，L0 不应因此失败；但迁移包里出现它一定是错误（export 永不打包，migration 白名单会拦）。

## 4. 脚本级回归（可复现）

```bash
cd dsh-profile-builder
node scripts/selftest.mjs
# selftest: 39 passed, 0 failed   （完全离线：无 app、无网络）
```

覆盖率：L0 static-check、mode-base 全子命令（extract/emit/verify/replay/refresh）、export/import 往返与校验和、dump 装配检查（用 fixture 模拟 app CLI）、五个 CLI 独立入口。

## 5. 复现方法

1. RED：建一个不包含本技能的空工作目录，把同一句用户原话交给一个 fresh subagent，只给 `/tmp` 写权限与 `~/.dsh` 只读约束。
2. GREEN：工作目录内放入 `dsh-profile-builder/`，其余条件相同，要求先加载技能。
3. REFACTOR：把 GREEN 中出现的新借口写回 SKILL.md 的硬门或 §9 常见错误，再重跑。
