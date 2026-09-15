import { pathToFileURL } from "node:url";
import { runGateFromEnv } from "./gate-runtime.js";

export type { GateInput, GateMode, GateResult } from "./gate-types.js";
export { verifyLiteAuthorization } from "./gate-authorization.js";
export { verifyLiteInput } from "./gate-input.js";
export { readGateInputFromEnv, runGateFromEnv } from "./gate-runtime.js";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runGateFromEnv();
}
