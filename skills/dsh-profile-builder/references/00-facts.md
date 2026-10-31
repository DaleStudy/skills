# 00 · DSH profile 官方事实（取证版）

> 取证日期：2026-10-31。取证对象：本机安装的 DSH NEXT 桌面应用 2.0.21-next（Electron 44.7.0 / node 24.21.0，随包 `@deepseek-ai/dsh` 0.2.1-rc.4）。本文只陈述可指向证据的事实；推断一律标【推断】。
>
> 约定：`$DSH_HOME` = DSH home，默认 `~/.dsh`；`<DSH_APP>` = 桌面应用安装包路径；`<profile>` = profile 名。证据标签：
> 【文档】= 发行包内 README / 官方随包技能；【源码】= `app.asar` 内实现；【实测】= 本机 scratch 环境跑通；【推断】= 未实测。
> 所有路径相对 `$DSH_HOME`、`app.asar/` 或 npm 包根，不含本机绝对路径。

## 1. 定义（一句话）

【文档】一个 **profile** 是目录 `$DSH_HOME/profiles/<name>`，包含：

1. `package.json` —— profile 清单：`dsh.profile.bundles`（有序的 bundle 包列表）+ 普通 npm `dependencies`（存放树外 bundle 依赖）；
2. `cordis.patch.yml` —— profile 自己的用户 patch 层，排序在所有 bundle 层之后生效。

启动器组装 Cordis 插件树的顺序是：**按 `dsh.profile.bundles` 顺序拼接每个 bundle 的 patch 列表（从空 entry 列表开始）→ profile 的 `cordis.patch.yml` → 家目录级 `$DSH_HOME/cordis.patch.yml` → 启动器 overlay（`--patch` 文件 / 桌面 runtime patch JSON）**。

- 证据：`app.asar/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js` 模块文档（约 483–505 行）；`@deepseek-ai/dsh-app-boot/README.md`；`@deepseek-ai/dsh/README.md`（CLI）。
- 产品语义：一个 dsh 安装 = 不同 app surface（web / headless / acp / sdk / sdk-minimal）各自的插件栈；在桌面应用里 = "启动哪套插件栈"。桌面端**同一时刻只有一个 active profile**。
- profile ≠ agent preset：profile 拥有 **host 平面**（插件栈、host 服务、sandbox/审批栈、持久化、模型路由行）；agent preset 只拥有 **agent 平面**（persona、本模式工具集），见 §8。

## 2. 目录结构（必需 / 可选 / 生成物）

| 文件 | 必需性 | 说明 | 证据 |
|---|---|---|---|
| `package.json` | **必需** | `name` 常为 `dsh-profile-<目录名>`；`private: true`；`dependencies`；`dsh.profile.bundles` 为**有序** string[]。缺 package.json 的自定义 profile 不会自动创建，直接报错（见 §6）。 | 【文档】app-boot README；【源码】`index.js:611` initProfile；【实测】 |
| `cordis.patch.yml` | **必需** | profile 用户 patch 层；内容必须是**顶层 YAML 数组**。`[]` 是正确空 patch；**纯注释/空文件是致命错误**：`dsh: overlay <path>/cordis.patch.yml must be a top-level YAML array of loader patch entries`。 | 【源码】`index.js:4002` parsePatchList；【实测】comments-only → exit 1 |
| `pnpm-workspace.yaml` | 可选 | initProfile 写入三行：`packages:`（其下一条 `- .`）、`nodeLinker: hoisted`、`autoInstallPeers: false`。 | 【源码】`index.js:611` initProfile |
| `pnpm-lock.yaml` | 可选 | pnpm install 产物；迁移时按需携带。 | 【文档】config-manager README |
| `compatibility.json` | 可选 | 精确版本豁免表：`"<package>@<exact version>" -> ["<exact dsh version>", ...]`；缺失 = 无豁免；格式坏不阻塞启动（合法记录生效、坏记录上报，文件转只读，需手工修复后才能增删豁免）。 | 【文档】plugin-manager README；【源码】compatibility 实现 |
| `node_modules/` | 可选 | 树外 bundle 依赖；bundle 解析在安装目录之后回落到这里。 | 【源码】`index.js:995` resolveBundleDir |
| `cordis.yml` | **生成物** | profile 根锚点；启动时**总是**被重写为一段注释 + `[]`（原因：Loader 回写会把组合后的 row 烘焙进去，下次启动会重复 bundle insert；该文件只用于把 baseUrl 锚在 profile 目录）。不要手写内容、不要迁移它。 | 【源码】`profile-boot-C14i-8IN.js:216` prepareProfile |
| `desktop-next.runtime.patch.json` | 生成物（仅桌面） | Host 写入：`[{id:"desktop-next-webserver",config:{host:"127.0.0.1",port}},{id:"connection",config:{trustedHosts}}]`。 | 【源码】`recovery-UNav6dON.js` |
| `desktop-next.cordis.patch.json` | 生成物（仅桌面） | 写入 agents-anywhere-bridge-next overlay（dshHome、connectorSourceDir、uvPath）。 | 【源码】`recovery-UNav6dON.js:616` |
| `.plugin-manager/`、`.dsh-market/` | 生成物 | 运行时诊断 / 市场状态，不属于可迁移内容。 | 【源码】plugin-manager / market |

