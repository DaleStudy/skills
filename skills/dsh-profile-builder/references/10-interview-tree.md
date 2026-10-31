# 10 · Phase 0 硬门访谈决策树（interview tree）

> 日期：2026-10-31。依据：`spec-v2.md` §4 / §5 与已落定的 Q1–Q26（见 §8），事实基线见 `00-facts.md`。
> 职责：在**任何写盘之前**，用有限轮次访谈把「目标 / 用途 / 基线 / 定制 / 模式 / 纯净 / 迁移 / 验收 / 演化」问到可执行，产出一份 ≤5 行契约并拿到**明确确认**。

## 0. 三条铁律

1. **先取证，再提问**：能自己查到的事实（已有哪些 profile、当前 active、DSH 版本、bundles、已有 patch 行、已有模式、日志）一律自己查，不向用户问。事实 = 我的工作；决策 = 用户的。
2. **按 frontier 成轮提问**：只问"前置已定"的问题；每问必须带**推荐答案**和"为什么推荐"。一轮问一层，等回答再推进；不要把后面轮次的问题提前抛。
3. **未确认契约 = 零写入**：没有用户明确确认（如"确认契约"）前，不建目录、不改文件、不装依赖、不跑会写盘的命令（详见 §7）。

## 1. 访谈前置取证（skill 自己做，只读）

| 要拿的事实 | 从哪读（只读） |
|---|---|
| 当前 active profile | `$DSH_HOME/desktop-next.json` 的 `active`（不存在 ⇒ `desktop`） |
| 已有 profile 清单 | `$DSH_HOME/profiles/` 目录名 + 各自的 `package.json` / `cordis.patch.yml` |
| 每个 profile 的类型 | bundles 是否含 `@deepseek-ai/dsh-web-app` / `dsh-headless` / `dsh-sdk-app` …（决定能否桌面切换、能否有第 5 模式） |
| DSH 版本 / 平台 | 发行包版本与随包 `@deepseek-ai/dsh` 版本；平台/arch |
| 已有模式 | profile patch 里的 `@deepseek-ai/dsh-agent-preset` insert 行；可用 `node scripts/static-check.mjs --profile-dir <dir> --json` 的 `modes[]`（只读） |
| 已有定制行 | profile patch 的顶层 id 列表（模型路由 / 主题 / MCP / 插件开关…） |
| 历史失败 | `$DSH_HOME/logs/` 下最新 failure log、recovery checkpoint 列表 |
| 命名占用 | `profiles/` 现有名字；保留名清单（见 00-facts §5.2） |

> 取证只允许**读**。`--dump-config` 会重写目标 profile 的 `cordis.yml` 锚点，属于写操作 → 契约确认后才跑（见 §7）。

## 2. 决策树总览（节点与依赖）

```
N1 目标 ─┬─> N2 用途×稳定度（名字/目录）
         ├─> N3 基线模板 ─┬─> N4 定制层
         │                ├─> N5 第 5 模式（依赖 N3 含 web-app，且 id 带 profile 前缀）
         │                └─> N6 纯净策略
         ├─> N7 迁移通道（依赖 N1/N3）
         └─> N8 验收级别 ──> N9 演化策略（可最后确认）
N5 还依赖 N4 的定制意愿；N9 只在目标含"长期维护"时展开。
```

**成轮建议**：第 1 轮 N1–N3（目标 / 名字 / 基线）；第 2 轮 N4–N6（定制 / 模式 / 纯净）；第 3 轮 N7–N9 + 契约确认。用户一次只关心一件事时可以合并，但**不能跳轮**。

## 3. 各节点问题、推荐默认与价值分叉

### N1 目标

**Q1 – 这次要做什么？**（新建 / 改造 / 迁移 / 升级 / 排障 / 只要一张模式卡）

- 选项与工作流：新建 → W1 create；改造非 desktop 旧 profile → W2 adopt；跨机复制 → W3 migrate；用户明确说"进化/升级" → W4 upgrade；启动失败/怀疑坏 → W5 doctor；只想要自定义 agent 模式 → W6 mode。
- ➡️ 推荐默认：**新建 profile**（多用途分 profile 是本技能的主线；改造/迁移/升级都要用户明确说）。
- 价值分叉：选 W2 时必须确认"原 profile 不动、只重建"；选 W4 必须有"升级"明示（Q9/Q13）；选 W5 只诊断不自动修/不删。
- 关键分歧：**"给我做一个 profile" 默认是新建；如果用户其实想要的是改现有 desktop 或只加一个模式，必须在 N1 纠正**（这是上一轮翻车点——需求没聊清就动手）。

### N2 用途 × 稳定度（名字 / 目录）

**Q2 – 这个 profile 给什么用、要多稳？名字叫什么？**

