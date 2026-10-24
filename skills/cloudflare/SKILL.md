---
name: cloudflare
description: "DaleStudy 조직의 Cloudflare 사용 규칙 (Workers 배포, 시크릿 관리, PR 미리보기, URL 형식). 다음 상황에서 사용: (1) wrangler.jsonc 또는 wrangler.toml 작업 시, (2) Worker 배포 워크플로우(deploy.yml, preview.yml) 작성·수정 시, (3) Worker에 시크릿이나 환경 변수를 추가·변경할 때, (4) PR 미리보기 설정 시, (5) 페이지 URL·트레일링 슬래시·canonical·sitemap 작업 시, (6) 'Cloudflare', 'wrangler', 'trailing slash', 'html_handling', 'Workers', 'secret put', 'Workers Builds', 'wrangler-action' 키워드가 포함된 작업 시"
license: MIT
compatibility: Requires wrangler CLI
metadata:
  author: DaleStudy
  version: "1.2.0"
---

# Cloudflare

## Workers 배포와 시크릿

DaleStudy는 오픈소스 커뮤니티라 모든 기여자에게 Cloudflare 접근 권한을 줄 수 없다. 그래서 배포와 시크릿을 **GitHub 쪽에 모은다**. 빌드 로그는 누구나 Actions에서 볼 수 있고, 시크릿은 GitHub secret 한 곳에서 관리한다.

### 규칙

1. **배포는 GitHub Actions로만 한다.** `cloudflare/wrangler-action`으로 배포하고, Cloudflare 대시보드의 Workers Builds(Git 연결)는 쓰지 않는다. 둘을 함께 켜면 한 번 머지에 두 번 배포된다.
2. **시크릿의 원본은 GitHub secret이다.** 여러 저장소가 쓰는 값은 조직 secret, 한 저장소만 쓰는 값은 저장소 secret에 둔다. 배포 워크플로우가 Worker에 넣는다.
3. **Worker secret을 직접 바꾸지 않는다.** `wrangler secret put`이나 대시보드로 넣은 값은 같은 이름이면 다음 배포 때 GitHub 값으로 덮이고, 다른 이름이면 GitHub에 기록 없이 Worker에만 남는다.
4. **공개해도 되는 값은 `wrangler.jsonc`의 `vars`에 둔다.** App ID, Client ID, 공개 URL 같은 값이다. 같은 이름을 vars와 secret에 함께 두지 않는다.
5. **로컬 개발 값은 `.dev.vars`에 둔다.** 커밋하지 않는다.

### 시크릿 추가 절차

새 시크릿 `FOO_API_KEY`가 필요하면:

1. 조직에서 이미 쓰는 값인지 먼저 확인한다: `gh secret list --org DaleStudy`
2. 없으면 운영진에게 GitHub secret 등록을 요청한다. 직접 권한이 있다면 `gh secret set FOO_API_KEY --org DaleStudy --repos <repo>` 또는 `--repo DaleStudy/<repo>`
3. `wrangler.jsonc`의 `secrets.required`에 이름을 추가한다 (쓰는 저장소만)
4. `deploy.yml`에서 Worker로 넘기는 목록에 추가한다

### 배포 워크플로우

```yaml
# .github/workflows/deploy.yml
name: Deploy 🚀

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    environment:
      name: production
      url: https://example.dalestudy.com
    steps:
      - uses: actions/checkout@v{N}
      - uses: oven-sh/setup-bun@v{N}
      - run: bun install --frozen-lockfile
      - run: bun run build

      - name: Deploy
        uses: cloudflare/wrangler-action@v{N}
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          packageManager: bun
          secrets: |
            FOO_API_KEY
        env:
          FOO_API_KEY: ${{ secrets.FOO_API_KEY }}
```

- `CLOUDFLARE_API_TOKEN`은 조직 secret이다. 저장소마다 새 토큰을 만들지 않는다.
- 시크릿이 없는 Worker는 `secrets`와 `env`를 뺀다.
- 액션 버전은 `github-actions` 스킬대로 최신 메이저를 확인해 쓴다.

### PR 미리보기

PR마다 Workers Previews(`wrangler preview --name pr-<번호>`)로 미리보기를 띄운다. 주소는 job의 `environment`로 GitHub 배포에 기록되어 PR 타임라인에 "deployed to previews"와 View deployment 버튼으로 나타난다. 댓글을 달지 않고, 오래된 미리보기는 Cloudflare가 Worker당 개수 제한에 맞춰 정리하므로 지우지 않는다.

