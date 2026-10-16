import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizationService,
  buildActionPlanScopeWhere,
  buildAuthorizationSummaryFromRoles,
  buildEvidenceScopeWhere,
  buildExtensionRequestScopeWhere,
  buildObservationScopeWhere,
  type AuthorizationSummary,
} from "./authorization-service.js";
import {
  ALL_PERMISSION_NAMES,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_NAMES,
} from "../permissions/definitions.js";

const access = (
  roleCode: AuthorizationSummary["roleCode"],
  dataScope: AuthorizationSummary["dataScope"],
  permissions: string[] = [],
): AuthorizationSummary => ({
  dataScope,
  isAdmin: roleCode === "SYSTEM_ADMIN",
  permissions,
  roleCode,
  roleCodes: roleCode ? [roleCode] : [],
  roleName: roleCode,
  roles: roleCode ? [roleCode] : [],
  userId: "user-1",
});

test("los permisos se unen entre todos los roles sin perder el scope asignado", () => {
  const summary = buildAuthorizationSummaryFromRoles("user-1", [
    {
      code: "CUSTOM_REVIEWER",
      name: "Revisor personalizado",
      permissions: ["deadline_extensions.approve"],
    },
    {
      code: "EXECUTOR",
      name: "Ejecutor",
      permissions: ["action_plans.submit_to_audit"],
    },
    {
      code: "PROCESS_OWNER",
      name: "Dueño del proceso",
      permissions: ["action_plans.view"],
    },
  ]);

  assert.deepEqual(summary.permissions, [
    "action_plans.submit_to_audit",
    "action_plans.view",
    "deadline_extensions.approve",
  ]);
  assert.deepEqual(summary.roleCodes, ["PROCESS_OWNER", "EXECUTOR"]);
  assert.deepEqual(summary.roles, [
    "Revisor personalizado",
    "Ejecutor",
    "Dueño del proceso",
  ]);
  assert.equal(summary.dataScope, "AREA");
  assert.equal(
    authorizationService.can(summary, "deadline_extensions.approve"),
    true,
  );
  assert.equal(
    authorizationService.can(summary, "deadline_extensions.reject"),
    false,
  );
  assert.deepEqual(buildActionPlanScopeWhere(summary), {
    AND: [
      {
        OR: [
          { remediationPlanId: null },
          { remediationPlan: { deletedAt: null } },
        ],
      },
    ],
    deletedAt: null,
    observation: { deletedAt: null },
    OR: [
      {
        observationArea: {
          observation: { deletedAt: null },
          OR: [
            { processOwnerUserId: "user-1" },
            { areaResponsibleUserId: "user-1" },
            {
              actionPlans: {
                some: {
                  OR: [
                    { remediationPlanId: null },
                    { remediationPlan: { deletedAt: null } },
                  ],
                  deletedAt: null,
                  responsibleUserId: "user-1",
                },
              },
            },
          ],
        },
      },
      { responsibleUserId: "user-1" },
    ],
  });
});

test("todo permiso del catálogo puede concederse y revocarse para roles personalizados", () => {
  assert.equal(new Set(ALL_PERMISSION_NAMES).size, ALL_PERMISSION_NAMES.length);
  assert.deepEqual(
    ROLE_DEFINITIONS.map(({ code }) => code).sort(),
    Object.keys(ROLE_PERMISSION_NAMES).sort(),
  );
  for (const permission of ALL_PERMISSION_NAMES) {
    const granted = buildAuthorizationSummaryFromRoles("user-1", [
      { code: "CUSTOM_REVIEWER", name: "Revisor", permissions: [permission] },
    ]);
    assert.equal(
      authorizationService.can(granted, permission),
      true,
      permission,
    );
    assert.equal(
      authorizationService.can({ ...granted, permissions: [] }, permission),
      false,
      permission,
    );
  }
  for (const permissions of Object.values(ROLE_PERMISSION_NAMES)) {
    assert.equal(new Set(permissions).size, permissions.length);
    assert.ok(
      permissions.every((permission) =>
        ALL_PERMISSION_NAMES.includes(permission),
      ),
    );
  }
});

test("un rol personalizado conserva el scope de sus asignaciones directas", () => {
  const custom = buildAuthorizationSummaryFromRoles("user-1", [
    {
      code: "CUSTOM_REVIEWER",
      name: "Revisor personalizado",
      permissions: ["observations.view", "deadline_extensions.approve"],
    },
  ]);
  assert.equal(custom.dataScope, "ASSIGNED");
  assert.deepEqual(buildObservationScopeWhere(custom), {
    deletedAt: null,
    OR: [
      {
        areaAssignments: {
          some: {
            OR: [
              { processOwnerUserId: "user-1" },
              { areaResponsibleUserId: "user-1" },
            ],
          },
        },
      },
      {
        actionPlans: {
          some: {
            OR: [
              { remediationPlanId: null },
              { remediationPlan: { deletedAt: null } },
            ],
            deletedAt: null,
            responsibleUserId: "user-1",
          },
        },
      },
    ],
  });
  assert.ok(
    JSON.stringify(buildExtensionRequestScopeWhere(custom)).includes(
      "areaResponsibleUserId",
    ),
  );
});

