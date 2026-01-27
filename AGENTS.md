# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

DaleStudy 커뮤니티의 Agent Skills 모음집. AI 코딩 어시스턴트(Claude Code, Cursor, GitHub Copilot)용 재사용 가능한 스킬 정의를 제공한다.

이 저장소는 **빌드 과정 없는 순수 콘텐츠 저장소**다. 각 스킬은 SKILL.md 파일로 정의되며, 배포 시 단순히 ZIP으로 압축되어 `dist/` 디렉토리에 `.skill` 확장자로 저장된다.

## Development Commands

### 스킬 테스트 (로컬)

```bash
# 로컬 저장소에서 특정 스킬 설치 테스트
npx skills add . --skill bun --agent claude-code --global --yes

# Bun 사용 시
bunx skills add . --skill bun --agent claude-code --global --yes
```

설치 후 `~/.agents/skills/{skill-name}` 및 `~/.claude/skills/{skill-name}` (심볼릭 링크)에서 확인 가능

### 배포 방식

이 저장소는 **GitHub를 통해 직접 배포**된다. `npx skills add dalestudy/skills`는:
1. GitHub 저장소 클론
2. `skills/` 디렉토리에서 SKILL.md 파일 읽기
3. 선택한 스킬을 `~/.agents/skills/`에 설치

**별도 빌드/패키징 과정 없음**. `skills/{skill-name}/SKILL.md` 파일을 수정하면 즉시 배포된다.

### CI 테스트

GitHub Actions가 자동으로 실행됨 (스케줄: 매일 11:00, 23:00 UTC):
- 모든 스킬의 설치 가능성 검증
- `.github/workflows/ci.yml`의 `matrix.skill` 배열에 명시된 스킬만 테스트 대상

**새 스킬 추가 시 CI 업데이트 필수**: `matrix.skill` 배열에 스킬명 추가

## Repository Architecture

### 스킬 구조

각 스킬은 [Agent Skills 스펙](https://agentskills.io/specification)을 따른다:

```
skills/{skill-name}/
└── SKILL.md          # YAML frontmatter + Markdown 지시사항 (필수)
```

**핵심 원칙:**
- SKILL.md는 **실행 가능한 지시사항이자 메타데이터**를 포함
- `description` 필드는 **스킬 활성화 조건**을 명확히 기술 (파일 패턴, 키워드, 사용 상황)
- `allowed-tools`는 스킬이 요구하는 도구 권한을 선언 (예: `Bash(bun:*)`)

### SKILL.md 작성 규칙

```yaml
---
name: skill-name
description: "스킬 설명 + 활성화 조건. 다음 상황에서 사용: (1) ..., (2) ..., (3) ..."
license: MIT
compatibility: 필요한 CLI 도구 (예: Requires bun CLI)
metadata:
  author: DaleStudy
  version: "1.0"
allowed-tools: Bash(command:*) Bash(another:*) # 공백으로 구분
---

# 스킬 제목

스킬 지시사항 (Markdown)
```

**중요:**
- `description`은 AI 에이전트가 **언제 이 스킬을 사용할지** 판단하는 주요 기준
- 구체적인 파일 패턴 (`.stories.tsx`), 키워드 (`bun`, `CSF`), 사용 상황을 명시
- `allowed-tools`는 권한 프롬프트 최소화를 위해 정확히 기술

### 배포 구조

스킬은 GitHub 저장소를 통해 직접 배포된다:

```bash
npx skills add dalestudy/skills --skill bun
```

위 명령은:
1. `https://github.com/DaleStudy/skills` 저장소 클론
2. `skills/bun/SKILL.md` 파일 복사
3. `~/.agents/skills/bun/`에 설치

## Adding New Skills

새 스킬 추가 시 **반드시 `/skill-creator` 스킬을 사용**하라:

```bash
/skill-creator
```

또는 "새 스킬 만들어줘"라고 요청하면 자동 활성화된다.

`/skill-creator`는 다음 작업을 수행:
1. SKILL.md frontmatter 형식 검증
2. `description` 필드의 활성화 조건 명확성 확인
3. `.github/workflows/ci.yml`의 `matrix.skill` 배열 업데이트
4. `dist/` 디렉토리에 `.skill` 파일 생성

## Current Skills

- **bun**: Node.js 대신 Bun 런타임 사용
- **github-actions**: GitHub Actions 워크플로우 작성 및 보안
- **skill-creator**: 새 스킬 생성 가이드
- **storybook**: Storybook CSF 3.0 스토리 작성
- **react**: React 컴포넌트 개발 (추가됨)

## Important Notes

- **스킬 추가 후 CI 업데이트 필수**: `.github/workflows/ci.yml`의 `matrix.skill` 배열에 새 스킬명 추가
- **SKILL.md만 수정하면 됨**: 빌드 과정 없음, 변경사항은 즉시 반영됨
- **`description` 작성이 핵심**: AI 에이전트가 올바른 상황에서 스킬을 활성화하도록 구체적으로 기술
