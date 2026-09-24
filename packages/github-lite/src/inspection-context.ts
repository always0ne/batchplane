import type { RepoRef } from "./github-types.js";
import type { WorkspacePolicy } from "@batchplane/domain";
import { defaultWorkspacePolicy } from "@batchplane/domain";
import { parseExecutionRequestDetail } from "./execution-approval-legacy.js";
import {
  formatRepositoryYamlDiagnostics,
  parseRepositoryYaml,
} from "./repository-yaml.js";
import { validateWorkspacePolicyFile } from "./repository-schema.js";
import type {
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "./repository-evidence-types.js";
import type {
  GitHubIssue,
  GitHubIssueComment,
  GitHubLiteClient,
  GitHubPullRequest,
} from "./github-types.js";

export type ExecutionRequestForRun = NonNullable<
  ReturnType<typeof parseExecutionRequestDetail>
>;
const liteWorkspacePolicyPath = ".batch-governance/workspace.yml";
export function toRepositoryIssue(issue: GitHubIssue): RepositoryIssue {
  return {
    ...issue,
    state: issue.state === "all" ? "open" : issue.state,
  };
}

export function toRepositoryIssueComment(
  comment: GitHubIssueComment,
): RepositoryIssueComment {
  return comment;
}

export function toRepositoryPullRequest(
  pullRequest: GitHubPullRequest,
): RepositoryPullRequest {
  return pullRequest;
}

export async function loadExecutionApprovalRequests(
  client: GitHubLiteClient,
  repositoryRef: RepoRef,
): Promise<ExecutionRequestForRun[]> {
  const issues = await client.listIssues({
    ...repositoryRef,
    state: "all",
  });
  const parsedRequests = await Promise.all(
    issues.map(async (issue) => {
      const comments = await client.listIssueComments({
        ...repositoryRef,
        issueNumber: issue.number,
      });

      return parseExecutionRequestDetail(
        toRepositoryIssue(issue),
        comments.map(toRepositoryIssueComment),
      );
    }),
  );

  return parsedRequests.filter(
    (request): request is ExecutionRequestForRun => request !== null,
  );
}

export function parseWorkspacePolicyFile(content: string): WorkspacePolicy {
  const parsed = parseRepositoryYaml(content);

  if (!parsed.ok) {
    throw new Error(formatRepositoryYamlDiagnostics(parsed.diagnostics));
  }

  const validated = validateWorkspacePolicyFile(parsed.value);

  if (!validated.ok) {
    throw new Error(
      validated.diagnostics
        .map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`)
        .join("; "),
    );
  }

  return validated.value.spec;
}

export async function loadWorkspacePolicy({
  client,
  ref,
  repositoryRef,
}: {
  client: GitHubLiteClient;
  ref?: string;
  repositoryRef: RepoRef;
}): Promise<WorkspacePolicy> {
  const repository = await client.getRepository(repositoryRef);
  const file = await client.getFile({
    ...repositoryRef,
    path: liteWorkspacePolicyPath,
    ref: ref || repository.defaultBranch,
  });

  if (!file) {
    return defaultWorkspacePolicy;
  }

  return parseWorkspacePolicyFile(file.content);
}
