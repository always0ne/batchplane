import auditEn from "./locales/en/audit.json";
import batchesEn from "./locales/en/batches.json";
import commonEn from "./locales/en/common.json";
import dashboardEn from "./locales/en/dashboard.json";
import errorsEn from "./locales/en/errors.json";
import executionsEn from "./locales/en/executions.json";
import failuresEn from "./locales/en/failures.json";
import myWorkEn from "./locales/en/myWork.json";
import navigationEn from "./locales/en/navigation.json";
import registrationEn from "./locales/en/registration.json";
import settingsEn from "./locales/en/settings.json";
import auditKo from "./locales/ko/audit.json";
import batchesKo from "./locales/ko/batches.json";
import commonKo from "./locales/ko/common.json";
import dashboardKo from "./locales/ko/dashboard.json";
import errorsKo from "./locales/ko/errors.json";
import executionsKo from "./locales/ko/executions.json";
import failuresKo from "./locales/ko/failures.json";
import myWorkKo from "./locales/ko/myWork.json";
import navigationKo from "./locales/ko/navigation.json";
import registrationKo from "./locales/ko/registration.json";
import settingsKo from "./locales/ko/settings.json";

export const defaultNamespace = "common";

export const namespaces = [
  "common",
  "navigation",
  "dashboard",
  "batches",
  "registration",
  "executions",
  "failures",
  "myWork",
  "audit",
  "settings",
  "errors",
] as const;

export const resources = {
  en: {
    audit: auditEn,
    batches: batchesEn,
    common: commonEn,
    dashboard: dashboardEn,
    errors: errorsEn,
    executions: executionsEn,
    failures: failuresEn,
    myWork: myWorkEn,
    navigation: navigationEn,
    registration: registrationEn,
    settings: settingsEn,
  },
  ko: {
    audit: auditKo,
    batches: batchesKo,
    common: commonKo,
    dashboard: dashboardKo,
    errors: errorsKo,
    executions: executionsKo,
    failures: failuresKo,
    myWork: myWorkKo,
    navigation: navigationKo,
    registration: registrationKo,
    settings: settingsKo,
  },
} as const;

export type TranslationNamespace = (typeof namespaces)[number];
