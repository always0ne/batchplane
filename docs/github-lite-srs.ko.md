# GitHub Lite SRS

[English](./github-lite-srs.md)

이 문서는 BatchPlane GitHub Lite 모드의 구현 요구사항을 정의한다.
[`control-plane-srs.ko.md`](./control-plane-srs.ko.md)의 하위 명세이며
[`main-lite-conformance.ko.md`](./main-lite-conformance.ko.md)의 공통 제품 의미를
보존해야 한다. GitHub Lite는 Git 기반 서버리스 에디션이며 Main이 생기기 전의
임시 제품 정의가 아니다.

현재 동작과 명시적으로 대기 중인 보정을 함께 포함한다. NATIVE_SCHEDULE_V2의
native 동일 Run 스케줄링은 구현됐지만 실제 수용 #202는 대기다. 새 전결 승인
호환 경로는 필요 없다. [추적표](./requirements-traceability.ko.md)와
[로드맵](./control-plane-migration-plan.ko.md)은 구현·수용·예정 작업을 구분한다.

## 범위

Lite는 GitHub 저장소에 설정·감사 증적을 저장한다. React/Vite UI는 BatchPlane
서버 없이 실행하며 세션 저장소에만 둔 사용자 토큰으로 GitHub API를 호출한다.

필수 지원 범위:

- 설정 PR을 통한 저장소 설치.
- 변경 요청을 통한 배치 등록·변경·삭제.
- 요청 상세·승인함에서 변경 요청 승인.
- GitHub Issue 기반 실행 요청.
- Issue 댓글 기반 실행 승인 증적.
- 저장소 workflow를 통한 dispatcher 전달.
- 배치 명령 실행 전 BatchPlane Gate 강제.
- 승인된 배치 형상이 일치 회차를 허용하며 회차별 승인을 꾸며내지 않는 통제 스케줄.

UI는 [Lite UX 기준](./lite-ui-ux-baseline.ko.md)도 따라야 한다. 사용자가 통제 대상,
다음 동작, 현재 항목이 승인 작업인지 실행 증거인지 실패 후속처리인지 이해할 수
있어야 화면 구현이 완료된다.

### 제품 사이트맵과 유예한 요청 기능

실행내역은 `/executions`, 특정 실행은 `/executions/:executionId`, 실패 후속처리는
`/executions/failures`, Workspace 설정은 `/workspace`를 사용한다. 내부 링크는
정확한 실행 식별자와 기존 회차/attempt 맥락을 유지해야 한다. 제품 탐색은 플랫폼
Run·Governance 분류가 아니라 실행·요청·감사 용어를 사용한다. 원본 링크에는 실제
플랫폼과 Run이라는 명칭을 사용할 수 있다.

사이트맵 리팩터링은 현재 변경·실행 요청 작성/상세 경로, 단일 요청 동작, 승인
정책·증적을 유지한다. 복수 배치·유형·Workspace 요청과 `/requests/new`,
`/requests/:requestId`는 별도 [통합 요청 기능 명세](./unified-request-feature-spec.ko.md)로
유예한다. 해당 문서는 합의 방향·미결정 사항이며 현재 지원이나 리팩터링 중 구현
승인을 주장하지 않는다.

## 설치 요구사항

Workspace 설정은 공유 제품 UI를 사용한다. Lite 연결 폼은 GitHub 자격 증명을,
공유 화면은 제품 클라이언트를 통한 연결 결과·설치 준비·승인 정책 표시를 소유한다.
현재 지원은 세션 저장소 연결 하나다. Main 신원·OAuth는 미구현이다. 멀티 Workspace·
통합 요청은 #142 예정이며 이 단일 연결 화면이 제공하지 않는다.

연결 저장을 검증 성공으로, 설치/업데이트 요청 생성을 설치 반영으로 보고하지 않는다.
연결 확인은 현재 편집값을 명시적으로 저장·검증한다. 설치/업데이트·정책 요청은
현재 연결 확인 성공을 전제로 하며 연결 필드를 암묵적으로 저장하지 않는다.
owner·repository·token 편집, 명시적 저장, 연결 해제, 확인 실패는 이전 검증·관련
명령 결과를 무효화한다. 불가 명령에는 번역된 비활성 사유와 핸들러 검사를 둔다.
이후 성공한 확인은 그 검사 결과의 제품 지원 기능이 허용하는 명령만 복구한다.
정책 요청은 원본에서 반영을 확인하기 전까지 현재·요청 모드를 따로 표시한다.
연결 해제·교체 후 대기 응답이 이전 연결 화면 상태를 복원하면 안 된다.

