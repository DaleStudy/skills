# 60 · 第 5 模式（自定义 agent preset）机制与账本

> 日期：2026-10-31。依据：`spec-v2.md` §6（决策 Q17/Q18/Q20/Q21/Q21-bis/Q22/Q24/Q25）、本目录 `scripts/mode-base.mjs` + `scripts/_lib.mjs` **源码**（CLI 事实以源码为准）、`tests/fixtures/dump-web.txt` / `dump-ptc-moved.txt` 实测。
> **本文件中的所有命令与标志都取自源码；源码与 spec 文字不一致处集中在 §12，遇到冲突以源码为准。**
> 一句话：第 5 模式 = 往 profile 的 `cordis.patch.yml` 里加**一条顶层 `- insert:`**，插入一个 `@deepseek-ai/dsh-agent-preset` 声明行；声明内容 = 官方 PTC 的 `plugins` 整份复制 + 只改元数据。

## 0. 适用条件（先判断，再动手）

- 目标 profile 的 `package.json` 的 `dsh.profile.bundles` **必须包含 `@deepseek-ai/dsh-web-app`**：4 个内建 preset 声明和 `agent-preset-registry` 都来自这个 bundle（它的 patch list 里含 `presets/standard.patch.yml`、`presets/ptc.patch.yml`、`presets/minimal.patch.yml`、`presets/cordis.patch.yml`）。
- `headless` / `acp` / `sdk` / `sdk-minimal` 模板没有 web UI 选择器 → **第 5 模式不适用**：直接告诉用户并停止（不要用别的机制"模拟"）。
- 目标 profile 不在 desktop 上：模式随 profile 走；desktop 永不改、永不切（Q12）。

## 1. 机制与证据

**机制**：一行 insert 即可，不需要额外 bundle、不需要 `plugin_manager`。

- 证据（本机已实证）：scratch `DSH_HOME` + 内建 `web` profile，插入模式行后跑 `--dump-config`：**exit 0、1242 行组合输出、stderr 空**，组合结果中同时出现 `- id: preset-<mode>` 行与 `agent-preset-registry` 行。
- 官方"插件/预设编辑"轨道（bundle + `plugin_manager.install_bundle`）是**备选**路径；本技能主路径 = profile patch 直接 insert（本机实证、可离线校验、可迁移）。

**为什么能生效**：`@deepseek-ai/dsh-agent-preset` 插件的 Config 是 `z.object({id, name, description, order, plugins})`，apply 时调用 `ctx.agentPresets.register()`；`agent-preset-registry` 的 `list()` 读 `record.config.name / description / order`，选择器把非内建模式归入「自定义预设」分组。

## 2. 官方 4 模式与 PTC 差异（决定"复制整份"）

### 2.1 事实测量（fixture `tests/fixtures/dump-web.txt`，597 行，来自一次干净 `--dump-config` 的官方声明，已脱敏）

| 内建 id | 声明起始行 | 顶层 plugin 行数 | 非空声明行数 | plugins 规范化 sha256（前 12 位 / 全长见下） |
|---|---|---|---|---|
| `standard` | 8 | 22 | 148 | `9a64ed0946ccc4fe30a5582f3832514c50791186f1a47421440d1598fd3622db` |
| `ptc` | 168 | 23 | 154 | `0aff23a2d433509cd92c9b6c000f45f8585a2890a62a1e95a8ea209b36ab867c` |
| `minimal` | 334 | 4 | 79 | `fd6df7dc959dbcab641b560f874c4bbb5c3904f8b6857bca0ad0c221e64cf568` |
| `cordis` | 432 | 23 | 155 | `1fbb22d3e1cd0d323a224e14cb4926b4c8ddcd695eb69b1f4dfbc57ef101beb5` |

> 表里的 sha256 是 `scripts/_lib.mjs` 的 canonical 形式（`plugins:` 列表整体 dedent 到第 0 列、去行尾空白、恰一个结尾换行）的哈希；模式基线就是按这个定义比对的。

### 2.2 PTC vs standard 的精确差异（本机对 fixture 做块级 diff）

`ptc` 相对 `standard` **只有 3 处**（即 spec 所说"PTC 只差 3 处"的实测确认）：

