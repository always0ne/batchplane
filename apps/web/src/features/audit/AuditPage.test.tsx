import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { i18next } from "../../i18n/i18n";
import {
  createBatchPlaneRuntime,
  writeRuntimeFixtureSelection,
} from "../../runtime/runtime-fixtures";
import { AuditPage } from "./AuditPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("AuditPage", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await i18next.changeLanguage("en");
  });

  it.each(["en", "ko"])(
    "distinguishes every native schedule attempt and its exact detail link in %s",
    async (locale) => {
      await i18next.changeLanguage(locale);
      writeRuntimeFixtureSelection("native-schedule-mixed");
      const runtime = createBatchPlaneRuntime(session);
      render(
        <MemoryRouter>
          <AuditPage
            createRuntime={() => runtime}
            readSession={() => session}
          />
        </MemoryRouter>,
      );

      const links = await screen.findAllByRole("link", {
        name: locale === "en" ? "Execution detail" : "실행 상세",
      });
      expect(links).toHaveLength(4);
      const cases = [
        {
          letter: "a",
          attempt: 1,
          schedule: "weekday-close",
          en: "Succeeded",
          ko: "성공",
        },
        {
          letter: "a",
          attempt: 2,
          schedule: "weekday-close",
          en: "Gate blocked",
          ko: "Gate 차단",
        },
        {
          letter: "b",
          attempt: 1,
          schedule: "weekday-open",
          en: "Business failed",
          ko: "업무 실패",
        },
        {
          letter: "b",
          attempt: 2,
          schedule: "weekday-open",
          en: "Evidence unconfirmed",
          ko: "증적 확인 불가",
        },
      ];
      for (const occurrence of cases) {
        const locator = `native:btr-schedule-${occurrence.letter.repeat(64)}:900:${occurrence.attempt}`;
        const link = links.find(
          (item) =>
            item.getAttribute("href") ===
            `/execution-runs/${encodeURIComponent(locator)}`,
        );
        expect(link).toBeDefined();
        const row = within(link!.closest("li")!);
        const summary =
          locale === "en"
            ? `Schedule ${occurrence.schedule}, Run 900, attempt ${occurrence.attempt}: ${occurrence.en}`
            : `스케줄 ${occurrence.schedule}, Run 900, 시도 ${occurrence.attempt}: ${occurrence.ko}`;
        expect(row.getByText(summary)).toBeInTheDocument();
        expect(
          row.queryByText(locale === "en" ? "Run completed" : "Run 완료"),
        ).not.toBeInTheDocument();
        expect(
          row.getByRole("link", {
            name: locale === "en" ? "GitHub source" : "GitHub 원본",
          }),
        ).toHaveAttribute(
          "href",
          expect.stringContaining(`/attempts/${occurrence.attempt}`),
        );
      }
      expect(screen.queryByText(/nativeObservation\./)).not.toBeInTheDocument();
    },
  );

  it("renders audit timeline items with source links and filters", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    render(
      <MemoryRouter>
        <AuditPage
          createRuntime={() => createGitHubLiteRuntime(session, { client })}
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Audit Trail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Timeline filters")).toBeInTheDocument();
    expect(screen.getAllByText("Execution requested").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/Gate blocked for/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText("GitHub source").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Batch"), {
      target: { value: "payment.daily-close" },
    });

    expect(screen.getByDisplayValue("payment.daily-close")).toBeInTheDocument();
    expect(screen.getAllByText(/payment.daily-close/u).length).toBeGreaterThan(
      0,
    );
  });

  it("renders an empty state when no runtime session is available", async () => {
    render(
      <MemoryRouter>
        <AuditPage readSession={() => null} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Connect a Workspace to inspect the audit trail.",
      ),
    ).toBeInTheDocument();
  });
});
