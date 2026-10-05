# BatchPlane Lite Workspace 시작하기

[English](./repo-mode-getting-started.md)

Lite는 GitHub 기반 Workspace를 설정 저장소·승인 화면·dispatcher 런타임·감사
이력으로 사용한다. React/Vite UI는 정적이며 BatchPlane 서버를 실행하지 않는다.
Lite Workspace는 대상 GitHub 저장소 하나를 기반으로 한다.

이 안내는 첫 Lite 전체 흐름을 다룬다.

1. Workspace의 대상 GitHub 저장소 준비.
2. Workspace 화면에서 연결.
3. Lite 저장소 파일 설치.
4. PR로 배치 등록.
5. 실행 요청·승인.
6. dispatcher·Gate·실행 이력 증거 확인.

## 사전 조건

- 최초 커밋이 있는 GitHub 저장소.
- 해당 저장소의 GitHub Actions 활성화.
- 브랜치·PR·Issue·label·댓글 생성 권한.
- Actions workflow·run·job·로그 읽기 권한.
- 운영에 준하는 사용에서는 기본 브랜치 직접 변경을 막는 브랜치 보호·저장소 규칙.

로컬 smoke test에는 private 저장소로 충분하다.

```bash
gh repo create batch --private --add-readme
```

## 토큰 범위

대상 저장소만을 위한 fine-grained GitHub PAT를 만든다. 필요한 저장소 권한:

- `Actions`: 읽기 전용
- `Contents`: 읽기·쓰기
- `Issues`: 읽기·쓰기
- `Pull requests`: 읽기·쓰기
- `Metadata`: 읽기 전용

권한별 이유:

- `Actions` 읽기: workflow·run·job 목록과 임시 job 로그 조회.
- `Contents` 쓰기: 설치·등록·변경·삭제·workflow/정책 업데이트 PR 브랜치 생성.
- `Issues` 쓰기: 실행 요청 Issue, label, 승인·반려·dispatcher·실패 후속처리 증적.
- `Pull requests` 쓰기: 설치·등록·변경·삭제·Workspace 정책 PR.
- `Metadata`: GitHub API와 저장소 신원 확인.

조직 정책이 collaborator·team 소속 조회를 막으면 Issue·PR 생성은 가능해도 승인
역할 검사가 실패할 수 있다. 승인 시험 전에 조직 토큰 정책·저장소 접근을 조정한다.

## 세션 저장 정책

연결 정보는 `sessionStorage`에만 보관한다.

- 토큰을 localStorage에 쓰지 않는다.
- Issue·PR·workflow·배치 정의에도 토큰을 쓰지 않는다.
- 브라우저 세션을 지우면 토큰도 지워지며 Workspace 화면에서 제거할 수도 있다.
- 브라우저 실행이므로 신뢰하는 빌드만 사용하고 페이지 저장소를 읽는 확장·주입
  스크립트를 피한다.

저장소의 `GITHUB_TOKEN`은 브라우저 토큰과 별개다. 설치 PR 머지 후 dispatcher·
Gate는 저장소 workflow 권한을 사용한다.

## Workspace 연결

Lite UI의 Workspace에서 입력한다.

- Owner: GitHub 사용자·조직
- Repository: 대상 저장소명
- Token: fine-grained 토큰

`Check connection`으로 저장·검증한다. 별도 `Save session`은 선택이며 검증하지
않는다. 편집·저장·삭제하면 이전 확인이 무효다. 설치·업데이트·정책 요청 전에 다시
확인한다. 그 동작들이 대신 연결을 저장해 주지는 않는다.

확인 항목:

- 저장소 메타데이터·기본 브랜치
- Lite 필수 설치 파일
- 관리 설정 workflow의 템플릿 불일치
- 설치돼 있다면 Workspace 정책

## Lite 설치

기본 브랜치에 다음 파일이 있으면 설치된 상태다.

```text
.github/workflows/batchplane-dispatcher.yml
.github/workflows/batchplane-sample-target.yml
.batch-governance/README.md
.batch-governance/workspace.yml
.batch-governance/policies/role-mapping.yml
.batch-governance/batches/.gitkeep
```

누락 시 Workspace에서 `Create installation request`를 선택하고 GitHub에서
검토·머지한다. 필수 파일은 있지만 생성 workflow가 낡았으면 경로와
`Create update request`를 보여준다. 업데이트는 다음 관리 workflow만 바꾼다.

```text
.github/workflows/batchplane-dispatcher.yml
.github/workflows/batchplane-sample-target.yml
```

