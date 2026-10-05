# GitHub Lite 기술 명세

[English](./github-lite-technical-spec.md)

GitHub Lite의 구현 계약이다. 공통 도메인·Gate·정합성 계약을 GitHub 기반 권한
근거에 맞게 구체화하며 제품 의미를 재정의하지 않는다.

NATIVE_SCHEDULE_V2, native 시간대 생성, 별도 결과 Action은 구현했고 실환경
수용은 #202 대기다. 불변 릴리스 참조는 첫 외부 릴리스의 #196 작업이다. 준비
상태를 구분하며 전결 스케줄 호환 계층을 도입하지 않는다.
[추적표](./requirements-traceability.ko.md)에 남은 결함이 있다.

## 제품 라우팅 경계

공유 React 라우터는 실행 조회·설정에 `/executions`, `/executions/:executionId`,
`/executions/failures`, `/workspace`를 제공한다. 실행 경로 파라미터는 기존 불투명
제품 클라이언트 ID다. 화면·경로명 변경이 플랫폼 ID·증적·회차·attempt를 바꾸지 않는다.
GitHub Pages 하위 basename 배포를 포함해 링크에서 기존 필터·query 맥락을 유지한다.

현재 변경·실행 요청 URL·query mode는 그대로다.
[통합 요청 명세](./unified-request-feature-spec.ko.md)는 리팩터링 이후로 명시적으로
유예한다. 목표 경로에서 새 Issue/PR 매핑·승인 계약을 추론하지 않는다. 아래 현재
등록·실행·Gate·증적 계약을 계속 적용한다.

## 저장소 구조

통제·감사 기록은 대상 GitHub 저장소에 둔다.

```text
.batch-governance/
  workspace.yml
  batches/
    {batchId}.yml
    {batchId}/
      artifacts/
        {uploadedExecutionFile}
.github/
  workflows/
    {batchId}.yml
    batchplane-dispatcher.yml
```

`{batchId}` 경로는 제출된 ID에서 도출해야 한다. `new-batch.yml` 같은 임시 경로를
영속 저장하지 않는다.

## 설치 흐름

공유 Workspace는 플랫폼 중립 `BatchPlaneClient`를 사용한다. 라우터는 Lite 연결
편집기를 포함한 Page를 직접 렌더링한다. 설정 전용 Route 래퍼가 편집 상태를 소유하지
않는다. GitHub 자격 증명은 편집기가 소유하며 세션 저장소에만 있고 제품 계약에
나타나지 않는다. Runtime은 현재 Lite 연결을 제공한다. 설치 템플릿·필수 파일 검사·
관리 workflow 비교·설치/업데이트/정책 요청 생성은 React가 아니라
`packages/github-lite` 책임이다. 어댑터가 표시할 제품 상태·불투명 원본 참조를
반환하며 Page는 저장소 산출물을 해석하지 않는다.

편집기는 작성 중 값·저장 세션 표시를 소유한다. 연결 변경은 검사·명령 수명을
무효화한다. 확인은 현재 연결을 명시적으로 저장 후 검사한다. 설치/업데이트/정책
핸들러는 현재 검증 결과를 요구하며 편집값을 저장하거나 불투명 prepare callback을
받지 않는다. 편집·저장·해제·확인 실패는 이전 검증을 취소하고 낡은 비동기 결과가
복원하지 못하게 한다. 언어 변경은 재조회 없이 편집·제품 상태를 보존한다.

