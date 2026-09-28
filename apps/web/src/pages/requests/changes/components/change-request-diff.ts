export type ChangeRequestDiffLine = {
  kind: "added" | "context" | "removed";
  text: string;
};

export function buildDiffLines(
  baseContent: string,
  nextContent: string,
): ChangeRequestDiffLine[] {
  const baseLines = splitLines(baseContent);
  const nextLines = splitLines(nextContent);
  const table = Array.from({ length: baseLines.length + 1 }, () =>
    Array<number>(nextLines.length + 1).fill(0),
  );

  for (let baseIndex = baseLines.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let nextIndex = nextLines.length - 1; nextIndex >= 0; nextIndex -= 1) {
      table[baseIndex]![nextIndex] =
        baseLines[baseIndex] === nextLines[nextIndex]
          ? table[baseIndex + 1]![nextIndex + 1]! + 1
          : Math.max(
              table[baseIndex + 1]![nextIndex]!,
              table[baseIndex]![nextIndex + 1]!,
            );
    }
  }

  const lines: ChangeRequestDiffLine[] = [];
  let baseIndex = 0;
  let nextIndex = 0;

  while (baseIndex < baseLines.length && nextIndex < nextLines.length) {
    if (baseLines[baseIndex] === nextLines[nextIndex]) {
      lines.push({ kind: "context", text: baseLines[baseIndex]! });
      baseIndex += 1;
      nextIndex += 1;
    } else if (
      table[baseIndex + 1]![nextIndex]! >= table[baseIndex]![nextIndex + 1]!
    ) {
      lines.push({ kind: "removed", text: baseLines[baseIndex]! });
      baseIndex += 1;
    } else {
      lines.push({ kind: "added", text: nextLines[nextIndex]! });
      nextIndex += 1;
    }
  }

  while (baseIndex < baseLines.length) {
    lines.push({ kind: "removed", text: baseLines[baseIndex]! });
    baseIndex += 1;
  }

  while (nextIndex < nextLines.length) {
    lines.push({ kind: "added", text: nextLines[nextIndex]! });
    nextIndex += 1;
  }

  return lines;
}

function splitLines(content: string): string[] {
  return content ? content.replace(/\n$/, "").split("\n") : [];
}
