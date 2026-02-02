[![All Contributors](https://img.shields.io/github/all-contributors/DaleStudy/skills?color=ee8449&style=flat-square)](#contributors)

# DaleStudy Skills

달레 스터디의 에이전트 스킬 모음입니다.

다양한 프로젝트를 진행하면서 자주 쓰는 지식, 반복되는 체크리스트, 노하우, 모범 관행, 안티 패턴 같은 것들이 자연스럽게 지식 자산으로 쌓입니다. 이제 이런 공동 지식을 AI 에이전트도 활용할 수 있도록 [Agent Skills](https://agentskills.io/specification) 형식으로 체계화했습니다.

## 빠른 시작

### 전체 스킬 설치

```bash
npx skills add dalestudy/skills
```

또는 Bun 사용 시:

```bash
bunx skills add dalestudy/skills
```

### 특정 스킬만 설치

```bash
npx skills add dalestudy/skills --skill bun
```

## 스킬 목록

### [bun](skills/bun)

Node.js 대신 Bun 런타임 사용을 위한 가이드

**주요 기능:**

- npm/yarn → bun 명령어 매핑
- 프로젝트 초기화 및 패키지 관리
- GitHub Actions CI 설정
- Node.js 마이그레이션 체크리스트

**언제 활성화되나요?**

- `package.json`에서 bun 관련 작업 시
- "bun으로 프로젝트 시작해줘" 같은 요청 시

```bash
npx skills add dalestudy/skills --skill bun
```

---

### [git](skills/git)

Git 버전 관리 모범 관례 및 워크플로우 가이드

**주요 기능:**

- Conventional Commits 기반 커밋 메시지 작성
- GitHub Flow 워크플로우 (브랜치 전략, PR 병합 전략)
- Git 히스토리 관리 (rebase, squash, cherry-pick, amend)
- Merge conflict 해결 가이드
- Git 보안 모범 관례 (.gitignore, 시크릿 관리)

**언제 활성화되나요?**

- Git 커밋 메시지 작성 시
- 브랜치 생성 및 관리 시
- PR 생성 및 병합 시
- Git 히스토리 정리 작업 시
- `git`, `.git`, `commit`, `branch`, `merge`, `rebase` 키워드 포함 작업 시

```bash
npx skills add dalestudy/skills --skill git
```

---

### [github-actions](skills/github-actions)

GitHub Actions 워크플로우 작성 시 보안과 최신 버전 관리

**주요 기능:**

- 최신 액션 버전 자동 확인 (`gh api` 활용)
- 최소 권한 원칙 및 시크릿 관리
- 입력값 인젝션 방지 패턴
- `pull_request_target` 보안 가이드

**언제 활성화되나요?**

- `.github/workflows/` 파일 작업 시
- "CI 워크플로우 만들어줘" 같은 요청 시
- `uses:`, `actions/` 키워드 포함 작업 시

```bash
npx skills add dalestudy/skills --skill github-actions
```

---

### [storybook](skills/storybook)

Storybook 스토리 작성 및 CSF 3.0 베스트 프랙티스

**주요 기능:**

- CSF 3.0 형식과 타입 안전한 패턴
- Args 기반 스토리 작성 및 재사용
- Decorators로 컨텍스트 제공 (Theme, Router, Provider 등)
- Parameters와 ArgTypes 세밀한 제어

**언제 활성화되나요?**

- `.stories.tsx`, `.stories.ts` 파일 작업 시
- "Button 컴포넌트 스토리 만들어줘" 같은 요청 시
- `storybook`, `CSF` 키워드 포함 작업 시

```bash
npx skills add dalestudy/skills --skill storybook
```

---

### [testing](skills/testing)

React Testing Library 및 Vitest 기반 테스팅 모범 관례

**주요 기능:**

- 올바른 쿼리 우선순위 (getByRole > getByLabelText > getByText...)
- userEvent 사용 패턴 (fireEvent 지양)
- 비동기 처리 (waitFor, findBy)
- 안티패턴 회피 (구현 세부사항 테스트 금지)
- Vitest + MSW 설정 템플릿

**언제 활성화되나요?**

- `.test.tsx`, `.test.ts`, `.spec.tsx`, `.spec.ts` 파일 작업 시
- "테스트 작성해줘", "컴포넌트 테스트" 같은 요청 시
- `test`, `testing`, `vitest`, `RTL`, `getByRole`, `userEvent` 키워드 포함 작업 시

```bash
npx skills add dalestudy/skills --skill testing
```

---

### [skill-creator](skills/skill-creator)

새 스킬 생성 및 관리 가이드

**주요 기능:**

- SKILL.md 형식 및 frontmatter 규칙
- 스킬 생성 6단계 프로세스
- 자동 검증 및 패키징

**언제 활성화되나요?**

- "새 스킬 만들어줘" 요청 시
- `/skill-creator` 명령어 사용 시
- SKILL.md 작성 또는 수정 시

```bash
npx skills add dalestudy/skills --skill skill-creator
```

---

### [typescript](skills/typescript)

TypeScript 타입 정의 및 베스트 프랙티스

**주요 기능:**

- 기본 타입 및 Everyday Types
- 타입 조작 (Generics, Utility Types, Mapped Types)
- 타입 가드 및 타입 좁히기
- tsconfig.json 권장 설정
- 타입 안전성 패턴

**언제 활성화되나요?**

- `.ts`, `.tsx` 파일 작업 시
- 타입 정의(interface, type) 작업 시
- `tsconfig.json` 설정 시
- 타입 에러 해결 시
- `typescript`, `type`, `interface`, `generic` 키워드 포함 작업 시

```bash
npx skills add dalestudy/skills --skill typescript
```

## 사용법

설치 후 각 AI 도구에서 자동으로 활성화됩니다:

| 도구           | 활성화 방식                           | 예시                                    |
| -------------- | ------------------------------------- | --------------------------------------- |
| Claude Code    | 자동 (키워드 감지) 또는 슬래시 명령어 | "GitHub Actions 워크플로우 만들어줘"    |
| Cursor         | 파일 패턴 매칭                        | `.stories.tsx` 파일 열면 자동 활성화    |
| GitHub Copilot | `@workspace` 멘션                     | `@workspace Storybook 스토리 작성 방법` |

## 스킬 구조

각 스킬은 [Agent Skills 스펙](https://agentskills.io/specification)을 따릅니다:

```
skill-name/
├── SKILL.md          # 필수: YAML frontmatter + 마크다운 지시사항
├── scripts/          # 선택: 실행 가능한 스크립트
├── references/       # 선택: 참조 문서
└── assets/           # 선택: 템플릿, 이미지 등
```

## 기여하기

새 스킬을 추가하거나 기존 스킬을 개선하고 싶으시다면:

1. **skill-creator 스킬 설치**

```bash
npx skills add dalestudy/skills --skill skill-creator
```

2. **새 스킬 초기화**

```bash
npx skills init <스킬명>
```

또는 Claude Code에서:

```
/skill-creator
```

3. **스킬 개발 및 테스트**

skill-creator 가이드를 따라 SKILL.md 작성 및 리소스 추가

4. **Pull Request 제출**

변경사항을 커밋하고 PR을 보내주세요!

## 기여자

본 프로젝트는 [All Contributors](https://github.com/all-contributors/all-contributors) 관례에 따라 기여자분들의 공헌를 인정하고 감사를 표현하고 있습니다.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://www.daleseo.com"><img src="https://avatars.githubusercontent.com/u/5466341?v=4?s=100" width="100px;" alt="Dale Seo"/><br /><sub><b>Dale Seo</b></sub></a><br /><a href="https://github.com/DaleStudy/skills/commits?author=DaleSeo" title="Code">💻</a> <a href="https://github.com/DaleStudy/skills/commits?author=DaleSeo" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/hyoseong1994"><img src="https://avatars.githubusercontent.com/u/50227228?v=4?s=100" width="100px;" alt="hyoseong"/><br /><sub><b>hyoseong</b></sub></a><br /><a href="https://github.com/DaleStudy/skills/commits?author=hyoseong1994" title="Code">💻</a> <a href="https://github.com/DaleStudy/skills/commits?author=hyoseong1994" title="Documentation">📖</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## 관련 링크

- [Agent Skills 스펙](https://agentskills.io/specification)
- [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills)
- [DaleStudy 커뮤니티](https://github.com/DaleStudy)
