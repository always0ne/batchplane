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