profile 管理文件之外的东西**不属于** profile：sessions、storages、credentials、`AGENTS.md`、skills、agent presets、桌面偏好——见 §8、§9。

## 3. 官方模板与 bundle 解析

### 3.1 随发行版模板（PROFILE_TEMPLATES）

【源码】`app.asar/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js:551`：

| 模板 id | bundles |
|---|---|
| `web` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`（桌面可切换的最低要求） |
| `headless` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless` |
| `acp` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-acp-app` |
| `sdk` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-sdk-app` |
| `sdk-minimal` | `@deepseek-ai/dsh-sdk-minimal` |

- `DEFAULT_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base"]`；`RETIRED_BUNDLES = {"@deepseek-ai/dsh-experimental-schedule-bundle"}`。
- 可选 bundle（`OPTIONAL_BUNDLES`, 12 个）：`dsh-experimental-session-search` / `-ralph-bundle` / `-terminal-bundle` / `-badge-skill-bundle` / `-session-titles-bundle` / `-agent-team-profile` / `-voice-input-bundle` / `-cot-translation-bundle` / `-auto-review` / `-inspector-profile` / `-plugin-market-bundle` / `-tool-worktree`。
- 安装目录内共有 21 个包声明 `dsh.bundle`（6 个 app surface 包、13 个 experimental、`@agents-anywhere/dsh-bridge-next`、`dsh-community-market`、`dshmarket`），清单见侦察笔记附录。

### 3.2 bundle 是什么

【文档】bundle = 一个 npm 包，其 `package.json` 声明 `dsh.bundle = { patch: "<file>" | ["<file>", ...] }`；每个路径相对包根；列表 = 一个 bundle 层内按序应用多个 patch 文件。

- `@deepseek-ai/dsh-web-app` 声明 5 个有序 patch 文件：`["./cordis.patch.yml","./presets/standard.patch.yml","./presets/ptc.patch.yml","./presets/minimal.patch.yml","./presets/cordis.patch.yml"]`（这就是 4 个内建 agent preset 的来源，见 §7/60-agent-modes）。
- 其余随包 bundle 都只声明 `{ "patch": "./cordis.patch.yml" }`。

### 3.3 解析顺序

【源码】`resolveBundleDir`（`index.js:995`）：**先从 dsh 安装本身解析**（启动器自己的包；CLI 用 `INSTALL_ANCHOR = new URL("../package.json", import.meta.url)`，桌面 Host 用 `NEXT_PACKAGE`），**再从 `<profile>/package.json` 的 dependencies**（pnpm 安装的 node_modules，含 profile 的 node_modules 与祖先回退；运行时还会在 `$DSH_HOME/profiles/node_modules` 安装一份）。

- 解析失败文案：`<bin>: cannot resolve profile bundle "<pkg>" from the dsh installation or <profileDir>; run 'dsh plugin --profile <name> install' if its dependency is not installed`。
- 读不了 / 格式坏 / 不兼容的 bundle 会被 **SKIP**：记录进 `profile.skippedBundles`，每次启动打印一次 `dsh: skipping profile bundle "<pkg>": <reason>`；**manifest 错误和用户 patch 错误仍然 THROW**（致命）。

### 3.4 兼容性判定

【文档】+【源码】：先看插件声明的 `engines.dsh`（若声明则它单独决定）；否则逐个检查对 `@deepseek-ai/dsh` / `dsh-*` 的 `peerDependencies` 范围是否匹配唯一 runtime 版本；prerelease 参与比较；**没有声明 = 无约束**；空/非法范围 = 不兼容；拒绝时会点名未满足要求。

