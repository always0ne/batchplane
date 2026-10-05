# 공유 UI 아키텍처

[English](./control-plane-ui-architecture.md)

상태: 현재 UI 경계와 승인된 목표. 2026-10-05 정합화.
Main이나 멀티 Workspace가 구현됐다는 문서가 아니다.

## 실제 의존 방향

```text
app/router + runtime 조합
  -> React Page와 소유 컴포넌트/Hook
  -> client Context
  -> packages/ui-client: BatchPlaneClient
  -> 주입된 구현
       Lite: packages/github-lite -> GitHub
       Main: 향후 HTTP 어댑터 -> Kotlin 애플리케이션 -> 플랫폼 어댑터
```

현재 계약은 [소스 인터페이스](../packages/ui-client/src/index.ts)다. 그림에 맞추려고
병렬 그룹형 클라이언트, 범용 폼 렌더러나 플랫폼 SDK를 도입하지 않는다. 향후
메서드는 승인된 완결 흐름에 따라 추가한다.

## 소유권과 가독성

[필수 엔지니어링 원칙](./frontend-engineering-principles.md)과 각 라이브러리의
문서화된 조합 패턴을 따른다.

- `app`: 라우팅·provider·조합. 자체 경로 분기 대신 React Router의 route object,
  layout, Outlet을 사용한다.
- `pages`: 업무 영역. 여러 Page가 있으면 list/detail/new로 나눈다. Page는 화면
  구성을 드러내며 의미 있는 하위 컴포넌트는 해당 소유 영역의 별도 파일에 둔다.
  Page 전용 Hook도 소유 Page에 둔다.
- `components`: 실제 제품 중립적인 컨트롤과 시각 토큰.
- `client`: 제품 클라이언트에 대한 좁은 React 연결 계층.
- `runtime`: 구현 선택과 플랫폼별 연결 편집기.
- `assets`: 브랜딩. `shared`: i18n 같은 비시각적 중립 지원 코드.

`features`나 전역 `ui` 계층, overview/operations/control 폴더 묶음, helper마다
파일을 만드는 파편화는 사용하지 않는다. 단순 삼항식과 map은 유용하지만 중첩된
다중 상태 마크업과 거대한 Hook은 책임을 숨긴다.

## 현재 사이트맵

아래 경로는 [router.tsx](../apps/web/src/app/router.tsx)와 대조했다.
제안하는 Main API 엔드포인트가 아니다.

| 경로                                       | Page 소유권 / 목적                                     |
| ------------------------------------------ | ------------------------------------------------------ |
| `/dashboard`                               | `pages/dashboard`: 운영 요약                           |
| `/my-work`                                 | `pages/my-work`: 사용자에게 배정된 처리할 작업         |
| `/batches`                                 | `pages/batches/list`: 배치 목록                        |
| `/batches/:batchId`                        | `pages/batches/detail`: 형상·스케줄·이력·요청 동작     |
| `/batches/new`                             | `pages/requests/changes/new`: 기존 변경 요청 작성 경로 |
| `/approvals/registration/:requestLocator`  | `pages/requests/changes/detail`: 기존 변경 요청 상세   |
| `/batches/:batchId/execution-requests/new` | `pages/requests/execution/new`: 수동 실행 요청         |
| `/execution-requests/:requestLocator`      | `pages/requests/execution/detail`: 실행 요청 상세      |
| `/requests`                                | `pages/requests/list`: Workspace 요청 목록             |
| `/approvals`                               | `pages/approvals`: 승인함                              |
| `/executions`                              | `pages/executions/list`: 실행내역                      |
| `/executions/:executionId`                 | `pages/executions/detail`: 정확한 실행과 로그          |
| `/executions/failures`                     | `pages/executions/failures`: 실패내역과 후속처리 진입  |
| `/audit`                                   | `pages/audit`: 증적 타임라인                           |
| `/workspace`                               | `pages/workspace`: 공유 설정과 주입된 연결 폼          |

기존 스케줄 작성 URL은 배치 변경 작성으로 이동한다. 배치 상세에서 스케줄을
직접 변경하지 않는다. 요청 경로는 #142까지 유지한다. 향후 `/requests/new`와
`/requests/:requestId`는 [통합 요청 명세](./unified-request-feature-spec.ko.md)에
기록했으며 이번 문서 PR이 추가하는 경로가 아니다. 배치 간 스케줄 목록 #206은
여전히 미완료다.

## Workspace와 플랫폼 범위

Main은 한 Workspace의 여러 연결을 지원한다. 플랫폼별 타입이 있는 연결 편집기는
runtime에서 조합하며 Workspace 정책은 공유 Page에 둔다. Workspace URL로
플랫폼 신원을 추론하지 않는다.

#142는 전역 전환 기능만이 아니라 Workspace를 가로지르는 권한 기반 통합 조회와
요청을 제공해야 한다. 항목마다 Workspace·연결·배치·실행 식별자를 유지하고
모든 대상의 권한을 검사한다. 포함된 모든 작업을 승인할 사람이 없다면 유용한
사유와 함께 생성을 제한한다. Workspace별 독립 승인을 수집하는 방식으로
대체하지 않는다.

자격 증명, Issue/PR DTO, 원시 증적 파싱과 전송은 어댑터에 남긴다. 필요한 곳에는
타입이 있는 플랫폼별 필드를 표시할 수 있다. GitHub 링크는 보조 증거이며 사용자의
주 작업 흐름이 아니다.

## 상호작용 규칙

- 변경 성공을 확인한 뒤 제품 상세와 실제 최신 상태를 표시한다. 낡은 승인 버튼을
  남기거나 GitHub로 강제 이동시키지 않는다.
- 실행 요청은 연결이 확인되면 필터 없는 목록이 아니라 해당 실행 상세로 연결한다.
  변경 요청은 해당 배치로 연결한다.
- 배치 상세는 수행 대상·런타임·명령/파일·스케줄·이력을 보여준다. Gate는 필수이며
  간결하게 표시한다. 선택 스위치나 과도하게 큰 카드가 아니다.
- 비활성 컨트롤에는 간결하고 접근 가능한 사유를 제공한다. 보통 tooltip을 사용한다.
- 업무 로그는 실제 배치 명령 구간을 기본으로 보여주고 전체 로그도 제공한다.
  Gate 차단은 업무 실패가 아니다.
- 요청 철회·대기 취소·실행 중단은 서로 다른 확인을 사용한다. 수행 중 작업은
  중단 전 확인하고 사유를 보존하며 실제 엔진 증거를 받은 뒤 완료로 표시한다.
- 결과 동기화는 별도 조회/보정 명령이며 자동 재실행이나 취소가 아니다.
- 목록에는 오류와 부분 조회 범위를 드러낸다. 최신 페이지가 가득 찼다고 오래된
  작업이 사라지면 안 된다. 현재 직접 조회 동작을 사용하며 새 캐시는 승인하지 않는다.
- 열린 #119를 기준으로 영향 화면의 영어·한국어, 키보드, 데스크톱/모바일 배치와
  연결된 탐색을 확인한다.

[QA 시트](./user-qa.ko.md)는 현재 확인할 항목과 구현 대기 항목을 구분한다.
Main mock fixture는 조합만 증명한다.
