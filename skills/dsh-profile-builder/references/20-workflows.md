# 20 · 工作流 W1–W6

> 日期：2026-10-31。前置：已读 `references/10-interview-tree.md` 并拿到用户对 ≤5 行契约的**明确确认**；事实基线见 `00-facts.md`，验收细节见 `30-verification.md`，第 5 模式细节见 `60-agent-modes.md`。
> 所有命令假定 **cwd = 技能根目录**（`~/.dsh/skills/dsh-profile-builder`），脚本用 `node scripts/<x>.mjs` 调用。

## 0. 通用约定

### 0.1 路径与变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SKILL_ROOT` | `~/.dsh/skills/dsh-profile-builder` | 本技能安装目录，脚本相对此目录 |
| `DSH_HOME` | `~/.dsh` | profile 根在 `$DSH_HOME/profiles/<name>` |
| `DSH_APP` | `/Applications/DSH NEXT.app` | DSH NEXT 安装包；bin=`Contents/MacOS/DSH NEXT`，cli=`Contents/Resources/app.asar/lib/desktop-cli.js` |

```bash
# 所有 dsh 调用都走这个包装（本机没有独立的 dsh 可执行文件在 PATH 上）
dsh() {
  DSH_APP="${DSH_APP:-/Applications/DSH NEXT.app}"
  ELECTRON_RUN_AS_NODE=1 "$DSH_APP/Contents/MacOS/DSH NEXT" --expose-internals \
    "$DSH_APP/Contents/Resources/app.asar/lib/desktop-cli.js" "$@"
}
```

> 必须用**真实安装包**里的 `app.asar`；把 app.asar 解包/复制后再跑会 `ERR_MODULE_NOT_FOUND`。

### 0.2 每个工作流的共同出口

结束时在回复里给一张固定报告表：

| 项 | 内容 |
|---|---|
| profile | 名字 + 绝对路径 |
| 基线 | 官方模板名（web/headless/acp/sdk/sdk-minimal） |
| patch 清单 | 逐条行 id / 模式 insert（无则"无定制行"） |
| 验收 | 已做 L0/L1/L2/L3 + 证据命令与关键输出；未做项标"未验证" |
| 回滚点 | `.bak-<ts>` / profile 备份路径 / recovery 快照（只读）/ 不适用 |
| 未验证 | 明确列出 |

**任何工作流都不切换 active profile、不删除、不修改 desktop。** 切换永远由用户自己在桌面 Profile 菜单完成（新/手工 profile 首次切换可能弹 onboarding 向导——未验证，如实告知）。

### 0.3 共同前置

1. 契约已确认（`10-interview-tree.md` §5/§6）；超契约的写必须先停下重新确认。
2. 只读取证已完成（§1 表）。
3. 回滚点已确定并记录；对已有 profile 的任何改动前先 `cp -a` 备份。
4. 第一次写 `$DSH_HOME` 下新路径前，在回复里说明将写哪些路径。

---

## W1 · create（新建 profile）

### W1.1 确认契约与回滚点

- 契约 5 行齐全：名字、基线模板、patch 清单（可"无定制行"）、迁移包（通常"不做"）、验收级别 + 回滚点。
- 新建 = 无旧状态可回滚，回滚点写"不适用（新建）"；若目标目录已存在，**停止**，回到命名节点确认（不覆写）。

### W1.2 官方模板 init

```bash
dsh --profile <name> --from-default-profile web --dump-config
```

预期产出（已验证，2026-10-31，DSH NEXT 2.0.21-next / dsh 0.2.1-rc.4）：

| 文件 | 说明 |
|---|---|
| `package.json` | `name: "dsh-profile-<name>"`、`private: true`、`dependencies: {}`、`dsh.profile.bundles` = `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]` |
| `cordis.patch.yml` | 空 patch 为顶层数组 `[]`（**注释-only 会 fatal**） |
| `cordis.yml` | 生成物，每次启动重写；不进迁移包、不手改 |
| `pnpm-workspace.yaml` | 生成的标准 workspace 文件 |

判据：退出码 0、stderr 为空、stdout 是一份完整 dump（本次 1231 行）；否则按 `00-facts.md` §7 查 failure log。

