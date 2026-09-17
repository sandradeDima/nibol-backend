import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import {
  assertReportFilterAccess,
  getReportFilterCapabilities,
} from "./reports.service.js";

const access = (
  roleCode: AuthorizationSummary["roleCode"],
  dataScope: AuthorizationSummary["dataScope"],
): AuthorizationSummary => ({
  dataScope,
  isAdmin: roleCode === "SYSTEM_ADMIN",
  permissions: ["reports.view", "reports.export"],
  roleCode,
  roleName: roleCode,
  roles: roleCode ? [roleCode] : [],
  userId: "user-1",
});

test("expone solo los filtros jerárquicos permitidos por rol", () => {
  assert.deepEqual(getReportFilterCapabilities(access("SYSTEM_ADMIN", "ALL")), {
    area: true,
    areaResponsible: true,
    auditReport: true,
    executor: true,
    processOwner: true,
  });
  assert.deepEqual(
    getReportFilterCapabilities(access("AUDIT_CHIEF", "AUDIT_SCOPE")),
    {
      area: true,
      areaResponsible: true,
      auditReport: true,
      executor: true,
      processOwner: true,
    },
  );
  assert.deepEqual(
    getReportFilterCapabilities(access("PROCESS_OWNER", "AREA")),
    {
      area: false,
      areaResponsible: true,
      auditReport: false,
      executor: true,
      processOwner: false,
    },
  );
  assert.deepEqual(
    getReportFilterCapabilities(access("AREA_RESPONSIBLE", "AREA")),
    {
      area: false,
      areaResponsible: false,
      auditReport: false,
      executor: true,
      processOwner: false,
    },
  );
  assert.deepEqual(
    getReportFilterCapabilities(access("EXECUTOR", "ASSIGNED")),
    {
      area: false,
      areaResponsible: false,
      auditReport: false,
      executor: false,
      processOwner: false,
    },
  );
});

test("rechaza filtros jerárquicos manipulados fuera del alcance", () => {
  const executor = access("EXECUTOR", "ASSIGNED");
  assert.doesNotThrow(() =>
    assertReportFilterAccess({ cutoffDate: "2026-09-17" } as never, executor),
  );
  assert.throws(
    () =>
      assertReportFilterAccess(
        { areaId: "00000000-0000-0000-0000-000000000001" } as never,
        executor,
      ),
    /filtros no está disponible/,
  );
  assert.doesNotThrow(() =>
    assertReportFilterAccess(
      {
        executorId: ["00000000-0000-0000-0000-000000000001"],
      } as never,
      access("PROCESS_OWNER", "AREA"),
    ),
  );
  assert.throws(
    () =>
      assertReportFilterAccess(
        {
          processOwnerId: ["00000000-0000-0000-0000-000000000001"],
        } as never,
        access("PROCESS_OWNER", "AREA"),
      ),
    /filtros no está disponible/,
  );
});
