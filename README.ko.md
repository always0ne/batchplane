# BatchPlane

[English](./README.md)

실행 플랫폼을 통합하는 배치 통제·감사 플랫폼.

BatchPlane은 배치 등록·변경·삭제·실행·스케줄·Gate 결정·실행 이력·실패 후속처리·
감사 증거를 하나의 통제된 목록에서 운영하도록 한다. 첫 지원 플랫폼은 GitHub
Actions이며 다음 Jenkins로 플랫폼 경계를 검증한다. 다른 배치 플랫폼도 공통 제품
계약으로 검증한 어댑터를 통해 확장할 계획이다.

제품 아키텍처에는 두 에디션이 있다.

- **BatchPlane Main**: MySQL 기반 Kotlin/Spring Boot 통제 플랫폼으로 계획 중이다.
  GitHub Actions를 포함해 여러 Workspace와 플랫폼 연결을 지원하는 것이 목표다.
- **BatchPlane Lite**: 현재 구현된 GitHub native 에디션이다. 저장소·PR·Issue·댓글·
  Actions를 권한 판단 근거로 사용하며 BatchPlane 서버가 필요 없다.

두 에디션은 제품 의미와 React/Vite 제품 UI를 공유하며 런타임 초기 구성과 기준
저장소는 다르다.

구현 존재가 운영 수용을 의미하지는 않는다. Main은 계획 단계이고 Lite에는 알려진
요청·입력·조회 결함과 실제 스케줄 QA가 남아 있다.
[승인된 로드맵](docs/control-plane-migration-plan.ko.md),
[요구사항·이슈 연결](docs/requirements-traceability.ko.md),
[사용자 QA 시트](docs/user-qa.ko.md)로 잔여 작업을 추적한다.
실제 결과는 [QA 결과 양식](docs/qa-result-template.ko.md)에 기록한다.

## 개발

이 저장소는 pnpm workspace를 사용한다.

기여 전에 저장소 필수 지침 [AGENTS.ko.md](AGENTS.ko.md)와 공유 React 원칙
[frontend-engineering-principles.md](docs/frontend-engineering-principles.md)를 읽는다.

```bash
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

저장소 루트에서 `pnpm dev`를 실행한다. 내부 선행 패키지를 빌드한 뒤 TypeScript
패키지 watcher 하나와 Vite를 시작한다. 패키지 소스 변경은 자동 재빌드된다.
Ctrl-C로 둘 다 종료한다. Web 앱과 TypeScript는 소스 경로 alias나 별도 개발 plugin
없이 pnpm workspace 링크와 선언한 `exports`로 내부 패키지를 찾는다. 패키지 `dist`
디렉터리는 생성 결과이며 커밋하지 않는다.

## 코드 탐색

[Graphify](https://github.com/Graphify-Labs/graphify#installation)는 선택적인 로컬
코드 탐색 도구이며 제품 의존성·CI 필수 항목이 아니다.
[uv](https://docs.astral.sh/uv/getting-started/installation/)를 먼저 설치하고
Graphify 공식 Codex 설정을 따른다.

```bash
uv tool install graphifyy
uv tool update-shell
```

새 터미널을 열어 도구 디렉터리가 `PATH`에 반영되면 실행한다.

```bash
graphify install --platform codex
```

저장소 루트에서 모델 추출 없이 코드 전용 그래프를 만든다.

```bash
graphify extract . --code-only \
  --exclude '**/dist/**' --exclude '**/node_modules/**' \
  --exclude '**/coverage/**' --exclude 'docs/**' --exclude '*.local.*' \
  --exclude 'apps/web/src/shared/i18n/locales/**'
