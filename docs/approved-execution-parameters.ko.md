# 승인된 실행 파라미터

[English](./approved-execution-parameters.md)

## 승인 근거와 상태

#212의 전체 구현 계약이다. 2026-10-09 구체 기술 제안은 2026-10-11 로컬 구현
승인을 받았다. [Lite SRS](./github-lite-srs.ko.md),
[기술 명세](./github-lite-technical-spec.ko.md),
[스케줄 계약](./schedule-execution-contract.ko.md)을 구체화하며 승인 정책을
바꾸거나 Main 구현을 추가하지 않는다.

2026-10-11 소스 검토, 전체 로컬 검사, 1440px·390px 한영 브라우저 검증 후
준비 상태는 `AVAILABLE`이다. 구현된 흐름을 사용자 QA할 수 있다는 뜻이며
운영 수용 통과를 의미하지 않는다. 실제 플랫폼의 키 업로드,
수동·스케줄 전달, runner 동작, 수치 지원 한계는 `NOT_TESTED`다. 문서·소스 확인,
mock·로컬 CI·브라우저 검사를 실환경 실행·릴리스 증거로 보고하지 않는다. 실제
쓰기·실행에는 사용자 별도 승인이 필요하며 원격 CI 추적·머지는 사용자 책임이다.
이전 버전별 QA 결과는 그대로 보존한다.

## 정의와 선택

정의는 승인된 배치 형상이 소유한다. 정확한 `name`, `required`, `sensitive`,
선택 `defaultValue`를 가진다. 실행 요청은 입력을 선택할 뿐 이름을 추가하거나
flag를 바꾸지 않는다. 스케줄 설정도 같은 정의에 대한 선택이며 소유 배치 변경
요청에서 승인한다.

| 규칙      | 계약                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 이름      | `^[A-Za-z_][A-Za-z0-9_]*$`. 동일 이름·대소문자만 다른 중복을 거부한다. 철자·대소문자를 보존하며 trim·정제·대문자 변환하지 않는다.                                |
| 값        | `""`, 공백만 있는 문자열, 선행 0, Unicode, 줄바꿈을 포함한 리터럴 문자열이다. 숫자·boolean·JSON으로 강제 변환하거나 표현식을 평가하지 않는다.                    |
| 필수      | 길이가 아닌 존재 여부를 검사한다. 제공한 빈 문자열도 존재 조건을 충족하며 명령에 그대로 전달한다.                                                                |
| 선택      | 생략과 명시적 빈 값은 다르다. 생략하면 파라미터 환경 변수를 만들지 않는다.                                                                                       |
| 기본값    | 승인된 기본값을 선택하는 것이며 빈 입력·인가 실패·복호화 실패의 대체값이 아니다. 기본값 부재는 빈 기본값이 아니다.                                               |
| NUL       | NUL을 거부하며 제거하거나 나머지 값을 바꾸지 않는다. 복호화 후 명령 시작 전에도 검사한다.                                                                        |
| 민감 여부 | 일반·민감 기본값, 직접 입력, 스케줄 값에 동일하게 적용한다. 민감을 일반으로 바꿔도 저장 암호문을 평문 기본값으로 드러내지 않으며 변경 요청에서 새 값을 입력한다. |

선택 계약은 `ParameterSelection`이다.

```ts
type ParameterSelection =
  | { name: string; source: "DEFAULT" | "OMIT" }
  | { name: string; source: "VALUE"; value: ParameterInputValue };

type ParameterInputValue =
  | { kind: "VALUE"; value: string }
  | { kind: "SAVED"; reference: string };
```

`DEFAULT`는 승인 기본값이 있을 때만 쓴다. `VALUE`는 빈 값도 포함해 정확한
입력 문자열을 제공한다. `OMIT`는 선택 입력에만 허용한다. 수동 요청은 각 정의의
선택을 명시한다. 스케줄은 승인 형상에서 정의별 선택을 해석하며 직접 설정하지
않은 정의는 기본값을 상속하거나, 기본값 없는 선택 입력이면 생략한다. 필수
입력에 선택 값·기본값이 없으면 요청 또는 회차를 업무 허용 전에 차단한다.