- 不兼容 bundle 且无精确版本豁免 → 组合时 SKIP（进 skippedBundles）。
- 不兼容插件行 → 被 **detached 为 disabled row**（`disabled: true`），不阻断启动。
- 实测日志（`~/.dsh/logs/desktop-next.log`）：`[info] dsh: disabling profile plugin row "subagent-model-selection-settings": Plugin @deepseek-ai/dsh-tool-subagent@0.2.1-rc.2 is incompatible with dsh 0.2.1-rc.4: requirements {...}`。
- 精确版本豁免由 `dsh plugin allow-version` 写入 `compatibility.json`（需要 `--accept-risk`）；每条豁免只对**精确包版本 + 精确 DSH 版本**生效。

## 4. 层序（谁覆盖谁）

### 4.1 标准链（CLI / npm dsh）

【源码】`readProfilePatches`（`index.js:1127`）顺序：

1. 每个 bundle 的 patch 列表（按 `dsh.profile.bundles` 顺序）；
2. profile 的 `cordis.patch.yml`；
3. 家目录级 `$DSH_HOME/cordis.patch.yml`（本机不存在）；
4. 启动器 overlay：CLI `--patch <file>`（可重复）/ 桌面 runtime 层；
5. telemetry patch（设置 `DSH_TELEMETRY_DISABLED` 且存在 session-telemetry-otel 时追加 `{id, disabled:true}`）。

结论：**后面的层覆盖前面的层**——home patch 压过 profile patch；启动器 overlay 压过两者。

### 4.2 桌面 Host 链（NEXT，多两层产品层）

【源码】`readNextProfilePatches`（`app.asar/lib/recovery-UNav6dON.js`，约 600 行）：

1. bundle 层；
2. **Next 产品层** `app.asar/cordis.patch.yml`（禁用 product telemetry / analytics，插入 desktop-next-capabilities、computer-use 等）；
3. profile `cordis.patch.yml`；
4. `app.asar/host.cordis.patch.yml`（禁用 webserver，插入 desktop-next-webserver）；
5. `<profile>/desktop-next.cordis.patch.json`；
6. `<profile>/desktop-next.runtime.patch.json`；
7. telemetry。

桌面加载时 `loadNextProfile` 校验 "Profile must belong to Next home"（目录必须恰为 `join(home,"profiles",name)`），调用 `manager.ensure(name)`，把 `<home>/profiles/node_modules/dsh-desktop-next` symlink 到安装包目录（在 asar 内则跳过），再把 Next bundle 层 `[{packageName:"dsh-desktop-next", patchPaths:[app.asar/cordis.patch.yml], ...}]` 推入。

### 4.3 patch 条目语义

【源码】`parsePatchList`（`index.js:4002`）：`yaml.load` + `userPatchesSchema`；顶层必须是数组，否则报 §2 的致命错误；每条必须是 mapping；`insert[].name` 若是绝对路径或 `./*` / `../*` 路径会改写成 `file://` URL；**指名未知 id 只打 stderr warning，不致命**；`disabled`、`insert`、`!!js` 表达式均可用。

## 5. 身份 / 发现 / 切换（桌面端）

### 5.1 active profile 存哪

- 【源码】`$DSH_HOME/desktop-next.json`，内容 `{"version":1,"active":"<name>"}`，由 `NextProfiles.select` 在 `selectable(name)` 校验后原子写入。**文件不存在 ⇒ 默认 `"desktop"`**（`app.asar/lib/desktop-contract-Djnia2On.js` 的 `DEFAULT_PROFILE`）。本机实测：该文件不存在，因此 active = `desktop`。
- 【源码】启动：`runtime.initialize` 读 active；失败报 "profile-selection"。`start()` 阶段 "profile-composition"：safeMode → 隔离临时 home + `NextProfiles(safeHome).ensure("desktop")`，否则 `profiles.ensure(selected)`；然后 "host-boot"。

### 5.2 名称与目录规则

【源码】`NextProfiles`（`recovery-UNav6dON.js`）：

