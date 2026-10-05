export const batchPlaneApiVersion = "batchplane.io/v1";
export const legacyBatchPlaneApiVersion = "batchtrail.io/v1";

export const supportedBatchPlaneApiVersions = [
  batchPlaneApiVersion,
  legacyBatchPlaneApiVersion,
] as const;

export type BatchPlaneApiVersion =
  (typeof supportedBatchPlaneApiVersions)[number];

export function isBatchPlaneApiVersion(
  value: unknown,
): value is BatchPlaneApiVersion {
  return (
    typeof value === "string" &&
    supportedBatchPlaneApiVersions.includes(value as BatchPlaneApiVersion)
  );
}
