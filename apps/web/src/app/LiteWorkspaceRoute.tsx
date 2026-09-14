import { WorkspacePage } from "../pages/workspace/WorkspacePage";
import {
  GitHubConnectionForm,
  GitHubSessionSummary,
} from "../runtime/GitHubConnectionForm";
import { useGitHubConnection } from "../runtime/useGitHubConnection";

export function LiteWorkspaceRoute() {
  const connection = useGitHubConnection();
  return (
    <WorkspacePage
      connectionForm={(controls) => (
        <GitHubConnectionForm connection={connection} {...controls} />
      )}
      storedConnection={<GitHubSessionSummary connection={connection} />}
      prepareRequest={connection.save}
    />
  );
}
