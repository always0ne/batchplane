/**
 * Current GitHub Actions editing contract. This is UI input, not a transport
 * DTO or a promise that every future platform accepts the same settings.
 */
export type GitHubActionsExecutionSettings = {
  platform: "GITHUB_ACTIONS";
  ref: string;
  runnerLabel: string;
  command: string;
  existingFile?: {
    fileName: string;
    locator: string;
  };
  upload?: {
    fileName: string;
    bytes: Uint8Array;
  };
  removeExistingArtifact?: boolean;
};