저장된 민감 값은 제품 UI·클라이언트에 평문이나 플랫폼/JWE DTO가 아닌 불투명
`SAVED` 참조로 나타난다. 어댑터는 검증된 저장소·배치·정확한 이름·원본 위치·
출처 형상에 대해서만 참조를 해석한다. 기본값·저장 스케줄 직접값 재사용은 암호문
복사이며 브라우저에서 복호화·재암호화하지 않는다. 마스크·placeholder는 입력값이
아니다. 작성 중 새 입력은 확인할 수 있지만 Lite에는 저장값 공개 기능이 없다.
민감 평문은 Issue/PR body·저장소 YAML·정규 증적·브라우저 저장소·인계 상태에
저장하지 않는다.

## 저장과 승인 바인딩

일반 값은 문자열로 저장한다. 신규 민감 값은 `valueDigest`만 남기거나 평문 해시를
저장하는 대신 인증된 암호문으로 저장한다.

```json
{
  "sensitive": true,
  "encrypted": {
    "version": 1,
    "keyId": "<public-JWK-thumbprint>",
    "jwe": "<compact-JWE>"
  }
}
```

Lite 어댑터는 `jose@6.2.12`, JWE Compact Serialization, `alg: RSA-OAEP-256`와
`enc: A256GCM`만 허용하는 allowlist를 사용한다. 문서화된 `generateKeyPair`로
RSA-2048을 생성하고 공개 JWK·임시 개인 PKCS#8을 내보내며 공개 JWK SHA-256
thumbprint로 키를 식별한다. 보호 header와 envelope의 키 식별자는 일치해야 한다.
암호 기본 연산이나 범용 키 공급자 framework를 직접 만들지 않는다.

JWE 평문은 정확한 `value`와 `{ repositoryId, batchId, parameterName, origin }`
맥락을 가진 UTF-8 JSON이다. `repositoryId`는 어댑터가 해석하는 GitHub의 안정적
저장소 ID이며 변경 가능한 owner/name이 아니다. 값 원본 위치는
`{ type: "BATCH_DEFAULT" }`, `{ type: "SCHEDULE_VALUE", scheduleId }`,
`{ type: "REQUEST_VALUE", requestId }`다. 암호화는 최초 위치를 결합하고 이후
재사용은 이를 감싸는 승인에 결합한다. 공개키 암호화 자체는 작성자·승인을 입증하지 않는다.

신규 파라미터 실행의 정규 payload에는
`spec.parameterContractVersion: "PARAMETER_DELIVERY_V1"`와
`spec.parameterSourceRevision`이 필수다. 후자는 검증된 승인 배치의 merge SHA다.
`spec.parameters`는 정확한 정의 이름을 key로 사용한다. 선택 값마다 민감 여부,
일반 값 또는 정확한 암호 envelope, 검증된 `source.origin`을 포함하고 배치 기본값·
스케줄 직접값에는 `source.revision`도 포함한다. 선택 입력 생략은 값 없이
`source.origin.type: "OMIT"`를 가진 명시적 승인 증거이며 복호화할 JWE 원본 위치가 아니다.

기존 정규 요청 digest는 계약 버전·출처 SHA·선택 값/생략·민감 여부·정확한 암호문·
원본 위치/출처 형상을 기존 요청·배치·workflow 맥락과 함께 결합한다. 출처는
호출자의 주장 대신 승인 정의·스케줄 스냅샷과 비교한다. 재사용 암호문은 해당 출처와
같아야 한다. SHA/digest를 만드는 데이터 안에 미래 commit SHA·최종 digest를
넣지 않는다. 별도 승인 기록·마이그레이션 framework는 추가하지 않는다.

`PARAMETER_DELIVERY_V1`에는 원문 보존 정규 JSON을 적용한다. 객체 자신의 key를
재귀적으로 정렬하고 배열 순서·문자열의 모든 code unit·명시적 빈 문자열/null을
보존하며 undefined 객체 항목만 생략한다. 그 UTF-8 표현을 SHA-256으로 계산한다.
CR·LF·CRLF는 서로 다른 값이며 줄바꿈·Unicode 정규화를 하지 않는다.
`__proto__` 같은 허용 이름도 일반적인 객체 자신의 key로 보존한다. 출처 값 비교도
같은 원문 보존 표현을 사용한다. 이 버전이 없는 요청은 과거 digest 알고리즘을
유지하며 기존 승인을 다시 쓰지 않는다.

