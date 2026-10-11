import * as core from "@actions/core";
import { pathToFileURL } from "node:url";
import { validateParameterString } from "@batchplane/domain";
import {
  createGitHubLiteClient,
  decryptParameterValue,
  inputPreparationStepName,
  loadWorkspaceEncryptionConfiguration,
  type GitHubResolvedParameter,
  type WorkspaceEncryptionConfiguration,
} from "@batchplane/github-lite";
import { verifyLiteAuthorization } from "./gate-authorization.js";
import { parseRepository } from "./gate-github-client.js";
import { parameterFailureCode } from "./gate-parameters.js";
import { readGateInputFromEnv, writeGateLogRecord } from "./gate-runtime.js";

/** Values remain in this job; only the explicitly bound business step inherits them. */
export async function prepareParameterEnvironment({
  parameters,
  repositoryId,
  batchId,
  configuration,
  privateKey,
  mask,
}: {
  parameters: Record<string, GitHubResolvedParameter>;
  repositoryId: string;
  batchId: string;
  configuration: WorkspaceEncryptionConfiguration | null;
  privateKey: string;
  mask: (value: string) => void;
}): Promise<Record<string, string>> {
  const environment: Record<string, string> = {};
  for (const [name, parameter] of Object.entries(parameters)) {
    let value: string;
    if (parameter.sensitive) {
      if (!configuration || !privateKey)
        throw new Error("PARAMETER_PRIVATE_KEY_UNAVAILABLE");
      value = await decryptParameterValue(
        parameter,
        privateKey,
        configuration,
        {
          repositoryId,
          batchId,
          parameterName: name,
          origin: parameter.source.origin,
        },
      );
      registerParameterMask(value, mask);
    } else {
      value = parameter.value;
    }
    validateParameterString(value);
    environment[`BATCHPLANE_PARAM_${name}`] = value;
  }
  return environment;
}

function registerParameterMask(
  value: string,
  mask: (value: string) => void,
): void {
  if (value.length === 0) return;
  mask(value);
  // The runner can display JSON-escaped step outputs in expression diagnostics.
  const escaped = JSON.stringify(value).slice(1, -1);
  if (escaped !== value) mask(escaped);
}

export async function runInputPreparation(env = process.env): Promise<void> {
  const input = readGateInputFromEnv(env);
  input.gateStepName = inputPreparationStepName;
  try {
    const authorization = await verifyLiteAuthorization(input);
    if (authorization.result === "DENY" || !authorization.verifiedSha) {
      writeGateLogRecord(authorization, input, env);
      core.setFailed(
        authorization.reasonCode ?? "PARAMETER_AUTHORIZATION_FAILED",
      );
      return;
    }
    const parameters = authorization.approvedParameters ?? {};
    const hasSensitiveValues = Object.values(parameters).some(
      (value) => value.sensitive,
    );
    let configuration: WorkspaceEncryptionConfiguration | null = null;
    if (hasSensitiveValues) {
      configuration = await loadWorkspaceEncryptionConfiguration({
        client: createGitHubLiteClient({
          token: input.githubToken!,
          apiBaseUrl: input.apiBaseUrl,
        }),
        repositoryRef: parseRepository(input.repository!),
        ref: authorization.verifiedSha,
        configPath: input.configPath,
      });
    }
    const environment = await prepareParameterEnvironment({
      parameters,
      repositoryId: input.repositoryId ?? "",
      batchId: input.batchId,
      configuration,
      privateKey: env["INPUT_PRIVATE-KEY"] ?? "",
      mask: core.setSecret,
    });
    core.setOutput("environment", JSON.stringify(environment));
    writeGateLogRecord(
      {
        result: "ALLOW",
        message: "Approved inputs are prepared for the batch command.",
      },
      input,
      env,
    );
  } catch (error) {
    const reasonCode = parameterFailureCode(error);
    writeGateLogRecord(
      {
        result: "DENY",
        reasonCode,
        message: `Approved input preparation failed (${reasonCode}). The batch command did not start.`,
      },
      input,
      env,
    );
    core.setFailed(reasonCode);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runInputPreparation();
}
