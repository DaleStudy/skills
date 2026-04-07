---
name: mcp-server
description: "mcp 서버 연결 문제를 분석하고 최신 specification 기준으로 구현을 검증한다. tools/list 또는 tools/call 오류, stdio sse http transport 이슈, resources prompts 라우팅 문제, inspector 기반 재현 테스트가 필요할 때 사용한다."
license: MIT
metadata:
  author: DaleStudy
  version: "1.0.0"
---

# MCP 원인 분석·스펙 검증

문제 재현, 최신 스펙과 구현 대조, 불일치 근거 정리, 수정 전/후 Inspector 검증

---

## 입력 요구사항 (Ask if missing)

먼저 아래 3가지만 확인

1. 작업 목적: `원인 분석` 또는 `스펙 검증`
2. 대상 코드/서버 위치: repo path, package 이름, 실행 엔트리
3. 런타임/transport: `Node(TypeScript)` or `Python`, `stdio` or `SSE/HTTP`

필요할 때만 아래 항목 추가 확인

- 재현 절차: 에러 로그, 실패 요청/응답, 기대 동작
- 점검 대상 Tool/Resource/Prompt 이름
- 배포 환경/인증 정보(원격 호출 이슈일 때만)

---

## 의사결정 규칙

1. 분석과 검증을 구현보다 우선
2. 서버 신규 생성/스캐폴딩은 범위에서 제외
3. 수정이 필요하면 기존 코드 기준 최소 변경으로 진행
4. 확정 사실과 추정 가설 분리 기록

---

## 안전 규칙

### STDIO 로깅

- stdio transport에서는 stdout 로그 출력 금지
- Node에서는 `console.log()` 대신 `console.error()` 사용
- Python에서는 `print()` 대신 `logging` 사용

### 입력/호출 검증

- 필수 입력 누락 여부 먼저 검증
- Tool handler 실행 전 schema 검증 수행
- 파일 경로 입력에서 path traversal(`../`) 차단
- 외부 API 호출에 timeout 강제

---

## 실행 절차

### Step 1. 문제 재현

- 최소 재현 시나리오 정의
- 실패 지점을 transport, tools, resources, prompts로 분류
- 재현 결과를 `확정 사실`과 `추정`으로 구분 기록

### Step 2. 최신 스펙 기준 대조

1. [MCP Specification](https://modelcontextprotocol.io/specification/latest) 먼저 확인
2. [MCP SDKs](https://modelcontextprotocol.io/docs/sdk) 문서와 사용 중인 SDK 버전 대조
3. 구현 코드와 스펙을 항목별로 1:1 매핑
   - transport 초기화/연결 방식
   - `tools/list`, `tools/call` 요청/응답 구조
   - `resources/list`, `resources/read` 노출/조회 구조
   - prompt 등록 이름, argument schema, handler 라우팅
   - 응답 포맷 `content`, `isError`
4. 불일치 발견 시 영향 범위와 수정 포인트 함께 정리

### Step 3. 수정안 정리

- 원인별 수정 순서를 우선순위로 정리
- 각 수정안의 영향 범위와 회귀 위험 명시
- 테스트 가능한 검증 케이스 함께 제시

### Step 4. Inspector 검증

- 수정 전/후 동일 시나리오로 결과 비교
- 통과/실패 기준을 체크리스트로 기록

---

## Resources / Prompts 검증 항목

- `resources/list`가 기대한 리소스를 노출하는지 확인
- `resources/read`가 실제 payload를 반환하는지 확인
- prompt 등록 이름 충돌 여부 확인
- prompt argument schema가 호출 payload와 일치하는지 확인
- handler 누락 또는 라우팅 누락 여부 확인

---

## Inspector 테스트 체크리스트

- [ ] 서버 실행 및 Inspector 연결 유지 기준을 만족하는가
- [ ] `tools/list` 결과가 기대한 tool 노출 기준을 만족하는가
- [ ] 대표 tool 1개 이상 `tools/call` 성공 기준을 만족하는가
- [ ] 응답이 `content` / `isError` 구조 기준을 만족하는가
- [ ] stdout 무오염 및 프로토콜 유지 기준을 만족하는가
- [ ] 수정 전/후 결과 차이 검증 기준을 만족하는가

---

## Error 반환 기준

아래 조건 중 하나라도 해당하면 `isError: true`로 반환

- 서버 실행 또는 연결 자체가 실패한 경우
- 필수 입력 누락으로 검증을 진행할 수 없는 경우
- 스펙 불일치가 확인된 경우
- 재현 실패로 원인 확정이 불가능한 경우
- 환경 제약으로 Inspector 테스트를 수행할 수 없는 경우

Error 응답에는 최소한 다음 항목 포함

1. 실패 단계
2. 관측된 증상
3. 필요한 추가 입력 또는 다음 조치

---

## 출력 계약 (Output Contract)

항상 아래 순서로 결과 정리

1. 문제 요약과 재현 조건
2. 확정 사실 / 추정 가설
3. 스펙 대조 결과(일치/불일치)
4. 수정 포인트와 영향 범위
5. Inspector 전/후 검증 결과
6. 남은 리스크와 후속 확인 항목

---

## Tool 반환 포맷

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