사용자가 실행 승인에 의존하기 전에 설정 화면이 저장소를 검사해야 한다.
기본 브랜치의 필수 파일로 설치 상태를 판단한다.

- `.github/workflows/batchplane-dispatcher.yml`
- `.github/workflows/batchplane-sample-target.yml`
- `.batch-governance/README.md`
- `.batch-governance/workspace.yml`
- `.batch-governance/policies/role-mapping.yml`
- `.batch-governance/batches/.gitkeep`

누락 시 설치 PR을 제공해야 한다. 기본 브랜치에 직접 쓰지 않고 설정 브랜치·PR을
만든다. 저장소 maintainer가 GitHub native 권한으로 검토·머지한다.

필수 파일은 있으나 관리 workflow가 현재 Lite 템플릿과 다르면 Workspace에 낡은
경로를 표시하고 업데이트 PR을 제공한다. 관리 파일:

- `.github/workflows/batchplane-dispatcher.yml`
- `.github/workflows/batchplane-sample-target.yml`

업데이트 PR은 현재 정규 workflow를 쓰고 대체한 legacy BatchTrail workflow를
제거한다. `.batch-governance/workspace.yml`,
`.batch-governance/policies/role-mapping.yml` 같은 저장소 소유 정책·설정은 덮어쓰지 않는다.

설치 dispatcher는 `issue_comment.created`를 받되 실행 가능한 승인 증적 댓글에만
job을 실행해야 한다. 수동 승인 댓글의 조건:

- PR 대화가 아니라 Issue에 작성됨
- `batchplane:execution-request` 또는 legacy `batchtrail:execution-request`
  label이 있는 실행 요청 Issue
- `/bgcp approve requestDigest=`로 시작
- `batchplane:execution-approval` marker 포함
- 승인 결정 marker 포함

이때만 이벤트 Issue 번호·댓글 ID·저장소 `GITHUB_TOKEN`으로
`always0ne/batchplane/actions/dispatcher@main`을 호출한다. 일반 논의·설명·변경
요청 댓글과 marker 없이 명령처럼 보이는 댓글은 무시한다. workflow `concurrency`로
실행 요청 Issue별 직렬화해 중복 승인 댓글이 같은 요청을 병렬 전달하지 못하게 한다.

dispatcher는 수동 승인용이다. 스케줄 회차는 승인함에서 기다리거나 dispatcher
경로에 들어가지 않는다. native workflow가 요청 기록·승인 스케줄 형상 검증·업무
진입 재검사 후 명령·동일 Run 결과 기록을 수행한다. 스케줄 요청·Gate·결과 댓글이
승인 명령이 되면 안 된다.

새 workflow는 변경된 Action 저장소 `always0ne/batchplane`을 사용해야 한다.
현재 개발 템플릿은 `@main`이지만 운영 릴리스는 승인된 불변 tag·commit SHA로
고정하고 #196에서 Workspace 설치 상태로 낡은 참조를 드러내야 한다. 여전히
`always0ne/batchtrail`을 참조하는 저장소는 관리 산출물을 재생성하는 것이 바람직하다.
이 문서는 새 호환 기간을 만들거나 과거 조회기를 제거하지 않는다.

## 등록 요구사항

### 배치 정의

등록은 `.batch-governance/batches/{batchId}.yml`을 생성한다.
`batchId`는 필수다. 영속 저장 경로에 `new-batch` 같은 대체 ID를 만들면 안 된다.

### Workflow 생성

배치 정의와 같은 PR에 `.github/workflows/{batchId}.yml`을 만든다. 경로는 배치 ID에서
도출하며 초기 Lite 등록에서 사용자가 다른 workflow 경로를 직접 고르지 않는다.

필수 생성 항목:

- 실행을 요청에 연결할 배치 ID·요청 ID가 포함된 `run-name`.
- `request_id`, `batch_id`, `request_digest`를 받는 `workflow_dispatch` 입력.
- 업무 job 앞의 `batchplane-gate` job.
- `batchplane-gate`에 의존하는 업무 job.
- 별도 schedule-result Action의 native 스케줄 결과 보고. 수동 결과는 native 실행
  조회 모델이며 범용 Gate 완료 작업이 아니다.
- 저장소 등록 실행 자산 수행 전 checkout.
- Gate 뒤에 사용자 정의 배치 명령.

활성 스케줄이 있으면 다음도 포함한다.

- `BatchDefinition.schedules[]`에서 만든 `on.schedule` 항목
- 연중 겨울/여름 UTC 대안을 만들지 않는 원래 cron·native 시간대
- 같은 Run 안에서 일치 스케줄별 통제·업무·결과 책임 분리
- 같은 workflow의 동일 cron·다른 시간대에 대한 명시적 오류. 같은 cron·시간대의
  스케줄도 개별 식별자 유지
- 업무 허용 전 요청·Gate 증적 기록
- 업무 job만 재실행하는 경우까지 포함한 명령 전 실제 Run/attempt·현재 승인 형상 검사
- 전체 Run 결론이 아니라 해당 스케줄 job·attempt에 연결된 결과

통제 job은 배치 명령을 실행하거나 Issue 쓰기 권한을 업무 job에 넘기면 안 된다.
스케줄은 dispatcher를 호출하지 않는다. `gateRequired`는 불변 규칙이며 선택 checkbox가 아니다.

Gate는 기본적으로 GitHub Actions UI 재실행을 거부해야 한다. 재실행은 원래
`workflow_dispatch` 입력을 재사용하므로 새 인가가 아니다. 새 실행에는 새 요청이
필요하다. 묵시적 재시도·확인된 실패 후 같은 요청 재전달은 승인하지 않았다.

수동 Gate도 GitHub 증거를 독립 검증해야 한다. 생성 workflow는 저장소
`GITHUB_TOKEN`을 Gate에 전달한다. Gate는 dispatcher 자동화가 시작했는지와
제출된 `request_id`, `batch_id`, `request_digest`에 일치하는 요청 Issue·APPROVED
승인 댓글이 존재하는지 확인해야 한다.

### 실행 환경

등록에서 배치 실행 환경을 선택할 수 있어야 한다. 기본 선택지:

- `ubuntu-latest`
- `ubuntu-24.04`
- `windows-latest`
- `macos-latest`
- `self-hosted`

사용자 정의 runner label도 지원한다. 쉼표로 구분한 label은 GitHub Actions 배열로
직렬화한다.

```yaml
runs-on: ["self-hosted", "linux", "prod"]
```

### 배치 명령과 파일

명령 필드명은 영어 `Batch command`, 한국어 `배치 명령`이다.
명령을 직접 입력하거나 실행 파일을 업로드할 수 있다. 파일은 같은 등록 PR의
다음 경로에 커밋한다.

```text
.batch-governance/batches/{batchId}/artifacts/{fileName}
```

업로드 시 명령이 비어 있으면 해당 파일 실행 기본 명령을 채울 수 있다. 자동 생성한
명령은 배치 ID 변경 시 함께 갱신해야 한다.

업무 메타데이터와 플랫폼 실행 설정은 타입이 구분된 소유자를 가진다. GitHub runner/
ref는 GitHub 실행 설정 컴포넌트가 맡고 공유 Page는 동일 등록·변경 흐름을 유지한다.
이 분리로 상세·실행 요청의 명령·runner·형상·파일 정보가 사라지거나 별도 저장 단계·
두 번째 변경 요청이 생기면 안 된다. 새로운 플랫폼 구현을 뜻하지 않는다.

Lite 어댑터와 Action 파일 조회기는 같은 표준 YAML 해석을 사용해야 한다.
구문 진단에 줄·열을 유지하며 파일 스키마·인가 검증도 필수다. parser/formatter 변경으로
기존 증적을 다시 쓰거나 원래 바이트 대신 재포맷한 내용을 해싱해 과거 승인을 무효화하면 안 된다.

### 등록 검토 UX

변경 요청 전에 다음 검토 패널을 보여야 한다.

