import { useTranslation } from "react-i18next";
import { ParameterValueDisplay } from "../../parameters/components/ParameterValueDisplay";

export function ExecutionRequestParameterValue({
  sensitive,
  value,
}: {
  sensitive: boolean;
  value?: string;
}) {
  const { t } = useTranslation("parameters");
  if (sensitive) return <span>{t("protected")}</span>;
  if (value === undefined) return <span>{t("valueUnavailable")}</span>;
  return (
    <ParameterValueDisplay sensitive={false} value={{ kind: "VALUE", value }} />
  );
}
