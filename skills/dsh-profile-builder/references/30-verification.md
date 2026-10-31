# 30 · 验收与验证（L0–L3 + A1–A5）

> 日期：2026-10-31。依据：`spec-v2.md` §6/§7、`scripts/` 实际实现、2026-10-31 的本机实测。目标：任何"完成"声明都必须对应到这里的一层证据；**dump 通过 ≠ 已启动**。

## 1. 验收阶梯总览

| 层 | 做什么 | 命令 | 通过判据 | 不能证明什么 |
|---|---|---|---|---|
| **L0** 静态 | 结构/纯度/模式账本离线检查 | `node scripts/static-check.mjs` | 退出码 0，无 error | 不能证明能被 DSH 加载 |
| **L1** 权威 | 用真实 app.asar 跑 `--dump-config` 检查组合结果 | `node scripts/dump.mjs` | 退出码 0、stderr 空、必需行齐全、模式 sha 对齐、无 skip/incompatible 标记 | 不能证明能启动 |
| **L2** 运行级 | 隔离 DSH_HOME 冒烟启动 / 真实验收 profile / 用户 UI 确认 | 见 §4 | 启动成功并输出 `dsh web: http://...`；模式用户亲眼看到 | 不能证明交互流程与长期稳定 |
| **L3** 负例回归 | 39 项离线 selftest + 负例矩阵 | `node scripts/selftest.mjs` + §5 | 39/39 通过；每个负例得到预期错误 id/文本 | 不能替代 L1/L2 |

另外 `scripts/selftest.mjs` 是**全离线**回归（不启动 DSH、不联网），可直接作为 L3 主证据；`tests/fixtures/` 目前只有 `dump-web.txt` 与 `dump-ptc-moved.txt`，其余 fixture 由 selftest 自己构造。

## 2. L0：静态检查

```bash
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"
node scripts/static-check.mjs --profile-dir <迁移包目录> --migration
node scripts/static-check.mjs --profile-dir <dir> --json
```

退出码：0 = 通过（可有 warning）；1 = 有 error；2 = 用法错误。结果 JSON：`{schemaVersion:1, profileDir, ok, errors, warnings, checks, modes, summary{errorCount,warningCount,modeCount}}`；人类可读首行 `dsh-profile-builder static-check: OK|FAIL (N errors, N warnings, N custom modes)`。

### 2.1 包与 patch（error 除非注明）

| 检查 id | 含义 |
|---|---|
| PKG-EXISTS / PKG-JSON | profile 目录与 `package.json` 可读、可解析 |
| PKG-NAME（warn） | package name 应为 `dsh-profile-<目录名>` |
| PKG-PRIVATE（warn） | 应为 `private: true` |
| PKG-BUNDLES | `dsh.profile.bundles` 必须是非空字符串数组 |
| PKG-BUNDLES-BASE | 必须含 `@deepseek-ai/dsh-base` |
| PKG-BUNDLES-SURFACE（warn） | 应含一个已知 surface bundle（web/headless/acp/sdk/sdk-minimal） |
| PKG-BUNDLES-DUP | bundles 不得重复 |
| PKG-ENGINES（warn） / PKG-PEER-RANGES（warn） | engines/peer 范围与当前 dsh 是否明显冲突 |
| COMPAT-JSON（warn） / COMPAT-SHAPE（warn） | `compatibility.json` 可选；形状为 精确版本 → bundle 列表 |
| PATCH-EXISTS | `cordis.patch.yml` 存在 |
| PATCH-TOP-ARRAY | **必须顶层 YAML 数组**；注释-only / 空对象都 fatal |
| PATCH-NO-TAB-INDENT | 不得用 tab 缩进 |
| PATCH-DUP-ID（warn） | 顶层条目 id 不应重复 |
| PROFILE-GENERATED-PRESENT（info） | 存在 `cordis.yml`/生成物，提示别进迁移包 |

### 2.2 纯净四检

| 检查 id | 含义 |
|---|---|
| PURITY-NO-SECRET | 包内声明层不得出现 `sk-`、`ghp_`、`github_pat_`、`AKIA`、`xox[baprs]-`、`PRIVATE KEY` 等模式（error） |
| PURITY-NO-MACHINE-PATH | 不得出现 `/Users`、`/home`、`/root`、盘符路径、`/private/var/folders`（error） |
| PURITY-PLAINTEXT-CREDENTIAL-KEY | 出现 literal apiKey/token/secret/password 值（warn，交人工判断） |