- 배치 정의·workflow·선택 실행 파일의 생성 경로
- ID 기반 경로·필수 Gate·선택 실행 환경·배치 명령을 확인하는 통제 점검표
- 배치 정의와 생성 workflow YAML 미리보기
- 생성 요청은 즉시 내부 상세로 열리며 GitHub 목록에는 잠시 지연될 수 있다는 짧은 안내

등록·변경·삭제 Page는 `BatchPlaneClient` 제품 동작을 호출한다. 브랜치·파일·PR은
Lite 어댑터 책임이며 Page는 PR body를 명령 계약으로 사용하지 않는다. 성공하면
반환된 내부 변경 요청 상세로 바로 이동한다. 승인함이 GitHub 목록 API보다 늦어도
직접 상세는 즉시 접근 가능하다.

검토 패널이 주 운영 화면이다. YAML은 보조 증거이며 사용자가 처음부터 해석해야
하는 대상이 아니다.

### 배치 삭제 요청

삭제는 직접 저장소 수정이 아닌 변경 요청이다. 상세의 실행·변경 요청과 같은
영역에 삭제 요청을 제공한다. `Delete batch {batchId}` PR을 만들고 다음을 제거한다.

- `.batch-governance/batches/{batchId}.yml`
- 배치 정의에 기록한 생성 workflow 경로
- 등록돼 있고 존재하는 선택 실행 파일 경로

머지 후 삭제 배치 보관 내용을 복원할 만큼 검증된 증적을 보존해야 한다. 삭제
기준 형상과 BatchDefinition의 `beforeDigest`를 포함한다. 기준은 편집 가능한 PR
요약이 아니라 기록된 `baseRevisionSha`의 정의다. 복원 내용:

- 배치 ID·이름·담당자·도메인·환경·중요도
- workflow 경로·ref
- runner·명령·선택 실행 파일
- 삭제 당시 내장 스케줄
- 원본 요청 번호·URL

어댑터는 반환 전에 복원 바이트를 증적 `beforeDigest`와 비교해야 한다. 증적 손상·
변조, 기준 형상 조회 불가, digest 불일치면 보관 증거 확인 불가와 원본 요청 링크를
명시한다. PR body에서 보관 필드를 재구성·표시하지 않는다.

삭제 PR 머지 후 활성 정의에서는 빠지지만 머지된 삭제 요청이 있으면
`/batches/{batchId}` 직접 접근에서 삭제 형상·최근 실행 증거를 보여야 한다.
삭제 배치의 실행 요청 Issue·workflow 이력에도 접근할 수 있어야 한다.

## 실행 요청 요구사항

수동 실행은 등록된 활성 배치에서 시작한다. 요청 생성은 다음을 수행한다.

- 정규 `ExecutionRequest` payload 구성.
- 정규 payload의 SHA-256 요청 digest 계산.
- 실행 요청 marker가 있는 GitHub Issue 생성.
- 생성 후 승인함으로 이동.
- GitHub 목록에서 Issue를 관찰하거나 승인 동작이 제거할 때까지 반환 Issue를
  브라우저 세션 인계 상태에 유지.

Issue 생성 전 요청 폼을 거쳐야 한다. 배치 목록·상세 동작이 숨은 기본값으로 직접
요청을 만들면 안 된다. payload 포함 항목:

- `requestId`
- `batchId`
- 요청자·요청 시각
- 만료 시각
- 요청 workflow ref
- 요청 사유
- 비민감 파라미터
- 민감 파라미터의 값 digest만
- 배치 요약 필드
- workflow 경로·ref

민감 값은 Issue body·정규 payload·브라우저 저장소·인계 상태에 기록하지 않는다.
제출 전 임시 폼 상태에만 둘 수 있으며 값 digest만 저장한다는 점을 표시해야 한다.
요청 digest는 다른 payload에 승인 증거를 재사용하지 못하게 한다.

승인 판단에 필요한 사유·workflow 경로/ref·runner label·배치 명령·Gate 필수 상태를
포함한다. digest는 감사 증거이며 주 판단 자료로 의존하게 만들지 않는다.

## 승인 요구사항

