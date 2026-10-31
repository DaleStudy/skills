# 参考 40：DSH Profile 迁移 — 导出、传输、导入

日期 2026-10-31。适用：dsh-profile-builder 的 W3（迁移）工作流。
前提：Phase 0 契约已获用户明确确认（迁移范围与目标机）；已读 20-workflows.md 的 W3 与 30-verification.md 的 L0–L2。本文所有命令只搬运"声明层"，不复制运行时状态。

## 1 迁移包规范

### 1.1 设计原则

- **只带声明层**：能描述 profile 的声明文件 + 模式账本。运行时生成物、机器绑定文件、凭据一律不出包。
- **导入端不依赖源机器**：包拷进目标机 $DSH_HOME/profiles/<name> 后，启动时按官方语义重新生成 cordis.yml。
- **可校验**：manifest.json 记录每个文件的字节数与 sha256，导入端逐个校验。
- **可机械检查**：static-check --migration 强制包根目录只允许白名单条目。

### 1.2 包内内容（export.mjs 的 PORTABLE_FILES / PORTABLE_DIRS）

| 路径 | 是否必需 | 说明 |
| --- | --- | --- |
| package.json | 必需 | profile 包声明：name / private / dependencies / dsh.profile.bundles |
| cordis.patch.yml | 必需 | 顶层 YAML 数组的 overlay patch 条目 |
| compatibility.json | 可选 | profile 兼容性声明 |
| pnpm-lock.yaml | 可选 | 依赖锁定 |
| README.md | 可选 | 源 profile 有才带；export 不生成 |
| pnpm-workspace.yaml | 可选 | 源 profile 自带才带；导入端缺失会补标准内容 |
| .profile-builder/** | 可选 | 模式账本：baseline-<modeId>.json / baseline-ptc-<modeId>.yml / ops-<modeId>.json |
| manifest.json | 生成 | export 每次重新生成；源 profile 里的旧 manifest 永远被排除 |

注意：PORTABLE_FILES 里也列了 manifest.json，但 collectPortable 对其特殊处理——源 profile 中出现 manifest.json 会以 "generated: previous migration manifest" 排除，绝不会把上一个包的 manifest 带进新包。

### 1.3 manifest.json schema

~~~json
{
  "schemaVersion": 1,
  "kind": "dsh-profile-migration-package",
  "exporter": "dsh-profile-builder/export.mjs",
  "exportedAt": "2026-10-31T00:00:00.000Z",
  "profile": {
    "name": "<源 profile 目录名>",
    "packageName": "dsh-profile-<name>",
    "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"],
    "dshRuntimeVersion": "<--runtime-version 或 DSH_RUNTIME_VERSION，可为 null>"
  },
  "modes": [{ "modeId": "...", "order": 5, "pluginsSha": "..." }],
  "files": [{ "path": "package.json", "bytes": 123, "sha256": "..." }],
  "excluded": [{ "path": "cordis.yml", "reason": "generated: rewritten on every start (baseUrl anchor)" }]
}
~~~

| 字段 | 含义 |
| --- | --- |
| schemaVersion | 固定 1；导入端不接受其他值（MANIFEST-INVALID） |
| kind | 固定 "dsh-profile-migration-package"（说明性，不参与校验） |
| exporter | 生成者，固定 "dsh-profile-builder/export.mjs" |
| exportedAt | 导出时间 ISO 字符串 |
| profile.name | 源 profile 目录名 |
| profile.packageName | 源 package.json 的 name |
| profile.bundles | 源 package.json dsh.profile.bundles |
| profile.dshRuntimeVersion | 导出时记录的 DSH 运行时版本，用于目标机核对；null 表示未记录 |
| modes | 源 profile 的模式摘要（modeId / order / pluginsSha） |
| files | 包内每个文件的 path / bytes / sha256 |
| excluded | 被排除的文件及原因（给用户看，导入端不消费） |

### 1.4 排除清单（与 exclusionReason 一一对应）

| 路径模式 | reason | 为什么排除 |
| --- | --- | --- |
| node_modules/ | generated: installed dependencies | 目标机 pnpm install 重建 |
| cordis.yml | generated: rewritten on every start (baseUrl anchor) | 启动时按本机路径重写 |
| desktop-next.* | host-binding: desktop launcher overlay | 桌面启动器绑定，机器相关 |
| .plugin-manager/ | generated: plugin manager state | 本机插件管理状态 |
| .dsh-market/ | generated: market cache/state | 本机市场缓存 |
| *.bak-* | generated: backup file | 备份文件 |
| manifest.json | generated: previous migration manifest | 旧迁移清单，避免叠包 |
| 其他任意条目 | not part of the portable declaration layer | 白名单外，一律不带 |

### 1.5 模式账本（.profile-builder/）

- baseline-<modeId>.json：schemaVersion 1、modeId、baselineFile、baselineSha256（官方基线 plugins 的 sha256）、sha256（叠加 ops 后的期望 sha256）、来源 DSH 版本。
- baseline-ptc-<modeId>.yml：官方 PTC 基线的 raw 输出（原文）。
- ops-<modeId>.json：{"modeId": "...", "ops": [...]} 操作串；没有 ops 的纯 Phase A 模式可以没有此文件。
- static-check 的纯净扫描会扫 .profile-builder 下的 json/yml/yaml；账本里出现绝对路径/凭据同样报 PURITY-*。
- 账本必须与 patch 一致：MODE-SYNC / MODE-BASELINE-SHA-MATCH / MODE-BASELINE-SOURCE-SHA 失败说明账本 stale，不要手改，回 W6 的 refresh 流程。

## 2 导出（源机器 · W3 节点 1）

### 2.1 前置

1. 源 profile 通过 L0：node scripts/static-check.mjs --profile-dir <dir>，exit 0。
2. 模式账本全绿（如有模式）：MODE-* 无 error。
3. 用户已确认这是要迁移的声明层版本，且知道迁移不带 session/凭据。

### 2.2 命令

~~~bash
cd ~/.dsh/skills/dsh-profile-builder
node scripts/export.mjs \
  --profile-dir "$DSH_HOME/profiles/<name>" \
  --out /tmp/<name>-migration-package \
  --runtime-version "<DSH 版本>"
~~~

| flag | 必需 | 说明 |
| --- | --- | --- |
| --profile-dir | 是 | 源 profile 目录 |
| --out | 是 | 输出目录；必须在 profile 目录之外 |
| --force | 否 | 目标目录非空时先 rm -rf 再重建 |
| --json | 否 | 输出 JSON 结果而非文本 |
| --runtime-version | 建议 | 写入 manifest.profile.dshRuntimeVersion，供目标机核对 |

- 目标目录在源目录内 → IO-OUT-INSIDE-SOURCE。
- 目标目录已存在且非空、又没给 --force → IO-OUT-EXISTS。--force 会清空该目录，执行前必须向用户明示。
- 不给 --runtime-version 时写 null，目标机无法核对版本。

### 2.3 执行顺序（失败即停）

1. 对源目录跑 static-check；错误以 SRC-<id> 返回，警告同样加 SRC- 前缀收集（不阻断）。
2. 路径检查：目标在源内 → IO-OUT-INSIDE-SOURCE；目标非空且无 --force → IO-OUT-EXISTS。
3. 读 package.json；失败 PKG-READ。
4. 收集白名单文件；缺 package.json 或 cordis.patch.yml → PACKAGE-INCOMPLETE。
5. 复制文件，按实际内容写 manifest.json（files 的 bytes 与 sha256）。
6. 对产物目录跑 static-check --migration；错误以 PKG-<id> 返回（例如 PKG-MIGRATION-CLEAN 表示有白名单外文件）。
7. 全部通过才 ok:true。

### 2.4 输出契约

- 文本模式：export: OK / outDir / files / modes（无模式显示 (none)）/ excluded 计数 / warn 行。
- --json：结果对象字段 ok、errors、warnings、outDir、manifestPath、files、excluded、modes、manifest（失败时可能只有 ok/errors/warnings，写 manifest 之后失败才带 manifest）。
- 退出码：0 成功；1 失败；2 参数缺失（--profile-dir 与 --out 都必需）。

### 2.5 导出后自检

~~~bash
node scripts/static-check.mjs --profile-dir /tmp/<name>-migration-package --migration
~~~

期望 exit 0，且输出 mode 行数与源 profile 一致。此步与 export 内部第 6 步一致，可省略，但建议留证据。

## 3 传输（W3 节点 2）

### 3.1 首选 git 通道

~~~bash
cd /tmp/<name>-migration-package
git init
git add -A
git commit -m "profile migration package: <name>"
git tag <name>-<YYYYMMDD>
git remote add origin <repo-url>
git push -u origin HEAD --tags
~~~

目标机：

~~~bash
git clone <repo-url> ~/migration-packages/<name>
cd ~/migration-packages/<name>
git checkout <name>-<YYYYMMDD>
~~~

为什么首选 git：包很小（纯文本）、有历史与 tag、传输出错可发现；导入端仍按 manifest 的 sha256 校验（双保险）。私有仓库要先确认目标机有访问权限。不要把包推到公开仓库。

### 3.2 直传通道（没有 git 时）

~~~bash
tar -C /tmp -czf /tmp/<name>-migration-package.tgz <name>-migration-package
scp /tmp/<name>-migration-package.tgz <target>:~/
ssh <target> 'cd ~ && tar -xzf <name>-migration-package.tgz'
~~~

- 传输后可用 sha256sum 逐个对比，或直接依赖导入端 manifest 校验。
- 不要在网络共享/网盘里直接编辑包内文件；不要在本机把包解到 profile 目录内。

### 3.3 包外的东西

- 凭据、token、workspace 绝对路径不进包（导出时 PURITY-NO-SECRET / PURITY-NO-MACHINE-PATH 硬失败）。
- 迁移包不是 profile：不要把它当 $DSH_HOME/profiles/<name> 直接启动。

## 4 导入（目标机器 · W3 节点 3）

### 4.1 前置检查表

| 项 | 检查 | 不满足时 |
| --- | --- | --- |
| 平台 + 架构 | uname -sm（macOS 再看 sw_vers）与源机一致 | 拒绝迁移（native 依赖/路径假设） |
| DSH 版本 | manifest.profile.dshRuntimeVersion 与目标机 DSH 版本一致 | 版本不同先升级，或用户明确接受风险 |
| DSH 启动过 | test -d "$DSH_HOME/profiles" | 先启动一次 DSH（桌面 app），否则 IO-DSH-HOME |
| node | node -v（脚本为 ESM，需 Node 18+；本机实测 v24.13.1） | 安装 node |
| pnpm | pnpm -v（仅 --install 需要） | 先不加 --install，导入后手动 pnpm install |
| 目标名不冲突 | test -d "$DSH_HOME/profiles/<name>" | 换 --profile-name 或用户确认后移除旧 profile |

### 4.2 命令

~~~bash
cd ~/.dsh/skills/dsh-profile-builder

# 1) dry-run，零写入
node scripts/import.mjs --from ~/migration-packages/<name> --profile-name <name> --dry-run

# 2) 真正导入
node scripts/import.mjs --from ~/migration-packages/<name> --profile-name <name>

# 3) 需要重建依赖时
node scripts/import.mjs --from ~/migration-packages/<name> --profile-name <name> --install
~~~

| flag | 必需 | 说明 |
| --- | --- | --- |
| --from | 是 | 迁移包目录 |
| --profile-name | 是 | 目标 profile 名；必须匹配 ^[a-z0-9][a-z0-9-]{0,63}$ |
| --dsh-home | 否 | 默认 $DSH_HOME 或 ~/.dsh |
| --dry-run | 否 | 只校验并返回计划，不写盘 |
| --install | 否 | 导入后执行 pnpm install |
| --json | 否 | 输出 JSON 结果 |

- 名字不合法 → PROFILE-NAME。
- --dry-run 不跑目标 static-check，也不回填 modes；控制台显示 modes: (none) 是预期，不是错误。

### 4.3 校验顺序与错误 id

1. 名字：^[a-z0-9][a-z0-9-]{0,63}$，否则 PROFILE-NAME。
2. 包目录存在，否则 IO-FROM。
3. $DSH_HOME/profiles 存在，否则 IO-DSH-HOME（提示先启动一次 DSH）。
4. 目标 profile 不存在，否则 IO-TARGET-EXISTS。
5. manifest：缺失 → MANIFEST-MISSING（warn，回退目录扫描）；不可解析或 schemaVersion≠1 或 files 空 → MANIFEST-INVALID。
6. 包目录跑 static-check --migration：错误以 PKG-<id> 返回（迁移白名单/纯净扫描）。
7. manifest 文件校验：绝对路径或 .. → MANIFEST-PATH；文件不在 → MANIFEST-FILE-MISSING；sha256 不符 → MANIFEST-SHA；包内多出未列文件 → MANIFEST-UNLISTED（warn）。
8. 必需文件：缺 package.json 或 cordis.patch.yml → PACKAGE-INCOMPLETE。
9. 读源 package.json：失败 PKG-READ；无法改写 name → PKG-NAME-REWRITE。
10. 复制后对目标跑 static-check：错误以 TARGET-<id> 返回（此时目标目录已创建）。

其他错误：INSTALL-FAILED（pnpm install 非 0）、UNEXPECTED（未捕获异常）。

### 4.4 导入行为细节

1. 复制白名单文件（按 manifest.files；无 manifest 时按目录扫描）。
2. package.json 的 name 改写为 dsh-profile-<--profile-name 的值>，因此导入名可以与源 profile 名不同。
3. pnpm-workspace.yaml 缺失时写入标准内容：

~~~yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
~~~

4. 回填目标 manifest：importedAt / importedAs / packageName，并按目标实际文件重算 bytes 与 sha256（因为 package.json 被改写）。
5. --install：在目标目录执行 pnpm install，超时 300000 ms（5 分钟）；失败返回 INSTALL-FAILED 并提示手动命令。
6. 不启动应用、不切换 active profile、不修改 desktop profile。

### 4.5 输出契约与退出码

- 退出码：0 成功；1 失败；2 参数缺失（--from 与 --profile-name 必需）。
- 文本输出：import: OK / target / packageName / files / modes（dry-run 为 (none)）/ install 或 next 手动命令 / warn 行。
- --json：ok、from、dshHome、target、profileName、packageName、files、workspaceFile、dryRun、errors、warnings；写入成功后增加 created 与 modes；--install 增加 install{ran, exitCode, signal, tail}。

## 5 目标机要求（硬约束）

| 要求 | 怎么查 | 不满足的后果 |
| --- | --- | --- |
| macOS 同架构（arm64 对 arm64，或 x64 对 x64） | uname -m | native 依赖不可用，profile 无法启动 |
| DSH runtime 版本一致 | manifest.profile.dshRuntimeVersion vs 目标机 DSH 版本 | bundle 兼容失败：skipping profile bundle / disabling profile plugin row |
| $DSH_HOME/profiles 已存在 | test -d "$DSH_HOME/profiles" | IO-DSH-HOME |
| Node 可用 | node -v | 脚本无法运行 |
| pnpm 可用（仅 --install） | pnpm -v | 导入成功但依赖未装，手动补 |
| 目标 profile 不存在 | test -d 目标 | IO-TARGET-EXISTS |

不迁移、不复制：node_modules、cordis.yml、desktop-next.*、.plugin-manager/、.dsh-market/、recovery/、sessions/、storages/、本机 skills。

## 6 导入后验收（W3 节点 4）

### 6.1 L0：目标 profile static-check

~~~bash
node scripts/static-check.mjs --profile-dir "$DSH_HOME/profiles/<name>"
~~~

期望 exit 0；mode 数（输出里的 mode 行数）与 manifest.modes 数一致。刚导入时若还没 pnpm install，可能出现依赖缺失相关告警——按输出处理，不要跳过。

### 6.2 L1：目标 profile dump

~~~bash
node scripts/dump.mjs --profile <name> --dsh-home "$DSH_HOME" --raw-out /tmp/<name>-post-import.yml
~~~

期望 exit 0、stderr 为空、requiredRows 5、无 skip/incompatible 标记。有模式时再跑：

~~~bash
node scripts/dump.mjs --profile <name> --mode <modeId> --profile-dir "$DSH_HOME/profiles/<name>"
~~~

Phase A 模式期望 MODE-SHA 与官方基线一致；Phase B 有 ops 定制时按 30-verification.md §3.3 的 replay 流程核对。dump 需要目标机装有 DSH NEXT；纯脚本机器只能做到 L0。

### 6.3 L2（可选）：隔离 DSH_HOME 冒烟

- 把 profile 复制到临时 DSH_HOME，按 30-verification.md §4.2 的 recipe 启动 web；成功判据：stdout 一行 dsh web: http://127.0.0.1:<port>/?token=...，stderr 为空。
- 或让用户在桌面 app 里手动切换到该 profile 确认（不自动切换）。

### 6.4 验收清单

| # | 检查项 | 命令/证据 | 通过标准 |
| --- | --- | --- | --- |
| 1 | 包完整性 | import 输出 | exit 0，manifest 校验无 error |
| 2 | 名字正确 | 读目标 package.json | name == dsh-profile-<name> |
| 3 | 包白名单干净 | static-check --migration（包目录） | exit 0 |
| 4 | 目标 L0 | static-check --profile-dir | exit 0 |
| 5 | 目标 L1 | dump | exit 0 / requiredRows 5 / 无 skip |
| 6 | 模式保留 | static-check 输出 mode 行 | 数量 == manifest.modes 数 |
| 7 | 依赖状态 | ls 目标/node_modules 或用户手动 install | 存在，或已告知用户手动执行 |
| 8 | 回滚点 | 导入前目标不存在 | 回滚 = 用户确认后删除新建 profile |

## 7 连续性边界（必须向用户说清）

### 7.1 迁移的是声明层

bundles、cordis.patch.yml 的 patch 行、模式声明与账本、依赖锁定文件。它们决定"启动后装配出什么"，不携带运行时状态。

### 7.2 不迁移（逐项）

- 会话历史与消息（$DSH_HOME 下的 sessions 等）
- 凭据、存储、缓存（$DSH_HOME/storages、登录态、浏览器会话）
- 本机 skills 与 AGENTS.md（属于 ~/.agents/skills、~/.dsh，走各自分发渠道）
- workspace 列表 / 最近打开 / 窗口状态（机器绑定）
- .plugin-manager/ 与 .dsh-market/ 的本机状态
- onboarding 完成状态

### 7.3 首次切换

- 用户首次在桌面 app 切到新 profile 可能看到 onboarding / 设置向导；本技能不代操作，该 UI 流程未验证。
- 迁移不会把新 profile 设为 active，也不会修改 desktop profile。

### 7.4 版本连续性

- 源机与目标机 DSH 版本不一致时，"包可导入" ≠ "运行行为一致"。版本差异导致的 bundle 兼容问题按 W5 doctor 排查，不要改 cordis.yml 掩盖。

## 8 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| export: FAIL ERROR SRC-* | 源 profile L0 不通过 | 先修源 profile，不绕过 |
| export: FAIL ERROR IO-OUT-EXISTS | 目标目录非空 | 换目录，或 -force（会清空目录，先向用户明示） |
| export: FAIL ERROR IO-OUT-INSIDE-SOURCE | --out 在 profile 内 | 换到 /tmp |
| export: FAIL ERROR PKG-MIGRATION-CLEAN | 产物含白名单外文件 | 查源 profile 是否混入暂存文件后重新导出 |
| import: FAIL ERROR MANIFEST-MISSING（warn） | 包是手工拼的或旧导出 | 建议重新 export；继续前人工确认必需文件 |
| import: FAIL ERROR MANIFEST-SHA | 包被编辑或传输损坏 | 重新传输 / 重新导出 |
| import: FAIL ERROR IO-DSH-HOME | 目标机没启动过 DSH | 启动一次桌面 app 再导 |
| import: FAIL ERROR IO-TARGET-EXISTS | 目标已存在 | 换 --profile-name，或用户确认后移除旧 profile |
| import: FAIL ERROR TARGET-* | 复制后目标 static-check 失败 | 按 TARGET-<id> 修目标文件；或用户确认后移除目标重导 |
| import: FAIL ERROR INSTALL-FAILED | pnpm 安装失败 | cd 目标目录手动 pnpm install，查网络/代理 |
| dump 出现 dsh: skipping / disabling profile bundle | 目标机依赖不完整或版本不兼容 | 补 bundles 或升级；不要改 cordis.yml |
| dump --mode 报 MODE-SHA（有 ops 定制时） | 默认与官方基线比较，不看 ops | 用 replay 生成期望文件再 --baseline（30-verification §3.3） |

## 9 实测证据（2026-10-31）

- 源：本机 test-w1 profile（2 个自定义模式），export 成功，包内文件与 excluded 清单符合第 1 节。
- dry-run 可能出现 PKG-PKG-NAME warn：manifest 记录的 packageName 与按 --profile-name 预期的新名字不同，属预期告警。
- import 成功；目标 static-check exit 0，mode 数一致；mode-base verify 通过，pluginsSha 以 68bf95db9e5f... 开头，opsApplied 1。
- 目标 dump exit 0，lineCount 1577，requiredRows 5。
- 结论：在本机 DSH NEXT（2026-10-31 版本）上，导出 → 导入 → L0 → L1 链路实测通过。跨平台、跨版本、UI onboarding 未验证。

## 10 完成清单（W3 收尾）

- [ ] 契约已确认：迁移范围、目标机、新名字、是否 --install
- [ ] 源 L0 通过；模式账本无 error
- [ ] export exit 0，包在 profile 目录外，manifest.profile.dshRuntimeVersion 已记录
- [ ] 传输方式与校验已记录（git url+tag，或 tar + sha256）
- [ ] 目标机前置检查表全过
- [ ] dry-run exit 0
- [ ] import exit 0（或用户明确确认了替代路径）
- [ ] 目标 L0 + L1 有证据；未做的层标"未验证"
- [ ] 报告含：源/目标机器与版本、包路径与传输方式、各层验收证据、未验证项、回滚方式
- [ ] 没有自动切换 active、没有改 desktop、没有删用户 profile
