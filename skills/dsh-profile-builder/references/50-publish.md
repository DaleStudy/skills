# 参考 50：发布与分发（DaleStudy/skills 上游 + 本机安装）

日期 2026-10-31。适用：A2（发布）与 W3 之外的技能分发场景。
前提：A1 技能自检全部通过（见 30-verification.md §7 A1），尤其 selftest 38/38 与 frontmatter 合法。

## 1 上游仓库约定（DaleStudy/skills）

### 1.1 目录布局

~~~text
DaleStudy/skills
└── skills/
    └── dsh-profile-builder/
        ├── SKILL.md            # 入口：frontmatter + 主流程
        ├── README.md           # 人类可读：是什么/装/用/限制
        ├── references/         # 按需加载的细节文档
        │   ├── 00-facts.md
        │   ├── 10-interview-tree.md
        │   ├── 20-workflows.md
        │   ├── 30-verification.md
        │   ├── 40-migration.md
        │   ├── 50-publish.md
        │   └── 60-agent-modes.md
        ├── scripts/            # 可执行工具（.mjs）
        │   ├── _lib.mjs
        │   ├── static-check.mjs
        │   ├── dump.mjs
        │   ├── mode-base.mjs
        │   ├── export.mjs
        │   ├── import.mjs
        │   └── selftest.mjs
        └── tests/
            └── fixtures/       # dump-web.txt / dump-ptc-moved.txt 等离线夹具
~~~

- 技能目录名必须等于 SKILL.md frontmatter 的 name；不放在 skills/ 根下的其他 .md 不会被当作技能。
- references/、scripts/、tests/ 是约定目录，不是 DSH 内核要求；DSH 只要求 SKILL.md 存在且 frontmatter 合法。
- 上游仓库根 README.md 维护技能列表：新增技能要加一行（名称 + 一句话简介）。

### 1.2 skill-creator 的上游约定（本仓库技能约定）

以下来自本机 ~/.agents/skills/skill-creator/SKILL.md（DaleStudy/skills 的创作规范，韩文原版）：

- name：目录名一致；小写字母/数字/连字符，≤64 字符；不用空格/下划线/大写。
- description：一句话能力 + 触发条件；≤1024 字符；写清"什么时候用"。
- body：建议 ≤500 行；超出部分放 references/，正文只留索引与路由。
- version：metadata.version 用 SemVer；每次改 SKILL.md 都要升版本。
- 可选字段：license、compatibility、metadata（author、version 等）。
- 新增/修改技能后更新仓库根 README.md 的技能清单。
- 步骤化、可执行、带验收；不要写无法执行的空话。

### 1.3 本技能与上游的差异

- 本技能的可执行部分在 scripts/（Node ESM），上游技能多为纯文档；因此 README 必须写清 Node 版本要求与"脚本只读/写盘边界"。
- 本技能依赖本机 DSH NEXT 应用路径（macOS 默认 /Applications/DSH NEXT.app）；发布版必须在 SKILL.md/README 里说明"环境变量可覆盖、非 macOS 需自行提供路径"，且不得出现除该默认值之外的绝对路径。

## 2 发布前自检（A1 + 发布附加项）

### 2.1 形式检查

~~~bash
cd ~/.dsh/skills/dsh-profile-builder
# frontmatter：name 与目录名一致、description ≤1024
node -e 'const fs=require("fs");const t=fs.readFileSync("SKILL.md","utf8");const m=t.match(/^---\n([\s\S]*?)\n---/);if(!m)throw new Error("no frontmatter");const fm=m[1];if(!/^name: dsh-profile-builder$/m.test(fm))throw new Error("bad name");const d=fm.match(/^description: (.*)$/m);if(!d)throw new Error("no description");if(d[1].length>1024)throw new Error("description too long: "+d[1].length);console.log("frontmatter OK")'
wc -l SKILL.md
grep -rnE 'T[O]DO|T[B]D|占[位]|待[补]' SKILL.md references README.md || echo 'no placeholders'
# 离线自测（必须 38/38）
node scripts/selftest.mjs
~~~

### 2.2 发布附加项