graphify cluster-only . --no-label
graphify codex install
```

마지막 명령은 `AGENTS.md`에 query 우선 지침을 추가하고 로컬 Codex hook 설정을
생성한다. 기존 프로젝트 지침도 계속 적용한다. 그래프 산출물과 장비별 hook 설정은
Git에서 제외한다.

```bash
graphify query "LiteSetupPage" --budget 1600
graphify explain useExecutionRunDetail
graphify path ExecutionRunDetailPage useExecutionRunDetail
graphify update .
```

Codex에서는 `$graphify query LiteSetupPage`처럼 `$graphify`로 설치된 skill을
호출한다. `$graphify .`만 입력하면 조회가 아니라 전체 그래프 생성을 요청한다.
문서·미디어는 모델 추출을 사용할 수 있다. 병렬 추출에는 Codex의 `multi_agent`
기능이 필요하다. 그래프로 관련 소스를 찾고 실제 소스를 읽는다. 관계가 없다고
미구현·결함으로 단정하지 않는다.

### Git Hook

그래프 생성 후 clone마다 한 번 공식 hook을 설치한다.

```bash
graphify hook install
graphify hook status
```

`post-commit`, `post-checkout`은 커밋·브랜치 전환 후 백그라운드에서 코드 그래프를
갱신한다. 모델 호출 없는 AST 추출이며 재생성 동안 Git을 막지 않는다. `git pull`,
`git merge`에는 Graphify hook이 없으므로 이후 `graphify update .`를 직접 실행한다.

설치기는 저장소 로컬 merge driver와 `graphify-out/graph.json`의 `.gitattributes`
항목도 등록한다. BatchPlane은 그래프 산출물을 Git에서 제외하므로 자동 커밋되지
않는다. hook은 clone 로컬이며 이 README를 pull했다고 설치되지 않는다.

Graphify 업그레이드·재설치 후 `graphify hook install`로 고정된 Python 경로를
갱신한다. 제거는 `graphify hook uninstall`을 사용한다. 재설치는 생성 hook을
교체하므로 로컬 Obsidian 내보내기 확장은 다시 적용해야 한다.

### Obsidian

공식 exporter로 기존 그래프를 내보낸다. 추가 Obsidian plugin이나 모델 추출은
필요 없다.

```bash
graphify export obsidian --dir "/path/to/your/Obsidian Vault"
```

노드·커뮤니티를 연결한 Markdown과 `graph.canvas`를 만든다. Obsidian에서 대상
vault를 열어 그래프 탐색·심볼 검색·노트 간 이동을 할 수 있다. exporter는 기존
사용자 노트·그래프 설정을 보존하고 생성 노트를 `.graphify_obsidian_manifest.json`에
추적한다. 생성 노트는 다음 내보내기 때 교체되므로 개인 주석은 별도 노트에 둔다.

단방향 내보내기이며 양방향 동기화가 아니다. 공식 Git hook은
`graphify-out/graph.json`만 갱신한다. 로컬 확장으로 기존 백그라운드 job에서
`_rebuild_code` 성공 후 내보내기를 실행할 수 있다. 현재 설정된 로컬 checkout은
커밋·브랜치 전환 시 이 확장을 사용한다. 재생성이 실패·생략되면 내보내지 않는다.
내보내기 실패는 Git을 실패시키지 않고 `~/.cache/graphify-rebuild.log`에 기록한다.

이 확장은 `.git/hooks`의 로컬 수정이며 Graphify 설정이나 저장소 배포 hook이
아니다. 다른 clone에는 별도 설정이 필요하다. pull·merge 후에는 루트에서 둘 다
직접 갱신한다.

```bash
graphify update .
graphify export obsidian --dir "/path/to/your/Obsidian Vault"
```

## 로컬 검증

BatchPlane은 Node 24 이상이 필요하다. CI와 저장소의 JavaScript Action은 Node 24를
사용한다. 버전 관리자의 단일 기준 파일은 `.node-version`이다. 전체 로컬 검증 순서:

```bash
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --exit-code -- actions/dispatcher/dist actions/gate/dist actions/schedule-request/dist actions/schedule-result/dist
VITE_BASE_PATH=/batchplane/ pnpm --filter @batchplane/web build
git diff --check
```

각 JavaScript Action은 독립 실행 가능한 Node 24 `dist/index.js` 번들을 만든다.
빌드가 추적 번들을 변경했는데 커밋하지 않았으면 Action dist diff 검사가 실패한다.
생성 dispatcher·대상·스케줄 workflow 동작은 정확한 단일 따옴표
`github.event.schedule` 표현식 등을 포함한 집중 TypeScript 테스트로 확인한다.
Go 도구 체인은 필요 없다.

이 검사는 결정적인 fixture와 생성 workflow만 확인하며 실제 GitHub 저장소 한
사이클을 증명하지 않는다. 설치·Issue/PR 쓰기·승인 증적·dispatcher·Gate·Actions
로그·cron 트리거는 아래의 별도 승인된 Lite smoke test가 필요하다.

## Lite Smoke Test

GitHub 기반 등록 흐름을 테스트하려면 BatchPlane이 등록 PR을 쓸 수 있는 private
GitHub 저장소를 만든다.

```bash
gh repo create batch --private --add-readme
```

최초 커밋이 있어야 한다. BatchPlane이 기본 브랜치에서 등록 브랜치를 만들기 때문에
`--add-readme`가 가장 간단하다.

`batch` 저장소에 대한 fine-grained GitHub PAT를 만든다.

- Repository access: `batch`만 선택
- `Actions`: 읽기 전용
- `Contents`: 읽기·쓰기
- `Issues`: 읽기·쓰기
- `Pull requests`: 읽기·쓰기
- `Metadata`: 읽기 전용

로컬 앱에서 저장소를 연결한다.

```text
http://127.0.0.1:5173/
```

`Workspace`에 입력한다.

- Owner: GitHub 사용자명 또는 조직
- Repository: `batch`
- Token: fine-grained PAT

`Check connection`으로 입력 연결을 저장·검증하고 Lite 설치 여부를 확인한다.
토큰은 `sessionStorage`에만 보관한다. `Save session`만으로 연결을 검증하지 않는다.
연결을 수정·초기화하면 설치·업데이트·정책 요청 전에 다시 검사에 성공해야 한다.
이 요청들이 연결 필드를 암묵적으로 저장하지는 않는다.

미설치 상태라면 `Workspace`에서 `Create installation request`를 선택한다.
설치 PR은 다음을 추가한다.

- `.github/workflows/batchplane-dispatcher.yml`
- `.github/workflows/batchplane-sample-target.yml`
- `.batch-governance/README.md`
- `.batch-governance/batches/.gitkeep`

실행 승인 테스트 전에 설치 PR을 머지한다. 브라우저는 설정·요청 기록을 만들지만
승인된 실행의 전달은 대상 저장소 dispatcher workflow가 수행한다.

배치 등록은 `Batches` -> `Register batch`에서 입력 후 YAML 미리보기를 확인하고
`Create registration PR`을 선택한다. 항상 Gate로 보호되는 workflow를 만든다.
경로는 배치 ID에서 도출하고 실행 환경은 `runs-on`으로 선택한다. Gate 허용 후
실행되는 명령은 지정한 배치 명령이며 스케줄은 배치 정의에 내장한다. 성공 시 생성물:

- 새 `batchplane/register/...` 브랜치
- `.batch-governance/batches/{batchId}.yml`
- `.github/workflows/{batchId}.yml`
- 선택적인 `.batch-governance/batches/{batchId}/artifacts/...` 실행 파일
- 기본 브랜치를 대상으로 한 PR

등록 승인 사이클은 `Approvals`에서 해당 PR의 `Approve and merge`로 완료한다.
성공하면 PR에 BatchPlane 승인 댓글을 남기고 기본 브랜치로 squash merge한 뒤
승인함에서 제거한다. `Batches`로 돌아와 `Refresh`하면 저장소의
`.batch-governance/batches`에 있는 승인된 정의가 보여야 한다.

스케줄 실행은 배치 등록·변경 승인에 활성 스케줄을 하나 이상 넣어 테스트한다.
승인 형상이 무인 실행을 허용하므로 회차마다 사람의 승인을 다시 받을 필요가 없다.
native 스케줄 workflow는 같은 workflow에서 실행 요청 기록·Gate 검증·명령 직전
권한 재검사·결과 기록을 수행한다. 다른 workflow를 전달하거나 승인 댓글을 만들어내지
않는다. 회차는 요청·실행·감사에 나타나지만 승인 작업으로는 나타나지 않는다.

생성 스케줄은 원래 cron과 native IANA 시간대를 유지한다. 한 배치에서 같은 cron에
서로 다른 시간대를 쓰면 문서화된 트리거 맥락으로 구분할 수 없어 거부한다. 원본
회차는 추론한 예정 시각이 아니라 저장소·배치·스케줄·native Run으로 식별한다.
native 전체·부분 재실행은 차단한다. 같은 예정 회차의 별도 Run 간 중복 제거는
보장하지 않는다. GitHub는 스케줄 실행을 지연·누락할 수 있다. 신뢰 경계와 별도
실환경 절차는 [스케줄 실행 계약](docs/schedule-execution-contract.ko.md)을 참조한다.

현재 Lite는 설치 PR, 등록 요청·승인·머지, Workspace 기반 배치 목록, 실행 요청,
실행 승인 증적, dispatcher 측 `workflow_dispatch`를 다룬다. 대상 저장소는 승인
댓글로 dispatcher를 트리거하기 전에 설치 workflow를 머지해야 한다.

첫 실행 통제 진입을 테스트하려면 `Batches`의 승인 배치에서 `Request run`을 선택한다.
성공하면 BatchPlane 실행 요청 marker, 정규 payload, SHA-256 요청 digest가 있는
Issue를 만들고 UI가 `Approvals`로 이동한다. 승인하면 첫 줄이 dispatcher 명령
(`/bgcp approve ...`)인 실행 승인 댓글을 기록한다. 이 댓글이 `workflow_dispatch`로
이어지려면 대상 저장소의 dispatcher workflow가 설치돼 있어야 한다.

dispatcher는 `workflow_dispatch` 전에 요청 Issue와 승인 댓글의 요청 ID·배치 ID·digest·승인 결정·
만료 구간·workflow 대상이 일치하는지 검사한다. 기본값은 요청자 자가승인 금지다.
한 명으로 테스트하려면 대상 `.batch-governance/workspace.yml`을
`SELF_APPROVAL_ALLOWED`로 설정할 수 있다. 승인 댓글과 Gate는 여전히 자가승인임을
명시한다. `AUTO_APPROVE`는 더 높은 완화 수준이므로 자가승인도 포함하며 자동
Workspace 정책 승인 증적을 기록한다.

참고:

- `BRAND_GUIDELINES.md`
- `docs/product-scope-and-editions.ko.md`
- `docs/control-plane-srs.ko.md`
- `docs/domain-model.ko.md`
- `docs/control-plane-architecture.ko.md`
- `docs/control-plane-ui-architecture.ko.md`
- `docs/control-plane-architecture-review.ko.md`
- `docs/platform-provider-contract.ko.md`
- `docs/gate-protocol.ko.md`
- `docs/identity-and-authorization.ko.md`
- `docs/audit-and-evidence.ko.md`
- `docs/main-lite-conformance.ko.md`
- `docs/control-plane-migration-plan.ko.md`
- `docs/adr/0001-modular-monorepo.ko.md`
- `docs/repo-mode-getting-started.ko.md`
- `docs/github-pages.md`
- `docs/i18n.md`
- `docs/github-lite-srs.ko.md`
- `docs/github-lite-technical-spec.ko.md`
- `docs/repository-rename-runbook.md`
- `examples/github-lite-demo/README.md`

## 현재 Lite Workspace 구조

```text
apps/web                 공유 React/Vite 제품 UI, 현재 Lite 런타임
packages/ui-client       제품 클라이언트 계약
packages/domain          도메인 타입·동작
packages/digest          정규 payload 도구
packages/github-lite     GitHub 전송·증적·Lite 작업
actions/gate             업무 전 인가
actions/dispatcher       승인된 수동 요청 전달
actions/schedule-request native 회차 증적
actions/schedule-result  native 회차 결과
```

현재 경계와 예정된 Main 방향은 `docs/control-plane-architecture.ko.md`에 있다.
UI·클라이언트 추출은 이미 기준선이다. 리팩터링을 반복하거나 가상 모듈을 추가하지
않고 승인된 로드맵을 따라 Main 계약·플랫폼 연동을 진행한다.

## 다국어

UI 기본 언어는 영어이며 한국어를 기본 포함한다. 새 언어는 locale JSON 리소스
기여와 지원 locale registry 갱신으로 추가한다.