Workspace 정책과 연결별 설정은 다른 제품 책임이다. 단일 세션 구현이 멀티
Workspace를 증명하거나 Lite 브라우저 인증과 Main 엔진 자격 증명을 합치지는 않는다.
향후 경계는 [프런트엔드 원칙](./frontend-engineering-principles.md#workspace-and-platform-extension-boundary)에 있다.

설치·업데이트·정책 요청 생성은 요청 증거를 즉시 반환하며 적용 상태·정책을 바꾸지
않는다. 적용 상태의 기준은 기본 브랜치 검사다.

Lite는 설정 PR로 설치한다. 제품 동작이 브랜치·PR 처리를 Lite 어댑터에 위임하고
maintainer가 GitHub에서 검토·반영한다. 실행 통제는 그 반영 이후 시작한다.
기본 브랜치 필수 검사 파일:

```text
.github/workflows/batchplane-dispatcher.yml
.github/workflows/batchplane-sample-target.yml
.batch-governance/README.md
.batch-governance/workspace.yml
.batch-governance/policies/role-mapping.yml
.batch-governance/batches/.gitkeep
```

리브랜딩 전 설치에는 `.github/workflows/batchtrail-dispatcher.yml`,
`.github/workflows/batchtrail-sample-target.yml`도 legacy 동등 파일로 인식한다.
이전 파일명이라는 이유만으로 두 번째 dispatcher를 만들면 안 된다.

하나 이상 누락되면 다음 브랜치를 만들 수 있다.

```text
batchplane/install/lite-{yyyyMMddHHmmss}
```

PR 제목:

```text
Install BatchPlane Lite
```

브라우저는 기본 브랜치에 직접 설치 파일을 쓰지 않는다. 저장소 native review·머지
규칙이 bootstrap 신뢰 근거로 남도록 PR을 만든다.

설치됐으나 관리 workflow가 낡았으면 다음 업데이트 브랜치를 만들 수 있다.

```text
batchplane/workspace/update-{yyyyMMddHHmmss}
```

PR 제목:

```text
Update BatchPlane Workspace workflows
```

생성 workflow만 불일치를 탐지한다.

```text
.github/workflows/batchplane-dispatcher.yml
.github/workflows/batchplane-sample-target.yml
```

정규 파일 내용이 현재 템플릿과 다르거나 legacy 경로가 남았으면 불일치다. 현재
정규 내용을 쓰고 대체 대상 legacy workflow는 업데이트 브랜치에서 삭제한다.

`.batch-governance/workspace.yml`, `.batch-governance/policies/role-mapping.yml`
같은 저장소 소유 통제 설정을 비교·덮어쓰지 않는다. 각자의 정책·설정 흐름으로만 바꾼다.

## Workspace 정책

승인 동작의 저장소 근거:

```text
.batch-governance/workspace.yml
```

기본 파일:

```yaml
apiVersion: "batchplane.io/v1"
kind: "WorkspacePolicy"
metadata:
  id: "default"
spec:
  approval:
    mode: "SELF_APPROVAL_BLOCKED"
```

지원 `spec.approval.mode`:

- `SELF_APPROVAL_BLOCKED`: 기본 직무 분리. 요청자·승인자는 달라야 한다.
- `SELF_APPROVAL_ALLOWED`: 적격 배치 변경·수동 실행의 자가승인을 허용한다. 승인은
  명시적 감사 증거이며 Gate는 인가·대상 digest·해당하는 dispatcher 행위자·배치
  정의를 계속 검증한다.
- `AUTO_APPROVE`: 자동 Workspace 정책 승인. 생성 시
  `approvalType=WORKSPACE_AUTO_APPROVED`, `approvalMode=AUTO_APPROVE`,
  `approvalSource=WORKSPACE_POLICY`의 명시적 증거를 남긴다. 적격 등록·변경·삭제·
  수동 실행 의도에 적용한다. Gate는 머지 정책이 `AUTO_APPROVE`일 때만 실행 증거를
  허용한다. `workflow_dispatch`는 dispatcher 책임이고 브라우저 직접 전달은 금지다.
  가장 높은 완화 수준이며 `SELF_APPROVAL_ALLOWED` 동작도 포함한다.

정책·역할 매핑·설치 요청은 제안 전 유효 정책으로 평가한다. 제안 내용이 자기 자신을
인가·자동 머지하면 안 된다. 실패 후속처리에서는 완화 두 모드가 적격 관리자의
명시적 자가검토를 허용하지만 실패 후 검토를 꾸며내지는 않는다. 종결 결정·공백 아닌
사유는 필수다.

정책 파일이 없으면 UI·Gate는 `SELF_APPROVAL_BLOCKED`로 취급한다. UI 로컬 설정이
정책을 약화하면 안 되며 Gate는 Actions에서 같은 결정을 독립적으로 강제해야 한다.

Workspace에 선택 설정을 제공할 수 있지만 저장은 정책 파일 변경 PR을 만들어야 한다.
머지가 활성화 단계다. 완화는 로컬 편의 switch가 아닌 제품 정책이며 직무 분리를
줄이지만 요청·승인 출처·dispatcher·Gate·실행 연결은 계속 감사 가능해야 한다.

## 배치 정의

저장소 문서는 Lite 저장·실행 계약이지 공유 제품 `BatchDefinition`이 아니다.
제품 식별·소유권·업무 상태·스케줄은 GitHub workflow/ref/runner와 독립적이다.
어댑터가 타입 플랫폼 설정을 문서·생성 workflow로 매핑한다. UI는 표시할 실행
정보를 받으며 YAML을 파싱하거나 표시값으로 권한 근거를 선택하지 않는다.

등록·변경은 한 Page·미리보기·제출 흐름에 공통 업무 입력과 타입 GitHub 설정을
조합한다. 임의 JSON map이나 명령형 form ref에 플랫폼 입력을 숨기지 않는다.
상세·실행 요청에도 플랫폼·명령·runner·형상·파일 정보를 유지한다. 입력 소유권
분리가 두 번째 UI나 범용 폼 프레임워크를 만들지 않는다.

UI 클라이언트는 현재 GitHub Actions의 타입 입력 계약을 정의할 수 있다. REST DTO나
저장소 파일 스키마는 아니다. runner label은 명시적 플랫폼 편집 데이터다. 일반
환경 필드로 이름만 바꿔도 이식 가능해지지 않는다. 표시 모델은 파일명·위치를
보존하지만 이를 인가 증거로 해석하지 않는다.

정의는 결정적인 YAML로 직렬화한다.

```yaml
apiVersion: batchplane.io/v1
kind: BatchDefinition
metadata:
  id: "payment.daily-close"
  name: "Daily Close"
spec:
  owner: "ops-team"
  domain: "payments"
  environment: "PROD"
  criticality: "HIGH"
  status: "ACTIVE"
  workflow:
    path: ".github/workflows/payment.daily-close.yml"
    ref: "main"
  gateRequired: true
```

Lite 등록 배치의 `gateRequired`는 항상 `true`다.

### 저장소 YAML

공개 `yaml` v2 document API로 구문을 읽고 줄·열 진단을 제공한다. 따옴표 scalar,
block sequence, 여러 줄 문자열, 주석·들여쓰기는 두 칸 전용 자체 parser가 아니라
YAML 문법을 따른다. 파싱 후에도 파일 스키마·현재 인가/Gate 검사는 필요하다.
파싱 성공은 인가가 아니다. Web·Action은 다른 해석의 fallback 대신 같은 구현을 쓴다.

새 설정 요청은 공개 API·결정적 출력 옵션으로 직렬화한다. API 버전·필드·증적 의미는
같고 따옴표·sequence 배치는 이전 바이트 배열을 재현할 필요가 없다. 이 리팩터링은
기존 파일·Issue·PR을 자동 재포맷하지 않는다. 승인 검증은 재파싱·재직렬화가 아니라
원본 바이트를 해싱한다. 순수 포맷은 업무 변경이 아니며 과거 요청은 재생성 없이
검증 가능해야 한다. workflow 템플릿·cron 변환·정규 JSON digest는 별도이며 여기서 재작성하지 않는다.

저장된 Node 24 번들은 독립 실행 가능하다. ESM 빌드는 `yaml`의 CommonJS 의존성에
Node `createRequire(import.meta.url)`을 제공한다. runner에서 workspace 패키지를
설치하지 않는다. 직접 번들 실행·재빌드 일치는 모두 로컬 검증에 포함한다.

## 생성 배치 Workflow

수동 `batchplane-gate` -> `run-batch`와 활성 일치 스케줄별 통제·업무·결과 경로를
만든다. `run-batch`는 `needs: batchplane-gate`를 선언한다.

현재 [Gate Action](../actions/gate/action.yml)은 허용을 검증하고 결정·사유·검증 SHA를
반환한다. `operation: START | COMPLETE` 입력이나 범용 `batchplane-complete` job은
없다. 별도 [schedule-result Action](../actions/schedule-result/action.yml)이 정확한
회차·attempt·스케줄별 job 결과를 기록한다. 통제·결과 쓰기 권한은 따로 주고 업무는
읽기 전용이다. 수동 결과는 native 실행·Gate 증거에서 도출한다. 결과가 없다고 업무
실패를 꾸며내지 않는다.

배치 ID·요청 ID가 포함된 실행 이름:

```yaml
run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}
```

수동 `workflow_dispatch` 입력:

```yaml
request_id:
  required: true
batch_id:
  required: true
request_digest:
  required: true
```

활성 스케줄이 있으면 `on.schedule`과 동일 Run의 스케줄별 경로도 생성한다.
필수 동작:

- `github.event_name == 'schedule'`일 때만 수행
- 실제 플랫폼 이벤트로 등록 cron 일치 확인
- 연중 DST 대안 없이 native cron·시간대 생성
- 같은 cron·다른 시간대는 모호한 선택 대신 거부
- 허용 전 원본 Run에 결합된 요청·Gate 증적 기록
- 통제와 업무 직전에 승인 형상 검증기 사용
- 과거 upstream output이 남은 업무 전용 재실행까지 실제 attempt가 1보다 크면 거부
- 검증 SHA checkout, Issue 쓰기 통제/결과 권한과 읽기 업무 권한 분리
- dispatcher·승인 댓글 없이 실제 스케줄 job·attempt 결과 기록

통제 job은 명령을 실행하지 않는다. 식별·쓰기 실패·정확한 연결 규칙은
[스케줄 계약](./schedule-execution-contract.ko.md)에 있다. 업무 job은 선택 runner에서
배치 명령을 실행한다. 업로드 파일은 저장소 산출물로 커밋되어 checkout 후 사용할 수 있다.

Gate는 기본적으로 직접 재실행을 거부한다. `GITHUB_RUN_ATTEMPT`가 `1`보다 크면
`RERUN_NOT_AUTHORIZED`다. 통제 배치 재수행에는 새 실행 요청이 필요하다. 자동
재시도·실패 요청 재사용은 승인하지 않았다.

Gate는 dispatch 입력만 믿지 않는다. 수동 workflow는
`github-token: ${{ secrets.GITHUB_TOKEN }}`을 전달하며 `issues: read`로 검사한다.

- 현재 workflow 행위자가 dispatcher 자동화(기본 `github-actions[bot]`)인지
- 제출 `request_id`에 대한 `batchplane:execution-request` Issue marker 존재
- marker의 `batch_id`, `request_digest`, `REQUESTED` 상태 일치
- `/bgcp approve `로 시작하고 `decision=APPROVED`의 일치
  `batchplane:execution-approval` marker가 있는 댓글 최소 하나 존재

스케줄 Gate는 실행 승인 댓글을 찾지 않는다. 현재 머지 정의·내장 스케줄 형상·정의
commit SHA·생성 workflow 대상·`github.event.schedule`·Run 식별·
`github.run_attempt == 1`을 검증한다. 비활성·삭제·대체·형상 불일치·native 이벤트
불일치면 거부한다. 신뢰할 예정 시각이 있으면 분석용으로 유지하지만 플랫폼 지연만으로
다른 승인으로 재해석하지 않는다.

## 실행 요청 Payload

수동 payload:

```json
{
  "apiVersion": "batchplane.io/v1",
  "kind": "ExecutionRequest",
  "metadata": {
    "requestId": "btr-20260509010203-payment.daily-close-abcdef12",
    "batchId": "payment.daily-close"
  },
  "spec": {
    "requestedBy": "developer",
    "requestedAt": "2026-05-09T01:02:03.000Z",
    "expiresAt": "2026-05-09T02:02:03.000Z",
    "reason": "Manual request from BatchPlane Lite.",
    "batch": {
      "name": "Daily Close",
      "owner": "ops-team",
      "domain": "payments",
      "environment": "PROD",
      "criticality": "HIGH"
    },
    "execution": {
      "runsOn": "ubuntu-latest",
      "command": "echo mock batch",
      "gateRequired": true
    },
    "workflow": {
      "path": ".github/workflows/payment.daily-close.yml",
      "ref": "main"
    }
  }
}
```

정규 JSON payload로 digest를 계산한다. 미리보기·생성에는 작성값 `requestedBy`가
아닌 인증된 GitHub login을 사용한다. 승인 쓰기·dispatcher·수동 Gate(자동승인 포함)
전에 표시 `Requested by`와 정규 `spec.requestedBy`가 실제 Issue 작성자
`user.login`과 일치해야 한다. 없거나 다르면 차단하되 기존 요청은 승인 불가 상태로
조회할 수 있다. 자가승인을 포함한 login 비교는 payload·digest 입력을 바꾸지 않고
대소문자를 무시한다. 실제 native `schedule` 이벤트만 회차 인가를 사용한다.
payload의 `SCHEDULE` 주장이 수동 요청자 검증을 우회할 수 없다.

UI는 정규 payload로 수행 내용을 보여준다. 실행 맥락은 단순 표시 메타데이터가
아니라 승인 증거다.

## 승인 댓글 계약

제품 코드는 등록·수정·삭제를 `ChangeRequest`라 부른다. 소스 용어 변경이 저장
증적을 이전하지 않는다. `governedChangeId`, `batchplane:governed-change-*`,
`batchplane.io/governed-change/v2`의 철자·digest 의미와 경로·URL은 유지한다.

결정 댓글은 감사 증거이지 인가 토큰이 아니다. 반영·머지는 현재
`.batch-governance/workspace.yml`과 역할 매핑을 다시 읽고 현재 모드로 재인가한다.
`authorizationRevisionSha`는 과거 맥락을 보존할 뿐 회수된 역할·강화된 자가승인
규칙을 되돌릴 수 없다.

결정 시 검증한 head 정의로 workflow를 재구성하고 내용을 정확히 비교한다.
REGISTER·CHANGE·DELETE의 정의/workflow 전이는 각각 `null -> digest`,
`digest -> digest`, `digest -> null`이다. 선택 파일은 보존된 불투명 기준 경로나
정규 `.batch-governance/batches/{batchId}/artifacts/`에 한정한다. 다른 파일은
통제 산출물에 들어올 수 없다.

실행 승인 댓글 첫 줄:

```text
/bgcp approve requestDigest=sha256:...
```

함께 기록할 구조화 marker:

```text
<!-- batchplane:execution-approval
decision=APPROVED
requestId=...
batchId=...
requestDigest=...
approvalMode=SELF_APPROVAL_ALLOWED
selfApproval=true
-->
```

유효 정책을 알면 `approvalMode`를 기록하고 요청자·승인자가 같을 때만
`selfApproval=true`를 기록한다. Gate는 marker만 믿지 않고
`.batch-governance/workspace.yml` 정책 파일을 읽는다.
유효 모드가 `SELF_APPROVAL_ALLOWED` 또는 `AUTO_APPROVE`로 적격 자가승인을
허용할 때만 수용한다.

dispatcher 검사:

- 명령이 `approve`인지. 현재 `retry-dispatch` 지원은 아래에 기록한 #224 제거 대상 불일치다.
- 이벤트 댓글에 `batchplane:execution-approval`과 승인 결정이 있을 때만 처리 가능한 명령
- 요청 증거 존재
- 승인 증거 존재
- 요청 상태 `REQUESTED`
- 미만료
- 요청·승인 `requestId` 일치
- 요청·승인 `batchId` 일치
- 요청·승인 digest 일치
- workflow 경로·ref 존재

검사 이후에만 `workflow_dispatch`를 호출한다.

## Dispatcher Workflow 계약

대상 저장소에는 수동 승인 댓글을 받아 `actions/dispatcher`를 호출하는 workflow가
필요하다. 최소 정의:

```yaml
name: BatchPlane Dispatcher

on:
  issue_comment:
    types: [created]

permissions:
  actions: write
  contents: read
  issues: write

concurrency:
  group: batchplane-dispatch-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  dispatch-approved-request:
    if: >-
      github.event.issue.pull_request == null &&
      startsWith(github.event.comment.body, '/bgcp approve requestDigest=') &&
      contains(github.event.comment.body, '<!-- batchplane:execution-approval') &&
      contains(github.event.comment.body, 'decision=APPROVED') &&
      (contains(github.event.issue.labels.*.name, 'batchplane:execution-request') ||
       contains(github.event.issue.labels.*.name, 'batchtrail:execution-request'))
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch approved BatchPlane execution
        uses: always0ne/batchplane/actions/dispatcher@main
        with:
          issue-number: ${{ github.event.issue.number }}
          comment-id: ${{ github.event.comment.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

현재 저장소 참조는 `always0ne/batchplane`이다. `always0ne/batchtrail`을 쓰는
이전 대상은 설정 산출물 재생성 전까지 GitHub 저장소 redirect에 의존한다.

`@main`은 개발 템플릿에서만 허용한다. 운영 게시 템플릿은 #196에 따라 Gate·
dispatcher·회차·완료 Action을 승인된 불변 tag·commit SHA로 고정한다. 현재 검사·
업데이트 기능이 불변 운영 게시·롤백·브랜치 보호까지 완료했다는 뜻은 아니다.

GitHub는 모든 `issue_comment.created`에 workflow run을 만든다. 일반 대화·PR
검토·설명·변경 요청·marker 없는 명령형 댓글에는 dispatcher job을 건너뛰어야 한다.
Action도 적격 검사를 반복하며 승인 증거가 아니면 실패 증거 쓰기 없이
`IGNORED_COMMENT`를 반환한다.

Lite 브라우저는 통제 배치를 직접 전달하지 않는다. 스케줄은 두 번째 workflow·
dispatcher를 사용하지 않고 native Run 안에서 업무 전후 요청·Gate·결과를 남긴다.
스케줄 증거·댓글은 수동 승인이 아니다. 승인처럼 보이는 댓글을 주더라도 dispatcher는
스케줄 요청을 제외해야 한다.

dispatcher 책임:

- 이벤트 댓글 읽기
- 실행 요청 Issue body 읽기
- BatchPlane 증적 검증
- 같은 Issue의 전달 시도 직렬화
- `batchplane:dispatching`, `batchplane:dispatched` 상태 증거가 있는 요청 무시
- `request_id`, `batch_id`, `request_digest`로 대상 workflow 호출
- 성공·실패 증적 기록

Issue label·댓글 상태:

- 전달 전 `DISPATCHING` `batchplane:bgcp:dispatcher` marker와 `batchplane:dispatching`
- 성공 후 `DISPATCHED` `batchplane:bgcp:dispatcher` marker와 `batchplane:dispatched`
- 실패 시 `DISPATCH_FAILED` `batchplane:bgcp:dispatcher` marker와 `batchplane:dispatch-failed`
- 현재는 `DISPATCH_FAILED` 후 `retry-dispatch`를 수용한다. #224에서 제거할 알려진
  정책 불일치이지 목표 계약이 아니다. 확인된 실패는 종결·새 요청이며 전달 불명은
  확인된 실패가 아니다.

## 변경 요청 승인 상세 계약

등록·변경 상세는 승인 대기열의 요청을 읽고 통제 파일 변경 요약을 보여준다.
정의·workflow·선택 파일 경로마다 다음을 비교한다.

- 기준 ref (`pullRequest.base`)
- 등록 브랜치 ref (`pullRequest.head`)

파일을 `ADDED`, `UPDATED`, `UNCHANGED`, `MISSING_HEAD`로 분류한다. 삭제 요청의
`MISSING_HEAD`는 사용자에게 삭제 파일로 표시한다. 필수 화면 요소:

- 외부 원본 메타데이터·링크
- 검토 상태: 열림·승인 후 머지 대기·머지·반려·닫힘
- 통제 점검표
- 파일 상태 요약·head 형상 미리보기
- 새로고침

삭제는 같은 계약의 `DELETE` 유형이다. 등록·변경·삭제 Page는 제품 클라이언트를
호출하고 Lite 어댑터가 브랜치·통제 파일 반영·PR을 만든다. 기준 브랜치에 정의 또는
workflow가 없으면 부분 삭제 PR 대신 요청을 차단한다.

기본 브랜치에 정의가 없으면 머지된 변경 PR에서 배치 ID의 최신 `DELETE`를 찾아
보관 형상을 복원할 수 있다. 어댑터는 v2 증적을 읽고 `baseRevisionSha`의
`.batch-governance/batches/{batchId}.yml`을 가져와 `beforeDigest`와 비교한다.
일치한 정의만 검증된 보관 형상으로 반환한다. 배치 정보·workflow·runner·명령·
내장 스케줄·원본 요청 위치를 보존한다.

PR body는 표시 요약이지 보관 내용의 기준이 아니다. 잘못되거나 편집된 증거,
누락된 기준 형상/파일, digest 불일치는 추론한 배치 필드 없이 명시적 확인 불가를
반환한다. 검증 가능한 v2가 없는 legacy 삭제도 이 계약에서는 확인 불가다. 실행
Issue·workflow run은 별도 증거로 남아 배치 ID로 조회할 수 있어야 한다.

같은 요청 ID·배치 ID·digest의 `DISPATCHING`·`DISPATCHED`가 있으면 중복 승인
댓글로 두 번째 `workflow_dispatch`를 호출하지 않는다.

## 변경 결과 인계와 GitHub 지연

변경 응답은 즉시 인계할 신뢰 근거다. 등록·변경·삭제는 반환된 내부 상세로 직접
이동한다. 기존 실행 요청 흐름은 승인함 목록에서 확인할 때까지 반환 Issue를
`sessionStorage`에 유지할 수 있다.

같은 Issue가 목록 API에 나오거나 승인·반려를 완료하면 인계 항목을 제거한다.
브라우저를 통제 진실의 원본으로 삼지 않으면서 API 반영 지연에도 기존 실행 흐름을
결정적으로 유지한다.

`CHANGE`의 새 `governedChangeId`는 감사 형상 marker이며 자체로 유효 업무 변경이
아니다. `BatchPlaneClient.previewBatchChange`의 `hasEffectiveChanges`를 제출
상태와 어댑터 변경 검사에 함께 사용한다. YAML에 marker 바이트 차이가 보여도
업무 동작·정의·스케줄·workflow·파일이 안 바뀌면 브랜치·요청을 만들지 않는다.

선행 통제는 배치 전체의 생성 제한이다. 열린 변경의 `OPEN`, `APPROVED_PENDING_MERGE`는
같은 배치의 등록·변경·삭제를 차단한다. 실행의 `REQUESTED`, `APPROVED`,
`DISPATCHING`도 차단하지만 `DISPATCH_FAILED`, `DISPATCHED`, `GATE_BLOCKED`,
`REJECTED`는 차단하지 않는다. 생성 전에 확인하지만 브라우저 간 확인·생성은
원자적이지 않다. 이 변경은 잠금·controller를 추가하지 않으며 신뢰할 조율은 향후
Main/R2-B 작업에 속한다.

## 실행 상세 계약

실행·실패 Page는 조회·요청 시 로그·후속 명령에 중립 `BatchPlaneClient`를 사용한다.
어댑터가 대상 저장소 Actions API를 읽고 제품 실행 기록으로 변환한다. React가
runtime 생성·토큰 읽기·댓글 파싱·job 이름으로 Gate/업무 역할 추론을 하지 않는다.

- workflow와 수동 `workflow_dispatch`·native `schedule` 실행 목록
- 실행 맥락용 workflow 목록에서는 YAML에 `workflow_dispatch`가 없는 항목 제외
- run ID로 특정 실행 조회
- 보고된 attempt의 job, Gate·업무 결론, Gate step 시각 조회
- 수동은 명시 요청 증거, 스케줄은 원본 회차·스케줄별 job·실제 attempt로 연결.
  같은 배치의 첫 요청만으로는 부족

생성 workflow의 필수 이름:

```yaml
run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}
```

Actions에서도 연결을 읽을 수 있고 서버 DB 없이 어댑터가 복원할 수 있다.
실행 상태 매핑은 통제·업무 실패를 구분한다.

- 실제 Gate job 로그에 저장소·run ID·attempt·실제 job명·관찰된
  `Verify approved execution evidence` 시간 구간이 일치하는 구조화 `DENY`가
  정확히 하나 있을 때만 `BLOCKED`.
- 일치하는 구조화 `ALLOW`와 후속 업무 실패는 `FAILED`.
- 누락·조회 불가·잘림·손상·모호·불일치 Gate 로그는 검증 불명. 일치 `DENY` 없는
  Gate job 실패를 인가 거부·업무 실패로 표시하지 않음.
- 성공 완료 job은 `SUCCEEDED`.
- 진행 상태는 `QUEUED`, `RUNNING`.
- Gate가 차단을 입증하지 않으면 취소·건너뜀은 `CANCELED`.

상세에는 Actions 링크·job 요약·응답 `html_url`이 있으면 job 로그 링크를 제공한다.
Gate·업무를 따로 표시해 통제 로그부터 확인할 수 있게 한다. 권한 실패는 원시 API
오류 대신 Actions 읽기 권한 안내를 제공한다. 인라인 로그는 job endpoint에서
필요 시 읽고 원문은 UI 휘발 상태에만 둔다. 표시량 제한·행 필터·다운로드를 제공하며
감사에 기본 저장하지 않는다. 다운로드 redirect URL은 단기이며 큰 텍스트·비밀정보가
있을 수 있어 임시 운영 증거로 취급한다. 기본 업무 구간은 생성 `Run batch` 안의
`BatchPlane batch command` group이다. checkout·준비 조사에는 전체보기를 제공한다.
명시 group이 없는 이전 workflow는 생성 `Run batch` step으로 대체할 수 있다.

Gate는 `ALLOW`, `DENY` 모두 기존 job 로그에 기록한다. R4는 Issue 쓰기 권한의
분리된 통제·기록 책임으로 스케줄 요청/Gate/결과도 남긴다. 파일 저장소·캐시·DB는
추가하지 않는다. 어댑터는 상세의 해당 Gate 로그와, 목록의 최근 비성공 행 분류를
위해 실제 Gate job이 있는 각 실패 실행의 그 로그만 읽는다. 성공 Gate 뒤 업무
실패도 포함한다. 업무 로그의 일치 텍스트나 Issue의 최신 Gate marker를 신뢰하지 않는다.
GitHub가 제공한 job·관찰 step 시간과 결합할 수 있지만 jobs API는 같은 step이
임의 출력을 내도록 변조된 workflow까지 인증하지 않는다. 승인 형상 SHA·workflow
증명 작업 전까지 이 위협은 해당 한정 작업 밖이며 검증 불가는 불명으로 남긴다.

실패 후속처리는 승인과 별도다. 업무 실패는 소명·조치·담당자·운영 상태·작성자·
시각·run ID·요청 ID를 받을 수 있어야 한다. 운영 상태(`OPEN`, `INVESTIGATING`,
`RESOLVED`, `ACCEPTED_RISK`)와 검토 상태(`AWAITING_REVIEW`, `APPROVED`,
`CHANGES_REQUESTED`, `REJECTED`)는 별도다. 구조화 댓글·저장소 파일 등으로 DB
없이 감사 가능하게 저장한다. 제출은 최종 종결이 아니다. 관리자 결정은 별도
댓글이며 종결 세 결정 모두 공백 아닌 사유가 필요하다.

조회 모델은 검토 없는 원본 소명 marker부터 읽는다. `requestId`, `batchId`가
해당 실행 요청과 일치해야 하며 중복 `followUpId`는 최초 유효 댓글이 기준이다.
marker의 검토 관계 필드는 설명용이며 기준 원본으로 정규화한다. 실제 작성자·
댓글 생성 시각으로 검토 신원·시각을 결합하고 주장한 검토자가 다르면 거부한다.
실제 작성자의 현재 `maintain`·`admin`을 확인해야 수용한다. 기본 금지 모드는 실제
검토자가 원본 작성자인 경우를 제외한다. 두 완화 모드는 적격 관리자의 수동
자가검토를 허용하지만 자동 모드도 종결 결정을 만들지 않는다. 명시적 댓글·사유가
필요하며 기준 소명의 최초 유효 종결 검토만 조회 상태에 반영한다.

브라우저는 검토 호출 중 중복 제출을 막고 runtime은 쓰기 전 증거를 다시 검증한다.
두 브라우저를 감싸는 신뢰 트랜잭션·dispatcher 잠금은 없으므로 서버 조율자 도입
전에는 클라이언트 간 동시 경쟁이 가능하다. 댓글은 GitHub 편집·삭제와 독립적인
불변 저장소가 아니다. 자기 중복 클릭 억제는 클라이언트 간 잠금이 아니다.

제품 클라이언트의 `listAuditTimeline({ limit })`는 Lite에서 DB 대신 증거를 조합한다.
등록 PR, 실행 Issue·댓글, 수동·스케줄 run, workflow 메타데이터를 읽어 선택
`sourceUrl`이 있는 `AuditTimelineItem`으로 정규화한다. 초기 UI 필터는 클라이언트에서
`batchId`, `requestId`, `runId`, `status`, `reasonCode` 같은 메타데이터를 사용한다.

내처리함은 기존 `getMyWork`를 사용한다. 어댑터가 현재 사용자·등록 PR·실행 Issue/
댓글·최근 실행을 읽고 승인·등록·자기 요청·실패 후속으로 분류해 내부 상세에 연결한다.
유효 소명 없는 업무 실패는 수동 요청자 또는 실행된 스케줄 형상 담당자에게
`Write follow-up`을 준다. 소명 없는 Gate 차단은 명령 미수행이므로 요청자/담당자의
`Gate blocked` 증거 작업·`Review evidence`다. `AWAITING_REVIEW`는 적격 관리자만,
`APPROVED`는 작성자·요청자 잔여 없음, `CHANGES_REQUESTED`·`REJECTED`는 작성자/
담당자의 `Submit follow-up update`다. 배정된 `OPEN`·`INVESTIGATING`은 동일
관리자 검토와 중복 없이 `Continue follow-up`일 수 있다. Gate 차단의 진행·보완은
label·맥락을 유지한다. 상세는 중립 `reviewCapability`를 받아 간단한 문구·tooltip으로
불가를 표시하며 GitHub 권한을 직접 조회하지 않는다.

## 실행 조회 UI 경계

실행·실패·감사·대시보드는 제품 동작에 의존한다. Page 조회는 현재 클라이언트·경로와
동기화하며 언어 변경으로 재조회하거나 미완료 소명을 지우지 않는다. 필터·로그 검색은
표현 책임이다. 플랫폼 오류 해석·증거 연결·권한 검사·업무 로그 구간은 어댑터 책임이다.

소명·검토 명령은 사용자 이벤트에서 실제 응답으로 처리한다. 과거 실행·클라이언트
응답은 새 화면을 바꾸지 않는다. 중복 클릭 억제는 로컬 상호작용이지 저장소 잠금이
아니다. 직접 새로고침은 플랫폼을 다시 읽으며 조회 불가를 성공한 빈 결과로 표시하지 않는다.

대시보드는 목적 화면과 같은 처리 가능 요청·검증된 실패·Gate 차단·감사 조회 모델을
사용한다. 기존 설치 요약은 어댑터 의존이며 공유 UI에 설치 workflow·토큰 관리를
옮길 허가는 아니다. 내처리함·최근 실행 링크는 native attempt·읽기 전용 과거 관찰까지
정확한 제품 식별자를 유지한다.

이는 소유권 변경이며 R4 인가·실패 검토 정책·로그 보존을 바꾸지 않는다. 캐시·결과
동기화·취소·백그라운드 모니터·새 실패 상태를 추가하지 않는다.

파서는 `batchplane.io/v1`, `batchtrail.io/v1`, `batchplane:*`, `batchtrail:*`
숨은 marker·label을 모두 읽고 쓰기는 BatchPlane 이름을 사용한다. 대상 dispatcher
설치 전 승인은 증거만 남길 뿐 업무를 실행하지 않는다.

## 스케줄 회차 계약

스케줄은 `BatchDefinition.spec.schedules`에만 저장하고 통제 배치 형상의 일부로
승인한다.

```text
.batch-governance/batches/{batchId}.yml
```

관찰된 회차마다 정규 직렬화·해싱으로 도출한 실행 요청 식별자가 있다.

```text
(repositoryId, batchId, scheduleId, sourceRunId)
```

attempt·시각은 회차 식별자 구성 요소가 아니다. 증거에는 실제 attempt/job·승인
형상 결합을 보존한다. 예정 시각은 worker에서 계산하지 않고 불명으로 남긴다.
별도 Run은 별도 회차이며 예정 회차 exactly-once를 보장하지 않는다. 동일 Run
전체·부분 재실행은 업무 진입에서 실패해야 한다.

digest는 소유 배치 형상·workflow 대상·실행 스냅샷·원본 회차를 포함한다. 기존
`governedChangeId`, `targetRevisionDigest` 결합·검증기를 재사용하고 workflow
출처 비교·현재 산출물 검증도 포함한다.

같은 workflow가 요청·Gate를 기록하고 인가/attempt 재검사 후 업무를 실행해
정확한 결과를 남긴다. 승인 댓글·두 번째 Run은 만들지 않는다. 허용 전 필수 쓰기
성공을 확인하며 불확실성이 자동 재시도가 되지 않는다. 결과 쓰기 실패로 업무를 재시작하지 않는다.

스케줄 요청은 조회 가능하지만 승인 작업은 아니다. 댓글 누락으로 수동 결정·승인
건수·영구 수동 대기 차단을 만들면 안 된다. 권한 근거·Gate·실행 결과·확인 상태를
구분한다. 원본 파싱은 github-lite에 두고 UI에는 불투명 실행 ID·내부 목적지를 준다.
담당자·시간대·UI·검증은 [스케줄 계약](./schedule-execution-contract.ko.md)을 따른다.

## R2 경계

R2-A는 요청 생성·검증된 변경 검토·어댑터 소유 저장소 변경을 다룬다. R2-B는 모든
새 실행 요청을 승인 배치의 `governedChangeId`·대상 형상 digest에 결합한다.
수동 생성·회차 생성·dispatcher 변경·Gate에서 가장 최근 적용 가능한 머지 통제
변경과 재검증한다. 등록 정의·workflow·파일만 비교하며 무관한 배치·README 변경은
형상을 무효화하지 않는다.

Gate는 검증된 머지 SHA를 내보낸다. 업무 job은 값이 있을 때만 시작하고 정확히 그
SHA를 checkout한다. 실행 맥락의 workflow 출처 SHA도 등록 승인 산출물과 비교한다.
API 실패·조회 불가는 실행을 차단한다. 불가 API는 통제 불명이지 만들어낸 우회 증거가 아니다.

미승인 현재 형상은 현재 형상 검토 또는 최신 검증 승인 형상 복구를 위한 새 변경
요청으로 보정한다. 생성만으로 해제하지 않으며 일반 역할·자가·자동 정책을 적용한다.
자동승인이 탐지된 우회를 몰래 복구하지 않는다. 복구 요청 증적은 보정 유형과
변경을 연결하고 기존 실행/attempt 증거는 차단을 기록한다.

저장소 보호는 필수 신뢰 경계다. 관리자는 Gate·Action workflow를 바꾸거나 제거할
수 있고 Gate만으로 이를 막을 수 없다. Run·로그·Issue·댓글·PR은 GitHub의 보존·
편집·삭제 정책을 따른다. 별도 불변 사고 저장소·writer를 추가하지 않는다. 따라서
미승인 편집 후 정확히 복원한 사실을 이 프로토콜만으로 영구 사고 상태로 만들 수는
없다. 남아 있는 실행/attempt·복구 변경 증거만 그 사실을 보여준다.

R4 회차 프로토콜 재설계·R5 전체 앱 이전은 R2-B 범위 밖이다.
