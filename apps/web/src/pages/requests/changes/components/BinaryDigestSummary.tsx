import type { ChangeRequestPreviewFile } from "@batchplane/ui-client";

export function BinaryDigestSummary({
  file,
  label,
}: {
  file: ChangeRequestPreviewFile;
  label: string;
}) {
  const digests = [
    { phase: "before", value: file.beforeDigest },
    { phase: "after", value: file.afterDigest },
  ];

  return (
    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
      {digests.map(({ phase, value }) => (
        <div key={phase}>
          <dt className="font-semibold text-bp-muted">{`${label} (${phase})`}</dt>
          <dd className="mt-1 break-all font-mono text-bp-graphite">
            {value ?? "-"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