등록·변경·삭제의 PR 댓글은 저장소 기반 감사 증거일 뿐 자체로 머지 권한을 주지 않는다.
승인·승인 변경 반영 시마다 현재 Workspace 정책·역할 매핑을 다시 읽고 현재 자가승인
규칙으로 행위자를 재인가한다. 권한이 회수되거나 정책이 강화됐으면 낡은 승인을 거부해야 한다.

권한 검증기는 요청 증거만 믿지 않고 PR head를 읽어야 한다. 작업에 맞는 정규
BatchDefinition과 Gate 선행 workflow 전이를 필수로 요구한다. 통제 범위는 정의·
생성 workflow·허용된 배치 파일 범위뿐이며 임의 저장소 경로는 통제 산출물이 아니다.

실행 승인은 승인함에서 한다. Workspace 승인 모드는 브라우저 로컬 상태가 아닌
저장소 설정이며 경로는 다음과 같다.

```text
.batch-governance/workspace.yml
```

없으면 `SELF_APPROVAL_BLOCKED`다. 이 기본 직무 분리 모드에서는 요청자·승인자가
달라야 한다. `SELF_APPROVAL_ALLOWED`는 개인 시험·데모·저위험 자동화를 위한
명시적 정책으로, 동일 운영자가 적격 배치 변경·수동 실행을 요청·승인할 수 있다.
증적은 자가승인을 명시하고 Gate는 승인·배치 정의·dispatcher 행위자·요청 digest·
승인 권한을 계속 검증한다. `AUTO_APPROVE`도 명시적 정책이다. 적격 배치 변경·
수동 실행 생성 시 자동승인 출처/유형·`approvalMode=AUTO_APPROVE`를 가진 감사
증거를 만든다. Gate는 머지된 정책이 `AUTO_APPROVE`일 때만 이 실행 증거를 허용한다.
수동 `workflow_dispatch`는 계속 dispatcher 책임이다. 더 높은 완화 수준이므로
`AUTO_APPROVE`는 자가승인도 포함한다.

정책·역할 매핑·설치 변경은 현재 유효 정책과 저장소 보호로 평가한다. 아직 유효하지
않은 제안 값으로 자신을 인가·자동 머지하면 안 된다.

실패 후속처리에서 두 완화 모드는 현재 `maintain`·`admin` 사용자의 명시적 자가
검토도 허용한다. 실패 후 검토 결정을 만들어내는 것은 아니다. `AUTO_APPROVE`에서도
관리자는 종결 결정 하나와 공백 아닌 사유로 검토 댓글을 직접 제출해야 한다.

운영자는 YAML을 직접 편집하지 않고 Workspace 정책 변경을 준비할 수 있어야 한다.
모드 저장은 `.batch-governance/workspace.yml` 변경 PR을 만들고 머지 후 유효해진다.
로컬 설정으로 정책을 약화하지 않는다. 완화가 직무 분리를 줄이지만 요청·승인·
dispatcher·Gate·실행 이력을 없애지 않는다는 감사상 차이를 명확히 설명한다.

승인함에는 승인 가능한 요청만 둔다. 실패·Gate 차단·전달 중·전달 완료·반려 실행
요청은 증거·후속 작업이지 승인 작업이 아니므로 승인/반려 컨트롤을 표시하지 않는다.

내처리함은 현재 GitHub 사용자와 연결된 등록 요청, 다른 maintainer 검토를 기다리는
등록 항목, 작성한 실행 요청, 검토 대기 실행 승인, 후속처리할 실패·Gate 차단을
모은다. 각 행은 GitHub 원본만이 아니라 해당 BatchPlane 상세로 이동한다.

후속처리 동선은 상태에 따른다. 유효 소명이 없는 업무 실패는 실행 요청자에게
`Write follow-up`을 제공한다. 소명 없는 Gate 차단은 배치 명령이 실행되지 않았으므로
업무 소명 누락이라 하지 않고 `Gate blocked` 증거 작업의 `Review evidence`로 이동한다.
`AWAITING_REVIEW`는 Runtime 적격 Workspace 관리자만의 검토 작업이다. 단순
실행 요청자라는 이유로 소명 누락 작업을 주지 않는다. `APPROVED`는 작성자·요청자의
후속 작업을 해제한다. `CHANGES_REQUESTED`, `REJECTED`는 작성자·담당자를 실행
상세 후속처리 anchor의 `Submit follow-up update`로 안내한다. `OPEN`,
`INVESTIGATING`은 `Continue follow-up`으로 배정할 수 있지만 같은 기록의 적격
관리자 검토 작업과 중복하지 않는다. Gate 차단 후속처리는 해당 label·맥락을
보존한다. 보완 동작을 업무 실패와 공유해도 Gate 표시를 유지한다.