1. **多一个顶层插件行**：`- id: tool-presentation / name: '@deepseek-ai/dsh-agent-tool-presentation' / config: { mode: ptc }`；
2. `delegation` 组的子行 `workflow-ptc` 增加 `disabled: true`；
3. `delegation` 组的子行 `tool-workflow` 增加 `disabled: true`。

除此之外逐字相同。**DSH 没有 preset 继承机制**：4 个内建模式是 4 份独立完整声明（`minimal` 只有 4 个顶层插件，`cordis` 用 `tool-cordis` 取代 `tool-presentation`，都不是"继承 + 覆盖"）。因此：

- "在 PTC 基础上做" = **复制 PTC 的 `plugins` 列表整份**（约 150 行声明），只改 `config.id / config.name / config.description / config.order`；
- Phase A（纯 fork）要求 `plugins` 与官方 **逐字一致**（sha 相等），这样行为 0 漂移、基线可比。

## 3. 声明形状（写进 profile 的 `cordis.patch.yml`）

```yaml
- insert:
    - id: preset-<profile>-<mode>        # loader 行 id，profile 内唯一
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: <profile>-<mode>              # 模式 id，见 §4
        name: '<显示名>'                   # 选择器里显示的名字，必填
        description: '<一句话描述>'        # 必填，建议 ≤200 字符
        order: 5                          # 整数 ≥5，profile 内唯一
        plugins:
          # 官方 preset-ptc 的 plugins 整份逐行复制（缩进保持一致）
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            ...
```

- insert 行也可以带 `replace` / `insert` 等 patch 语义；本技能只使用"顶层 insert 一行"的最小形态。
- 缩进事实（源码 `emitInsertText`）：`- insert:` 顶格；`    - id:`（4 空格）；`      name:`（6）；`      config:`（6）；config 子键 8；`plugins:` 8；plugins 条目 10。
- `plugins` 里允许保留官方原文的 `!!js` 表达式、`disabled`、`cordis:group` 嵌套——**只许逐字复制**；Phase B 的改动一律通过 ops 账本（§8）表达，不许手改 insert 行正文。

## 4. 命名与顺序规则

| 项 | 规则 | 来源 |
|---|---|---|
| mode id | 必须匹配 `/^[a-z0-9][a-z0-9-]{0,63}$/`（kebab-case，最长 64 字符）；约定 `<profile>-<mode>`（如 `lab-redteam`），跨 profile 唯一 | 源码 `MODE_ID_RE`；Q25 |
| 保留 id | 不得为 `standard` / `ptc` / `minimal` / `cordis` | 源码 `RESERVED`；`static-check` MODE-RESERVED-ID |
| loader 行 id | 必须是 `preset-<mode-id>` | 源码 `emitInsertText`；`static-check` MODE-INSERT-ID |
| order | 整数 ≥5（内建占 1–4；不要猜官方精确顺序，只保证自己和内建不冲突）；同一 profile 内唯一 | 源码 `--order must be an integer >= 5`；`static-check` MODE-ORDER / MODE-ORDER-DUP |
| 显示名 | 必填，用户原话，不翻译、不 fallback 到内建文案 | `static-check` MODE-NAME；Q25 |
| 描述 | 必填，一句话（建议 ≤200 字符） | `static-check` MODE-DESCRIPTION |
| 多模式 | 默认 1 个主模式；要第 2/3 个必须用户明确要求；每个模式独立 insert 行 + 独立基线文件（`.profile-builder/baseline-<mode>.json`、`baseline-ptc-<mode>.yml`、可选 `ops-<mode>.json`），id 与 order 全 profile 唯一 | Q25；源码文件名规律 |
| profile 前缀 | 模式 id 带 profile 名做前缀（`lab-…`），避免跨 profile 撞名 | Q25 约定 |

## 5. 默认模式策略（Q20 = C）