- 先问用途轴（如：日常 main / 实验 lab / 某项目专用 / 无 UI 的 headless 服务），再问稳定度轴（长期维护 / 一次性试水）。
- ➡️ 推荐默认：用途 = `main`（日常）与 `lab`（实验）二选一或都要；目录名 = 用户给的名字，kebab-case。
- 命名规则（硬约束）：匹配 `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/`；不得是保留名（`node_modules`、`con`、`prn`、`aux`、`nul`、`com1`–`com9`、`lpt1`–`lpt9`）；不得叫 `desktop`（桌面专属）；不得与现有 profile 重名；桌面可切换还要求目录是 `$DSH_HOME/profiles/<name>` 下的真实目录。
- 价值分叉：名字直接进入契约并决定目录；改名成本高（无官方 rename UI，config-manager 才有）→ 在契约里一次定死。

### N3 基线模板

**Q3 – 从哪个官方模板长出来？**

- 选项：`web`（base + web-app；桌面可切换、有 UI、**能做第 5 模式**）、`headless`、`acp`、`sdk`、`sdk-minimal`（后四者无 web UI 选择器，第 5 模式不适用）。
- ➡️ 推荐默认：**`web`**（除非用户明确只要 headless/SDK/ACP 集成——那就按用途选，并明说"这个 profile 不会出现在桌面 Profile 菜单里，只能 CLI/独立实例启动"）。
- 价值分叉：模板决定 bundles、能否桌面切换、能否有第 5 模式、预览/验收方式。**永远从官方模板 init，不 clone desktop、不手拼 bundle 列表**（Q12）。
- 追问：若用户想"在 desktop 基础上改" → 拒绝 clone，改为"用 web 模板重建 + 把 desktop 里需要的配置行搬过来（逐条评审）"。

### N4 定制层

**Q4 – 新 profile 里要预置哪些定制？**（多选，但默认全不配）

| 定制项 | 是否问 | 默认 | 落点 / 纪律 |
|---|---|---|---|
| 模型路由（provider/model/reasoningEffort） | 问 | 不配（继承默认模型选择） | profile patch 的 `agent-default-model` 行 |
| 主题 / 字号 / UI | 问 | 不配 | profile patch 的 `ui-theme` 等行 |
| 工具/插件（官方 optional bundle / 第三方插件） | 问 | 不配 | 优先官方 optional bundle 加进 `dsh.profile.bundles`；第三方走官方 `plugin_manager.install_bundle` 轨道；**不要教用户手改 active profile** |
| MCP connector | 问 | 不配 | 插件行 + `$DSH_HOME/storages/` 记录；凭据不进 patch |
| skill 挂载 | 问 | 不配 | skill 来自文件系统根目录，不进 profile manifest；仅当用户要"该 profile 专用技能根"时才谈 |
| workspace / 项目路径 | 问 | 不配 | 机器相关，**不进迁移包** |

- ➡️ 推荐默认：**所有定制项 = 不配**；用户点名的才配，且每条都写进契约的 "patch 清单"。
- 价值分叉：每多配一项 = 多一条 patch 行 + 多一条后续升级时要重锚的配置；能不加就不加（这也是 Q8 的"纯净"的来源）。
- 禁止：在访谈阶段就写文件；把 desktop 的 patch 整段抄过来当默认。

### N5 第 5 模式（自定义 agent preset）

**Q5 – 要不要给这个 profile 做一个自定义 agent 模式（与官方 4 模式并列出现在选择器）？**

- 前置：N3 必须是 `web`（bundles 含 `@deepseek-ai/dsh-web-app`）；否则直接告知"不适用"并跳过（不降级成别的实现）。
- 若"要"，继续问 4 个子问题：
  1. **显示名**（选择器里看到的，必填，用户原话，不翻译成内建文案）；
  2. **一句话描述**（≤200 字符，必填）；
  3. **mode id 后缀**：默认 `<profile>-<mode>`（kebab-case，如 `lab-redteam`）；必须匹配 `/^[a-z0-9][a-z0-9-]{0,63}$/`，不得占用内建 id（`standard`/`ptc`/`minimal`/`cordis`）；
  4. **order**：默认 `5`（内建 1–4 保留，profile 内唯一、整数 ≥5）。
- 多模式：默认**只做 1 个主模式**；用户明确要第 2/3 个才加，每个独立 insert 行 + 独立基线文件，id/order 唯一（Q25）。
- ➡️ 推荐默认：**第一版不做模式**（先 W1 建出干净 profile 并验收，再按需 W6）。若用户就是为核心玩法来的，则 Phase A 纯 fork 先验收。
- 价值分叉：做模式 ⇒ 契约里必须写 mode id + 显示名 + order + "Phase A/B 两段验收"；不做 ⇒ 契约很简单。
- 口径声明（回答"是不是继承官方模式"）：**DSH 没有 preset 继承**；我们复制官方 PTC 整份声明再改元数据，Phase A 行为 0 漂移（见 `60-agent-modes.md`）。