```yaml
# .github/workflows/preview.yml
name: Preview 🔍

on:
  pull_request:

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  preview:
    # 포크 PR에는 secret이 전달되지 않으므로 같은 저장소의 PR만 미리보기를 만든다
    if: >
      github.event.pull_request.head.repo.full_name == github.repository &&
      github.actor != 'dependabot[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    # 미리보기 주소는 GitHub 배포(previews 환경)로 PR에 표시된다. 오래된 미리보기는 Cloudflare가 정리한다
    environment:
      name: previews
      url: ${{ steps.preview.outputs.preview-url }}
    steps:
      - uses: actions/checkout@v7

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - run: bun run build

      - name: Deploy preview
        id: preview
        uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          packageManager: bun
          command: preview --name pr-${{ github.event.pull_request.number }} --ignore-base-config
```

운영 배포 job에도 `environment: { name: production, url: <운영 주소> }`를 두면 저장소의 Deployments 탭에서 두 환경의 이력을 함께 볼 수 있다.

미리보기는 운영 설정을 상속하지 않는다. `wrangler.jsonc`에 `previews` 블록을 두고, 미리보기에 필요한 `vars`와 바인딩을 다시 적는다. 필요한 게 없으면 빈 블록(`"previews": {}`)을 둔다. 운영 D1을 미리보기와 같이 써도 되면 같은 데이터베이스를 바인딩하고, 분리해야 하면 미리보기용 D1을 따로 둔다 ([feedback](https://github.com/DaleStudy/feedback/blob/main/.github/workflows/preview.yml) 참고). 미리보기에는 운영 시크릿도 들어가지 않는다. 미리보기에 시크릿이 필요하면 `wrangler preview --secrets-file`로 넣는다 (feedback 참고). wrangler 4.136.3 이상이 필요하다 (wrangler-action의 `preview-url` 출력).

`versions upload`로 미리보기를 만들지 않는다. 운영 Worker에 배포되지 않은 버전이 쌓여, `secrets:` 입력으로 배포할 때 `code 10214`로 실패한다.

웹훅·봇 서버처럼 미리보기로 확인할 화면이 없는 Worker는 미리보기를 두지 않는다.

### 안티 패턴

```bash
# ❌ Worker secret을 직접 넣기 - 다음 배포 때 덮이고, 다른 운영진은 값의 출처를 모른다
wrangler secret put FOO_API_KEY
```

- ❌ Cloudflare 대시보드에서 저장소를 연결해 Workers Builds 켜기
- ❌ 저장소마다 Cloudflare API 토큰 새로 만들기
- ❌ 공개 값(Client ID 등)을 secret으로 두기 - `vars`로 충분하다

> 참고: [GitHub Actions로 배포](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy)

## URL 형식 (트레일링 슬래시)

DaleStudy 사이트의 정규 URL은 **슬래시 없는 형태**다 (`/about`, 도메인 루트 `/`만 예외). API·웹훅·OAuth 콜백 경로가 모두 이 형태로 외부에 등록되어 있고, 앱 프레임워크(TanStack, React Router)도 이 형태로 링크를 만들기 때문이다.

정적 파일로 서빙하는 페이지는 Cloudflare 기본값이 `about/index.html`을 `/about/`에서 서빙하므로, 설정으로 맞춘다.

| 구성 | 설정 |
| --- | --- |
| Workers 정적 에셋 (prerender, SPA, Astro 모두) | `wrangler.jsonc`의 `assets.html_handling: "drop-trailing-slash"` |
| Astro | 위 설정과 함께 `astro.config.mjs`에 `trailingSlash: "never"`, `build: { format: "file" }` |
| TanStack Start·Router, React Router (SSR) | 기본값 그대로 |

- canonical, sitemap, 내부 링크는 모두 슬래시 없는 형태로 쓴다.
- Workers 정적 에셋의 리다이렉트는 307(임시)이고 바꿀 수 없다. 리다이렉트가 일어날 일 자체를 줄이도록 링크를 정규 형태로 맞춘다.
- 확인: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n'`로 주요 페이지를 두 형태로 요청해, 슬래시 없는 쪽만 200이고 슬래시 있는 쪽은 그쪽으로 리다이렉트되는지 본다.