- **不覆写** `agent-preset-registry` 的 `config.default`。web-app bundle 自带 `default: standard`（fixture 第 3–6 行：`- id: agent-preset-registry / config: default: standard`）。新建 profile 的开箱新会话仍是 `standard`。
- 用户要换默认：在 UI「新会话默认模式」里设一次（`selectedDefault` 是 volatile，不落 profile 文件、不进迁移包）。
- 报告口径必须写："**在你手动设置之前，新会话默认模式仍是 standard**"。
- 校验建议（源码能力）：`node scripts/dump.mjs --profile <name> --expect-default standard` 检查组合后 registry 的 `default` 是否被意外改动（`REGISTRY-DEFAULT` 检查项，warn 级）。
- ⚠️ 源码差异：`spec-v2` §6.5 说"静态检查：patch 中若出现对 registry `config.default` 覆写 → 告警"；当前 `static-check.mjs` **没有**这条检查（只有 `dump.mjs --expect-default` 覆盖）。以源码为准，差异见 §12。

## 6. 两阶段交付（Q22 = A+B、Q24 = A）

### Phase A — 纯 fork（行为 0 漂移）

1. 从当前官方 dump 抽取基线：`node scripts/mode-base.mjs extract --dump <新dump文件> --preset ptc --out .profile-builder/baseline-ptc-<mode>.yml --json`（`--out` 会写基线快照；也可把 `--json` 输出的 `yaml` 字段交给 emit 用）。
2. 生成并写入 insert 行（**只有元数据变化**）：
   `node scripts/mode-base.mjs emit --profile-dir $DSH_HOME/profiles/<name> --baseline .profile-builder/baseline-ptc-<mode>.yml --mode-id <profile>-<mode> --mode-name '<显示名>' --description '<描述>' --order 5 --write --json`
   - 不带 `--ops` = diff 为空；`--write` 前会先备份 patch 为 `cordis.patch.yml.bak-<epoch-ms>`。
3. 组合校验：`node scripts/dump.mjs --profile <name> --mode <mode-id> --profile-dir $DSH_HOME/profiles/<name>` → exit 0、stderr 空、`MODE-SHA` 通过（组合后的 plugins sha == 基线 sha）。
4. **用户 UI 亲眼确认**：选择器「自定义预设」分组出现该模式；此时新会话默认仍是 standard。**前提**：桌面/浏览器必须运行在该模式所属的 profile 上——预设 chip 只读当前 host 的 roster，在 `desktop` profile 下看不到是隔离而非失败（见 30-verification A5 判据边界）。
5. 静态校验：`node scripts/static-check.mjs --profile-dir <dir>`（模式形状 + 基线配对全部通过）。

### Phase B — 定制（每项进 ops 账本）

1. 按访谈把定制写成 ops 文件（如 `.profile-builder/ops-<mode>.json`，格式见 §8）；
2. 重新 emit（记得 `--ops`）再 `--write`；或先不带 `--write` 看 `patchPreview` 再落盘；
3. 复跑 `verify` + `dump` + `static-check`；4. 用户二次 UI 确认；5. 报告写明本次追加了哪些 op、为什么。

## 7. `.profile-builder/` 账本（文件与语义）

目录：`$DSH_HOME/profiles/<name>/.profile-builder/`（源码常量 `MARKER_DIR`）。三个文件（按 mode id 各一套）：

### 7.1 `baseline-ptc-<mode-id>.yml`（官方基线快照）

由 `extract` / `emit` / `refresh` 生成，固定形状：

```yaml
# dsh-profile-builder mode baseline — generated, do not edit by hand.
# Extracted from an official dsh --dump-config run; see references/20-workflows.md W4.
preset: ptc
sha256: <官方 baseline 的 64 位 hex>
plugins:
  <官方 preset-ptc 的 plugins 规范化文本，整体缩进 2 空格>
```

- `sha256:` 是**声明值**，读取时会与正文重新计算值比对（不一致 → `VERIFY-SHA-DECLARED` / `BASELINE-SHA` 类错误）。
- 手改这个文件 = 破坏基线可比性；只允许脚本重写。
- 只支持 `preset: ptc`（emit 会拒绝其它 preset：`BASELINE-PRESET`）。

### 7.2 `baseline-<mode-id>.json`（模式元数据 + 双 sha 指针）

`emit` 写出的实际字段（源码事实，不是 spec 草案）：

