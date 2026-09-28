import { useTranslation } from "react-i18next";
import {
  criticalityOptions,
  statusOptions,
  type BatchChangeFormValues,
} from "../batch-change-form";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";

export function BatchMetadataEditor({
  batchIdReadOnly = false,
  onOwnerBlur,
  onValueChange,
  values,
}: {
  batchIdReadOnly?: boolean;
  onOwnerBlur: () => void;
  onValueChange: (field: keyof BatchChangeFormValues, value: string) => void;
  values: BatchChangeFormValues;
}) {
  const { t } = useTranslation("registration");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("form.definition")}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TextField
          disabled={batchIdReadOnly}
          label={t("form.batchId")}
          onChange={(value) => onValueChange("batchId", value)}
          placeholder={t("form.placeholders.batchId")}
          value={values.batchId}
        />
        <TextField
          label={t("form.name")}
          onChange={(value) => onValueChange("name", value)}
          placeholder={t("form.placeholders.name")}
          value={values.name}
        />
        <TextField
          label={t("form.owner")}
          onChange={(value) => onValueChange("owner", value)}
          onBlur={onOwnerBlur}
          placeholder={t("form.placeholders.owner")}
          value={values.owner}
        />
        <TextField
          label={t("form.domain")}
          onChange={(value) => onValueChange("domain", value)}
          placeholder={t("form.placeholders.domain")}
          value={values.domain}
        />
        <TextField
          label={t("form.environment")}
          onChange={(value) => onValueChange("environment", value)}
          placeholder={t("form.placeholders.environment")}
          value={values.environment}
        />
        <SelectField
          label={t("form.criticality")}
          onChange={(value) => onValueChange("criticality", value)}
          options={criticalityOptions}
          value={values.criticality}
        />
        <SelectField
          label={t("form.status")}
          onChange={(value) => onValueChange("status", value)}
          options={statusOptions}
          value={values.status}
        />
      </div>
    </article>
  );
}
