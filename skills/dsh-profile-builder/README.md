# dsh-profile-builder

一个可安装的 DeepSeek Harness（DSH）技能：按官方约定创建、改造、迁移、升级、体检 profile，并可为 profile 增加与官方 4 个内置模式并列的第 5 个 agent 模式（自定义 agent 预设）。

- 版本：1.0.0（2026-10-31）
- 适用：macOS 上的 DSH NEXT（默认 /Applications/DSH NEXT.app，可用 DSH_APP 覆盖）
- 技能形式：SKILL.md（主流程）+ references/（按需加载）+ scripts/（可执行 Node ESM）+ tests/fixtures/

## 解决什么问题

手工维护 DSH profile 的常见失败：不可复现（改了什么都说不清）、不可迁移（换机器重来）、不可升级（跟 DSH 版本脱节）、不纯净（混入生成物/机器路径/凭据）、模式扩展没有官方路径（手改插件清单后账本失配）。

本技能把 profile 当成"声明层"来管理：

- 以官方模板为基线（不 clone desktop，不猜测结构）；
- 先用访谈确认 ≤5 行契约，再写盘；
- 全程只读 desktop profile（不修改、不切换）；
- 用 L0–L3 分层验收，未验证的层如实标注；
- 迁移只带可移植声明层，生成物与凭据永不出包。

## 能力（六个工作流）

| 工作流 | 名字 | 你什么时候会用到 |
| --- | --- | --- |
| W1 | create | 新建一个 web profile（含可选第 5 模式） |
| W2 | adopt | 把历史手工 profile 按官方布局重建，保留行为、去掉生成物 |
| W3 | migrate | 导出迁移包 → git/直传 → 目标机导入 → 验收 |
| W4 | upgrade | DSH 或插件升级后，刷新 bundle、patch、模式账本 |
| W5 | doctor | profile 启动失败/白屏/被跳过时，按日志定位并确认后修复 |
| W6 | mode | 给 profile 增加第 5 个 agent 模式（Phase A 复制官方 PTC 声明，Phase B 用 ops 定制，账本可重放） |

触发词示例：dsh profile、profile 搭建、制作 profile、新建 profile、迁移或分享 profile、profile 升级、profile 体检、第 5 模式、自定义 agent 预设、agent-preset、dsh-profile-builder。

## 安装

### 本地安装（开发/自用）

~~~bash
mkdir -p ~/.dsh/skills
cp -R <this-directory> ~/.dsh/skills/dsh-profile-builder
ls ~/.dsh/skills/dsh-profile-builder/SKILL.md
~~~

DSH 技能发现根按优先级：项目 .dsh/skills → 项目 .agents/skills → 自定义根 → $DSH_HOME/skills → ~/.agents/skills → 内置。技能目录是 watch 发现，改完 SKILL.md 会刷新清单；若没出现，先确认 frontmatter 的 name 与目录名一致，再重启应用。

### 发布后安装（上游 DaleStudy/skills）

~~~bash
npx skills add demo112/skills --skill dsh-profile-builder --agent claude-code --global --yes
~~~

发布流程（fork → 分支 → PR → npx 验证）见 references/50-publish.md。发布前必须先用本地安装方式验证。

### 验证安装成功

在本会话调用原生 skill 工具（name: dsh-profile-builder），返回内容应包含 SKILL.md 正文；然后：

~~~bash
cd ~/.dsh/skills/dsh-profile-builder
node scripts/selftest.mjs
~~~

期望 39/39 通过（完全离线）。

## 快速开始

### 1. 创建第一个 profile