저장소 소유 정책 `.batch-governance/workspace.yml`,
`.batch-governance/policies/role-mapping.yml`은 덮어쓰지 않는다.

빠른 초기 저장소 구성이 필요하면 `examples/github-lite-demo/.batch-governance`와
`examples/github-lite-demo/.github`를 복사해 커밋·push한다. 다만 운영에 준하는
경로는 native PR 검토 증거가 남는 Workspace 설치 PR을 권장한다.

## Workspace 정책

승인 모드 저장 위치:

```text
.batch-governance/workspace.yml
```

기본값:

```yaml
apiVersion: "batchplane.io/v1"
kind: "WorkspacePolicy"
metadata:
  id: "default"
spec:
  approval:
    mode: "SELF_APPROVAL_BLOCKED"
```

지원 모드:

- `SELF_APPROVAL_BLOCKED`: 기본 직무 분리. 요청자·승인자는 달라야 한다. 감사가
  중요하거나 운영에 준하는 Workspace에서 사용한다.
- `SELF_APPROVAL_ALLOWED`: 적격 배치 변경·수동 실행의 요청자가 자가승인할 수 있다.
  한 사람이 운영하는 개인 시험·데모·저위험 자동화용이다. 결정 증거는 명시적으로
  남고 Gate는 실행 요청·digest·승인 권한·dispatcher 행위자·배치 정의를 계속 검증한다.
- `AUTO_APPROVE`: 간편 운영을 위한 정책이다. 수동 실행·적격 배치 변경 생성 시
  명시적 승인 증거도 자동 기록한다. Gate는 머지된 정책이 이 모드일 때만 자동승인
  실행 증거를 허용한다. `workflow_dispatch`는 dispatcher가 수행하며 브라우저 직접
  전달은 금지다. `SELF_APPROVAL_ALLOWED` 동작도 포함한다.

정책·역할 매핑·설치 요청은 이미 유효한 정책을 사용한다. 제안 값으로 자신을
머지하도록 인가하지 않는다. Workspace에서 모드를 바꾸면 PR을 만들고 머지 후
활성화한다. 완화는 직무 분리를 줄이지만 증거는 없애지 않는다. 요청 payload·승인
출처·dispatcher 상태·Gate 결정·workflow 연결을 계속 감사할 수 있어야 한다.

## 배치 등록

Batches에서 `Register batch`를 선택한다. 운영자가 정할 항목:

- 배치 ID
- 이름·담당자·도메인·환경·중요도
- `ubuntu-latest`, `self-hosted` 또는 사용자 runner label
- 배치 명령
- 선택 실행 파일
- 선택 스케줄

다음 내용으로 PR을 만든다.

```text
.batch-governance/batches/{batchId}.yml
.github/workflows/{batchId}.yml
.batch-governance/batches/{batchId}/artifacts/{fileName}
```

workflow 경로는 배치 ID에서 도출한다. Gate는 필수이며 업무 job은 Gate job에
의존한다. 승인함에서 등록 PR을 승인·머지한다. 이후 Batches를 새로고침하면
대상 저장소에서 배치를 읽는다.

## 실행 요청

수동 실행은 활성 등록 배치에서 시작한다.

1. `Request run` 선택.
2. 배치 맥락·workflow·runner·명령·요청 사유 검토.
3. 실행 요청 생성.

UI는 다음 Issue를 만든다.

- 실행 요청 marker
- 정규 요청 payload
- SHA-256 요청 digest
- 배치·workflow·runner·명령·요청자 맥락

생성 후 승인함으로 이동한다. GitHub 목록이 잠시 늦을 수 있어 목록에 반영될
때까지 반환 Issue를 즉시 인계 증거로 사용한다.

## 실행 승인

승인자는 상세에서 다음을 확인한다.

- 배치 ID·요청 ID
- 요청자·만료
- 사유
- workflow 경로·ref
- runner label
- 배치 명령
- 요청 digest

승인은 marker와 함께 다음으로 시작하는 댓글을 쓴다.

```text
/bgcp approve requestDigest=sha256:...
```

반려는 사유가 필수이며 반려 증거를 남긴다. 반려·만료·전달 완료·전달 실패·Gate
차단·업무 실패 요청은 더 이상 승인 작업이 아니다.

## 전달과 Gate

설치 dispatcher는 `issue_comment.created`를 받되 실행 요청의 처리 가능한 승인
증거에만 job을 실행한다. 검사 항목:

- 실행 요청 Issue 여부.
- marker 기반 승인 댓글의 승인 결정.
- 요청 ID·배치 ID·digest·workflow 경로/ref 일치.
- 아직 처리 가능한 요청.
- 같은 요청의 전달 중·전달 완료 증거 부재.