扫描范围：`package.json`、`cordis.patch.yml`、`compatibility.json`、`.profile-builder/**/*.{json,yml,yaml}`。

### 2.3 迁移包检查（`--migration`）

| 检查 id | 含义 |
|---|---|
| MIGRATION-CLEAN | 根目录只允许 `package.json`、`cordis.patch.yml`、`compatibility.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`manifest.json`、`README.md`、`.profile-builder` |
| MIGRATION-NO-GENERATED | 不得含 `cordis.yml`、`node_modules` 等生成物 |

### 2.4 模式与账本（check id 以报错详情为准）

模式声明：`MODE-PLUGIN`（insert row name 必须是 `@deepseek-ai/dsh-agent-preset`）、`MODE-INSERT-ID`（必须 `preset-<configId>`）、`MODE-CONFIG-ID`（`^[a-z0-9][a-z0-9-]{0,63}$`）、`MODE-RESERVED-ID`（不得 standard/ptc/minimal/cordis）、`MODE-DUP-ID`、`MODE-ORDER`（int ≥5）、`MODE-ORDER-DUP`、`MODE-NAME`、`MODE-DESCRIPTION`。

账本：`MODE-BASELINE-JSON`（缺 `.profile-builder/baseline-<modeId>.json`）、`MODE-BASELINE-YML`（缺 `baseline-ptc-<modeId>.yml`）、`MODE-BASELINE-JSON-SHAPE`（schemaVersion 1）、`MODE-BASELINE-PRESET`（必须是 ptc）、`MODE-OPS-READ`、`MODE-OPS-REPLAY`、`MODE-BASELINE-MODE-ID`、`MODE-BASELINE-SHA-MATCH`（`json.sha256` == sha256(官方基线 + ops)）、`MODE-BASELINE-SOURCE-SHA`（`json.baselineSha256` == sha256(官方基线)）、`MODE-BASELINE-FILE`（warn）、`MODE-SYNC`（patch 里实际插件 sha == 期望 sha；不一致即 "hand edit or stale baseline: re-run the mode refresh workflow"）。

## 3. L1：权威 dump 检查

```bash
# 基本
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-dump.yml
# 隔离 DSH_HOME（不改真实 ~/.dsh）
node scripts/dump.mjs --profile <name> --dsh-home /tmp/<sandbox-home>
# 第 5 模式（Phase A 有官方基线即可；Phase B 需 --baseline 期望文件，见 3.3）
node scripts/dump.mjs --profile <name> --mode <modeId> --profile-dir "$DSH_HOME/profiles/<name>"
node scripts/dump.mjs --profile <name> --mode <modeId> --baseline /tmp/expected-<modeId>.yml
# 默认模式校验（不覆写 registry 默认，只检查）
node scripts/dump.mjs --profile <name> --expect-default standard
```

标志：`--profile`、`--dsh-home`、`--app`、`--cli`、`--raw-out`、`--json`、`--required-rows a,b,c`、`--mode`、`--baseline`、`--profile-dir`、`--expect-default`。默认 app=`/Applications/DSH NEXT.app`（或 `DSH_APP`），cli=`Contents/Resources/app.asar/lib/desktop-cli.js`；内部用 `ELECTRON_RUN_AS_NODE=1` 调 `--dump-config`，超时 120s，stdout 上限 64MB。退出码 0/1/2。JSON 结果：`{schemaVersion:1, ok, exitCode, stderr, lineCount, requiredRows, errors, warnings, checks}`；人类可读 `dsh-profile-builder dump: OK|FAIL (N errors, N warnings, N lines)`。

### 3.1 error 类检查

| id | 含义 |
|---|---|
| APP-NOT-FOUND / APP-CLI-NOT-FOUND | 应用或 `app.asar/lib/desktop-cli.js` 不存在（`--app` 指错、应用未装） |
| RUNTIME-DUMP-EXIT | `--dump-config` 退出码非 0（stderr 里通常有根因） |
| REQUIRED-ROW | 必需行缺失：默认 `agent-loop,modules,connection` + `webserver,web-runtime`（headless/acp/sdk 用 `--required-rows` 调整） |
| MODE-ROW / MODE-ROW-CONFIG-ID | 模式 insert 行不存在 / 行结构不对 |
| MODE-BASELINE-FOUND / MODE-BASELINE-READ | 有 `--mode` 时必须能定位并读懂基线文件（`--baseline` 或 `--profile-dir`） |
| MODE-SHA | dump 里模式插件 sha 与基线不符（默认拿官方基线比；Phase B 见 3.3） |

### 3.2 warning 类检查

| id | 含义 |
|---|---|
| RUNTIME-STDERR | stderr 非空（先看内容再决定是否阻断） |
| RUNTIME-MARKER | stderr 命中 `/skipping profile bundle|disabling profile plugin row|incompatible|does not exist/i`（**必须查清**） |
| DUMP-DUP-ROW | dump 里 row id 重复 |
| MODE-ROW-ORDER | order 非整数或 <5 |
| REGISTRY-DEFAULT | 出现 `agent-preset-registry` 的 default 覆写（不允许） |

### 3.3 已知限制：Phase B 后的 MODE-SHA

`dump.mjs --mode` 默认拿**官方基线**比对插件 sha；Phase B 用 ops 定制后插件列表已不同，会误报 `MODE-SHA`。正确姿势：先 `mode-base replay` 把"官方基线 + ops"重放成期望文件，再 `dump --baseline`：

```bash
node scripts/mode-base.mjs replay \
  --baseline "$DSH_HOME/profiles/<name>/.profile-builder/baseline-ptc-<modeId>.yml" \
  --ops "$DSH_HOME/profiles/<name>/.profile-builder/ops-<modeId>.json" \
  --out /tmp/expected-<modeId>.yml