### W1.3 按契约做 patch 层

只做契约里列出的行；默认零定制。落点纪律（详见 `10-interview-tree.md` N4）：

- 模型路由 → profile patch 的 `agent-default-model` 行；主题/UI → `ui-theme` 等行。
- 工具/插件：**优先官方 optional bundle** 加进 `dsh.profile.bundles`（用官方 `plugin_manager.install_bundle` 轨道），第三方插件也走 plugin_manager；CLI 备选 `dsh plugin --profile <name> add <pkg>`。
- MCP / skill / workspace：MCP 凭据留在 `$DSH_HOME/storages/` 不进 patch；skill 是从文件系统根发现的，不经 profile；workspace 机器相关**不进迁移包**。
- 手改 `cordis.patch.yml`：改前备份 `cp cordis.patch.yml cordis.patch.yml.bak-$(date +%s)`；保持顶层 YAML 数组；每加一项跑一次 `static-check`。

### W1.4 可选 W6（第 5 模式）

契约里有模式才做，按本文件 W6 执行；没有则跳过。

### W1.5 验收与报告

```bash
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"       # L0
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-dump.yml          # L1
# L2：见 30-verification.md（隔离 DSH_HOME 冒烟 / dsh-lab 保留不激活）
```

L1 判据：退出码 0、stderr 空、必需行（agent-loop / modules / connection / webserver / web-runtime）齐全、stderr 无 "skipping profile bundle / disabling profile plugin row / incompatible" 标记。

报告按 §0.2；**不切换**，并告诉用户如何自己切换（Profile 菜单 → 选择 → 重启确认；首次可能出 onboarding，未验证）。

---
## W2 · adopt（按官方基线改造非 desktop 旧 profile）

目标：把现有"手拼/来源不明"的 profile 重新长到官方基线上，能力等价重建；**原 profile 一律不动**。桌面 UI 上改名/重建后，旧目录由用户自行决定保留或删除（本技能不删）。

### W2.1 只读盘点

对旧 profile 目录（`$DSH_HOME/profiles/<old>`）只读取证：

1. `package.json`：`dsh.profile.bundles`、`dependencies`、私有标记、桌面字段。
2. `cordis.patch.yml`：顶层条目 id 清单（定制项），按 `00-facts.md` §4.3 的语义解读。
3. 是否有生成物被误当配置（`cordis.yml`、`desktop-next.*.json`、`.plugin-manager/`、`.dsh-market/`）。
4. 行为证据（可选）：把旧 profile **复制**到临时 `DSH_HOME` 后再 dump，避免写原 profile 的 `cordis.yml` 锚点：

```bash
TMP_HOME=$(mktemp -d); mkdir -p "$TMP_HOME/profiles"
cp -a "$DSH_HOME/profiles/<old>" "$TMP_HOME/profiles/<old-copy>"
node scripts/dump.mjs --profile <old-copy> --dsh-home "$TMP_HOME" --raw-out /tmp/<old>-dump.yml
```

> 直接对原 profile 跑 `--dump-config` 会重写其 `cordis.yml`，属于写操作；契约里没写就不做。

### W2.2 意图提取 → 官方通道映射

逐条列出旧 profile 实际配置了什么（bundle、patch 行、依赖），映射到允许的落点，形成"保留 / 丢弃 / 待确认"三列：

| 旧实现 | 新落点 |
|---|---|
| 官方 optional bundle | 加进新 profile 的 `dsh.profile.bundles` |
| 官方插件行（模型路由/主题/MCP…） | profile patch 对应行，逐条评审 |
| 第三方插件（带版本/来源） | 官方 `plugin_manager.install_bundle` 轨道，或 `dsh plugin --profile <new> add <pkg>` |
| 机器绑定路径 / 明文密钥 | **丢弃**；在目标机本地重填 |
| 生成物 / 实验残留 | **丢弃**，不解释 |

不能解释的行一律"待确认"，向用户逐条确认，不默认搬运。

### W2.3 实施

1. 备份旧目录（`cp -a`，或确认已有备份）。
2. 用官方模板 init 新 profile（同 W1.2；名字默认沿用用途新名，避免覆盖旧目录）。
3. 按映射逐条建能力（同 W1.3），每条后跑 `static-check`。
4. 对照：`diff` 旧 dump 与新 dump 的关键行，差异表进报告——"能力等价"要由差异表证明，不是口头声明。

