# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

DaleStudy 커뮤니티의 Agent Skills 모음집. AI 코딩 어시스턴트(Claude Code, Cursor, GitHub Copilot)용 재사용 가능한 스킬 정의를 제공한다.

## Skill Structure

각 스킬은 [Agent Skills 스펙](https://agentskills.io/specification)을 따른다:

```
skills/{skill-name}/
└── SKILL.md          # YAML frontmatter + Markdown 지시사항 (필수)
```

### SKILL.md Format

```yaml
---
name: skill-name
description: "스킬 설명 및 활성화 조건"
license: MIT
compatibility: 필요한 CLI 도구
metadata:
  author: DaleStudy
  version: "1.0"
allowed-tools: Bash(command:*) # 허용할 도구 패턴
---

# 스킬 제목

스킬 지시사항 (Markdown)
```

## Adding New Skills

1. `skills/{skill-name}/` 디렉토리 생성
2. `SKILL.md` 작성 (frontmatter + 지시사항)
3. README.md의 스킬 목록에 추가

## Current Skills

- **bun**: Node.js 대신 Bun 런타임 사용
- **github-actions**: GitHub Actions 워크플로우 작성 및 보안