test("cada rol NIBOL usa el scope de datos esperado", () => {
  assert.equal(
    authorizationService.getAccessibleScope(
      access("AUDITOR", "AUDIT_SCOPE"),
      "observations",
    ),
    "AUDIT_SCOPE",
  );
  assert.equal(
    authorizationService.getAccessibleScope(
      access("AUDIT_CHIEF", "AUDIT_SCOPE"),
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
      areaAssignments: {
        some: {
          OR: [
            { processOwnerUserId: "user-1" },
            { areaResponsibleUserId: "user-1" },
          ],
        },
      },
      deletedAt: null,
    },
  );
  assert.deepEqual(
    buildObservationScopeWhere(access("AREA_RESPONSIBLE", "AREA")),
    {
      areaAssignments: {
        some: {
          OR: [
            { processOwnerUserId: "user-1" },
            { areaResponsibleUserId: "user-1" },
          ],
        },
      },
      deletedAt: null,
    },
  );
  assert.deepEqual(buildObservationScopeWhere(access("EXECUTOR", "ASSIGNED")), {
    deletedAt: null,
    OR: [
      {
        areaAssignments: {
          some: {
            OR: [
              { processOwnerUserId: "user-1" },
              { areaResponsibleUserId: "user-1" },
            ],
          },
        },
      },
      {
        actionPlans: {
          some: {
            OR: [
              { remediationPlanId: null },
              { remediationPlan: { deletedAt: null } },
            ],
            deletedAt: null,
            responsibleUserId: "user-1",
          },
        },
      },
    ],
  });
});

test("el scope de executor evita IDOR en planes, evidencias y ampliaciones", () => {
  const executor = access("EXECUTOR", "ASSIGNED");
  const planWhere = buildActionPlanScopeWhere(executor);
  const evidenceWhere = buildEvidenceScopeWhere(executor);
  const extensionWhere = buildExtensionRequestScopeWhere(executor);

  assert.ok(planWhere.OR?.some((filter) => "responsibleUserId" in filter));
  assert.ok(
    JSON.stringify(planWhere).includes('"processOwnerUserId":"user-1"'),
  );
  assert.ok(
    JSON.stringify(planWhere).includes('"areaResponsibleUserId":"user-1"'),
  );
  assert.equal(evidenceWhere.deletedAt, null);
  assert.equal(evidenceWhere.observation?.deletedAt, null);
  assert.ok(
    JSON.stringify(evidenceWhere).includes('"responsibleUserId":"user-1"'),
  );
  assert.equal(extensionWhere.deletedAt, null);
  assert.ok(
    JSON.stringify(extensionWhere).includes('"requestedByUserId":"user-1"'),
  );
  assert.ok(
    JSON.stringify(extensionWhere).includes('"areaResponsibleUserId":"user-1"'),
  );
});

test("los permisos sensibles quedan separados por rol", () => {
  assert.deepEqual(ROLE_PERMISSION_NAMES.AUDIT_CHIEF, [
    "users.view",
    "areas.view",
    "observations.view",
    "observations.view_module",
    "observations.history.view",
    "recommended_action_plans.view",
    "action_plans.view",
    "action_plans.view_module",
    "action_plans.history.view",
    "evidence.view",
    "deadline_extensions.view",
    "progress_evaluations.view",
    "reports.view",
    "reports.view_module",
    "reports.export",
    "notifications.view",
    "notifications.view_module",
  ]);
  assert.ok(!ROLE_PERMISSION_NAMES.AUDIT_CHIEF.includes("observations.delete"));
  assert.ok(!ROLE_PERMISSION_NAMES.AUDIT_CHIEF.includes("action_plans.delete"));
  assert.ok(!ROLE_PERMISSION_NAMES.AUDIT_CHIEF.includes("observations.close"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("observations.close"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("observations.create"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("observations.send"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("action_plans.evaluate"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("action_plans.approve"));
  assert.ok(ROLE_PERMISSION_NAMES.AUDITOR.includes("action_plans.delete"));
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
  assert.ok(ROLE_PERMISSION_NAMES.AREA_RESPONSIBLE.includes("evidence.delete"));
  assert.ok(
    ROLE_PERMISSION_NAMES.EXECUTOR.includes("deadline_extensions.request"),
  );
  assert.ok(ROLE_PERMISSION_NAMES.EXECUTOR.includes("evidence.create"));
  assert.ok(ROLE_PERMISSION_NAMES.EXECUTOR.includes("evidence.delete"));
  assert.ok(ROLE_PERMISSION_NAMES.EXECUTOR.includes("action_plans.create"));
  assert.ok(!ROLE_PERMISSION_NAMES.EXECUTOR.includes("action_plans.edit"));
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
