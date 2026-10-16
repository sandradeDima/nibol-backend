import assert from "node:assert/strict";
import test from "node:test";

import {
  canReviewEvidence,
  canViewActionPlanHistory,
  canViewEvidence,
} from "./progress.service.js";
import type { AuthorizationSummary } from "../../services/authorization-service.js";

const access = (
  roleCode: AuthorizationSummary["roleCode"],
  permissions: string[] = ["evidence.review"],
): AuthorizationSummary => ({
  dataScope: roleCode === "AUDITOR" ? "AUDIT_SCOPE" : "ASSIGNED",
  isAdmin: roleCode === "SYSTEM_ADMIN",
  permissions,
  roleCode,
  roleCodes: roleCode ? [roleCode] : [],
  roleName: roleCode,
  roles: roleCode ? [roleCode] : [],
  userId: "user-1",
});

test("evidence review follows permission regardless of the role name", () => {
  assert.equal(canReviewEvidence(access("AUDITOR")), true);
  assert.equal(canReviewEvidence(access("SYSTEM_ADMIN")), true);
  assert.equal(canReviewEvidence(access("PROCESS_OWNER")), true);
  assert.equal(canReviewEvidence(access(null)), true);
  assert.equal(canReviewEvidence(access(null, [])), false);
});

test("evidence visibility follows evidence.view independently of observation access", () => {
  assert.equal(canViewEvidence(access(null, ["evidence.view"])), true);
  assert.equal(canViewEvidence(access("AUDITOR", [])), false);
  assert.equal(canViewEvidence(access("SYSTEM_ADMIN", [])), true);
});

test("progress review history follows action_plans.history.view", () => {
  assert.equal(
    canViewActionPlanHistory(access(null, ["action_plans.history.view"])),
    true,
  );
  assert.equal(canViewActionPlanHistory(access("AUDITOR", [])), false);
});