실행 요청마다 내부 상세를 제공한다. 상태·요청자·배치·환경·workflow 경로/ref·runner·
배치 명령·digest·통제 점검·정규 payload·승인·dispatcher·가능한 Gate 증거를
표시한다. 승인이 전달로 이어졌거나 이어지지 않은 이유를 설명하는 주 화면이다.

승인·전달 완료 요청은 확인 가능한 연계 Actions 실행에 연결한다. 실행 상세는
상태·GitHub 링크·workflow 경로/이름·attempt·행위자·요청 ID·배치 ID·Gate 결정·job
결론 요약을 보여야 한다. Gate 차단은 명령 미수행이며 업무 실패는 Gate 허용 후
명령/job 실패이므로 시각적으로 구분한다. native runner 로그 접근도 제공한다.
최소한 GitHub가 URL을 주면 Gate·업무 job 원본으로 연결한다. 권한 오류에는 Actions
읽기 권한 필요를 알린다. 인라인 로그는 필요 시 조회·표시량 제한·검색·다운로드를
지원하며 원시 로그를 기본 감사 증적으로 저장하지 않는다. 업무 로그 기본 구간은
생성 workflow가 출력한 `BatchPlane batch command` runner group이고 전체보기도 제공한다.

실행 목록은 주 이력 화면이다. 최근 `workflow_dispatch`의 대기·실행 중·성공·업무
실패·취소·Gate 차단을 보여야 한다. 행에는 배치 ID·요청 ID·workflow 경로·완료 상태·
GitHub 링크·실행 상세 링크를 둔다. 전체·진행 중·성공·업무 실패·Gate 차단·취소
필터를 제공한다.

실패 목록은 승인 작업이 아니라 실행 이력 기반 전용 후속처리 화면이다. Gate·업무
실패를 구분해 실행 상세로 연결한다. 업무 실패에는 승인과 별도로 감사 소명·후속처리를
지원한다. 소명에는 내용·조치·담당자·후속 상태·작성자·시각·관련 실행/요청 ID가 필요하다.
Lite에서는 구조화된 Issue 댓글이나 저장소 증적 파일 같은 GitHub 기록으로 저장한다.
최종 종결에는 Workspace 관리자 검토·승인이 필요하다. 실제 댓글 작성자가 현재
저장소 `maintain`·`admin`일 때만 검토를 수용하며 marker의 신원·시각을 믿지 않는다.
운영 상태(`OPEN`, `INVESTIGATING`, `RESOLVED`, `ACCEPTED_RISK`)와 검토 상태
(`AWAITING_REVIEW`, `APPROVED`, `CHANGES_REQUESTED`, `REJECTED`)는 독립적이다.
종결 결정 세 종류에는 공백 아닌 사유가 필수다. 기본 금지 모드에서는 자신의 소명을
검토하지 못하며 완화 두 모드에서는 관리자의 수동 자가검토를 허용한다. 자동 모드도
명시적 검토 댓글·사유 없이 실패 후 결정을 자동 생성하지 않는다.

요청 Issue의 소명 marker는 `requestId`, `batchId`가 해당 실행 요청과 일치해야
적격이다. `followUpId`별 최초 유효 원본 댓글이 기준이고 그 원본의 최초 유효 종결
검토만 상태에 반영한다. 상세의 검토 불가 상태는 사용 가능해 보이는 컨트롤 대신
작은 사유·tooltip으로 표시한다. GitHub 권한으로 댓글을 편집·삭제할 수 있고 Lite에는
클라이언트 간 신뢰할 트랜잭션 잠금도 없다. 독립 불변 감사 저장소라고 주장하지 않고
저장소 기반 증거로 표현한다.

등록 PR에도 승인함에서 접근할 내부 상세를 제공한다. PR 메타데이터·검토 상태·통제
점검표·통제 파일 YAML 변경 요약·새로고침·GitHub 링크를 표시한다. 승인이 PR 머지를
포함함을 명확히 쓰고 승인/반려는 목록 카드가 아니라 상세에서 수행한다.

