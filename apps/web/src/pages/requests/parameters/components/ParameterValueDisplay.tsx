import type { ParameterInputValue } from "@batchplane/domain";
import { useTranslation } from "react-i18next";

export function ParameterValueDisplay({
  value,
  sensitive,
}: {
  value?: ParameterInputValue;
  sensitive: boolean;
}) {
  const { t } = useTranslation("parameters");
  if (value === undefined) return <span>{t("noDefault")}</span>;
  if (sensitive || value.kind === "SAVED") return <span>{t("protected")}</span>;
  if (value.value === "") return <span>{t("emptyValue")}</span>;
  return (
    <span className="block min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {value.value}
    </span>
  );
}
