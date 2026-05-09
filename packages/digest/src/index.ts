export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue | undefined };

export function canonicalize(value: CanonicalValue): string {
  return JSON.stringify(normalize(value));
}

export async function createCanonicalDigest(
  value: CanonicalValue,
): Promise<string> {
  return `sha256:${await sha256Hex(canonicalize(value))}`;
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
