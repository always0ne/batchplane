import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

export async function buildActionBundle({
  actionDirectory,
  outputDirectory = resolve(actionDirectory, "dist"),
}) {
  rmSync(outputDirectory, { force: true, recursive: true });
  mkdirSync(outputDirectory, { recursive: true });

  await build({
    absWorkingDir: actionDirectory,
    bundle: true,
    entryPoints: [resolve(actionDirectory, "src/index.ts")],
    format: "esm",
    outfile: resolve(outputDirectory, "index.js"),
    platform: "node",
    target: "node24",
  });
}

const invokedPath = process.argv[1];

if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await buildActionBundle({ actionDirectory: process.cwd() });
}
