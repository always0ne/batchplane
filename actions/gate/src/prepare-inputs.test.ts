import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  encryptParameterValue,
  generateParameterEncryptionKey,
  type GitHubResolvedParameter,
} from "@batchplane/github-lite";
import { prepareParameterEnvironment } from "./prepare-inputs.js";

describe("Approved business input preparation", () => {
  it("delivers exact ordinary and decrypted strings to a business process without introducing omitted names or the private key", async () => {
    const { configuration, privateKey } =
      await generateParameterEncryptionKey();
    const origin = { type: "REQUEST_VALUE" as const, requestId: "request-1" };
    const secret = " synthetic\n비밀 001 ";
    const encrypted = await encryptParameterValue(secret, configuration, {
      repositoryId: "123",
      batchId: "daily",
      parameterName: "Secret",
      origin,
    });
    const parameters: Record<string, GitHubResolvedParameter> = {
      Empty: { value: "", source: { origin } },
      Text: { value: " 001\n서울 ", source: { origin } },
      Secret: { ...encrypted, source: { origin } },
    };
    const mask = vi.fn();
    const environment = await prepareParameterEnvironment({
      parameters,
      repositoryId: "123",
      batchId: "daily",
      configuration,
      privateKey,
      mask,
    });
    expect(Object.keys(environment)).toEqual([
      "BATCHPLANE_PARAM_Empty",
      "BATCHPLANE_PARAM_Text",
      "BATCHPLANE_PARAM_Secret",
    ]);
    expect(mask.mock.calls).toEqual([
      [secret],
      [JSON.stringify(secret).slice(1, -1)],
    ]);
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        `
      const valid = process.env.BATCHPLANE_PARAM_Empty === ""
        && process.env.BATCHPLANE_PARAM_Text === " 001\\n서울 "
        && process.env.BATCHPLANE_PARAM_Secret === " synthetic\\n비밀 001 "
        && process.env.BATCHPLANE_PARAM_Omitted === undefined
        && process.env.BATCHPLANE_INPUT_KEY === undefined;
      process.exit(valid ? 0 : 1);
    `,
      ],
      { env: environment, encoding: "utf8" },
    );
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });

  it("rejects missing keys or mismatched encryption context instead of producing an empty substitute environment", async () => {
    const { configuration, privateKey } =
      await generateParameterEncryptionKey();
    const origin = { type: "BATCH_DEFAULT" as const };
    const encrypted = await encryptParameterValue("", configuration, {
      repositoryId: "123",
      batchId: "daily",
      parameterName: "Empty",
      origin,
    });
    const input = {
      parameters: {
        Empty: { ...encrypted, source: { origin, revision: "a".repeat(40) } },
      },
      repositoryId: "123",
      batchId: "daily",
      configuration,
      privateKey,
      mask: vi.fn(),
    };
    expect(await prepareParameterEnvironment(input)).toEqual({
      BATCHPLANE_PARAM_Empty: "",
    });
    expect(input.mask).not.toHaveBeenCalled();
    await expect(
      prepareParameterEnvironment({ ...input, privateKey: "" }),
    ).rejects.toThrow("PARAMETER_PRIVATE_KEY_UNAVAILABLE");
    await expect(
      prepareParameterEnvironment({ ...input, repositoryId: "456" }),
    ).rejects.toThrow("PARAMETER_DECRYPTION_FAILED");
  });
});