### W2.4 验收与报告

L0 → L1 → L2（同 W1.5）。报告额外包含：旧 profile 路径与"未改动"声明、能力映射表、未重建项及原因。

---

## W3 · migrate（迁移到另一台机器）

完整包规范、目标机要求与排错见 `references/40-migration.md`；本节是操作序列。

### W3.1 源机打包

```bash
# 1) 源 profile 先过 L0（export 内部也会跑，失败会以 SRC- 前缀报出）
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"

# 2) 导出迁移包（声明层 + lockfile + .profile-builder 记账）
node scripts/export.mjs --profile-dir "$DSH_HOME/profiles/<name>" \
  --out /tmp/<name>-migration-package --runtime-version <dsh 运行时版本>
```

包内容判据：根目录有 `package.json`、`cordis.patch.yml`、`manifest.json`（含 files/每个 sha256、excluded 原因、profile.dshRuntimeVersion、modes）；可选 `compatibility.json`、`pnpm-lock.yaml`、`README.md`、`pnpm-workspace.yaml`、`.profile-builder/`。**不应有** `node_modules`、`cordis.yml`、`desktop-next.*.json`、`.plugin-manager/`、`.dsh-market/`、`*.bak-*`。导出结束会自动对包再跑一次 `static-check --migration`（错误以 PKG- 前缀）。

### W3.2 git 通道

```bash
cd /tmp/<name>-migration-package
git init && git add -A && git commit -m "dsh profile <name> migration package"
git tag <name>-$(date +%Y%m%d)          # 可选：远端 + 标签分发
git remote add origin <repo-url> && git push -u origin main --tags
```

凭据不进仓库（导出时已被纯净检查拦截）；远端仓库权限由用户提供，本技能不代建仓库。

### W3.3 目标机落包

前置：目标机**同平台同架构**、**同 DSH 版本**（对照 `manifest.json` 的 `profile.dshRuntimeVersion` 与本机 `dsh -V`）；目标机**必须先启动过一次 DSH**（生成 `$DSH_HOME/profiles/`，否则 import 报 `IO-DSH-HOME`）。

```bash
git clone <repo-url> /tmp/<name>-migration-package && cd /tmp/<name>-migration-package

# 1) 干跑：校验 manifest/文件/sha/结构（不落盘）
node scripts/import.mjs --from . --profile-name <name> --dry-run
# 2) 真正落盘（需要依赖时加 --install 跑 pnpm install）
node scripts/import.mjs --from . --profile-name <name> --install
# 3) 复验
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-dump.yml
node scripts/mode-base.mjs verify --profile-dir "$DSH_HOME/profiles/<name>" --mode-id <modeId>   # 有模式时
```

注意：`--dry-run` 只校验包与文件清单（不跑目标端 static-check），所以 plan 里的 modes 会显示 `(none)` 属正常；实跑后 modes 才出现。`import` 会把 `package.json` 的 name 重写为 `dsh-profile-<name>`，并刷新目标 `manifest.json`（importedAt/importedAs/packageName）。

### W3.4 报告与边界

报告：源/目标机版本与平台、包内文件与 sha 核对、import 输出、L0/L1 证据、模式 verify 结果、未验证项。
**连续性边界**：只承诺"声明层环境"可复现；会话、凭据、技能历史、机器绑定配置不迁移。首次切换到手建 profile 可能弹 onboarding 向导——未验证，让用户注意。

---
## W4 · upgrade（仅用户明确要求升级时）

默认策略是"跟最新但不动手"；只有用户明确说"升级 / 进化 / 跟进新版本"才执行本工作流。

### W4.1 前置与版本记录

```bash
dsh -V                                            # 运行时版本
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-pre-upgrade.yml   # 升级前快照
dsh --dump-default-config > /tmp/default-pre-upgrade.yml                        # 默认配置基线，用于区分"产品层变化"与"我的定制"
```

记录：应用版本、`@deepseek-ai/dsh` 版本、模式账本里的 `source.dshRuntimeVersion`。

### W4.2 备份