- `profileName` 正则 `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/`；保留名（系统保留，如 `node_modules`、`con`、`prn`、`aux`、`nul`、`com[1-9]`、`lpt[1-9]`）不可用；
- 目录必须恰为 `join($DSH_HOME, "profiles", name)`（real dir，不接受 symlink）；
- `selectable(name)`：`package.json` 的 `dsh.profile.bundles` 必须是 string[]，且**包含全部 `PROFILE_TEMPLATES.web.bundles`**（即 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`），且 `features(name)` 可解析。不满足的 profile 仍列出但禁用（菜单后缀 `（不可用于桌面端）` / `(Unavailable for Desktop)`，进 `state.unavailableProfiles`）；强切会抛 `Profile is unavailable for Desktop Next`。

### 5.3 切换流程

【源码】`main.js`（约 5795–5860）：

1. Profile 菜单 radio 行 / Settings → Profiles 页（Choice 行，selected = active，`!selectable` 时 disabled，旁边 delete + confirm，另有 create 表单）；
2. 点选 → 确认框 `Switch to Profile "<name>" and restart the application?` → `profiles.select(next)` → `relaunchArguments(process.argv.slice(1), false, false)` → `app.quit()`；
3. 重启后按新 active 组合并 boot。

CLI 端没有"持久切换"：每次调用用 `--profile <name>`；桌面终端 shim 会注入 `DSH_DESKTOP_DEFAULT_PROFILE=<profileName>`（`desktop-cli.js` 的 `withDefaultDesktopProfile`，argv 无 `--profile` 时补上），并导出 `DSH_HOME`、把 `<stateDir>/bin` 放到 PATH 首位、STATE 目录按 `sha256(profileName)` 隔离（本机当前没有生成 shim）。**未发现 `DSH_PROFILE` 环境变量**（官方技能文档提到 profile 内 shell 会带 `DSH_PROFILE` / `DSH_PROFILE_DIR`，与源码未完全对上，记为未决）。

### 5.4 `desktop` 的特殊性

- 默认 profile（`DEFAULT_PROFILE`）；boot 时总是 `ensure` 存在；
- 只有它应用桌面 Next 产品层（§4.2）；CLI shim 默认目标；
- 不可删除：`name === active || name === "desktop"` → `Cannot remove the active or default Profile.` / `不能移除当前或默认 Profile。`；
- 普通 npm CLI 拒绝管理：`error: profile "desktop" is managed exclusively by the Electron application`（`bin.js:36` rejectElectronProfile；打包桌面 CLI 传 `manageDesktopProfile:true` 放行）。

### 5.5 多 profile 共存

- 磁盘上可任意多个；桌面 shell 只 boot 一个 active。
- 独立实例：`dsh --profile <name>`（web server 有自己的端口，默认 0 = 自动）或 config-manager 的 "launch this profile (independent instance)"。
- 新建 / 手造 profile 的 `onboardingRequired`：package.json 的 `dsh.desktopNextOnboarding.version !== 1` 或 outcome 不是 `completed`/`skipped` 时为 true。boot 的 onboarding = argv 含 `--next-onboarding` **或** `profiles.onboardingRequired(selected)`。【推断】切换新 profile 的重启不带 `--next-onboarding`，因此首次切到手造 profile 很可能进 GUI 设置向导（代码支持两半，未实测——本机从未启动 GUI 验证）。

## 6. 产品自带的创建路径

### 6.1 桌面 UI 新建（唯一原生创建入口）

【源码】`main.js` / `client.js`：

- 菜单 "Profile：" → "新建 Profile…" / "New Profile…" → controls 页 `create-profile`；"管理 Profile…" / "Manage Profiles…" → 页 `profiles`。
- create-profile 表单：一个文本输入 `profileName`（maxLength 128）+ create 按钮；调用 `runtime.profiles.create(profileName)`（`main.js:5690`）。**只创建、不选中、不重启**；创建后出现在 Profile 菜单里。
- `NextProfiles.create(name)`（`recovery-UNav6dON.js:396`）：`mkdir $DSH_HOME/profiles/<name> mode 0o700` → `initProfile(dir, WEB_BUNDLES)`（web 模板 = base + web-app）→ `setFeatures(DEFAULT_FEATURES {remoteControl:false, market:false})` → `migrateSchedule(name)`。
- `ensure(name)`（:376）：无 package.json → 用 web 模板 init；已有 manifest 含 `dsh-desktop-next`（legacy）→ 备份 + migrateFeatures + 移除该 bundle；新建则 setFeatures + migrateSchedule。
- 无 "duplicate / rename / export" UI；只有 open profile folder / open-profile-patch / open-profile-manifest 三个 IPC（`main.js:5933-5937`）。

### 6.2 CLI 入口

【文档】+【源码】（打包 CLI 经 `app.asar/lib/desktop-cli.js` 暴露；npm CLI 为 `@deepseek-ai/dsh`）：

- `dsh --profile <name> [--from-default-profile <template>] [--patch <file>] ...`
  - `--from-default-profile`：用官方模板**替换**一个自定义 profile（也是 reset 路径）；实现为暂存 `<profiles>/.<name>.staging-<rand>/new/<name>` → 旧目录改名让位 → 新目录入位 → 失败回滚。
  - 已发布的模板名（web/headless/acp/sdk/sdk-minimal）首次使用自动 init；自定义名字不带 `--from-default-profile` 时：`dsh: profile "<name>" does not exist; create it with dsh plugin --profile <name> add <package>`。
- `dsh plugin --profile <name> <pnpm args...>`：首次使用自动 mkdir + initProfile（模板存在用模板，否则 `DEFAULT_PROFILE_BUNDLES`），然后在 profile 目录里转交 pnpm。对 `desktop` 要求已有 package.json：`Open DeepSeek Harness Desktop once to initialize its profile, then fully quit it before running dsh plugin --profile desktop.`
- **不存在 `dsh profile ...` 子命令**；只有 `--profile` / `--from-default-profile` / `--patch` 标志 + `plugin` 子命令。
- 本机没有 `dsh` 在 PATH；唯一验证过的调用方式是：`DSH_HOME=<隔离home> ELECTRON_RUN_AS_NODE=1 <DSH_APP>/Contents/MacOS/DSH NEXT --expose-internals <DSH_APP>/Contents/Resources/app.asar/lib/desktop-cli.js --profile <name> --dump-config`（本机实测 exit 0、组合输出 1231 行、stderr 空；该命令会写 `<profile>/cordis.yml` 锚点文件）。**不要调用解包后的 asar 副本**（会 `ERR_MODULE_NOT_FOUND`，只有部分 node_modules 被解包）。

### 6.3 第三方 config-manager（已安装插件）

【文档】`dsh-config-manager` README：Environment → Profiles 提供 list / create from a shipped template / rename / hard delete / launch this profile (independent instance) / stop the instance；HTTP API `/profiles/{detail,create,copy,delete,rename,launch,stop}`；

- create 写"标准三件套"：`package.json`（`name: "dsh-profile-<name>"`、`private: true`、`dependencies: {}`、`dsh.profile.bundles: [模板bundles]`、可选 `dsh.profile.patchReload`）+ `cordis.patch.yml`（模板：两行注释 + `[]`）+ `pnpm-workspace.yaml`（同 §2）；
- copy 复制整个 `<home>/profiles/<src>` 目录（可选含 node_modules）；rename = 目录移动 + 重写 package.json name；delete = 硬删除；
- 它的 CLI（`dcm` / `dsh-config-manager`）**没有** profile create/rename/delete/launch 子命令——GUI 之外的脚本化创建需要手写目录或本技能的脚本。

### 6.4 最小可被接受 / 可启动的 profile

【实测】最小结构 = 目录 + `package.json`（`{"name":"dsh-profile-<name>","private":true,"dependencies":{},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]}}}`）+ `cordis.patch.yml`（`[]`）；无需 node_modules / pnpm install 即可被 `--dump-config` 接受（bundle 从安装目录解析）。`pnpm-workspace.yaml` 由 initProfile 自动补。

- "能被 CLI 组合" ≠ "能被桌面选中" ≠ "能真正完成 Host boot"：
  - 组合：上面最小结构即可（dump exit 0）；
  - 桌面可选：bundles 必须含 base + web-app（§5.2）；
  - 真正可启动：还要求运行时依赖齐全、端口/权限/网络可用、首启 onboarding 能走完——只有用户亲眼确认才算（本技能不得把 L1 结果称为"已验证启动"）。

## 7. 失败模式与日志 / recovery

### 7.1 失败语义（dsh-app-boot README 失败表）

- root 配置或必需 overlay 缺失/不可读/格式坏/条目非法 → **停止启动**；
- 模块 import 失败 / evaluation 抛错 → 可选：warn+继续；必需：停止；
- 插件 Config schema 校验失败 → 可选：warn+继续；必需：停止；
- Config `!!js` 抛错 / 同步 `apply()` 抛错 → warn/继续或停止；`disabled: !!js` 抛错 → warn/停止；
- 注入服务不可用 → warn，该 entry 等待；HTTP 端口绑定失败 → warn，无 endpoint 继续；
- 必需 entry（取决于 surface；web 必须）包括：`agent-loop`、`webserver`、`web-runtime`、`modules`、`connection`（另有 headless-runner / acp / sdk-jsonrpc-server 各自必需）；
- detached 异步工作里的未处理 rejection / 同步回调里的未捕获异常 → fatal dispose + 非零退出。

### 7.2 日志与恢复路径

| 路径 | 内容 |
|---|---|
| `$DSH_HOME/logs/desktop-next.log` | 桌面正常运行日志（含 incompatibility / skip 行）。 |
| `$DSH_HOME/logs/dsh-desktop-next-failure-<ts>-<stage>.log` | 桌面 Host 启动失败；头部字段 time/stage/run/version/platform/electron/node/safeMode/dsh/arch/profile。实测例子：stage `host-boot`、"Host startup exceeded 60 seconds"、profile:desktop、dsh:0.2.1-rc.4，尾部含 pnpm 输出（"Lockfile is up to date..."）。 |
| `$DSH_HOME/logs/startup-<ts>-<uuid>.log` | CLI 启动失败（mode 0600、dir 0700）；同时打印 "Full diagnostics: <path>"；含 timestamp/dshVersion/nodeVersion/platform/arch/profile/error；提示可能含凭据。 |
| `$DSH_HOME/recovery/<epoch-ms>-<uuid>/{package.json, cordis.patch.yml, snapshot.json}` | 每次桌面成功启动写一个 checkpoint（本机 18 个）。 |
| `$DSH_HOME/recovery/removed-profiles/<name>-<ts>-<uuid>` | 删除 profile 时移动到这里（不是直接销毁）。 |
| `$DSH_HOME/recovery/factory-reset-<ts>-<uuid>` | 工厂重置时把 home 下除 recovery / electron-user-data / desktop-next-location.json 之外的内容移到这里。 |

- `recover()`（回滚 UI）：备份 → `manifestForRepair` → `sanitizeProfile`：把 `cordis.patch.yml` 移到唯一 `.bak-<timestamp>`，bundle 列表重置为 `WEB_BUNDLES`，删除 `dsh.desktopNextOnboarding`，patch 写回 `[]`，features `{remoteControl:false, market:false}`。`repair-global` 会备份并禁用 `$DSH_HOME/cordis.patch.yml`（对所有 Next profile）。
- 依赖安装：桌面 Host 在 mount 前对 active profile 跑 pnpm（**日志证据**：failure log 里有 pnpm 输出；代码调用点未定位：`host.js` 把 `packageManager: bundledPnpmInvocation(runtimeDir)` 传给 runProfile，`profile-boot` 再转给 `profileContext.packageManager`）。CLI：`dsh plugin --profile <name>` 在 profile 目录跑 pnpm；缺 pnpm → exit 127 + `dsh: pnpm was not found; install pnpm and make it available on PATH.`

### 7.3 "这个 profile 有效且可启动"检查清单

由内而外，先静态后组合；**任何一步失败都不要声称 launchable**：

1. `node scripts/static-check.mjs --profile-dir $DSH_HOME/profiles/<name>` —— L0 结构/纯净/模式检查（exit 0 = 无硬错）。
2. `node scripts/dump.mjs --profile <name>` —— L1 组合（默认按 macOS 应用路径解析，可用 `--app` / `--dsh-home` 覆盖；`--json` 机器可读）。要求 exit 0、stderr 无 skip/disable/incompatible marker、必需 row 齐全（`agent-loop`、`modules`、`connection` + web 的 `webserver`、`web-runtime`）。
3. 等价裸命令（无脚本时）：`DSH_HOME=<隔离home> ELECTRON_RUN_AS_NODE=1 <DSH_APP>/Contents/MacOS/DSH NEXT --expose-internals <DSH_APP>/Contents/Resources/app.asar/lib/desktop-cli.js --profile <name> --dump-config`（exit 0 / stderr 空；注意该命令会重写 `<profile>/cordis.yml`）。
4. 模式存在时：`node scripts/mode-base.mjs verify --profile-dir <dir> --mode-id <profile>-<mode>`。
5. 迁移包：`node scripts/static-check.mjs --profile-dir <包目录> --migration`。
6. 桌面可切换性：bundles 含 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`（否则 UI 显示"不可用于桌面端"）。
7. 真正启动：**只有用户在 GUI 里切换并看到界面才算**；失败去 `~/.dsh/logs/` 找最新的 `dsh-desktop-next-failure-*.log`。首启可能进 onboarding 向导【推断】。