### N6 纯净策略

**Q6 – 迁移/共享的纯净标准怎么执行？**

- 四检（硬失败项）：① 无机器绑定值（无本机绝对路径、无设备路径）；② 无明文密钥（provider 只留 `apiKeyEnv` 变量名）；③ 无生成物（`cordis.yml`、`desktop-next.*.json`、`.plugin-manager/`、`.dsh-market/`）；④ 最小插件集（只列真的需要的 bundle/patch 行）。
- ➡️ 推荐默认：**四检全部按硬失败执行**（不允许"先带着 secret、回头再清"）。
- 价值分叉：如果用户坚持要带某些本地值 → 说明代价（无法共享/会泄露）并改为"在目标机本地重填"，契约里标注。
- 检查手段：`node scripts/static-check.mjs --profile-dir <dir> [--migration]`。

### N7 迁移通道

**Q7 – 要做成可迁移包吗？走哪条通道？**

- 选项：不做迁移（本机自用）/ git 仓库（推荐）/ 远端 + 分支/标签 / 目标机清单。目标机约束：同平台、同 DSH 版本。
- ➡️ 推荐默认：**本机自用不打包**；用户说要共享/换机时才做，默认 git 仓库 + 分支/标签；迁移包内容 = 声明层文件 + lockfile + `.profile-builder/` 记账（Q7）。
- 价值分叉：做迁移 ⇒ 契约写清"包内 / 包外 / 目标机要求"，并追加 `--migration` 静态检查；不做 ⇒ 不导出、不写安装脚本。
- 明确不承诺：会话、凭据、技能历史、机器绑定配置——只承诺**环境可复现**。

### N8 验收级别

**Q8 – 做到哪一层验收？**

- 选项：a 形式（结构/静态）；b 发布（上游 skills 布局 + npx skills add 预验收，仅发布场景）；c 运行级（隔离 DSH_HOME 冒烟 + 真实验收 profile `dsh-lab`；模式还要用户 UI 亲眼确认）。
- ➡️ 推荐默认：**a + c**（本机 mock/沙箱 + 真实 profile 验收；b 在发布时追加）。模式一律追加"用户在选择器看到它"的 UI 确认。
- 价值分叉：验收级别直接决定"报告能不能说完成"；任何未做的层必须写进报告。
- 纪律：L1 dump 通过 ≠ 已启动；"已验证"只能由用户/真实启动证据给。

### N9 演化策略

**Q9 – 以后 DSH 升级跟不跟？**

- 选项：跟最新（默认）/ 锁当前版本不升 / 每次手动评估。
- ➡️ 推荐默认：**跟最新**；但**只有用户明确说"进化/升级迭代"才动手**（Q9/Q13）；升级流程 = 备份 → 升 bundles/deps → dump 差异审查 → patch 重锚 → 模式基线重放 → L0–L2 → 失败回滚。
- 价值分叉：不跟进 ⇒ 契约写"锁定版本，不承诺未来兼容"；跟进 ⇒ 记下当前 `dshRuntimeVersion`（进入模式基线文件），升级时对比。

## 4. 每问的固定格式

```
❓ **Qn – <标题>**：<问题，给选项；可分段>

➡️ <推荐答案 + 一句理由>

🪝 <这个答案会改契约哪一行 / 会解锁哪个工作流>
```

- 推荐答案必须给（用户要的是判断，不是问卷）；理由不超过一句。
- 用户说"随便/你定"时 → 按推荐默认落契约，并在契约里标注"采用推荐默认"。
- 用户回答与已决 Q 冲突时 → 不争辩，记录"用户改判：<原决定> → <新决定>"，更新契约版本，再继续。

## 5. 契约模板（≤5 行，确认后才动）

```
profile：<name>（目录 $DSH_HOME/profiles/<name>）
基线：官方 <web|headless|acp|sdk|sdk-minimal> 模板
patch 清单：<逐行列出；含第 5 模式时写 mode id / 显示名 / order；无则"无定制行">
迁移包：<不做 | 含 X 不含 Y | 目标机同平台同版本 + git 通道>
验收：L0 + L1(+L2)、模式需求追加"用户在 UI 亲眼确认"；回滚点：<recovery checkpoint / .bak-<ts> / 不适用>
```

- 契约是**唯一施工依据**；增项 → 重新确认，不允许"顺手加"。
- 契约冻结后：先备份/记录回滚点，再开始首次写盘。

## 6. 确认与解锁