```bash
cp -a "$DSH_HOME/profiles/<name>" /tmp/<name>-pre-upgrade-$(date +%s)
ls "$DSH_HOME/recovery/" | tail -5      # 记下最近 checkpoint 路径（只读引用）
```

### W4.3 升级 bundles / 依赖

- 应用本体升级由用户在桌面完成；本技能只处理 profile 声明层。
- 官方 optional bundle / 第三方插件：走官方 `plugin_manager.install_bundle` 轨道；CLI 备选 `dsh plugin --profile <name> add <pkg>`（首次使用会初始化 profile 并转发 pnpm）。
- 不改 `compatibility.json` 绕过版本检查，除非用户明确接受风险（`dsh plugin allow-version --accept-risk` 属高风险，需单独确认）。

### W4.4 差异审查

```bash
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-post-upgrade.yml
diff -u /tmp/<name>-pre-upgrade.yml /tmp/<name>-post-upgrade.yml | head -200
```

只接受"能解释"的差异（产品层新增行、升级带来的默认变化）；出现新的 skip/incompatible 标记必须查清再继续。对比 `/tmp/default-pre-upgrade.yml` 判断某差异是产品默认还是自己的 patch 引起。

### W4.5 第 5 模式刷新（有模式时）

```bash
# 1) 预览（不带 --write，不落盘）
node scripts/mode-base.mjs refresh --profile-dir "$DSH_HOME/profiles/<name>" --mode-id <modeId> --dump /tmp/<name>-post-upgrade.yml
# 2) 判读：officialChanged / changed / errors
#    OPS-LEDGER-MISMATCH = patch 里有未记录的手改，先补 ops 或回退
#    OPS-LEDGER-MISSING  = 无法解释的漂移，停
# 3) 应用（会先备份 patch，再替换 insert 行并重写基线文件）
node scripts/mode-base.mjs refresh --profile-dir "$DSH_HOME/profiles/<name>" --mode-id <modeId> --dump /tmp/<name>-post-upgrade.yml --write
# 4) 复验 + 期望基线 + L1
node scripts/mode-base.mjs verify --profile-dir "$DSH_HOME/profiles/<name>" --mode-id <modeId>
node scripts/mode-base.mjs replay --baseline "$DSH_HOME/profiles/<name>/.profile-builder/baseline-ptc-<modeId>.yml" \
  --ops "$DSH_HOME/profiles/<name>/.profile-builder/ops-<modeId>.json" --out /tmp/expected-<modeId>.yml
node scripts/dump.mjs --profile <name> --mode <modeId> --baseline /tmp/expected-<modeId>.yml
```

无 ops 账本的纯 Phase A 模式：`refresh` 在校验 patch 插件 sha 等于旧基线 sha 后会直接跟随新基线；否则报 `OPS-LEDGER-MISSING`（说明有过未记录手改）。

### W4.6 验收与回滚

L0 → L1（有 L2 条件则 L2）。失败回滚顺序：`.bak-<ts>`（最近一次）→ `/tmp` 下的 profile 备份 → recovery 快照只读复制。报告给出版本前后对比、差异清单、模式是否刷新、未验证项。

---

## W5 · doctor（排障，只读诊断 + 确认后修复）

### W5.1 只读取证

| 证据 | 位置 |
|---|---|
| 桌面实时日志 | `$DSH_HOME/logs/desktop-next.log`（tail） |
| 启动失败日志 | `$DSH_HOME/logs/startup-<ISO>-<uuid>.log`、`$DSH_HOME/logs/dsh-desktop-next-failure-<ts>-<stage>.log` |
| 活跃运行记录 | `$DSH_HOME/logs/active-run.json` |
| recovery 快照 | `$DSH_HOME/recovery/<epoch-ms>-<uuid>/`（只看，不动） |
| profile 结构 | `package.json` / `cordis.patch.yml` / `compatibility.json` / 目录权限 |
| 静态结构 | `node scripts/static-check.mjs --profile-dir <dir>`（只读） |

### W5.2 症状 → 根因 → 修复

