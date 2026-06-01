import { describe, expect, it } from "vitest";

import {
  buildSchedulePullRequestBody,
  buildSchedulePullRequestTitle,
  createScheduleBranchName,
  defaultScheduleFormValues,
  getScheduleDefinitionPath,
  parseScheduleDefinitionYaml,
  serializeScheduleDefinitionYaml,
  toScheduleDefinition,
  toScheduleFormValues,
  validateScheduleRegistration,
  type ScheduleFormValues,
} from "./schedule-model";

const formValues = {
  cron: "0 5 * * *",
  enabled: true,
  name: "Daily settlement window",
  scheduleId: "payment.daily-close-daily",
  timezone: "Asia/Seoul",
} satisfies ScheduleFormValues;

const definition = toScheduleDefinition("payment.daily-close", formValues);

describe("schedule model", () => {
  it("builds deterministic governed schedule paths", () => {
    expect(getScheduleDefinitionPath("payment.daily-close-daily")).toBe(
      ".batch-governance/schedules/payment.daily-close-daily.yml",
    );
    expect(getScheduleDefinitionPath("")).toBe("");
  });

  it("serializes and parses schedule definitions", () => {
    const yaml = serializeScheduleDefinitionYaml(definition);

    expect(yaml).toContain('  batchId: "payment.daily-close"');
    expect(yaml).toContain('  id: "payment.daily-close-daily"');
    expect(yaml).toContain('  cron: "0 5 * * *"');
    expect(yaml).toContain("  enabled: true");
    expect(parseScheduleDefinitionYaml(yaml)).toEqual(definition);
  });

  it("validates required schedule fields", () => {
    expect(validateScheduleRegistration(definition)).toEqual([]);
    expect(
      validateScheduleRegistration({
        ...definition,
        cron: "",
        name: "",
        scheduleId: "",
      }),
    ).toEqual(["scheduleId", "name", "cron"]);
  });

  it("creates stable schedule branch names", () => {
    expect(
      createScheduleBranchName(
        "Payment Daily Close Daily",
        "create",
        new Date("2026-05-09T01:02:03.000Z"),
      ),
    ).toBe(
      "batchplane/schedule/register/payment-daily-close-daily-20260509010203",
    );
    expect(
      createScheduleBranchName(
        "Payment Daily Close Daily",
        "change",
        new Date("2026-05-09T01:02:03.000Z"),
      ),
    ).toBe(
      "batchplane/schedule/change/payment-daily-close-daily-20260509010203",
    );
  });

  it("creates auditable PR metadata for schedule changes", () => {
    expect(buildSchedulePullRequestTitle(definition)).toBe(
      "Register schedule payment.daily-close-daily",
    );
    expect(buildSchedulePullRequestTitle(definition, "change")).toBe(
      "Change schedule payment.daily-close-daily",
    );
    expect(buildSchedulePullRequestBody(definition)).toContain(
      "## BatchPlane Schedule Registration",
    );
    expect(buildSchedulePullRequestBody(definition)).toContain(
      "- Schedule definition: `.batch-governance/schedules/payment.daily-close-daily.yml`",
    );
  });

  it("maps schedule definitions back to form values", () => {
    expect(toScheduleFormValues(definition)).toEqual(formValues);
    expect(defaultScheduleFormValues.enabled).toBe(true);
  });
});
