import {
  generateParameterEncryptionKey,
  parameterPrivateKeySecretName,
  stringifyRepositoryYaml,
  type MockGitHubLiteClient,
} from "@batchplane/github-lite";
import type { BatchChangeDraft } from "@batchplane/ui-client";

/** Local-only public configuration and metadata; no private key is retained. */
export async function prepareApprovedParameterFixture(
  client: MockGitHubLiteClient,
): Promise<void> {
  const { configuration } = await generateParameterEncryptionKey();
  client.state.files.push({
    branch: "main",
    path: ".batch-governance/parameter-encryption.yml",
    content: stringifyRepositoryYaml(configuration),
    sha: "mock-parameter-encryption-configuration",
  });
  client.state.actionsSecrets.push({
    name: parameterPrivateKeySecretName,
    createdAt: "2026-10-11T00:00:00Z",
    updatedAt: "2026-10-11T00:00:00Z",
  });
}

export function withApprovedFixtureParameters(
  draft: BatchChangeDraft,
): BatchChangeDraft {
  return {
    ...draft,
    parameters: [
      {
        name: "REPORT_SCOPE",
        required: true,
        sensitive: false,
        defaultValue: { kind: "VALUE", value: "payments\nsettlements" },
      },
      {
        name: "EMPTY_MARKER",
        required: false,
        sensitive: false,
        defaultValue: { kind: "VALUE", value: "" },
      },
      { name: "OPTIONAL_NOTE", required: false, sensitive: false },
      {
        name: "SERVICE_TOKEN",
        required: true,
        sensitive: true,
        defaultValue: { kind: "VALUE", value: "synthetic-default-token" },
      },
    ],
    schedules: [
      {
        scheduleId: "weekday-close",
        name: "Weekday close",
        cron: "0 18 * * 1-5",
        timezone: "Asia/Seoul",
        enabled: true,
        parameters: [
          {
            name: "REPORT_SCOPE",
            source: "VALUE",
            value: { kind: "VALUE", value: "weekday\nclose" },
          },
          { name: "EMPTY_MARKER", source: "DEFAULT" },
          { name: "OPTIONAL_NOTE", source: "OMIT" },
          { name: "SERVICE_TOKEN", source: "DEFAULT" },
        ],
      },
      {
        scheduleId: "weekend-close",
        name: "Weekend close",
        cron: "0 18 * * 0,6",
        timezone: "Asia/Seoul",
        enabled: true,
        parameters: [
          { name: "REPORT_SCOPE", source: "DEFAULT" },
          { name: "EMPTY_MARKER", source: "OMIT" },
          {
            name: "OPTIONAL_NOTE",
            source: "VALUE",
            value: { kind: "VALUE", value: "" },
          },
          {
            name: "SERVICE_TOKEN",
            source: "VALUE",
            value: { kind: "VALUE", value: "synthetic-weekend-token" },
          },
        ],
      },
    ],
  };
}
