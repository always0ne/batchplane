import { parseDocument, stringify, type YAMLParseError } from "yaml";

export type GovernanceYamlScalar = string | number | boolean | null;

export type GovernanceYamlValue =
  | GovernanceYamlScalar
  | GovernanceYamlValue[]
  | { [key: string]: GovernanceYamlValue | undefined };

export type GovernanceYamlDiagnostic = {
  line: number;
  column: number;
  message: string;
};

export type GovernanceYamlParseResult<T = GovernanceYamlValue> =
  | { ok: true; value: T }
  | { diagnostics: GovernanceYamlDiagnostic[]; ok: false };

/** Parses stored governance files without changing the source bytes used as evidence. */
export function parseGovernanceYaml(input: string): GovernanceYamlParseResult {
  const document = parseDocument(input, { strict: true, uniqueKeys: true });

  if (document.errors.length > 0) {
    return {
      diagnostics: document.errors.map(toYamlDiagnostic),
      ok: false,
    };
  }

  return { ok: true, value: document.toJS() as GovernanceYamlValue };
}

export function stringifyGovernanceYaml(value: GovernanceYamlValue): string {
  return stringify(value, { indent: 2, lineWidth: 0 });
}

export function formatGovernanceYamlDiagnostics(
  diagnostics: GovernanceYamlDiagnostic[],
): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}`,
    )
    .join("; ");
}

function toYamlDiagnostic(error: YAMLParseError): GovernanceYamlDiagnostic {
  const position = error.linePos?.[0];

  return {
    column: position?.col ?? 1,
    line: position?.line ?? 1,
    message: error.message,
  };
}