| 检查 | 通过标准 |
| --- | --- |
| references 索引 | SKILL.md 的索引表列出的每个文件都存在，7 个一个不少 |
| 绝对路径 | 只允许文档中声明过的 macOS 默认 /Applications/DSH NEXT.app；其它机器路径用 $DSH_HOME/$DSH_APP |
| 脚本调用 | 文档里统一 node scripts/<x>.mjs，不写裸 ./scripts/<x>.mjs（缺执行位会失败） |
| 示例可运行 | 文档中的命令都能在"干净 profile 副本"上跑通；写盘示例标注"会写盘" |
| 无秘密 | 包里没有 token/凭据/真实用户路径（static-check --migration 已验证） |
| metadata.version | 本次发布相对上一版已升版本 |
| README | 含安装、快速开始、目录结构、验收、限制 |

## 3 本机安装（不发布也能用）

### 3.1 安装位置

DSH 的技能发现根（从高到低优先级）：项目 .dsh/skills（100）→ 项目 .agents/skills（200）→ 自定义根（300）→ $DSH_HOME/skills（400）→ ~/.agents/skills（500）→ DSH 内置（600）。同名技能高优先级覆盖低优先级。

- 全局可用：复制到 ~/.dsh/skills/dsh-profile-builder（或 ~/.agents/skills/dsh-profile-builder）。
- 项目内可用：复制到 <repo>/.dsh/skills/dsh-profile-builder（优先级最高，适合开发调试）。

~~~bash
mkdir -p ~/.dsh/skills
cp -R /path/to/dsh-profile-builder ~/.dsh/skills/dsh-profile-builder
ls ~/.dsh/skills/dsh-profile-builder/SKILL.md
~~~

### 3.2 生效与验证

- 技能目录是 watch 发现：新增/修改 SKILL.md 后会刷新技能清单，不需要重启应用（以本机实测为准；若没出现，先确认 frontmatter 合法，再重启应用）。
- 验证循环（本机实测可行的 de-facto 流程）：
  1. 写或复制技能到 ~/.dsh/skills/<name>/SKILL.md。
  2. 等技能清单刷新；<available_skills> 里出现该 name。
  3. 在本会话调用原生 skill 工具：skill({ name: "dsh-profile-builder" })，返回的 skill_content 必须包含 SKILL.md 正文。
  4. 若没触发，检查目录名 == frontmatter name、description 是否含触发词、是否有同名技能覆盖。
- 注意：没有官方 skill 校验器/CLI（本机未发现）；上面的"清单出现 + skill 工具能加载 + selftest 通过"就是事实上的验收链。

## 4 发布到上游（经个人 fork + PR）

### 4.1 前置

- 有 GitHub 账号（本机约定用 demo112）且 gh CLI 已登录：gh auth status。
- 能访问 network（npx 与 git push 都需要）。
- 已完成第 2 节自检与 30-verification.md §7 A1。
- 上游仓库默认分支与贡献规范未在本机文件中验证过；第一次 PR 前先在 GitHub 上确认默认分支名（下文按 main 写）。

### 4.2 fork 与分支

~~~bash
# 1) fork 上游到自己账号（已 fork 过可跳过）
gh repo fork DaleStudy/skills --clone=false

# 2) clone 自己的 fork
cd /tmp
git clone git@github.com:demo112/skills.git
cd skills
git checkout -b feat/dsh-profile-builder
~~~

### 4.3 放入技能目录并提交

~~~bash
mkdir -p skills
cp -R ~/.dsh/skills/dsh-profile-builder skills/dsh-profile-builder
# 不要把本地临时文件/备份/日志带进去
find skills/dsh-profile-builder -name '*.bak-*' -o -name 'node_modules' -o -name '*.log'

git add skills/dsh-profile-builder
git status --short
git commit -m "feat: add dsh-profile-builder skill"
git push -u origin feat/dsh-profile-builder
~~~

### 4.4 用 npx 安装验证（发布前最后一道）

~~~bash
npx skills add demo112/skills --skill dsh-profile-builder --agent claude-code --global --yes
~~~

期望：exit 0；技能出现在 ~/.agents/skills/dsh-profile-builder/SKILL.md；随后在本会话用原生 skill 工具加载 dsh-profile-builder，返回的 skill_content 含正文。

- 该命令依赖 npm 网络与 skills CLI 的当前版本；本机未验证过上游 CLI 行为，失败时记录 stderr 并回退到"直接复制目录"安装（第 3 节）。
- 安装验证通过前不要开 PR。