- 用户确认的判据：用户消息里**明确表示同意这份契约**（如"确认契约""按这个做""OK 开工"）。只是回答完问题不等于确认；沉默/含糊 → 复述契约请求确认。
- 确认后：把契约写进报告/工作记录（含日期与版本），随后 W1 第一步（官方 CLI init）。
- 中途变更：任何超出契约的写操作都先停下重新确认；已做出的越界写要如实报告，不掩盖、不继续扩大。

## 7. 未确认零写入规则（硬门）

**契约确认前，以下动作全部禁止**：

1. 不建 `$DSH_HOME/profiles/<name>` 目录，不建 `.profile-builder/`；
2. 不改任何 `package.json` / `cordis.patch.yml` / `compatibility.json` / `pnpm-lock.yaml`；
3. 不跑 `pnpm install` / `dsh plugin ...` / 任何安装或切换动作；
4. 不生成模式 insert 行、不写基线/账本文件；
5. 不跑会写盘的 `--dump-config`（它会重写目标 profile 的 `cordis.yml`）、不跑 `mode-base emit --write`、不跑 export/import 落盘；
6. 不切 active profile、不打开/关闭桌面设置、不删任何东西。

**允许的只读动作**：读文件、列目录、`node scripts/static-check.mjs --profile-dir <dir>`（只读）。

**唯一例外**：用户明确说"先对现有某 profile 跑一下 dump 看看"——此时也会写该 profile 的锚点文件，需在契约前单独确认这一次写。

**违例处理**：如果确认前已有写发生（例如上次会话遗留），停下来、列清单、报告用户、等确认后再继续；不得"为了对齐"再写更多。

## 8. 已决事项（Q1–Q26，不重问）

| 决策 | 定案 |
|---|---|
| 目标/范围 | 多 profile、官方基线、最全但纯净（Q1–Q6） |
| 迁移单位 | 声明层 + lockfile + 记账，git；只承诺环境连续；同平台同版本（Q7） |
| profile 划分 | 用途 × 稳定度；纯净四检为硬失败（Q8） |
| 演化 | 跟最新；仅用户明确要求才升级，带备份/dump/回滚（Q9/Q13） |
| 验收 | a 形式 + b 发布 + c 运行级 + writing-skills 铁律（Q10） |
| 安装位置 | `~/.dsh/skills/dsh-profile-builder`（Q11） |
| 基线纪律 | 从官方模板长，不 clone desktop；desktop 只读、不切换（Q12） |
| 运行验收隔离 | 隔离 DSH_HOME 沙箱 + 真实 `dsh-lab`（不切 desktop）（Q14） |
| 发布 | fork + PR 到上游 skills 仓库；`npx skills add` 预验收（Q15） |
| 访谈形态 | 决策树 + 每轮推荐 + 契约硬门（Q16） |
| 第 5 模式位置 | 跟 profile 走（profile patch insert）（Q17） |
| 模式基底 | 复制官方 PTC 整份声明，无继承（Q18） |
| 默认模式 | 不覆写 registry `default`；用户 UI 里设一次（Q20） |
| 模式验收 | dump + 隔离激活 + 用户 UI 亲眼确认（Q21） |
| 模式记账 | 基线快照 + ops 账本；升级重放，冲突交人（Q21-bis） |
| 交付节奏 | 两阶段：纯 fork 验收 → 定制 → 二次验收（Q22/Q24） |
| 多模式 | 默认 1 个，可扩；id 带 profile 前缀；order ≥5（Q25） |
| dogfood 产物 | 保留不激活，报告写路径与删除命令（Q26） |

> 这些是**已决**：不要再问用户；只有用户主动提起时才重新讨论，并明确记为改判。

## 9. 访谈禁忌（上一轮踩过的坑）

- 不先问事实（"你的 DSH 是什么版本？profile 在哪？"）——自己去读。
- 只问不推荐（把选择题全丢回用户）——每题必须给推荐。
- 把模式问题提前到基线没定时问——依赖未定，问了也白问。
- 把"要不要做 profile"偷换成"要不要改 desktop"——desktop 永不改、永不切。
- 把 PTC 说成"继承 standard"——错，是复制整份。
- 未经确认就写文件/装依赖/切 profile。
- 把 L1 dump 通过说成"可启动/已验证"。

## 10. 访谈结束判据

同时满足才进入工作流：

1. 9 个节点全部有答案（未问的必须显式"不适用"并写理由）；
2. 契约 ≤5 行、无空项、无"待定"；
3. 用户明确确认；
4. 回滚点已确定（recovery 快照 / `.bak-<timestamp>` / "不适用"）；
5. 验收级别与"哪些由用户亲眼确认"写清。

之后按目标进入 W1–W6（见 `20-workflows.md`）；**本文件不负责执行**。
