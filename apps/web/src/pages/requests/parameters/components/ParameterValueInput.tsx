import type { ParameterInputValue } from "@batchplane/domain";
import { Eye, EyeOff } from "lucide-react";
import { type CSSProperties, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";

export function ParameterValueInput({
  label,
  value,
  sensitive,
  sensitiveInputsAvailable,
  onChange,
}: {
  label: string;
  value: ParameterInputValue;
  sensitive: boolean;
  sensitiveInputsAvailable: boolean;
  onChange: (value: ParameterInputValue) => void;
}) {
  const { t } = useTranslation("parameters");
  const cautionId = useId();
  const [revealed, setRevealed] = useState(false);
  const unavailable = sensitive && !sensitiveInputsAvailable;

  if (value.kind === "SAVED") {
    return (
      <div className="min-w-0 space-y-2">
        <p className="break-words text-sm font-semibold text-bp-graphite [overflow-wrap:anywhere]">
          {label}: {t("protected")}
        </p>
        <Button
          disabled={unavailable}
          onClick={() => {
            setRevealed(false);
            onChange({ kind: "VALUE", value: "" });
          }}
          size="compact"
        >
          {t("replace")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <label className="block min-w-0 text-sm font-semibold text-bp-graphite">
        <span className="mb-1 block break-words [overflow-wrap:anywhere]">
          {label}
        </span>
        <textarea
          aria-describedby={sensitive ? cautionId : undefined}
          autoComplete="off"
          className={`min-h-24 w-full min-w-0 resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm caret-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20 disabled:bg-slate-100 ${sensitive && !revealed ? "text-transparent supports-[-webkit-text-security:disc]:text-bp-graphite" : "text-bp-graphite"}`}
          disabled={unavailable}
          onChange={(event) =>
            onChange({ kind: "VALUE", value: event.target.value })
          }
          spellCheck={false}
          style={
            sensitive && !revealed
              ? ({ WebkitTextSecurity: "disc" } as CSSProperties)
              : undefined
          }
          value={value.value}
        />
      </label>
      {sensitive ? (
        <div className="flex min-w-0 items-start gap-2">
          <Button
            aria-label={t(revealed ? "hide" : "show")}
            aria-pressed={revealed}
            disabled={unavailable}
            onClick={() => setRevealed(!revealed)}
            size="compact"
            title={t(revealed ? "hide" : "show")}
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <p
            className="min-w-0 break-words text-xs text-amber-800"
            id={cautionId}
          >
            {t("savedSensitiveCaution")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