| 症状（日志/stderr 原文） | 根因 | 修复方向 |
|---|---|---|
| `dsh: skipping profile bundle ...` | bundle 不在安装/依赖中、不可读或格式坏 | 修正 `dsh.profile.bundles`，或安装缺失 bundle |
| `dsh: disabling profile plugin row ...: Plugin ... is incompatible with dsh ...` | 插件 engines/peer 与当前 dsh 版本不匹配 | 升级插件；或按官方兼容性例外（需用户确认风险） |
| `dsh: overlay <path>/cordis.patch.yml must be a top-level YAML array of loader patch entries` | patch 不是顶层数组（注释-only / 对象） | 恢复备份，改成 `[]` 或合法 insert 数组 |
| `dsh: profile "<name>" does not exist; create it with ...` | 目录不存在或名字不符 | 用官方模板 init，或改到存在的名字 |
| 启动卡住/白屏 | 读 failure log 的 stage；常见为 host boot 或插件异常 | 按日志定位；回滚最近改动 |

### W5.3 修复纪律

1. 先给诊断结论（症状/证据/根因），再给修复计划**逐条列**；每条需用户确认后才执行。
2. 改任何文件前备份；不删除任何 profile、日志或 recovery 快照。
3. 不直接修 desktop profile；需要修 desktop 时只给命令，由用户执行。
4. 修复后按 L0 → L1 →（可行时）L2 复验；报告写明"未复现/未验证"项。

---
## W6 · mode（给 profile 增加第 5 个 agent 模式）

机制、官方 PTC 声明细节与账本 schema 见 `references/60-agent-modes.md`。W6 分两阶段验收，**不允许一步到位**。

### W6.0 前置

- 契约里已写：mode id、显示名（≤64 字符）、描述（≤200 字符）、order（整数 ≥5，profile 内唯一）、是否多模式。
- profile 基线必须是 web（bundles 含 `@deepseek-ai/dsh-web-app`）；headless/acp/sdk 不适用，直接告知用户。
- 命名：mode id 默认 `<profile>-<mode>`，匹配 `^[a-z0-9][a-z0-9-]{0,63}$`；不得占用内建 id `standard`/`ptc`/`minimal`/`cordis`。
- 口径：DSH 没有 preset 继承，本技能复制官方 PTC 整份插件声明再改元数据；Phase A 必须做到插件声明与官方 PTC 逐字相同（0 漂移）。

### W6.1 Phase A：纯 fork（只改元数据，插件声明不动）

```bash
# 1) 拿到当前 profile 的权威 dump
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-mode-dump.yml

# 2) 从 dump 里抽取官方 preset-ptc 的插件声明做基线
node scripts/mode-base.mjs extract --dump /tmp/<name>-mode-dump.yml \
  --out "$DSH_HOME/profiles/<name>/.profile-builder/baseline-ptc-<modeId>.yml"

# 3) 渲染 insert 并写盘（自动备份 cordis.patch.yml.bak-<epoch-ms>）
node scripts/mode-base.mjs emit \
  --baseline "$DSH_HOME/profiles/<name>/.profile-builder/baseline-ptc-<modeId>.yml" \
  --mode-id <modeId> --mode-name "<显示名>" --description "<≤200 字描述>" --order 5 \
  --profile-dir "$DSH_HOME/profiles/<name>" --write

# 4) 校验 + L0 + L1（Phase A：dump 的插件 sha 必须等于官方基线 sha）
node scripts/mode-base.mjs verify --profile-dir "$DSH_HOME/profiles/<name>" --mode-id <modeId>
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"
node scripts/dump.mjs --profile <name> --mode <modeId> --profile-dir "$DSH_HOME/profiles/<name>"
```

Phase A 通过判据：verify 全绿；static-check 退出码 0；dump 退出码 0 且模式行存在、插件 sha == 官方 PTC 基线 sha（`MODE-SHA` 通过）；stderr 无 incompatible/skip 标记。然后请用户在 Profile 的 agent 模式选择器里**亲眼确认**新模式出现；告知"新会话默认仍是 standard，需在 UI 里自己设一次"（本技能不覆写 registry 默认）。

### W6.2 Phase B：定制（每次改动一条 op）

1. 在 `$DSH_HOME/profiles/<name>/.profile-builder/ops-<modeId>.json` 记录定制（只允许支持的操作）：