```json
{
  "schemaVersion": 1,
  "modeId": "<profile>-<mode>",
  "displayName": "<显示名>",
  "description": "<描述>",
  "order": 5,
  "preset": "ptc",
  "baselineFile": "baseline-ptc-<mode-id>.yml",
  "sha256": "<期望的最终 plugins sha：baseline + ops 重放后>",
  "baselineSha256": "<官方 baseline plugins 的 sha（仅基线）>",
  "opsFile": "ops-<mode-id>.json 或 null",
  "extractedAt": "<ISO 8601>",
  "source": "dsh --dump-config"
}
```

**两个 sha 的分工（最容易混的地方）**：

- `sha256` = **期望终值**：官方 baseline 文本先经 ops 重放，得到期望 plugins 文本，再规范化 → sha256。它必须等于 patch 里 insert 行 `config.plugins` 的规范化 sha（否则 `VERIFY-SHA` / `MODE-SYNC` 失败）。
- `baselineSha256` = **官方基线指纹**：只对 `baseline-ptc-<mode>.yml` 的 plugins 块算 sha，不含 ops。它只用于**漂移检测**（官方升级后是否变化）。
- 没有 ops 时两者相等；写了 ops 后 `sha256 ≠ baselineSha256` 是**正常**的，不要"修成相等"。
- `refresh` 后会更新为：`baselineSha256 = 新官方基线 sha`、`sha256 = 新基线 + ops`，并追加 `refreshedAt`。

### 7.3 `ops-<mode-id>.json`（差异账本）

- 顶层必须是 JSON 对象且含数组 `ops`：`{ "modeId": "...", "ops": [ ... ] }`；`emit` / `refresh` 会原样保存整个对象（多余字段保留）。
- 每条 op 的字段（源码 `applyOps`）：

| op | 必填字段 | 语义 / 限制 |
|---|---|---|
| `disable-plugin` | `pluginId` | 目标顶层 plugin 块必须存在；已有 `disabled: true` 幂等返回；已有相反值 → `OP-CONFLICT` |
| `enable-plugin` | `pluginId` | 同上，置 `disabled: false` |
| `remove-plugin` | `pluginId` | 删除整个顶层 plugin 块 |
| `add-plugin` | `pluginId`（须匹配 mode-id 正则）、`pluginName`，可选 `config` | 只能标量 config（对象值 → `OP-UNSUPPORTED`）；id 已存在 → `OP-CONFLICT` |
| `set-plugin-config` | `pluginId`、`path`（数组且长度必须 1）、`value`；可选 `from`（期望旧值，用于防漂移） | 只支持单层路径；无 config 块/无该 key 时按情形插入或报 `OP-CONFLICT` |

- 源码**没有** `set-metadata` op：显示名/描述/order/id 这些元数据由 `emit` 参数决定，不进 ops（spec §6.7 曾把 `set-metadata` 列进 diff op 集，源码未实现，见 §12）。
- 建议（非强制，脚本不校验）：每条 op 附 `"reason": "..."` 作审计说明；`emit` 会原样保存整个 ops 对象，refresh 也按数组整体重放。
- ops 应用是**行级/缩进切片**，不是完整 YAML 解析：`plugins` 块里出现 tab 缩进、或人工把 insert 行改成脚本不认识的形状时，脚本可能报错或比对失败——这正是"不许手改"的技术原因。

## 8. CLI 权威参考（全部取自 `scripts/mode-base.mjs` 源码；输出 JSON 契约 `{ok, checks[], errors[]}`）

通用：`node scripts/mode-base.mjs <子命令> [options]`；`--json` 输出机器可读 JSON，否则人类可读；**exit 0 = ok，1 = 失败（含 USAGE 错误），2 = 未知子命令**。

### 8.1 `extract` —— 从官方 dump 抽基线

```
node mode-base.mjs extract --dump <file> [--preset ptc] [--out <file>] [--json]
```

- 读 `--dump` 给出的 dump 文本，找顶层行 `preset-<preset>`（默认 `ptc`），把它的 `plugins` 规范化 → sha256；`--out` 写 §7.1 格式的基线快照。
- 输出：`{ok, preset, sha256, plugins, out|yaml}`；`plugins` 是"非空声明行数"（本例 154），**不是**顶层插件数（23）。
- 错误：`USAGE`、`IO-DUMP`、`PRESET-ROW-MISSING`、`PRESET-PLUGINS-EMPTY`。

