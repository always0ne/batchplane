# User QA Result Record Template

[한국어](./qa-result-template.ko.md)

This is an unexecuted template. Use case IDs from the [QA sheet](./user-qa.md)
and preserve user results against the tested delivery version. Do not guess
values for the empty fields. Document PR #192/#232 does not establish PASS for
any case.

## Validation Session

| Field                                                    | Value                                            |
| -------------------------------------------------------- | ------------------------------------------------ |
| Session / date / tester                                  | Not recorded                                     |
| PR / app commit or build                                 | Not recorded                                     |
| QA sheet commit or version                               | Not recorded                                     |
| Edition / actual provider and version                    | Not recorded                                     |
| Actual environment or mock                               | Not recorded                                     |
| Workspace / repository / default branch                  | Not recorded                                     |
| Actual Gate, dispatcher and schedule Action SHAs         | Not recorded                                     |
| User role / effective policy                             | Not recorded; exclude account secrets and tokens |
| Browser / locale / viewport                              | Not recorded                                     |
| Change impact / selected QA IDs / exclusions and reasons | Not recorded                                     |
| Authorized live writes, execution and cancellation       | Not recorded                                     |

## Case Results

Execute relevant cases only. Leave the rest NOT_TESTED; do not force N/A or PASS.
Preserve each failure and subsequent revalidation by version. If a change makes
a previous PASS inapplicable, record RETEST_REQUIRED for the new session. Use the
same result criteria as the QA sheet; never automatically carry a PASS forward.

| QA ID  | Result     | Actual observation / evidence link | Defect issue / revalidation result |
| ------ | ---------- | ---------------------------------- | ---------------------------------- |
| QA-L01 | NOT_TESTED |                                    |                                    |
| QA-L02 | NOT_TESTED |                                    |                                    |
| QA-L03 | NOT_TESTED |                                    |                                    |
| QA-L04 | NOT_TESTED |                                    |                                    |
| QA-L05 | NOT_TESTED |                                    |                                    |
| QA-L06 | NOT_TESTED |                                    |                                    |
| QA-L07 | NOT_TESTED |                                    |                                    |
| QA-L08 | NOT_TESTED |                                    |                                    |
| QA-L09 | NOT_TESTED |                                    |                                    |
| QA-L10 | NOT_TESTED |                                    |                                    |
| QA-L11 | NOT_TESTED |                                    |                                    |
| QA-L12 | NOT_TESTED |                                    |                                    |
| QA-L13 | NOT_TESTED |                                    |                                    |
| QA-L14 | NOT_TESTED |                                    |                                    |
| QA-L15 | NOT_TESTED |                                    |                                    |
| QA-L16 | NOT_TESTED |                                    |                                    |
| QA-L17 | NOT_TESTED |                                    |                                    |
| QA-L18 | NOT_TESTED |                                    |                                    |
| QA-M01 | NOT_TESTED |                                    |                                    |
| QA-M02 | NOT_TESTED |                                    |                                    |
| QA-M03 | NOT_TESTED |                                    |                                    |
| QA-M04 | NOT_TESTED |                                    |                                    |
| QA-M05 | NOT_TESTED |                                    |                                    |
| QA-P01 | NOT_TESTED |                                    |                                    |
| QA-P02 | NOT_TESTED |                                    |                                    |
| QA-X01 | NOT_TESTED |                                    |                                    |
| QA-R01 | NOT_TESTED |                                    |                                    |

## Defects And Revalidation

| Field                                                 | Value        |
| ----------------------------------------------------- | ------------ |
| QA ID / first failing version                         | Not recorded |
| Reproduction preconditions, input and steps           | Not recorded |
| Difference between expected and actual behavior       | Not recorded |
| Safe logs, screenshots and request/execution evidence | Not recorded |
| Existing related issue or approved new issue          | Not recorded |
| Fixed version / revalidation time / result            | Not recorded |
| Related impacted cases revalidated together           | Not recorded |

## Delivery Assessment

- Implemented scope: not recorded.
- Local automated checks: not recorded. Keep separate from user QA.
- User QA: not executed.
- Actual provider evidence: not recorded. Compare separately with live acceptance such as #202.
- Unresolved defects / accepted nonblocking residuals and follow-up timing: not recorded.
- Document/code delivery: not recorded. The user decides remote CI acceptance and merge.

Do not paste tokens, authentication headers or raw sensitive inputs. Distinguish
access permissions for private evidence from a safe summary. Record original log
deletion/retention deadlines when relevant.
