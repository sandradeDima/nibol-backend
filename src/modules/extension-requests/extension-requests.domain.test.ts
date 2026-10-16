import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExtensionReviewQueueScopeWhere,
  getEffectiveExtensionDueDate,
  isActiveWorkflowInstanceStatus,
} from "./extension-requests.service.js";
import type { AuthorizationSummary } from "../../services/authorization-service.js";

const customReviewer: AuthorizationSummary = {
  dataScope: "ASSIGNED",
  isAdmin: false,
  permissions: ["deadline_extensions.approve"],
  roleCode: null,
  roleCodes: [],
  roleName: "Custom reviewer",
  roles: ["Custom reviewer"],
  userId: "reviewer-1",
};

test("extension cancellation identifies workflow instances that still need cleanup", () => {
  assert.equal(isActiveWorkflowInstanceStatus("PENDING"), true);
  assert.equal(isActiveWorkflowInstanceStatus("WAITING"), true);
  assert.equal(isActiveWorkflowInstanceStatus("COMPLETED"), false);
  assert.equal(isActiveWorkflowInstanceStatus("CANCELLED"), false);
});

test("extension review scope includes only requests assigned to a workflow task", () => {
  const where = buildExtensionReviewQueueScopeWhere(customReviewer, [
    "request-1",
  ]);
  const idFilter = where.OR?.find((filter) => "id" in filter) as
    | { id?: { in?: string[] } }
    | undefined;

  assert.deepEqual(idFilter, { id: { in: ["request-1"] } });
  assert.equal(
    where.OR?.some((filter) => "requestedByUserId" in filter),
    false,
  );
  assert.ok(JSON.stringify(where).includes('"areaAssignments"'));
  assert.ok(
    JSON.stringify(where).includes('"areaResponsibleUserId":"reviewer-1"'),
  );
});

test("intermediate manager approval does not change the effective deadline", () => {
  const previousDueDate = new Date("2026-11-01T00:00:00.000Z");
  const proposedDueDate = new Date("2026-12-01T00:00:00.000Z");
  const currentDueDate = getEffectiveExtensionDueDate({
    actionPlanDueDate: previousDueDate,
    previousDueDate,
  });

  assert.notEqual(currentDueDate.getTime(), proposedDueDate.getTime());
  assert.equal(currentDueDate.toISOString(), previousDueDate.toISOString());
});
