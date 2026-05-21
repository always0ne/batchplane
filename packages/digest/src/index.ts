export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue | undefined };

export type DigestEnvelope = {
  comments?: string[];
  labels?: string[];
  markdownBody?: string;
  payload: CanonicalValue;
};

export const canonicalExecutionRequestPayloadFixture: CanonicalValue = {
  apiVersion: "batchtrail.io/v1",
  kind: "ExecutionRequest",
  metadata: {
    batchId: "payment.daily-close",
    requestId: "btr-20260513010000-payment.daily-close-abcdef12",
  },
  spec: {
    batch: {
      criticality: "HIGH",
      domain: "payments",
      environment: "PROD",
      name: "Daily Close",
      owner: "ops-team",
    },
    expiresAt: "2026-05-13T02:00:00.000Z",
    reason: "Manual request from BatchPlane Lite.",
    requestedAt: "2026-05-13T01:00:00.000Z",
    requestedBy: "developer",
    workflow: {
      path: ".github/workflows/payment.daily-close.yml",
      ref: "main",
    },
  },
};

export const canonicalExecutionRequestDigestFixture =
  "sha256:1d03f50ceb52c2233a7ecf60c739c275f11975a7a156677fccc34f6f102cf9a9";

export function canonicalize(value: CanonicalValue): string {
  return JSON.stringify(normalize(value));
}

export async function createCanonicalDigest(
  value: CanonicalValue,
): Promise<string> {
  return `sha256:${await sha256Hex(canonicalize(value))}`;
}

export async function createParameterDigest(
  parameters: Record<string, CanonicalValue | undefined>,
): Promise<string> {
  return createCanonicalDigest({ parameters });
}

export async function createReasonDigest(reason: string): Promise<string> {
  return createCanonicalDigest({ reason });
}

export async function createRequestDigest(
  input: CanonicalValue | DigestEnvelope,
): Promise<string> {
  return createCanonicalDigest(isDigestEnvelope(input) ? input.payload : input);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalize(value: CanonicalValue): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const entry = value[key];
        if (entry === undefined || entry === null || entry === "") {
          return acc;
        }
        acc[key] = normalize(entry);
        return acc;
      }, {});
  }

  if (typeof value === "string") {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  return value;
}

function isDigestEnvelope(
  value: CanonicalValue | DigestEnvelope,
): value is DigestEnvelope {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "payload" in value,
  );
}