수동 선택은 승인 전에 확정한다. native 스케줄은 검증된 승인 배치·스케줄 형상으로
회차를 기록할 때 선택 값을 확정하고 Gate가 검사한다. 이후 기본값 변경으로 이미
승인된 요청을 바꾸거나 실행 때 가변 최신 기본값 포인터를 해석하지 않는다. 암호문·
출처 변조, 다른 맥락/키, 복호화 실패, 필수 데이터 누락은 업무 명령 시작을 막아야 한다.

기존 해시 전용 민감 이력은 계속 조회한다. 복호화할 수 없고 승인 후 평문을 넣어
실행 가능하게 바꾸지도 않는다. 입력을 제공한 대체 요청을 만든다. 기존 파라미터
없는 요청·이력은 유지한다.

## Workspace 암호화 설정

Workspace 관리자가 기존 설정 UI를 사용한다. 일반 값만 쓰거나 파라미터가 없는
배치에는 Secrets 쓰기 권한을 요구하지 않는다. 신규 민감값 사용에는 공개 설정의
반영과 대응하는 개인키 등록 성공이 필요하다.

민감값 제출에는 요청자의 fine-grained PAT에 저장소 `Secrets: read`가 추가로
필요하다. `BATCHPLANE_INPUT_KEY` 메타데이터를 조회하기 위한 권한이며 일반
요청자는 `Secrets: write`·개인키가 필요 없다. 반영된 공개 설정과 PRESENT Secret
메타데이터는 설정 준비 검사일 뿐이다. ABSENT·UNKNOWN/조회 불가는 준비 완료가
될 수 없다. PRESENT·UNKNOWN 어느 것도 암호학적 키 쌍 일치·runner 복호화를
입증하지 않는다. 최초 관리자 설정에는 기존 설정 PR 권한·관리자 권한에 더해
업로드용 저장소 `Secrets: write`가 필요하다. 일반 값만 쓰거나 파라미터 없는
제출은 이 메타데이터 검사에 의존하지 않는다.

| 자료                 | 위치와 책임                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 공개 설정            | `.batch-governance/parameter-encryption.yml`. 기존 검토 설정 PR을 거치며 `version: 1`, `keyId`, 공개 RSA JWK(`kty`, `n`, `e`)만 저장한다. 개인 필드는 없다. |
| 개인키               | Workspace에 대응하는 개인 PKCS#8을 저장하는 저장소 Actions Secret 하나, `BATCHPLANE_INPUT_KEY`. 파라미터별 Secret 목록은 없다.                              |
| GitHub 업로드 암호화 | `libsodium-wrappers@0.8.4`로 GitHub 업로드 공개키에 대해 개인키를 암호화한다. 제품 JWE 암호화와 별개다.                                                     |
| 준비 API             | Gate 동반 Action에서 마스킹·output에 `@actions/core@3.0.1`을 사용한다. 무관한 Action을 이전하지 않는다.                                                     |

1. 연결·관리자 권한을 검증하고 초기화 전 기존 공개 설정·대기 설정 요청·Secret
   메타데이터를 확인한다.
2. 최초 설정에만 임시 키 쌍을 생성한다. 공개 설정 PR을 먼저 만들고 생성한 요청
   링크를 유지한다.
3. 같은 개인키를 `BATCHPLANE_INPUT_KEY`에 업로드하며 새 쌍으로 대체하지 않는다.
   공개 설정 승인·머지는 기존 정책을 따른다.
4. 공개 설정 반영과 개인키 등록 성공 이후에만 설정 기록 완료로 보고한다.
   PR 생성·Secret 업로드·머지는 비원자적 별도 동작이며 부분 성공을 보여줘야 한다.
5. 같은 연결 제품 클라이언트의 설정 세션에서는 안전한 경우 보존된 키 쌍으로
   재시도할 수 있다. 업로드 실패에도 세션을 유지하되 브라우저 저장소에 넣지 않는다.
   재연결은 조회만 하며 자동 재생성·덮어쓰기·복구하지 않는다. 임시 개인 자료를 잃었거나
   기존 설정/Secret이 맞지 않으면 관리자의 명시적 해결을 위해 미완료로 표시한다.
   원래 요청 링크를 보존하고 완료를 주장하거나 키를 조용히 교체하지 않는다.