### 8.2 `emit` —— 生成 / 写入 insert 行（含账本）

```
node mode-base.mjs emit --baseline <file> --mode-id <id> --mode-name <name> --description <text>
     --order <n> [--profile-dir <dir>] [--write] [--preset ptc] [--out <file>] [--json]
```

源码实际还接受（用法行没写全）：`--ops <file>`、`--replace`。**`--out` 在用法行里出现但 emit 不读它（no-op），不要依赖**。

- 必填：`--baseline`、`--mode-id`、`--mode-name`、`--description`、`--order`（缺一个 → `USAGE`）。
- 校验顺序：mode-id 正则（`MODE-CONFIG-ID`）→ 保留 id（`MODE-RESERVED-ID`）→ order 整数 ≥5（`MODE-ORDER`）→ 读 baseline（`BASELINE-READ`）→ preset 必须 ptc（`BASELINE-PRESET`）→ 基线声明 sha 自洽（`BASELINE-SHA`）→ 若有 `--ops`：读 JSON 且 `ops` 为数组（`OPS-READ`）并重放（失败返回 `OP-*`）。
- 行为分三种：
  1. **不带 `--profile-dir`**：只生成 insert 文本，不写任何文件（结果里的 `insert` 字段）。
  2. **带 `--profile-dir` 但不带 `--write`**：**会写** `.profile-builder/baseline-ptc-<id>.yml` + `baseline-<id>.json`（若有 ops 也写 `ops-<id>.json`），但**不写 patch**；结果返回 `patchPreview`（新 patch 内容）与 `wrote` 列表。
  3. **带 `--profile-dir --write`**：先 `cp cordis.patch.yml cordis.patch.yml.bak-<Date.now()>`，再写 patch + 上述账本文件。
- 已存在同 mode 行：不带 `--replace` → `MODE-EXISTS`（"pass --replace to update it"）；带 `--replace` 则替换整条顶层 entry。
- 已存在 `ops-<id>.json` 但本次没给 `--ops` → `OPS-LEDGER-EXISTS`（"refusing to silently drop customizations"）——这是防"重新 emit 把定制清空"的保护，**不能靠 `--replace` 绕过**；必须显式给 `--ops`（或先移除旧账本）。
- patch 写入位置：如果 patch 里只有一行 `[]`，insert 直接替换该行；否则追加到文件末尾。写后整体 `normText` 规范化。
- 输出（关键字段）：`{ok, modeId, order, sha256, baselineSha256, insert, wrote[], patchPreview?, replaced?}`。

### 8.3 `verify` —— 离线校验 patch / 基线 / ops 一致性

```
node mode-base.mjs verify --profile-dir <dir> --mode-id <id> [--json]
```

检查项（失败即 exit 1）：`VERIFY-PATCH`（patch 存在）、`VERIFY-MODE-ROW`（patch 里有该 `config.id` 的 preset 行）、`VERIFY-BASELINE-YML`/`VERIFY-BASELINE-JSON`（账本存在）、`VERIFY-BASELINE-READ`、可选 `VERIFY-OPS-READ`/`VERIFY-OPS-REPLAY`、`VERIFY-BASELINE-JSON-SHAPE`（schemaVersion=1 且 modeId 匹配）、`VERIFY-BASELINE-SOURCE-SHA`、`VERIFY-SHA-DECLARED`、`VERIFY-SHA`（patch plugins sha == 基线+ops 期望）、`VERIFY-TEXT`（文本逐字相等）。输出 `{ok, modeId, sha256, opsApplied, checks[], errors[]}`。

### 8.4 `replay` —— 离线把 ops 重放到某个基线上（升级预检）

```
node mode-base.mjs replay --baseline <file> --ops <file> [--out <file>] [--json]
```