감사 화면은 GitHub 증거를 한 타임라인으로 보여준다. 초기 Lite에는 등록 PR, 실행
Issue, 승인·dispatcher·Gate 결정 댓글, `workflow_dispatch` 기록을 포함한다. 배치 ID·
요청 ID 필터와 가능한 이벤트 원본 링크를 제공한다.

대시보드의 승인·실패 요약은 목적 화면과 같은 적격 기록을 사용한다. 스케줄 회차는
사람 승인 대기가 아니다. Gate 허용 확인 없는 실패 workflow는 업무 실패로 세지
않는다. 요약·상세는 같은 회차·attempt·원본만 있는 관찰·삭제 배치 이력을 보존한다.

조회 화면에서 언어를 바꿔도 필터·로그 보기/검색·미제출 소명을 보존한다. 새로고침은
플랫폼을 새로 읽고 조회 실패와 빈 결과를 구분한다. 이전 실행·Workspace 응답이
새 화면을 갱신하면 안 된다. 이 연속성 요구가 결과 동기화·취소·새 소명 자격·새
검토 권한을 추가하지는 않는다.

실행 승인 댓글은 다음으로 시작해야 한다.

```text
/bgcp approve requestDigest={requestDigest}
```

같은 댓글에 포함할 승인 증적:

- 결정
- 승인자
- 승인 시각
- 확인 가능한 Workspace 승인 모드
- 요청자·승인자가 같을 때 명시적 자가승인 표시
- `requestId`
- `batchId`
- `requestDigest`

dispatcher는 명령줄을 트리거 신호, BatchPlane marker를 검증 증거로 사용한다.
승인 시 Issue를 닫지 않는다. 승인은 중간 상태이며 dispatcher·Gate가 같은 Issue에
증거를 계속 붙일 수 있어야 한다. 반려에는 사유가 필수이며 반려자·시각·요청 ID·
배치 ID·digest·사유를 기록한다.

자가승인은 유효 모드와 실제 승인 권한을 따른다. 금지 모드에서 요청자에게 사유가
있는 비활성 승인 컨트롤을 표시한다. 완화 모드는 권한 없는 사용자를 승인자로 만들지
않는다. UI·명령·Gate 정합성은 #223에서 추적한다.

dispatcher가 미설치면 승인은 증거만 남기고 workflow를 전달하지 못한다. 설치·
bootstrap 결함이지 브라우저 직접 전달을 허용하는 근거가 아니다.

dispatcher는 `workflow_dispatch` 전후 Issue에 상태를 남겨야 한다.

- 전달 전 `DISPATCHING` 증거와 `batchplane:dispatching` label
- 성공 후 `DISPATCHED` 증거와 `batchplane:dispatched` label
- 실패 후 `DISPATCH_FAILED` 증거와 `batchplane:dispatch-failed` label

같은 요청 ID·배치 ID·digest의 `DISPATCHING`·`DISPATCHED` 증거가 이미 있으면
중복 승인 댓글을 무시한다.

현재 구현 주의: `DISPATCH_FAILED` 뒤 `retry-dispatch` 명령이 아직 있다. 승인 목표
#224는 같은 요청 재전달 경로를 제거한다. 확인된 전달 실패는 종결하고 사용자가
현재 입력·정책으로 새 요청을 만든다. 수락 여부 불명을 확인된 실패로 오분류하지 않는다.

리브랜딩 이후에도 기존 저장소를 감사할 수 있도록 legacy `batchtrail.io/v1`,
`batchtrail:*` marker·label을 기존 조회기에서 계속 읽어야 한다.

## 스케줄 요구사항

스케줄은 `BatchDefinition.spec.schedules`에만 저장하며 소유 배치의 통제된 등록·
변경 요청으로 수정한다. 정의 형상에 포함된 승인 스케줄의 의미:

> 검증된 배치 형상을 이 반복 규칙에 따라 무인 실행할 수 있다.