설정 중 개인 자료는 임시로만 보관하며 local/session storage·저장소 파일·PR body·
로그에 남기지 않는다. 기존 Secret 존재는 덮어쓰기 허가가 아니다. GitHub Secret
메타데이터는 키 쌍 일치·runtime 복호화를 입증하지 못한다. 로컬 키 쌍 검사·업로드
증거는 설정 근거이지 runner 통과가 아니다. 별도 승인된 첫 실제 실행이 runtime
증거를 제공한다. 검증 workflow·키 백업/교체 서비스·재시도 엔진·저장값 공개는 없다.

GitHub Secret PUT은 create-if-absent가 아닌 upsert다. 존재를 재확인하고 같은
클라이언트의 초기화를 묶어 기존 키를 알면서 덮어쓰지 않지만, 두 관리자 사이의
원자적 상호 배제를 제공하지 않는다. 최초 설정은 관리자 한 세션에서 진행한다.
새 잠금·복구 체계는 승인하지 않았다.

## Workflow 갱신과 전달

기존 파라미터 없는 배치는 암호화 설정·강제 이전 없이 기존 실행 경로를 유지한다.
등록과 기존 배치의 파라미터 추가는 배치 변경 요청 하나에서 정의·생성 workflow를
함께 갱신한다. Workspace 공용 설치 갱신은 별개이며 최신 dispatcher만으로 배치별
입력 준비 상태를 증명하지 않는다. 무관한 workflow를 덮어쓰거나 통합 다중 배치
이전 요청을 추가하지 않는다.

`hasParameterDelivery`는 지원 주석·템플릿 버전만 보지 않고 실행 YAML의 의미를
검사한다. 같은 업무 job의 `Run batch` 앞에 지정 준비 Action·정확한 요청 바인딩이
있고 준비에 `continue-on-error: true`가 없으며 output과 step env가 정확히 연결돼야
한다. 수동 경로와 활성 native 스케줄 업무 경로 각각을 확인한다. 전달 지원이 없으면
UI는 차단 이유·배치 변경 링크를 보여준다. runtime도 같은 계약을 강제하며 버튼을
숨기는 것만으로 충족하지 않는다.

Gate 패키지가 빌드하는 동반 Action `actions/gate/input-preparation`을 사용한다.
Gate 인가를 물리적으로 재사용하며 정책 복제·범용 runner SDK를 만들지 않는다.
기존 업무 job에서 동일한 승인 요청·형상·digest 스냅샷을 검증하고 선택 입력을
읽어 민감값 복호화·맥락/값 검증·마스킹 등록 후 다음을 출력한다.

```ts
core.setOutput("environment", JSON.stringify(environment));
```

기존 native 업무 step에만 연결한다.

```yaml
- name: Run batch
  env: ${{ fromJSON(steps.prepare.outputs.environment) }}
  run: <existing approved batch command>
```

맵에는 선택된 `BATCHPLANE_PARAM_<exact name>` 문자열 key/value만 있다. 생략은
key가 없고 명시적 빈 값은 `""`다. 준비 output 누락·잘못된 형식·미인가이면 명령
시작 전에 실패해야 하며 `{}`로 대체하지 않는다. 값을 shell 소스에 삽입하거나
자동 명령행 인자·JSON 파일 인터페이스·`GITHUB_ENV`·새 workflow/job·명령 launcher를
추가하지 않는다. dispatch·job 간 output은 필요한 ID/digest만 유지하며 업무 평문·
개인키를 job 사이에 전달하지 않는다.

`${{ secrets.BATCHPLANE_INPUT_KEY }}`는 입력 준비에만 제공한다. 개인키는 파라미터,
환경 output, `GITHUB_ENV`, 업무 명령 변수가 되어서는 안 된다. 검증 SHA checkout,
작업 디렉터리, native 명령·shell, 종료 상태, 스트리밍 로그, 실제 취소, 업무 로그
구간·실행 상세 링크를 보존한다. 기존 Bash `trap` 경로·미지정 shell은 Windows
지원 증거가 아니며 #212는 runner 플랫폼 지원을 새로 주장하지 않는다.

## 마스킹·신뢰·결과

환경 output 공개 전에 민감 평문과 JSON escape 형태를 `core.setSecret`에 등록한다.
맵·키를 로그에 쓰지 않는다. 표현식 진단·로그에 실제 노출되는 형태를 검사하되
비교용 합성 비밀을 출력하지 않는다. 마스킹은 암호화·Secret 저장이 아니다.