검사 후에만 대상 `workflow_dispatch`를 호출한다. 대상은 업무 전 `batchplane-gate`를
실행하며 다음을 확인한다.

- 요청 증거 존재
- 승인 증거 존재
- 요청·승인 digest 일치
- dispatcher 행위자가 workflow 시작
- 직접 UI 재실행을 새 인가로 사용하지 않음
- 역할 매핑·Workspace 자가승인 정책이 승인을 허용

Gate 통과 시 `run-batch`가 명령을 수행한다. 실패하면 배치 명령은 실행하지 않는다.

## Gate 차단 시 동작

Gate 차단은 통제 실패이며 업무 실패가 아니다. 실행 상세·native 로그를 확인하는
것이 좋다. 흔한 원인:

- `.batch-governance/policies/role-mapping.yml` 누락
- dispatcher 미설치·구버전
- 일치 승인 요청 없는 직접 `workflow_dispatch`
- 이전 통제 실행의 Actions UI 재실행
- `SELF_APPROVAL_BLOCKED`에서 자가승인
- 요청 만료
- Issue body·승인 증거 편집 후 digest 불일치
- 토큰·`GITHUB_TOKEN`의 필수 Issue 증거 읽기 권한 부족

목록·상세는 차단과 업무 실패를 구분해야 한다. 업무 실패는 Gate 허용 뒤 배치
명령이 실패했을 때만 발생한다.

## 스케줄 안내

스케줄은 소유 배치 정의에 저장하고 등록·변경 PR로 승인한다. Actions 항목은
원래 cron·native IANA 시간대를 유지한다. 한 workflow의 동일 cron·다른 시간대는
문서화된 이벤트 맥락이 구분하지 못하므로 명시적으로 거부한다.

관찰된 native Run마다 같은 workflow에서 스케줄별 실행 요청·Gate·업무·결과를
기록한다. 승인 배치 형상이 근거이며 회차별 승인 댓글·두 번째 전달 Run은 없다.
스케줄 요청은 승인함에서 기다리지 않는다.

native 전체·부분 재실행은 명령 전에 차단한다. 별도 Run을 추론한 예정 시각으로
중복 제거하지 않는다. 지연은 가능하며 Lite는 누락 회차를 자동 몰아 실행하거나
불확실한 결과 후 재실행하지 않는다. 기존 배치 workflow는 직접 편집·Workspace
초기화가 아니라 승인된 배치 변경으로 재생성한다.
[스케줄 계약·실환경 점검표](./schedule-execution-contract.ko.md)를 참조한다.

## 보안 한계

Lite는 의도적으로 제품 서버가 없다. 설치는 간단하지만 다음이 설계의 한계다.

- 저장소 권한·브랜치 보호·PR review·Issue·Actions가 신뢰 경계다.
- 기본 브랜치 직접 push 권한자는 의도한 PR 통제를 우회할 수 있다. 기본 브랜치를 보호한다.
- 충분한 GitHub 권한자의 직접 전달 시도를 UI가 막을 수는 없다. 강제 지점은 Gate다.
- 실행 중 페이지에서 토큰에 접근할 수 있다. 신뢰 빌드·최소 권한 fine-grained 토큰을 쓴다.
- 서버 비밀 저장소가 없다. 민감 파라미터를 Issue·PR·YAML·로그에 쓰지 않는다.
- job 로그는 필요 시 조회하는 임시 운영 증거다. 대량 텍스트·Actions 마스킹 비밀을
  포함할 수 있다.
- API·Actions 표시는 지연될 수 있다. 즉시 인계 증거가 요청 생성을 처리하지만
  목록·실행 표시가 나중에 나타날 수 있다.
- 생성 Action은 현재 프로젝트가 설정한 BatchPlane 저장소 참조를 따른다. 불변
  고정이 필요한 조직은 운영 사용 전에 통제된 workflow 템플릿 정책을 도입하는 것이 좋다.

## 검증 점검표

- Workspace 연결 성공.
- 모든 필수 설치 파일 확인.
- 관리 workflow 최신 상태.
- 등록 PR에 정의·생성 workflow 포함.
- 등록 승인 머지 후 새로고침에 배치 표시.
- 실행 Issue 생성 후 승인함 이동.
- 승인 시 marker 기반 증거 기록.
- dispatcher 전달 중·전달 완료 기록.
- 대상 workflow가 Actions에 표시.
- 배치 명령 전 Gate 수행.
- 실행 상세에서 Gate·업무 job·로그 분리.
