# 사용자 QA 결과 기록 양식

이 파일은 미실행 양식이다. [QA 시트](./user-qa.ko.md)의 사례 ID를 사용하며
사용자 실행 결과는 해당 전달 버전의 기록으로 보존한다. 아래 빈칸은 추측으로
채우지 않는다. 문서 PR #192/#232는 어떠한 사례의 PASS도 의미하지 않는다.

## 검증 회차

| 항목                                        | 값                          |
| ------------------------------------------- | --------------------------- |
| 검증 회차 / 날짜 / 검증자                   | 미기록                      |
| PR / 앱 commit 또는 build                   | 미기록                      |
| QA 시트 commit 또는 버전                    | 미기록                      |
| 에디션 / 실제 provider 및 버전              | 미기록                      |
| 실제 환경 또는 mock 여부                    | 미기록                      |
| Workspace / 저장소 / default branch         | 미기록                      |
| Gate·dispatcher·schedule Action 실제 SHA    | 미기록                      |
| 사용자 역할 / 적용 정책                     | 미기록, 계정·토큰 비밀 제외 |
| 브라우저 / locale / viewport                | 미기록                      |
| 변경 영향 / 이번에 선택한 QA ID / 제외 근거 | 미기록                      |
| 실환경 쓰기·실행·취소 승인 범위             | 미기록                      |

## 사례별 결과

관련 사례만 실행한다. 나머지는 NOT_TESTED로 유지하며 억지로 N/A나 PASS를
만들지 않는다. 각 행의 실패와 후속 재검증을 버전별로 보존한다.
변경 영향으로 기존 PASS를 재사용할 수 없으면 새 회차는 RETEST_REQUIRED로
기록한다. 결과 선택 기준은 QA 시트와 같으며 PASS를 자동 승계하지 않는다.

| QA ID  | 결과       | 실제 관찰 / 증거 링크 | 결함 이슈 / 재검증 결과 |
| ------ | ---------- | --------------------- | ----------------------- |
| QA-L01 | NOT_TESTED |                       |                         |
| QA-L02 | NOT_TESTED |                       |                         |
| QA-L03 | NOT_TESTED |                       |                         |
| QA-L04 | NOT_TESTED |                       |                         |
| QA-L05 | NOT_TESTED |                       |                         |
| QA-L06 | NOT_TESTED |                       |                         |
| QA-L07 | NOT_TESTED |                       |                         |
| QA-L08 | NOT_TESTED |                       |                         |
| QA-L09 | NOT_TESTED |                       |                         |
| QA-L10 | NOT_TESTED |                       |                         |
| QA-L11 | NOT_TESTED |                       |                         |
| QA-L12 | NOT_TESTED |                       |                         |
| QA-L13 | NOT_TESTED |                       |                         |
| QA-L14 | NOT_TESTED |                       |                         |
| QA-L15 | NOT_TESTED |                       |                         |
| QA-L16 | NOT_TESTED |                       |                         |
| QA-L17 | NOT_TESTED |                       |                         |
| QA-L18 | NOT_TESTED |                       |                         |
| QA-M01 | NOT_TESTED |                       |                         |
| QA-M02 | NOT_TESTED |                       |                         |
| QA-M03 | NOT_TESTED |                       |                         |
| QA-M04 | NOT_TESTED |                       |                         |
| QA-M05 | NOT_TESTED |                       |                         |
| QA-P01 | NOT_TESTED |                       |                         |
| QA-P02 | NOT_TESTED |                       |                         |
| QA-X01 | NOT_TESTED |                       |                         |
| QA-R01 | NOT_TESTED |                       |                         |

## 결함과 재검증

| 항목                                 | 값     |
| ------------------------------------ | ------ |
| QA ID / 최초 실패 버전               | 미기록 |
| 재현 전제·입력·순서                  | 미기록 |
| 기대와 실제의 차이                   | 미기록 |
| 안전한 로그·스크린샷·요청/실행 증거  | 미기록 |
| 관련 기존 이슈 또는 승인받은 새 이슈 | 미기록 |
| 수정 버전 / 재검증 일시 / 결과       | 미기록 |
| 함께 재검증한 영향 사례              | 미기록 |

## 전달 판정

- 구현 범위: 미기록.
- 로컬 자동 검증: 미기록. 사용자 QA와 분리한다.
- 사용자 QA: 미실행.
- 실제 provider 증거: 미기록. #202 등 실환경 수용과 별도 대조한다.
- 미해결 결함 / 비차단 잔여 수용과 후속 시점: 미기록.
- 문서/코드 전달: 미기록. 원격 CI 확인·머지는 사용자가 판단한다.

토큰, 인증 헤더, 민감 입력 원문을 붙이지 않는다. 비공개 증거는 접근 권한과
안전한 요약을 구별해 기록한다. 원본 로그 삭제/보존 기한도 필요한 경우 명시한다.
