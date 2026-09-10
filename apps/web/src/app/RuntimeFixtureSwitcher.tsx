import { useTranslation } from "react-i18next";

import {
  isRuntimeFixtureSwitcherEnabled,
  runtimeFixtureOptions,
  type RuntimeFixtureId,
} from "../runtime/runtime-fixtures";

type RuntimeFixtureSwitcherProps = {
  fixtureId: RuntimeFixtureId;
  onChange: (fixtureId: RuntimeFixtureId) => void;
};

export function RuntimeFixtureSwitcher({
  fixtureId,
  onChange,
}: RuntimeFixtureSwitcherProps) {
  const { t } = useTranslation("common");

  if (!isRuntimeFixtureSwitcherEnabled()) {
    return null;
  }

  return (
    <label
      className="flex items-center gap-2 text-sm text-bp-muted"
      title={t("devRuntime.description")}
    >
      <span>{t("devRuntime.label")}</span>
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-bp-graphite"
        value={fixtureId}
        onChange={(event) => onChange(event.target.value as RuntimeFixtureId)}
      >
        {runtimeFixtureOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