### 4.5 开 PR

~~~bash
gh pr create \
  --repo DaleStudy/skills \
  --head demo112:feat/dsh-profile-builder \
  --base main \
  --title "feat: add dsh-profile-builder skill" \
  --body-file /tmp/dsh-profile-builder-pr.md
~~~

PR 描述模板（写入 /tmp/dsh-profile-builder-pr.md）：

~~~markdown
## 背景
用户需要一个可安装的技能，按 DSH 官方约定创建/改造/迁移/升级/体检 profile，
并可为 web profile 增加与官方 4 模式并列的第 5 个 agent 模式。

## 这个技能做什么
- W1 create / W2 adopt / W3 migrate / W4 upgrade / W5 doctor / W6 mode
- 强制先访谈取证、产 ≤5 行契约并获确认后才写盘
- 只读 desktop profile：不修改、不切换
- 离线自测 38 项 + 负例矩阵 + L0–L3 分层验收

## 目录
skills/dsh-profile-builder/{SKILL.md, README.md, references/, scripts/, tests/fixtures/}

## 验收证据
- node scripts/selftest.mjs -> 38/38 passed（附输出）
- 在本机 DSH NEXT（2026-10-31 版本）上完成：创建 profile、导出/导入迁移包、第 5 模式 Phase A/B、dump L1、隔离 DSH_HOME L2 冒烟
- 负例矩阵见 references/30-verification.md §5

## 限制
- 迁移只带声明层，不带 session/凭据；跨平台/跨版本未验证
- 需要目标机安装 DSH NEXT（scripts/dump.mjs 依赖应用内 CLI）
- UI 操作（切换 profile、选择模式）留给用户

## 检查清单
- [x] frontmatter name 与目录名一致，description ≤1024
- [x] references 索引齐全，正文 ≤500 行
- [x] 无未完成标记；无真实凭据与机器绝对路径（系统默认应用路径除外）
- [x] selftest 38/38；npx 安装验证通过
- [x] 根 README 技能列表已更新（若上游要求）
~~~

### 4.6 PR 之后

- 上游 owner 合并是异步的，不阻塞本地交付；本机仍用第 3 节直接安装。
- 被要求修改时：在 fork 分支改 → 重新自检（第 2 节）→ 重新 npx 验证 → git push（PR 自动更新）。
- 合并后：更新 README 里的安装命令为上游正式名；如上游改目录/命名规范，回改 references/50 与 SKILL.md 索引。

## 5 不发布时的分发

- 团队/多机：把整个技能目录打 tar 分发，按第 3 节复制到目标机 ~/.dsh/skills/ 或 <repo>/.dsh/skills/。
- 不要只发 SKILL.md：references/ 与 scripts/ 是路由与验收的一部分，缺失会让技能退化成"文档提示"。
- 版本记录：metadata.version 与 git tag 对齐（tag 形如 dsh-profile-builder-v1.0.0）。

## 6 发布清单（A2 收尾）

- [ ] A1 自检通过（30-verification.md §7 A1）
- [ ] 第 2 节发布附加项全过（索引/绝对路径/脚本调用/示例/无秘密/版本）
- [ ] README 完整（安装、快速开始、目录、验收、限制）
- [ ] gh auth status 通过，fork 与分支已推送
- [ ] npx skills add demo112/skills --skill dsh-profile-builder --agent claude-code --global --yes exit 0
- [ ] 原生 skill 工具能加载并返回正文
- [ ] PR 已开（title/body 用 4.5 模板），链接记入报告
- [ ] 未验证项已标注：上游 CI、PR 模板、CODEOWNERS、上游贡献规范、npm 网络行为

## 7 未验证与风险（发布相关，必须如实标注）

- 上游仓库的 CI/PR 模板/CODEOWNERS/贡献指南未在本机验证；PR 可能被要求改格式。
- skills CLI（npx skills add）的网络与行为未在本机验证；失败时回退直接复制。
- 默认分支名按 main 写；若上游是 master 或其他，改 --base。
- 本技能含可执行脚本，上游评审可能要求更严格的 Node 版本声明与安全说明；README/SKILL.md 已声明只读边界与写盘需确认。
- license：本机未见上游 LICENSE 文本；PR 前在仓库根确认，必要时在技能目录补 LICENSE。
