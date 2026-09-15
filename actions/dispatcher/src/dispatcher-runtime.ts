import type {
  DispatcherRunInput,
  DispatcherRunResult,
} from "./dispatcher-types.js";

export async function runDispatcherFromEnvironment(
  dispatch: (input: DispatcherRunInput) => Promise<DispatcherRunResult>,
): Promise<void> {
  const repository = requiredEnvironmentValue("GITHUB_REPOSITORY");
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo form.");
  }

  const result = await dispatch({
    apiBaseUrl: process.env["GITHUB_API_URL"],
    commentId: requiredNumberInput("comment-id"),
    githubToken: requiredActionInput("github-token"),
    issueNumber: requiredNumberInput("issue-number"),
    owner,
    repo,
  });

  if (result.status === "failed") {
    throw new Error(`${result.reasonCode}: ${result.message}`);
  }
}

function requiredNumberInput(name: string): number {
  const value = Number.parseInt(requiredActionInput(name), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Input ${name} must be a positive integer.`);
  }
  return value;
}

function requiredActionInput(name: string): string {
  const key = `INPUT_${name.toUpperCase()}`;
  const normalizedKey = key.replaceAll("-", "_");
  const value = process.env[key] ?? process.env[normalizedKey] ?? "";
  if (!value.trim()) throw new Error(`Input ${name} is required.`);
  return value.trim();
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}
