export type DispatcherCommand = "approve" | "retry-dispatch" | "ignore";

export function parseDispatcherCommand(commentBody: string): DispatcherCommand {
  if (commentBody.startsWith("/bgcp approve ")) {
    return "approve";
  }

  if (commentBody.startsWith("/bgcp retry-dispatch ")) {
    return "retry-dispatch";
  }

  return "ignore";
}
