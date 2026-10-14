import type { DispatcherCommand } from "./dispatcher-types.js";

export function parseDispatcherCommand(commentBody: string): DispatcherCommand {
  if (commentBody.startsWith("/bgcp approve ")) return "approve";
  return "ignore";
}