- 读基线 + ops，应用后输出**新的基线 YAML 文本**（`--out` 写文件；否则 `yaml` 字段）+ `sha256`。**不碰 profile、不写 patch。**
- 冲突错误：`OP-TARGET-MISSING`（ops 指向的 plugin 在新基线不存在）、`OP-CONFLICT`、`OP-BAD-ARG`、`OP-UNSUPPORTED`、`OP-UNKNOWN`；`applied` 记录到冲突前已应用的 op。

### 8.5 `refresh` —— 官方基线变动后的升级重放（W4）

```
node mode-base.mjs refresh --profile-dir <dir> --mode-id <id> --dump <file>
     [--preset ptc] [--write] [--json]
```

算法（源码顺序）：

1. 读 profile patch、旧基线 yml（`BASELINE-READ`）、旧 `baseline-<id>.json`（`BASELINE-JSON`）、新 dump（`IO-DUMP`）、新 dump 里的 `preset-ptc`（`PRESET-ROW-MISSING`）、当前 patch 里的 mode 行（`MODE-ROW-MISSING`）；
2. `officialChanged = 新基线 sha !== 旧基线 sha`；
3. 若存在 ops 账本：
   - **先在旧基线上重放**，结果必须逐字等于当前 patch 里的 plugins（否则 `OPS-LEDGER-MISMATCH`："local edits are not recorded in ops-<id>.json"——即有人手改过 patch）；
   - 再在新基线上重放（冲突带 `phase: replay-on-old` / `replay-on-new`）；
4. 若无 ops 账本但当前 patch 的 plugins sha ≠ 旧基线 sha → `OPS-LEDGER-MISSING`（有未记账定制，先补账本再升级）；
5. 用旧 json 里的 `displayName`/`description`/`order` 重建 insert；若期望 sha 与当前 patch 相同 → no-op（`changed:false`，不写任何文件）；
6. 无 `--write`：只返回 `patchPreview`，**零写入**；带 `--write`：备份 patch → 替换 mode entry → 重写 `baseline-ptc-<id>.yml`（新官方基线）+ `baseline-<id>.json`（更新 `sha256`、`baselineSha256`、`opsFile`、`extractedAt`、`refreshedAt`）。

输出：`{ok, modeId, officialChanged, changed, opsApplied, oldSha, freshSha, expectedSha, wrote[], patchPreview?}`。

### 8.6 错误码速查

| 阶段 | 错误码 |
|---|---|
| 通用 | `USAGE`（缺参）、`UNEXPECTED`（脚本异常） |
| extract | `IO-DUMP`、`PRESET-ROW-MISSING`、`PRESET-PLUGINS-EMPTY` |
| emit | `MODE-CONFIG-ID`、`MODE-RESERVED-ID`、`MODE-ORDER`、`BASELINE-READ`、`BASELINE-PRESET`、`BASELINE-SHA`、`OPS-READ`、`IO-PATCH`、`MODE-EXISTS`、`OPS-LEDGER-EXISTS` |
| ops 重放 | `OP-TARGET-MISSING`、`OP-CONFLICT`、`OP-BAD-ARG`、`OP-UNSUPPORTED`、`OP-UNKNOWN` |
| refresh | `IO-PATCH`、`BASELINE-READ`、`BASELINE-JSON`、`IO-DUMP`、`PRESET-ROW-MISSING`、`PRESET-PLUGINS-EMPTY`、`MODE-ROW-MISSING`、`OPS-READ`、`OPS-LEDGER-MISMATCH`、`OPS-LEDGER-MISSING` + 带 `phase` 的 `OP-*` |
| verify | `VERIFY-*` 系列（见 §8.3） |

> `OPS-LEDGER-*` 是**账本完整性保护**：出现时不要删账本、不要强写，先查清"是漏记定制还是手改了 patch"，再决定补账本或放弃定制。

## 9. 升级重放工作流（W4 里的模式部分）

触发条件：**用户明确说"进化 / 升级迭代"**（Q9/Q13）；不允许自动升级。

