import { describe, expect, it } from "vitest";

import { createGitHubLiteClient } from "./index";

describe("createGitHubLiteClient", () => {
  it("adds GitHub auth headers and maps the current user", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        login: "always0ne",
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(client.getCurrentUser()).resolves.toEqual({
      login: "always0ne",
    });

    const request = requests[0];

    expect(request?.input.toString()).toBe("https://api.github.com/user");

    const headers = new Headers(request?.init?.headers);

    expect(headers.get("Authorization")).toBe("Bearer ghp_test");
  });

  it("returns null when a file is missing", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ message: "Not Found" }, { status: 404 });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getFile({ owner: "always0ne", repo: "batchtrail", path: "x.yml" }),
    ).resolves.toBeNull();
  });

  it("decodes base64 file content", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        path: "batchtrail.yml",
        encoding: "base64",
        content: btoa("name: nightly\n"),
      });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getFile({
        owner: "always0ne",
        repo: "batchtrail",
        path: "batchtrail.yml",
      }),
    ).resolves.toEqual({
      path: "batchtrail.yml",
      content: "name: nightly\n",
    });
  });

  it("maps GitHub API errors", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ message: "Bad credentials" }, { status: 401 });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      code: "unauthorized",
      message: "Bad credentials",
      status: 401,
    });
  });
});
