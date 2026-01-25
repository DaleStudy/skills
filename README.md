# Skills

DaleStudy 커뮤니티 에이전트 스킬 모음

## 설치

```bash
npx skills add DaleStudy/skills
```

### Claude Code

```bash
claude skill add DaleStudy/skills
```

### 수동 설치

스킬 디렉토리를 복사:

```bash
# 프로젝트 로컬
cp -r skills/bun .claude/skills/

# 전역 (모든 프로젝트)
cp -r skills/bun ~/.claude/skills/
```

## 스킬 목록

### [bun](skills/bun)

Node.js 대신 Bun 런타임 사용

- npm/yarn → bun 명령어 매핑
- 프로젝트 초기화 및 패키지 관리
- GitHub Actions CI 설정
- Node.js 마이그레이션 체크리스트

```bash
npx skills add DaleStudy/skills --skill bun
```

### [github-actions](skills/github-actions)

GitHub Actions 워크플로우 생성, 보안 및 버전 관리

- 최신 액션 버전 확인 방법
- 최소 권한 원칙 및 시크릿 관리
- 입력값 인젝션 방지
- pull_request_target 보안

```bash
npx skills add DaleStudy/skills --skill github-actions
```

## 사용법

| 도구 | 활성화 방식 |
|------|-------------|
| Claude Code | 자동 (키워드 감지) 또는 슬래시 명령어 |
| Cursor | 파일 패턴 매칭 |
| GitHub Copilot | `@workspace` 멘션 |

## 스킬 구조

```
skill-name/
├── SKILL.md      # 에이전트 지시사항 (필수)
├── references/   # 참조 문서 (선택)
├── scripts/      # 실행 스크립트 (선택)
└── assets/       # 템플릿, 이미지 등 (선택)
```

## 기여

새 스킬 추가 시 [Agent Skills 스펙](https://agentskills.io/specification)을 따라주세요.
