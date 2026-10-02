import { describe, expectTypeOf, it } from "vitest";

import type {
  ApprovalDecision,
  AuditTimelineItem,
  BatchDefinition,
  ExecutionRequest,
  ExecutionRun,
  WorkspacePolicy,
} from "./index.js";

describe("domain product contracts", () => {
  it("type-level: keeps batch definitions free of provider workflow and execution fields", () => {
    expectTypeOf<BatchDefinition>().not.toHaveProperty("workflow");
    expectTypeOf<BatchDefinition>().not.toHaveProperty("execution");
  });

  it("type-level: exposes approval, request, run, and audit product contracts", () => {
    expectTypeOf<WorkspacePolicy>().toMatchTypeOf<{
      approval: { mode: string };
    }>();
    expectTypeOf<ExecutionRequest>().toMatchTypeOf<{
      approvedBatchRevision: {
        governedChangeId: string;
        targetRevisionDigest: string;
      };
      requestId: string;
    }>();
    expectTypeOf<ApprovalDecision>().toMatchTypeOf<{
      subjectId: string;
      subjectType: string;
    }>();
    expectTypeOf<ExecutionRun>().toMatchTypeOf<{
      batchId: string;
      requestId: string;
    }>();
    expectTypeOf<AuditTimelineItem>().toMatchTypeOf<{
      subjectId: string;
      subjectType: string;
    }>();
  });
});