## 8. profile vs agent preset vs 其它配置层

【文档】+【源码】核心分界（原文出自本机 presets 的 agent 平面文件头）：agent preset 是 **AGENT-PLANE composition**，"The host composition (base.cordis.yml + web.cordis.yml) keeps everything a preset must not own: the registries themselves, the sandbox and approval stack, persistence, and the model route."

| 关注点 | 归属 | 落点 / 证据 |
|---|---|---|
| 插件栈、顺序、启用/禁用 | **profile** | `package.json dsh.profile.bundles` + `cordis.patch.yml`。plugin_manager：插件开关只改 profile patch 中**最后一个匹配 override** 的 `disabled`；bundle 开关改 package.json 的有序 bundle 列表。 |
| host 服务（webserver、connection、modules、agent-loop、持久化、sandbox、审批栈） | **profile bundles**（桌面再加产品层） | app-boot 必需 entry 表；agent 平面文件头。 |
| persona | **agent preset** | preset `plugins` 第一行 `- id: persona / name: '@deepseek-ai/dsh-persona' / config.prefix`。 |
| 每个模式的 agent 工具集 | **agent preset** | preset `plugins` 数组；插件 Config = `z.object({id, name, description, order, plugins})`，注册进 `ctx.agentPresets.register()`。 |
| 默认 / 选中模式 | **profile patch** 的 `agent-preset-registry` 行 | 本机：`default: standard`、`selectedDefault: ptc`（volatile，不落 profile 文件；新会话解析顺序 = selectedDefault → default）。 |
| 模型路由（provider / model / reasoningEffort） | **profile patch** 的 `agent-default-model` 行 | 本机：`deepseek-account / deepseek-flash / max`；`saveSelection()` → `ctx.get("configEditor").edit(entry, ...)` → 写回 active profile patch。 |
| 子代理模型白名单 | **profile patch** 的 `subagent-model-selection-settings` 行 | 本机 patch。 |
| 模型 provider / API key 环境变量名 | **profile patch** 的 `llm-pi-ai` 行（只写 `apiKeyEnv` 名） | 真 secret 不在 patch；本机疑似 `~/.dsh/.credentials.yaml`【未验证】。 |
| 主题 / 聊天 UI / 设置表单 | **profile patch** 的 `ui-theme`、`ui-chat`、`ui-settings*`、`vision-router`、`web` 行 | `dsh-settings`：声明为 `.volatile()` 的字段会持久化进 active profile 的 Cordis patch。本机 `ui-theme`：fontSize 22 / codeFontSize 16 / terminalFontSize 20。 |
| 窗口 / 托盘 / 浏览器访问 / 网络暴露 / 端口 | **机器级** `~/.dsh/desktop-preferences.json` | 本机：`closeToTray:true`、`macosMaterial:"transparent"`、`browserAccess:true`、`networkExposure:"lan"`、`port:0`、`logLevel:"info"`。不属于任何 profile。 |
| skills | **文件系统根目录**（不是 profile manifest） | dsh-skill-filesystem 根表：项目 `.dsh/skills` 100、项目 `.agents/skills` 200、custom 300、用户 `$DSH_HOME/skills` 400、用户 `~/.agents/skills` 500、bundled 600；重复名就近层覆盖。 |
| MCP servers / connectors | 插件行 + 插件 storage | 连接记录与 OAuth grant 在 `$DSH_HOME/storages/mcp_connector.json` 与 `mcp_connector_grants_v1`（0700/0600）；不在 profile patch。 |
| sessions / storages / credentials / AGENTS.md | **机器级** `$DSH_HOME` | profile 删除对话框原文：共享的会话和设置会保留（"shared sessions and settings are retained"）。 |
| agent presets 存储 | 用户可写目录 `~/.dsh/.agent-presets/<name>/{agent.cordis.yml, preset.yml}`（config-manager adapter 文档）；或 profile patch 里的 preset 行 | 两套并存；随包技能 `editing-cordis-compositions` 称旧目录"NO LONGER READ"，与 config-manager 文档/本机现存 redteam、unrestricted 目录矛盾——**未决**，使用前以运行时 dump 结果为准。 |
| 插件市场 | profile node_modules（pnpm）+ bundles | `dshmarket`、`dsh-community-market`、`@deepseek-ai/dsh-experimental-plugin-market-bundle`；桌面另有 `remoteControl/market` feature 字段。 |

