import { parseDocument, stringify, type YAMLParseError } from "yaml";

export type RepositoryYamlScalar = string | number | boolean | null;

export type RepositoryYamlValue =
  | RepositoryYamlScalar
  | RepositoryYamlValue[]
  | { [key: string]: RepositoryYamlValue | undefined };

export type RepositoryYamlDiagnostic = {
  line: number;
  column: number;
  message: string;
};

export type RepositoryYamlParseResult<T = RepositoryYamlValue> =
  | { ok: true; value: T }
  | { diagnostics: RepositoryYamlDiagnostic[]; ok: false };

/** Parses stored governance files without changing the source bytes used as evidence. */
export function parseRepositoryYaml(input: string): RepositoryYamlParseResult {
  const document = parseDocument(input, { strict: true, uniqueKeys: true });

  if (document.errors.length > 0) {
    return {
      diagnostics: document.errors.map(toYamlDiagnostic),
      ok: false,
    };
  }

  return { ok: true, value: document.toJS() as RepositoryYamlValue };
}

export function stringifyRepositoryYaml(value: RepositoryYamlValue): string {
  return stringify(value, { indent: 2, lineWidth: 0 });
}

export function formatRepositoryYamlDiagnostics(
  diagnostics: RepositoryYamlDiagnostic[],
): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}`,
    )
    .join("; ");
}

function toYamlDiagnostic(error: YAMLParseError): RepositoryYamlDiagnostic {
  const position = error.linePos?.[0];

  return {
    column: position?.col ?? 1,
    line: position?.line ?? 1,
    message: error.message,
  };
}