동일 job output은 runner 파일을 사용하며 암호화 전달도 메모리 전용 전달도 아니다.
다른 step은 `Run batch.env`를 자동 상속하지 않지만 output을 참조할 수 있다.
신뢰하는 배치 코드는 값을 내보내거나 변환할 수 있고 workflow·runner 관리자도
접근할 수 있다. 비밀 보호 sandbox가 아니며 모든 변환된 비밀의 로그 차단을 보장하지 않는다.

정확한 요청·Run·job·step 증거로 검증된 준비 거부이면 `BLOCKED`로 나타낼 수 있다.
이는 명령이 시작하지 않았다는 뜻이다. 증거 누락·조회 불가·연결 불가이면
`UNCONFIRMED`를 유지하며 준비 job 실패만으로 업무 실패를 입증하지 않는다.
업무 실패에는 검증된 명령 시작·실제 실패 증거가 필요하다. 승인 요청을 바꾸거나
업무 결과를 꾸며내지 않고 승인·거부 사유·원본 링크를 보존한다.

## 한계와 수용

공통 이름 길이·개수·값 길이에 임의 수치 상한을 승인하지 않았으며 무제한 지원도
아니다. JWE·escape를 포함한 최종 요청/변경 증적을 측정한다. 플랫폼 거부에는
draft와 조치 가능한 안내를 유지하며 잘라내기·필드 누락·자동 재시도하지 않는다.
폼이 현재 가진 평문을 검사하되 검증 반복만을 위해 저장 암호문을 공개하지 않는다.
runtime은 복호화 값·NUL을 다시 검사한다.

최종 payload·output·프로세스 환경의 수치 지원 한계에는 버전·OS·명령 진입 경로와
승인된 실제 플랫폼/runner 증거가 필요하다. 추정 Issue body 최대치·보편 OS 상한·
Main 한계를 주장하지 않는다. 승인 리터럴 경로에 중요한 제한이 필요하면 전달
방식을 조용히 대체하지 말고 사용자 검토에 보고한다.

[QA-L06](./user-qa.ko.md#qa-l06-승인된-파라미터가-실제-업무-명령의-입력이-된다)은
설정·기본값/직접값·두 스케줄·존재/빈 값/생략·변조·기존 이력·구형 workflow를 다룬다.
연결 QA-L01-L03, QA-L05-L09, QA-L12, QA-L15, QA-L18은 시험 버전·환경별로
재검증하며 과거 통과를 덮어쓰지 않는다. 상위 통합 담당자가 README 전체 로컬
절차와 영어/한국어·desktop/mobile 브라우저 검토를 맡는다. 로컬 검사·실제 플랫폼
QA·원격 CI·릴리스·머지는 별도 증거다. 이 문서 작업은 범위 내 내용·링크·동등성·
diff·포맷 검사만 요구하며 새로운 제품 QA 통과를 만들지 않는다.

## 공식 참고 자료

승인 제안의 공식 근거이며 BatchPlane 실행 성공 증거나 의존성 업그레이드 요청이 아니다.

- [jose 6.2.12 CompactEncrypt](https://github.com/panva/jose/blob/v6.2.12/docs/jwe/compact/encrypt/classes/CompactEncrypt.md), [키 생성](https://github.com/panva/jose/blob/v6.2.12/docs/key/generate_key_pair/functions/generateKeyPair.md).
- [GitHub Secrets 업로드 암호화](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api), [저장소 Secret 메타데이터/권한](https://docs.github.com/en/rest/actions/secrets#get-a-repository-secret).
- [Toolkit 마스킹/output](https://github.com/actions/toolkit/tree/main/packages/core#inputsoutputs), [동일 job의 마스킹 output](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job).
- [fromJSON](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#fromjson), [step env](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsenv), [취소](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation).
- [Node.js 이름 규칙](https://nodejs.org/docs/latest-v24.x/api/environment_variables.html#variable-names): 제품 규칙이지 보편 OS 규칙·새 .env 인터페이스가 아니다.
- [Issue 생성 API](https://docs.github.com/en/rest/issues/issues#create-an-issue), [Linux execve 제약](https://man7.org/linux/man-pages/man2/execve.2.html), [Windows 환경 변수 방식](https://learn.microsoft.com/en-us/windows/win32/procthread/environment-variables): 지원 한계 조사 근거이지 측정된 지원이 아니다.