node scripts/dump.mjs --profile <name> --mode <modeId> --baseline /tmp/expected-<modeId>.yml
```

## 4. L2：运行级验证

### 4.1 隔离 DSH_HOME（不碰真实 `~/.dsh`）

```bash
TMP_HOME=$(mktemp -d); mkdir -p "$TMP_HOME/profiles"
cp -a "$DSH_HOME/profiles/<name>" "$TMP_HOME/profiles/<name>"
node scripts/dump.mjs --profile <name> --dsh-home "$TMP_HOME" --raw-out /tmp/<name>-sandbox-dump.yml
```

### 4.2 web 冒烟启动（已验证的配方）

```bash
DSH_APP="${DSH_APP:-/Applications/DSH NEXT.app}"
DSH_HOME="$TMP_HOME" ELECTRON_RUN_AS_NODE=1 "$DSH_APP/Contents/MacOS/DSH NEXT" --expose-internals \
  "$DSH_APP/Contents/Resources/app.asar/lib/desktop-cli.js" \
  --profile <name> --no-open --port 0 &
PID=$!
sleep 20
kill -0 "$PID" 2>/dev/null && echo "still running (good)"
# 判据：stdout 恰好一行 'dsh web: http://127.0.0.1:<port>/?token=...'，stderr 为空；成功后不写 logs/
kill "$PID"
```

注意：`--profile <name> web` 是**非法**的（`too many arguments. Expected 0 arguments but got 1: web.`）；正确写法是 `--profile <name>` 后直接跟 app 标志。`--port 0` 由系统分配端口，避免冲突；启动用后台进程，验证完必须 kill。

### 4.3 真实验收 profile（`dsh-lab`）

在真实 `$DSH_HOME` 下保留一个专用验收 profile（默认名 `dsh-lab`），**从不设为 active**、不从桌面切换。用途：验证"真实目录 + 真实桌面安装"下的 L0/L1；是否切换由用户自己操作，本技能只提供步骤。

### 4.4 第 5 模式的用户 UI 确认

脚本无法证明"选择器里真的出现"。必须请用户打开 Profile 的 agent 模式选择器，**亲眼确认**：新模式/新分组存在；新会话默认模式仍是 `standard`（本技能不覆写 registry 默认）。报告里写"用户已确认 / 未确认 / 未验证"。

### 4.5 L2 的边界

不证明：onboarding 向导流程、长期稳定性、交互功能、桌面切换后的行为。首次切换到手建 profile 可能弹 onboarding 向导——**未验证**，如实告知用户。

## 5. L3：负例矩阵

所有负例必须得到**明确的错误 id 或固定 stderr 文本**，不能静默通过。下表"selftest #"对应 `node scripts/selftest.mjs` 的编号（selftest 自动构造 fixture，离线运行）。

| 场景 | 命令 | 预期结果 | 证据 |
|---|---|---|---|
| patch 只有注释 | static-check | exit 1，`PATCH-TOP-ARRAY` | selftest #2 |
| patch 只有注释 | dump | exit 1，`RUNTIME-DUMP-EXIT`，stderr 含 `dsh: overlay <path>/cordis.patch.yml must be a top-level YAML array of loader patch entries` | 实测 |
| 缺 package.json | static-check | exit 1，`PKG-EXISTS` | selftest #3 |
| 缺 package.json | dump | exit 1，stderr 含 `dsh: profile "<name>" does not exist; create it with 'dsh plugin --profile <name> add <package>'` | 实测 |
| 缺 base bundle | static-check | exit 1，`PKG-BUNDLES-BASE` | selftest #1 的反例 |
| 缺 surface bundle | static-check | warn `PKG-BUNDLES-SURFACE`（不阻断，headless 可能合法） | — |
| 包内出现 secret 形态值 | static-check | exit 1，`PURITY-NO-SECRET` | selftest #4 |
| 包内出现本机绝对路径 | static-check | exit 1，`PURITY-NO-MACHINE-PATH` | selftest #5 |
| literal credential 值 | static-check | warn `PURITY-PLAINTEXT-CREDENTIAL-KEY`（交人工） | selftest #6 |
| 非 desktop profile 出现 desktop overlay 文件 | static-check | warn `PROFILE-DESKTOP-OVERLAY`（clone desktop 的残留信号） | selftest #39 |
| 迁移包含非白名单根条目 | static-check --migration | exit 1，`MIGRATION-CLEAN` | selftest #7 |
| 迁移包含 cordis.yml/node_modules | static-check --migration | exit 1，`MIGRATION-NO-GENERATED` | selftest #8 |
| 模式 id 用保留名 / order<5 | emit | exit 1，`MODE-RESERVED-ID` / `MODE-ORDER` | selftest #9/#14 |
| 模式 insert 插件名/行 id 结构错 | static-check | exit 1，`MODE-PLUGIN` / `MODE-INSERT-ID` | 构造 fixture |
| 重复模式未加 --replace | emit | exit 1，`MODE-EXISTS` | selftest #13 |
| 篡改基线 sha | emit/verify | exit 1，`BASELINE-SHA` / `VERIFY-SHA` | selftest #15 |
| 手改 insert 插件列表 | verify + static-check | exit 1，`VERIFY-SHA` / `MODE-SYNC` | selftest #17 |
| refresh 时 patch 有未记录手改 | refresh | exit 1，`OPS-LEDGER-MISSING` / `OPS-LEDGER-MISMATCH` | selftest #19/#20 |
| ops 目标不存在 / 冲突 | emit/replay | exit 1，`OP-TARGET-MISSING` / `OP-CONFLICT` | selftest #21 |
| 导出来源本身不通过 L0 | export | exit 1，`SRC-<id>` | selftest #24 |
| 导出目录非空且无 --force | export | exit 1，`IO-OUT-EXISTS` | selftest #23 |
| 导出目录在源内 | export | exit 1，`IO-OUT-INSIDE-SOURCE` | 构造 |
| 目标 profile 已存在 | import | exit 1，`IO-TARGET-EXISTS` | selftest #28 |
| manifest 校验和不符 | import | exit 1，`MANIFEST-SHA` | selftest #29 |
| manifest 含 `..`/绝对路径 | import | exit 1，`MANIFEST-PATH` | selftest #32 |
| 目标机无 profiles 目录 | import | exit 1，`IO-DSH-HOME`（提示先启动一次 DSH） | selftest #31 |
| 非法 profile 名 | import | exit 1，`PROFILE-NAME` | selftest #32 |
| 无 manifest 的包 | import | warn `MANIFEST-MISSING`，回退目录扫描 | selftest #30 |
| 运行时 dump 失败 | dump | exit 1，`RUNTIME-DUMP-EXIT` | selftest #35 |
| 找不到 dsh 可执行文件 | dump | exit 1，`APP-NOT-FOUND`，**抛错而非崩溃** | selftest #36 |

纪律：每个新脚本行为先加一条 selftest（RED），再改实现（GREEN），最后补边界（REFACTOR）——见 §7 A4。

## 6. 回滚

### 6.1 文件级（脚本自动）

脚本改 `cordis.patch.yml` 前会生成 `cordis.patch.yml.bak-<epoch-ms>`。回滚：

```bash
ls "$DSH_HOME/profiles/<name>"/cordis.patch.yml.bak-*   # 选最近一次
cp "$DSH_HOME/profiles/<name>/cordis.patch.yml.bak-<ts>" "$DSH_HOME/profiles/<name>/cordis.patch.yml"
```

### 6.2 profile 级（手工备份）

```bash
cp -a "$DSH_HOME/profiles/<name>" /tmp/<name>-backup-$(date +%s)
# 恢复（先停掉使用该 profile 的实例）
mv "$DSH_HOME/profiles/<name>" "/tmp/<name>-broken-$(date +%s)"
cp -a /tmp/<name>-backup-<ts> "$DSH_HOME/profiles/<name>"
```

### 6.3 recovery 快照（只读引用）

桌面启动成功时会写 `$DSH_HOME/recovery/<epoch-ms>-<uuid>/`（含 `package.json`、`cordis.patch.yml`、`snapshot.json`）；删除/工厂重置另有 `recovery/removed-profiles/`、`recovery/factory-reset-<ts>-<uuid>/`。**只读引用**：可用于对比或复制回退点，但不修改、不删除；是否用桌面自带恢复由用户决定。

### 6.4 回滚决策表

| 失败位置 | 回滚动作 |
|---|---|
| 模式 emit/refresh 写盘后 L0 失败 | 恢复 `.bak-<ts>`，删掉本次新写的基线/ops 文件（确认是本次生成） |
| 升级后 L1 出现 incompatible | 恢复 `.bak-<ts>` 与升级前 profile 备份，回到旧版本组合 |
| 迁移包在目标机导入失败 | 删除目标新目录（仅本次新建、且用户确认），重新导入修正后的包 |
| 桌面无法启动 | 用 recovery 快照只读核对，按 §7 日志定位；修复动作逐条确认 |

**永不自动删除**：任何 profile、日志、recovery 快照、备份目录的删除都只提供命令与风险说明，由用户执行。

## 7. 正式验收清单（A1–A5）

### A1 · 技能形式

| 检查 | 命令/证据 | 通过判据 |
|---|---|---|
| 目录名 == frontmatter name | `ls ~/.dsh/skills/dsh-profile-builder`；SKILL.md 第 2 行起 | 都是 `dsh-profile-builder`；name 匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| 必填字段 | `head -n 12 SKILL.md` | `name` + `description` 存在；仅用官方字段（name/description/whenToUse/metadata） |
| description 长度 | 提取 frontmatter 里 description 全文 | ≤1024 字符，且含触发词：dsh profile、profile 搭建、新建 profile、迁移 profile、profile 升级、第 5 模式、agent 预设、profile 体检、dsh-profile-builder |
| 正文长度 | `wc -l SKILL.md` | ≤500 行 |
| 版本递增 | `metadata.version`；与 git 上一版对比 | 每次编辑 SKILL.md 必须 bump（SemVer） |
| references 完整 | `ls references/` | 00-facts / 10-interview-tree / 20-workflows / 30-verification / 40-migration / 50-publish / 60-agent-modes 都在且被索引 |
| 无未完成标记 | `grep -RniE "T[O]DO|T[B]D|占[位]|待[补]"` | 无（"未验证"标注除外） |
| 脚本可解释 | `node scripts/selftest.mjs` | 39/39，exit 0 |

### A2 · 发布

上游仓库布局、fork、预验收与 PR 流程见 `references/50-publish.md`。证据：`npx skills add demo112/skills --skill dsh-profile-builder --agent claude-code --global --yes` 退出码 0、本机技能目录出现、native skill 工具能加载；PR 由上游 owner 合并，不阻塞交付。

### A3 · 运行时

| 检查 | 证据 |
|---|---|
| 沙箱正例 | 隔离 `DSH_HOME` 下 dump 通过（§4.1）、web 冒烟启动成功（§4.2） |
| 沙箱负例 | §5 矩阵中的关键负例（at least：注释-only patch、缺 package.json、secret、机器路径、模式保留 id） |
| 真实 profile | `dsh-lab` 保留在 `$DSH_HOME/profiles/`，**不激活**；报告写路径与"未切换" |
| 不碰 desktop | 报告写"desktop 未修改、未切换"；证据：无 desktop 文件改动 |
| 证据文件 | dump JSON / `--raw-out` 文件 / 启动 stdout 行，报告里给路径与关键字段 |

### A4 · TDD 证据（writing-skills 铁律：没有失败测试就不写技能）

必须能拿出以下记录，缺一不可：

1. **RED**：在没有本技能的情况下，让子代理执行一个压力场景（例如"帮我做个 dsh profile"），记录它暴露的失败行为（跳过访谈直接写、clone desktop、把 dump 当只读…）——原文摘录。
2. **GREEN**：加载本技能重跑同一场景，行为达标（先访谈、给契约、等确认、按 W1 执行）。
3. **REFACTOR**：若 GREEN 里出现新借口/漏洞，补进 SKILL.md 的"常见错误"或硬门，再重测。
4. **脚本级**：`node scripts/selftest.mjs` 输出 39 passed, 0 failed（离线可复现）。
5. 证据保存：放 `tests/` 或交付报告附录，注明日期与场景。

### A5 · 第 5 模式全链路

| # | 检查 | 命令 | 通过判据 |
|---|---|---|---|
| 1 | L0 insert 形状 + 账本 | `static-check` | MODE-* 与账本检查全通过 |
| 2 | L1 dump 出模式行 | `dump --mode --profile-dir` | exit 0、stderr 空、MODE-ROW 找到 |
| 3 | Phase A 插件逐字相同 | `dump --mode` | 插件 sha == 官方 PTC 基线 sha（MODE-SHA 通过） |
| 4 | 重放一致 | `mode-base verify` | VERIFY-SHA / VERIFY-SHA-DECLARED 通过（官方基线 + ops == patch） |
| 5 | 冲突有预期错误 | refresh/replay 负例 | `OPS-LEDGER-MISMATCH` / `BASELINE-SHA` 等按预期报错 |
| 6 | UI 可见 | 用户亲手操作，且必须在该 profile 的 host 里 | 该 profile 下选择器出现新模式/分组；新会话默认仍 standard（用户确认） |
| 7 | 迁移后仍通过 | export → import → `mode-base verify` | 目标机 verify 通过、dump 通过 |
| 8 | 多模式（如有） | `static-check` | id 与 order 唯一、order ≥5 |

**UI 可见性的判据边界（实测，勿误判）**：新会话的预设 chip 列的是**当前运行 host / profile 的 preset roster**，不是账号级全局列表。同一个 profile 里注册的模式，在该 profile 起的 host 下必然可见；桌面 App 若仍运行在别的 profile（默认 `desktop`），就看不到它——这是 profile 隔离，不是注册失败。

复现（真实 home，不切桌面）：
```bash
DSH_HOME=$HOME/.dsh ELECTRON_RUN_AS_NODE=1 "/Applications/DSH NEXT.app/Contents/MacOS/DSH NEXT" --expose-internals \
  "/Applications/DSH NEXT.app/Contents/Resources/app.asar/lib/desktop-cli.js" --profile <name> --no-open --port <port>
# 浏览器打开打印出的 http://127.0.0.1:<port>/?token=… → 新建会话 → 点「标准模式」chip → 应看到自定义模式
```
验收记录必须写清**在哪个 profile 的 host 下看到**；只写"UI 没出现"会把隔离误判成失败。

## 8. 验收报告模板

```markdown
## 验收报告：<profile>（<date>）

- 契约：<5 行原文>
- 基线：官方 <template> 模板
- patch 清单：<逐行 / 无定制行>
- 模式：<modeId / 显示名 / order / 无>

| 层 | 做了 | 证据（命令 + 关键输出/文件） | 结论 |
|---|---|---|---|
| L0 | 是/否 | ... | 通过/未做 |
| L1 | 是/否 | ... | 通过/未做 |
| L2 | 是/否 | ... | 通过/未做/用户未确认 |
| L3 | 是/否 | selftest 39/39 | 通过/未做 |

- 回滚点：<.bak-<ts> / profile 备份路径 / recovery 快照 / 不适用>
- 未验证：<逐条>
- 未改动声明：desktop profile 未修改、未切换；未删除任何数据
- 用户下一步：<如何自己切换 / 如何删除 dogfood 产物>
```
