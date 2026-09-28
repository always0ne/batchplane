import { describe, expectTypeOf, it } from "vitest";

import type { ChangeRequestEvidenceView } from "./change-requests.js";

type VerifiedEvidenceIdentifier =
  | "governedChangeId"
  | "requestDigest"
  | "targetRevisionDigest";

type LegacyEvidence = Extract<
  ChangeRequestEvidenceView,
  { kind: "LEGACY_UNAPPROVABLE" }
>;
type ReapprovalRequiredEvidence = Extract<
  ChangeRequestEvidenceView,
  { kind: "REAPPROVAL_REQUIRED" }
>;
type UnverifiedDispositionEvidence = Extract<
  ChangeRequestEvidenceView,
  { kind: "UNVERIFIED_DISPOSITION" }
>;

describe("change request client contract", () => {
  it("type-level: keeps verified evidence identifiers in the VERIFIED_V2 branch", () => {
    expectTypeOf<
      Extract<ChangeRequestEvidenceView, { kind: "VERIFIED_V2" }>
    >().toMatchTypeOf<{
      governedChangeId: string;
      requestDigest: string;
      targetRevisionDigest: string;
    }>();
  });

  it("type-level: keeps verified identifiers absent from every unverified evidence branch", () => {
    expectTypeOf<
      Extract<keyof LegacyEvidence, VerifiedEvidenceIdentifier>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof ReapprovalRequiredEvidence, VerifiedEvidenceIdentifier>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof UnverifiedDispositionEvidence, VerifiedEvidenceIdentifier>
    >().toEqualTypeOf<never>();
  });
});
