---
name: mcp
description: "MCP 서버 생성·구현 스킬. 다음 상황에서 사용: (1) 새 MCP 서버 프로젝트 생성할 때, (2) Tools/Resources/Prompts 정의·등록이 필요할 때, (3) stdio/SSE/HTTP 트랜스포트 설정 시, (4) MCP Inspector로 서버 테스트할 때"
license: MIT
compatibility: Node/Python/기타 MCP SDK 지원 런타임
metadata:
  author: DaleStudy
  version: "1.0.0"
allowed-tools: Bash(npx:*) Bash(npm:*) Bash(bun:*) Bash(uv:*) Bash(cargo:*) Bash(dotnet:*)
---

# MCP 서버 생성·구현

사용자의 요구사항을 기반으로 **MCP 서버 프로젝트를 생성하고**, 필요한 **Tools/Resources/Prompts를 등록**하며, **stdio 또는 SSE/HTTP 트랜스포트**로 실행 가능하게 구성하고, **MCP Inspector로 테스트**까지 완료한다.

---

## 입력 요구사항 (Ask if missing)

필수로 확인할 것:

- 런타임: `Node(TypeScript)` or `Python`
- 트랜스포트: `stdio` or `SSE/HTTP`
- 구현할 Tool 목록:

  - name
  - description
  - inputSchema (필드명/타입/필수 여부)
  - side effects 여부 (파일/삭제/배포/결제 등)

선택 입력:

- 서버 이름/버전
- 배포 환경(로컬/원격)
- 인증 필요 여부(API key 등)

---

## 의사결정 규칙

- 사용자가 명시하지 않으면 기본값은:

  - 런타임: **Node(TypeScript)**
  - 트랜스포트: **stdio**

- 원격 배포/브라우저 연동이 언급되면:

  - 트랜스포트: **SSE/HTTP**

- 로컬 Claude Desktop 연동이면:

  - 트랜스포트: **stdio**

---

## 안전 규칙 (Critical)

### STDIO 로깅 규칙

- **stdio 트랜스포트에서는 stdout 출력 금지**
- Node: `console.log()` 금지 → `console.error()`만 사용
- Python: `print()` 금지 → `logging` 사용

### 입력 검증 규칙

- Tool handler는 실행 전에 반드시 입력 검증 수행
- 파일 경로는 `../` 등 path traversal 차단
- 외부 API 호출은 timeout 필수

---

## 구현 절차 (Steps)

### Step 1. 프로젝트 스캐폴딩 생성

- Node:

  - `npm init -y`
  - `@modelcontextprotocol/sdk`, `zod`, `tsx`, `typescript` 설치
  - `src/server.ts` 생성

- Python:

  - `uv init`, `uv add mcp`
  - `server.py` 생성

### Step 2. MCP 서버 기본 골격 생성

- `McpServer(name, version)` 초기화
- transport 연결 (stdio 기본)

### Step 3. Tools 등록

각 Tool마다:

- registerTool / @mcp.tool() 적용
- inputSchema 정의
- handler 구현
- 반환을 content 배열 형태로 고정

### Step 4. Resources/Prompts (요청 시)

- SDK 제공 API로 등록
- 최소 1개 샘플 등록

### Step 5. 실행 커맨드 제공

- dev 실행 방법 1개
- 배포용 실행 방법 1개(가능하면)

### Step 6. MCP Inspector 테스트 가이드 제공

- tools/list 확인
- tools/call 테스트 페이로드 제공

---

## 출력 계약 (Output Contract)

이 스킬 실행 결과는 항상 아래를 포함해야 한다.

1. 생성된 파일 구조
2. MCP 서버 코드 (완성본)
3. 실행 커맨드
4. Inspector 테스트 방법
5. Claude Desktop 연동 예시(stdio일 때)

---

## Tool 반환 포맷 (고정)

### Success

```json
{
  "content": [{ "type": "text", "text": "..." }]
}
```

### Error

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "..." }]
}
```

---

## 템플릿

- `assets/server.node.ts` - Node(TypeScript)
- `assets/server.python.py` - Python

---

## Inspector 테스트 체크리스트

- [ ] 서버 실행됨
- [ ] tools/list에서 echo 노출됨
- [ ] tools/call로 입력 전달 시 정상 응답
- [ ] stdout 오염 없음(로그가 stderr로만 출력됨)

---

## 참고

- [MCP Quickstart](https://modelcontextprotocol.io/quickstart) – 서버 생성 절차
- [MCP Specification](https://modelcontextprotocol.io/specification/latest) – Tools/Resources/Prompts 스펙
- [MCP SDKs](https://modelcontextprotocol.io/docs/sdk) – Node, Python 등 SDK