```json
{"modeId": "<modeId>", "ops": [
  {"op": "set-plugin-config", "pluginId": "agent-instructions", "path": ["maxBytes"], "value": 32768, "from": 65536}
]}
```

支持：`disable-plugin`/`enable-plugin`（pluginId）、`remove-plugin`（pluginId）、`add-plugin`（pluginId/pluginName/config 标量）、`set-plugin-config`（pluginId/path 单层/value/from 可选）。冲突/目标缺失由脚本报 `OP-TARGET-MISSING` / `OP-CONFLICT` 等，不要手改插件列表绕过账本。

2. 重新渲染并写盘（`--replace` 允许覆盖已有模式）：

```bash
node scripts/mode-base.mjs emit \
  --baseline "$DSH_HOME/profiles/<name>/.profile-builder/baseline-ptc-<modeId>.yml" \
  --mode-id <modeId> --mode-name "<显示名>" --description "<描述>" --order 5 \
  --ops "$DSH_HOME/profiles/<name>/.profile-builder/ops-<modeId>.json" \
  --profile-dir "$DSH_HOME/profiles/<name>" --replace --write
node scripts/mode-base.mjs verify --profile-dir "$DSH_HOME/profiles/<name>" --mode-id <modeId>
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"
```

3. L1（注意：dump --mode 默认拿官方基线比，有 ops 时会误报 `MODE-SHA`；先重放生成期望基线再比）：

```bash
node scripts/mode-base.mjs replay \
  --baseline "$DSH_HOME/profiles/<name>/.profile-builder/baseline-ptc-<modeId>.yml" \
  --ops "$DSH_HOME/profiles/<name>/.profile-builder/ops-<modeId>.json" \
  --out /tmp/expected-<modeId>.yml
node scripts/dump.mjs --profile <name> --mode <modeId> --baseline /tmp/expected-<modeId>.yml
```

4. 请用户第二次 UI 确认（模式行为是否符合预期）。

### W6.3 多模式与升级后刷新

- 多模式：每个模式独立 insert 行 + 独立 `baseline-<modeId>.json` / `baseline-ptc-<modeId>.yml` / `ops-<modeId>.json`；id 与 order 在 profile 内唯一。默认只做 1 个。
- 升级后刷新：见 W4.5（`refresh` 预览 → `--write` → `verify` → `replay` → `dump --baseline`）。
- 禁止：覆写 `agent-preset-registry` 的 `config.default`；手改 insert 的插件列表后不更新账本；把模式放进 desktop profile。

### W6.4 报告

包含：mode id / 显示名 / order、基线文件路径、插件数量与 sha、Phase A/B 各层证据、用户 UI 确认结果（做了/没做）、升级后刷新状态、未验证项。

---

## 附录 · 命令速查

| 目的 | 命令（cwd = 技能根） |
|---|---|
| 离线全回归 | `node scripts/selftest.mjs` |
| L0 静态 | `node scripts/static-check.mjs --profile-dir <dir> [--migration] [--json]` |
| 打包复检 | `node scripts/static-check.mjs --profile-dir <pkg> --migration` |
| L1 权威 | `node scripts/dump.mjs --profile <name> [--raw-out f] [--mode <id> --profile-dir <dir>] [--baseline f]` |
| 抽基线 | `node scripts/mode-base.mjs extract --dump <f> --out <f>` |
| 写模式 | `node scripts/mode-base.mjs emit --baseline <f> --mode-id <id> --mode-name <s> --description <s> --order <n> --profile-dir <dir> --write [--ops <f>] [--replace]` |
| 验模式 | `node scripts/mode-base.mjs verify --profile-dir <dir> --mode-id <id>` |
| 重放期望 | `node scripts/mode-base.mjs replay --baseline <f> --ops <f> --out <f>` |
| 跟随官方基线 | `node scripts/mode-base.mjs refresh --profile-dir <dir> --mode-id <id> --dump <f> [--write]` |
| 导出迁移包 | `node scripts/export.mjs --profile-dir <dir> --out <dir> [--force] [--runtime-version <v>]` |
| 导入迁移包 | `node scripts/import.mjs --from <pkg> --profile-name <name> [--dsh-home <d>] [--dry-run] [--install]` |