补充：官方随包技能 `cordis-plugin-development` 明说："Do not write the profile's package.json or cordis.patch.yml, create packages under $DSH_HOME, or run pnpm in the profile directory: install_bundle performs those steps"——官方推荐的插件安装轨道是 plugin_manager 的 `install_bundle`；但本技能主路径是 profile patch 直接 `insert`（本机已实证，见 60-agent-modes）。

## 9. 共享 / 导出（今天有什么）

- **官方桌面 UI 没有 export / import / duplicate / rename**；Profile 菜单只做 list / switch / create / 打开目录、打开 patch、打开 manifest。
- `dsh-config-manager` 的 backup/export/sync ZIP **明确排除 profiles**（"DSH's own profiles ... are machine-local and are not part of the backup"），但 Environment → Profiles 提供 list / create / rename / delete / launch / stop / copy dir。
- `dshmarket` 分享的是**插件**（bundle 包 / index 条目），不是 profile 目录；组合（顺序、patch、设置）始终留在本地。
- 今天的可移植单位 = **profile 目录的声明层**：`package.json`（bundles + dependencies + 可选桌面 dsh.* 字段）+ `cordis.patch.yml` + 可选 `compatibility.json`、`pnpm-lock.yaml`（+ 本技能的 `.profile-builder/` 记账）。
  - **不要**原样复制：`cordis.yml`（每次 boot 重写）、`desktop-next.runtime.patch.json`、`desktop-next.cordis.patch.json`（Host 重新生成）、`.plugin-manager/`、`.dsh-market/`、`node_modules/`（按需重装）、日志、recovery。
  - 需要剥掉/改写：patch 里的绝对路径（`insert[].name` 会被改写成 `file://`）、生成的 connector 路径 / trustedHosts、桌面 feature / onboarding 字段；patch 可能夹带明文密钥，需扫描（静态检查的纯净四检）。