1. 记录回滚点：`$DSH_HOME/recovery/` 最新 checkpoint + 当前 patch 的 `.bak-` 副本（emit/refresh 写盘前自动生成）。
2. 确认新 runtime 版本，升级 profile bundles/依赖；对**目标 profile** 重新 `--dump-config` 到临时文件（dump 会重写该 profile 的 `cordis.yml`，属预期写）。
3. 先空跑：`node scripts/mode-base.mjs refresh --profile-dir <dir> --mode-id <id> --dump <new-dump> --json` → 看 `officialChanged` / `changed` / `opsApplied` / 有无冲突；有冲突（`OP-TARGET-MISSING`、`OP-CONFLICT`）→ **停下来列冲突交用户决定**（改 ops、放弃该定制、或暂缓升级）。
4. 落盘：同命令加 `--write`；全程自动备份。
5. 校验：`verify` → `dump.mjs --mode <id> --profile-dir <dir>` → `static-check.mjs`。
6. 报告：官方基线有哪些变化（sha 前后）、哪些 op 被重放、有没有 no-op、回滚点在哪。

**fixture 示例（`dump-ptc-moved.txt`）**：模拟官方 PTC 升级——顶层插件 23 → 24（新增一个 `tool-moved-in`），基线 sha `0aff23a2…` → `3170a1b1…`。refresh 的正确行为 = 以新官方声明为底、重放旧 ops、生成新 insert、更新两个 sha；旧基线 + 旧 ops 若在旧基线上无法重现当前 patch，则报 `OPS-LEDGER-MISMATCH`。

## 10. 迁移与随包

- `.profile-builder/` 三个账本文件**随 profile 迁移**（`static-check.mjs --migration` 的根目录白名单明确包含 `MARKER_DIR`；账本本身也会过纯净四检：无绝对路径 / 无明文密钥 / 无生成物）。
- 迁移包不带生成物（`cordis.yml`、`desktop-next.*.json`、`.plugin-manager/`、`.dsh-market/`、`node_modules/`），见 00-facts §9。
- 目标机要求：同平台 + 同 DSH 版本；装好后先 `mode-base verify`——若目标机官方基线 sha 与 `baselineSha256` 不同（版本/发行版不一致），先 `refresh` 再谈验收，或明确"未在本机验证"。

## 11. 限制与未验证风险（诚实清单）

1. **只支持以 PTC 为 fork 基底**：`emit` 拒绝其它 preset（`BASELINE-PRESET`）；`minimal` / `cordis` 不能作为基底。
2. **显示名/描述的最终 UI 渲染未实测**：注册表读取 `config.name/description/order` 是源码事实，但"真实激活后选择器怎么显示"要靠 L2 + 用户亲眼确认；不要仅凭 dump 断言 UI 生效。
3. **「代码工具」开关的可见性影响未知**：内建 PTC / minimal 的可见性受该开关影响（已知）；自定义模式是否同样受影响**未验证** → 验收时两种开关状态各看一次，若异常记为已知限制。
4. **官方升级只会被 sha 发现**：没有继承/引用，官方改了 `plugins` 只能通过 sha 对比发现，需要 refresh；若官方删改了 op 指向的 plugin/config 路径 → `OP-TARGET-MISSING` / `OP-CONFLICT`，必须由人决策，脚本不自动猜。
5. **ops 能力刻意很小**：只能标量 config、单层 path、整块 add/remove/disable；嵌套结构、列表值、复杂 config 都做不了——需要这些时结论应是"这个定制不适合走第 5 模式"或"用官方 bundle 轨道"。
6. **手改 patch 会被发现但不被原谅**：`verify`（`VERIFY-TEXT`）与 `refresh`（`OPS-LEDGER-MISMATCH`）都会失败；正确做法是把手改变成一条 op。
7. **dump-config 依赖真实 app.asar**：必须用桌面应用二进制 + `ELECTRON_RUN_AS_NODE=1` + `--expose-internals` 调打包 CLI；解包的 asar 副本不可用（`ERR_MODULE_NOT_FOUND`）。`dump.mjs` 默认按 macOS 应用布局解析，可用 `--app` / `DSH_APP` 覆盖。
8. **首启可能进 onboarding 向导**【推断】：手造 profile 第一次被桌面选中，可能先走一遍设置向导（未实测；验收时当作已知可能性，不要当作失败）。
9. **脚本常量会随官方漂移**：保留 id 列表、模板 bundle 名等是脚本里的常量；官方新增内建 preset 时需更新脚本（否则 static-check 可能误报/漏报）。

