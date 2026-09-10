import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizationService,
  buildActionPlanScopeWhere,
  buildEvidenceScopeWhere,
  buildExtensionRequestScopeWhere,
  buildObservationScopeWhere,
  type AuthorizationSummary,
} from "./authorization-service.js";
import { ROLE_PERMISSION_NAMES } from "../permissions/definitions.js";

const access = (
  roleCode: AuthorizationSummary["roleCode"],
  dataScope: AuthorizationSummary["dataScope"],
  permissions: string[] = [],
): AuthorizationSummary => ({
  dataScope,
  isAdmin: roleCode === "SYSTEM_ADMIN",
  permissions,
  roleCode,
  roleName: roleCode,
  roles: roleCode ? [roleCode] : [],
  userId: "user-1",
});

test("cada rol NIBOL usa el scope de datos esperado", () => {
  assert.equal(
    authorizationService.getAccessibleScope(
      access("AUDITOR", "AUDIT_SCOPE"),
      "observations",
    ),
    "AUDIT_SCOPE",
  );
  assert.deepEqual(
    buildObservationScopeWhere(access("AUDITOR", "AUDIT_SCOPE")),
    {
      deletedAt: null,
    },
  );
  assert.deepEqual(
    buildObservationScopeWhere(access("PROCESS_OWNER", "AREA")),
    {
      areaAssignments: { some: { processOwnerUserId: "user-1" } },
      deletedAt: null,
    },
  );
  assert.deepEqual(
    buildObservationScopeWhere(access("AREA_RESPONSIBLE", "AREA")),
    {
      areaAssignments: { some: { areaResponsibleUserId: "user-1" } },
      deletedAt: null,
    },
  );
  assert.deepEqual(buildObservationScopeWhere(access("EXECUTOR", "ASSIGNED")), {
    actionPlans: {
      some: { deletedAt: null, responsibleUserId: "user-1" },
    },
    deletedAt: null,
  });
});

test("el scope de executor evita IDOR en planes, evidencias y ampliaciones", () => {
  const executor = access("EXECUTOR", "ASSIGNED");
  const planWhere = buildActionPlanScopeWhere(executor);
  const evidenceWhere = buildEvidenceScopeWhere(executor);
  const extensionWhere = buildExtensionRequestScopeWhere(executor);

  assert.deepEqual(planWhere, { deletedAt: null, responsibleUserId: "user-1" });
  assert.deepEqual(evidenceWhere, {
    OR: [
      { actionPlan: { deletedAt: null, responsibleUserId: "user-1" } },
      {
        observation: {
          actionPlans: {
            some: { deletedAt: null, responsibleUserId: "user-1" },
          },
          deletedAt: null,
        },
      },
    ],
    deletedAt: null,
  });
  assert.deepEqual(extensionWhere, {
    OR: [
      { requestedByUserId: "user-1" },
      { actionPlan: { deletedAt: null, responsibleUserId: "user-1" } },
    ],
    deletedAt: null,
  });
});

test("los permisos sensibles quedan separados por rol", () => {
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("observations.close"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("observations.create"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("observations.send"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("action_plans.evaluate"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("action_plans.approve"));
  assert.ok(
    ROLE_PERMISSION_NAMES.PROCESS_OWNER.includes(
      "action_plans.assign_executor",
    ),
  );
  assert.ok(
    ROLE_PERMISSION_NAMES.PROCESS_OWNER.includes("action_plans.create"),
  );
  assert.ok(ROLE_PERMISSION_NAMES.PROCESS_OWNER.includes("action_plans.edit"));
  assert.ok(
    !ROLE_PERMISSION_NAMES.PROCESS_OWNER.includes(
      "recommended_action_plans.edit",
    ),
  );
  assert.ok(
    !ROLE_PERMISSION_NAMES.PROCESS_OWNER.includes("observations.close"),
  );
  assert.ok(
    ROLE_PERMISSION_NAMES.AREA_RESPONSIBLE.includes(
      "deadline_extensions.approve",
    ),
  );
  assert.ok(
    ROLE_PERMISSION_NAMES.AREA_RESPONSIBLE.includes(
      "action_plans.submit_to_audit",
    ),
  );
  assert.ok(
    ROLE_PERMISSION_NAMES.EXECUTOR.includes("deadline_extensions.request"),
  );
  assert.ok(ROLE_PERMISSION_NAMES.EXECUTOR.includes("evidence.create"));
  assert.ok(
    ROLE_PERMISSION_NAMES.EXECUTOR.includes("action_plans.submit_to_audit"),
  );
  assert.ok(
    !ROLE_PERMISSION_NAMES.EXECUTOR.includes("deadline_extensions.approve"),
  );
  assert.ok(
    !ROLE_PERMISSION_NAMES.EXECUTOR.includes("action_plans.assign_executor"),
  );
  assert.equal(
    authorizationService.can(
      access("EXECUTOR", "ASSIGNED", ["observations.close"]),
      "observations.close",
    ),
    true,
  );
});