- 安装到目标机：复制目录到 `$DSH_HOME/profiles/<newname>`（名字过 §5.2 规则、桌面要求 real dir）→ 装依赖（`dsh plugin --profile <newname> install` 或让桌面 Host boot 时装）→ 用户手动切换或独立实例启动。目标机必须是**同平台 + 同 DSH 版本**才谈得上环境可复现。

## 10. 证据索引（2026-10-31）

- 【文档】`app.asar/node_modules/@deepseek-ai/` 下：`dsh-app-boot/README.md`、`dsh/README.md`、`dsh-plugin-manager/README.md`、`dsh-agent-preset-registry/README.md`、`dsh-agent-default-model/README.md`、`dsh-settings/README.md`、`dsh-skill-filesystem/README.md`、`dsh-mcp-connector/README.md`。
- 【文档】随包技能（`app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-preset/skills/`）：`cordis-composition-reference`、`cordis-plugin-development`、`editing-cordis-compositions`、`agent-experience`。
- 【源码】`app.asar/lib/recovery-*.js`（NextProfiles / NextRecovery / 层序）、`lib/main.js`、`lib/client.js`、`lib/desktop-cli.js`、`lib/desktop-contract-*.js`、`lib/host.js`、`lib/profile-boot-*.js`；`app.asar/package.json`、`app.asar/cordis.patch.yml`、`app.asar/host.cordis.patch.yml`；`app.asar/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`。
- 【实测】本机 scratch 环境：hand-made profile 的 `--dump-config` 正例/负例；`tests/fixtures/dump-web.txt`（官方 4 preset 声明，597 行）与 `dump-ptc-moved.txt`（模拟官方 PTC 变动的 599 行 fixture）；负例 fixture（缺 package.json / 纯注释 patch）由 `scripts/static-check.mjs` 复现。
- 【观察】本机 `~/.dsh` 现状：18 个 recovery checkpoint、`logs/desktop-next.log`、无 `desktop-next.json`（active=desktop）、无 home 级 `cordis.patch.yml`、无 `dsh` 二进制。
- 详细侦察笔记：`.scratch/profile-skill-recon/internals.md`。