## 12. 与 spec-v2 §6/§9 的差异（源码为准，需 Lead 裁决是否改 spec）

| # | spec-v2 写法 | 源码实际 | 处理 |
|---|---|---|---|
| 1 | diff ops 含 `set-metadata`（id/name/description/order） | ops 只有 `disable-plugin`/`enable-plugin`/`remove-plugin`/`add-plugin`/`set-plugin-config`；元数据是 emit 参数 | 文档按源码；spec 需删 `set-metadata` |
| 2 | `baseline.json` = `{schemaVersion, modeId, source{presetId,presetRowId,dshRuntimeVersion,declarationSha256,extractedAt}, diff[]}` | 实际 = `{schemaVersion, modeId, displayName, description, order, preset, baselineFile, sha256, baselineSha256, opsFile, extractedAt, source:"dsh --dump-config"}`；无 `dshRuntimeVersion`、无 `diff[]`（diff 在独立 `ops-<id>.json`） | 文档按源码；spec 需重写 §6.7 |
| 3 | mode-base 只有 4 个子命令 extract/emit/verify/replay | 实际 **5 个**：多 `refresh` | 文档按源码 |
| 4 | §9 flag 名：`--mode` / `--name` / `--base` / `--diff` / `--profile` | 实际：`--mode-id` / `--mode-name` / `--baseline` / `--ops` / `--dump` / `--profile-dir`；emit 另有未写进用法行的 `--ops`、`--replace`；emit 的 `--out` 是 no-op | 文档按源码 |
| 5 | 每条 diff 必须带 `reason` | 源码不校验 `reason`（ops 对象原样保存，推荐但非强制） | 文档建议带；是否升级为校验由 Lead 定 |
| 6 | §6.5 "静态检查警告 registry default 覆写" | `static-check.mjs` 无此检查；`dump.mjs --expect-default` 可查 | 文档用 dump 检查；static-check 后续可补 |
| 7 | §6.7 `dshRuntimeVersion` 记录 | 源码未记录运行时版本 | 文档标注未实现；升级前用 dump 对比 + sha 漂移 |
| 8 | §6.6 多模式基线命名 `baseline-<mode>.json` / `baseline-ptc-<mode>.yml` | 一致（`<mode>` = 完整 mode id）；另多 `ops-<id>.json` | 文档按源码 |

## 13. 速查（copy-paste 级）

```
# 0) 判断适用：profile 的 bundles 是否含 @deepseek-ai/dsh-web-app
# 1) 取新 dump（真实 app.asar；DSH_APP 可覆盖默认应用路径）
node scripts/dump.mjs --profile <name> --raw-out <dump.txt> --json
# 2) 抽基线
node scripts/mode-base.mjs extract --dump <dump.txt> --preset ptc --out .profile-builder/baseline-ptc-<id>.yml --json
# 3) Phase A：纯 fork 写入（无 --ops = diff 空；--write 自动备份 patch）
node scripts/mode-base.mjs emit --profile-dir $DSH_HOME/profiles/<name> --baseline .profile-builder/baseline-ptc-<id>.yml \
  --mode-id <id> --mode-name '<显示名>' --description '<描述>' --order 5 --write --json
# 4) 校验
node scripts/mode-base.mjs verify --profile-dir $DSH_HOME/profiles/<name> --mode-id <id> --json
node scripts/dump.mjs --profile <name> --mode <id> --profile-dir $DSH_HOME/profiles/<name> --json
node scripts/static-check.mjs --profile-dir $DSH_HOME/profiles/<name> --json
# 5) Phase B：写 ops 后重 emit（必须显式 --ops，否则 OPS-LEDGER-EXISTS）
# 6) 升级：先空跑 refresh 看冲突，再 --write
node scripts/mode-base.mjs refresh --profile-dir $DSH_HOME/profiles/<name> --mode-id <id> --dump <new-dump.txt> --json
node scripts/mode-base.mjs refresh --profile-dir $DSH_HOME/profiles/<name> --mode-id <id> --dump <new-dump.txt> --write --json
```