~~~bash
APP="/Applications/DSH NEXT.app"
CLI="$APP/Contents/Resources/app.asar/lib/desktop-cli.js"
dsh() { ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/DSH NEXT" --expose-internals "$CLI" "$@"; }

# 用官方 web 模板初始化（这一步会写 $DSH_HOME/profiles/<name>）
dsh --profile my-profile --from-default-profile web --dump-config

# L0：声明层自检
node scripts/static-check.mjs --profile-dir "$HOME/.dsh/profiles/my-profile"

# L1：在真实应用运行时里 dump 装配结果
node scripts/dump.mjs --profile my-profile --raw-out /tmp/my-profile.yml
~~~

注意：没有 dsh profile 子命令；创建走 --from-default-profile（官方模板），插件安装走 dsh plugin --profile <name> add <pkg> 或应用内插件管理器。完整步骤见 references/20-workflows.md 的 W1。

### 2. 体检现有 profile

~~~bash
node scripts/static-check.mjs --profile-dir "$HOME/.dsh/profiles/<name>"
node scripts/dump.mjs --profile <name> --raw-out /tmp/<name>-dump.yml
~~~

失败症状 → 根因 → 修复见 W5（references/20-workflows.md）与 references/30-verification.md。

### 3. 给 profile 加第 5 个模式（可选）

~~~bash
node scripts/mode-base.mjs extract --dump /tmp/official-ptc.yml --out .profile-builder/baseline-ptc-<modeId>.yml
node scripts/mode-base.mjs emit --baseline .profile-builder/baseline-ptc-<modeId>.yml \
  --mode-id <modeId> --mode-name "<显示名>" --description "<描述>" --order 5 \
  --profile-dir "$HOME/.dsh/profiles/<name>" --write
node scripts/mode-base.mjs verify --profile-dir "$HOME/.dsh/profiles/<name>" --mode-id <modeId>
~~~

模式声明、ops 定制、refresh 与验收见 references/60-agent-modes.md 与 20-workflows.md 的 W6。

## 目录结构

~~~text
dsh-profile-builder/
├── SKILL.md                 # 入口：硬门流程 + 决策树摘要 + 工作流/脚本路由 + 验收门
├── README.md                # 本文件
├── references/
│   ├── 00-facts.md          # 已验证的 DSH/profile 事实与证据
│   ├── 10-interview-tree.md # Phase 0 访谈决策树 N1–N9
│   ├── 20-workflows.md      # W1–W6 可执行工作流
│   ├── 30-verification.md   # L0–L3 验收矩阵 + 负例矩阵 + 回滚 + A1–A5
│   ├── 40-migration.md      # 迁移包规范 / 传输 / 导入 / 连续性边界
│   ├── 50-publish.md        # 上游发布与本机安装
│   └── 60-agent-modes.md    # 第 5 模式：声明结构 / Phase A/B / 账本 / 排错
├── scripts/
│   ├── _lib.mjs             # 共用：参数解析、sha256、文件遍历
│   ├── static-check.mjs     # L0：profile 声明层自检（含 --migration / 纯净扫描 / 模式账本）
│   ├── dump.mjs             # L1：调用应用内 CLI，校验 dump 装配结果
│   ├── mode-base.mjs        # 模式：extract / emit / verify / replay / refresh
│   ├── export.mjs           # W3：生成迁移包 + manifest.json
│   ├── import.mjs           # W3：校验并导入迁移包
│   └── selftest.mjs         # L3：39 项离线自测
└── tests/
    └── fixtures/            # dump-web.txt / dump-ptc-moved.txt，离线夹具
~~~

## 验收模型（L0–L3）

| 层 | 做什么 | 通过标准 | 不能证明什么 |
| --- | --- | --- | --- |
| L0 | static-check：package.json / patch / 纯净 / 迁移白名单 / 模式账本 | exit 0 | 应用运行时是否真的加载 |
| L1 | dump：真实 CLI 装配输出 | exit 0、stderr 空、必需行齐全、无 skip/incompatible、模式 MODE-SHA | 是否长期稳定、UI 交互 |
| L2 | 隔离 DSH_HOME 冒烟或 dsh-lab profile + 用户 UI 确认 | stdout 出现 dsh web URL、stderr 空；用户确认模式可见 | onboarding、长期使用 |
| L3 | selftest 负例矩阵（30 例） | 39/39 离线通过 | 真实用户环境的所有边界 |

纪律：dump 通过 ≠ 已启动；未做的层必须写"未验证"。完整矩阵与失败处置见 references/30-verification.md。

## 依赖与平台

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| macOS + DSH NEXT | 默认 /Applications/DSH NEXT.app | 无头/其他平台需自行提供 DSH_APP 与 CLI 路径 |
| Node.js | 18+（本机实测 v24.13.1） | 所有 scripts 为 ESM |
| pnpm | 可选 | 仅 import --install 需要 |
| git / gh | 可选 | 仅 W3 传输与发布需要 |
| 网络 | 可选 | 仅 npx 发布验证需要；日常流程全离线 |

没有官方 dsh CLI 在 PATH 上：脚本调用应用内 desktop-cli.js，必须设置 ELECTRON_RUN_AS_NODE=1 并传 --expose-internals；必须使用真实 app.asar（解包副本会 ERR_MODULE_NOT_FOUND）。

## 限制

- 不修改、不切换 desktop profile；切换 profile 与选择模式等 UI 操作留给用户。
- 迁移只带声明层：不带 sessions、凭据、缓存、本机 skills、workspace 列表；跨平台/跨版本未验证。
- 第 5 模式基于"复制官方 PTC 声明 + ops 账本重放"；不存在 preset 继承，Phase A 必须与官方 PTC 完全一致（0 drift）。
- 没有官方 skill 校验器；事实上的验收链是：清单出现 + 原生 skill 工具可加载 + selftest 通过。
- 首次切换到新 profile 可能触发 onboarding/设置向导，该 UI 流程未验证。

## 相关文档

- SKILL.md：主流程与路由（使用时由 skill 工具自动加载）
- references/20-workflows.md：W1–W6 完整命令与判据
- references/30-verification.md：验收、负例、回滚、A1–A5
- references/40-migration.md：迁移包与导入
- references/50-publish.md：上游发布
- references/60-agent-modes.md：第 5 模式细节