관찰된 회차에는 `(repositoryId, batchId, scheduleId, sourceRunId)`로 식별한 실행
요청이 있다. attempt·worker 시각은 식별자를 바꾸지 않는다. 같은 Run 재실행은
새 실행 인가를 얻지 못한다. 한 예정 회차의 별도 Run 사이 중복 제거는 주장하지 않는다.

회차 요청은 승인된 소유 배치 형상을 식별하고 다음을 포함해야 한다.

- `triggerType: SCHEDULE`
- `scheduleId`
- 스케줄별 job 연결을 가진 원본 Run·실제 attempt
- BatchDefinition 경로
- BatchDefinition 형상 SHA
- 현재 배치/workflow 대상
- 회차별 요청 digest

원본 변경 요청과 검증 형상이 권한 근거다. 수동 승인 모드와 무관하게 회차별 승인
댓글은 필요하지도, 만들지도 않는다. Gate는 실제 이벤트·workflow 출처·활성 정의·
승인 형상·원본 회차를 검증한다. 업무 진입은 검증 SHA 실행 직전 관련 검사를
반복한다. 이전 전결 승인은 새 스케줄 권한이 될 수 없고 새 호환·이전 계층도 필요 없다.

기존 회차 상태는 증거를 연결할 뿐 다른 회차나 같은 Run 재실행을 인가하지 않는다.
전체·부분 재실행은 관련 허용·업무 진입 경계에서 차단해야 한다. 별도 Run의 예정
회차 중복 제거까지 약속하지 않는다.

스케줄 요청은 수동 승인함에 표시하지 않는다. 사람 승인 작업이 아닌 감사 가능한
실행 기록이다. worker·Run 생성 시각에서 예정 시각을 추론하지 않는다. 지연이
유효 회차를 만료시키지 않는다. 자동 몰아 실행·재실행은 없다. 필수 쓰기 결과 불명은
업무 허용을 차단하고 결과 기록 실패로 명령을 다시 시작하지 않는다. 최신 요청·
Issue 존재·label·bot 신원은 인가나 유일 잠금이 아니다.

조회 모델은 스케줄 권한 근거·Gate 결정·실제 업무 결과를 구분한다. 실패는 실행된
형상의 배치 담당자에게 최초 배정한다. 담당자 공백은 미리보기·승인 전에 인증된
변경 요청자로 채우며 명시한 값·과거 배정을 유지한다. 담당자 지정은 권한을 주지 않는다.

공유 UI·연결·실패·검증 수용 기준은 [스케줄 실행 계약](./schedule-execution-contract.ko.md)을 따른다.

## 감사 요구사항

실행 회차마다 요청·권한 근거·Gate 결정·실제 결과 증거를 유지한다. 수동 권한은
실행 승인, 스케줄 권한은 검증된 소유 통제 형상이다. 결과 누락은 성공·실패의 증거가 아니다.

Lite에서 스케줄 Issue 수 증가는 수용한다. Issue·댓글은 GitHub 편집·삭제·보존의
영향을 받는 저장소 기록이지 불변 저장소가 아니다. Main은 같은 제품 증거를 DB에
둘 수 있다. 사유 필수 실제 엔진 취소·승인 후 철회는 Lite 수용 전 #225의 필수지만
이 문서가 구현하지는 않는다. 결과 동기화는 별도 관찰 보정이며 Main 첫 흐름에
포함하고 Lite 시점은 별도다.

## 남은 운영 수용

- #212: 승인 파라미터를 실제 배치 명령에 연결.
- #223: 승인 화면·명령·Gate와 승인 형상 조회 완전성 정합화.
- #224: 만료·실패 종결 보정, 같은 요청 전달 실패 재시도 제거.
- #225: 승인 후 철회, 명시적 대기 취소·실행 중단, 실제 결과.
- #206: 배치 간 스케줄 현황·상세, cron 미리보기 일치.
- #226: 과거 실행·감사 완전 조회, 오래된 내처리함 미처리 보존.
- #142: 권한 기반 멀티 Workspace 조회·통합 요청. 생성 전 모든 대상의 공통 승인자
  한 명이 필요하다. Lite 우선에서 유예하려면 입증된 제약·사용자 승인이 필요하다.

[사용자 QA 시트](./user-qa.ko.md)를 사용한다. 이 요구가 현재 UI 컨트롤이나 테스트
통과를 주장하는 것은 아니다.
