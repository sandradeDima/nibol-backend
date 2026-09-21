import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoleDashboardHierarchy,
  getRoleDashboardStatus,
} from "./dashboard.service.js";
import { buildObservationUrl } from "../../utils/observation-links.js";

test("dashboard deep links preserve the observation context", () => {
  assert.equal(
    buildObservationUrl("observation-1", {
      advanceId: "advance-1",
      planId: "plan-1",
      tab: "plans",
    }),
    "/observaciones/observation-1?tab=plans&planId=plan-1&advanceId=advance-1",
  );
});

test("role dashboard status reflects mixed observation states", () => {
  assert.deepEqual(getRoleDashboardStatus(2, 0), {
    key: "PENDING",
    name: "Pendiente",
  });
  assert.deepEqual(getRoleDashboardStatus(0, 3), {
    key: "CONCLUDED",
    name: "Concluida",
  });
  assert.deepEqual(getRoleDashboardStatus(1, 1), {
    key: "MIXED",
    name: "Mixto",
  });
});

test("role dashboard keeps responsible and executor hierarchy role-specific", () => {
  const record = {
    areaAssignments: [
      {
        actionPlans: [
          { responsibleUser: { id: "executor-1", name: "Ejecutor 1" } },
        ],
        area: { id: "area-1", name: "Área 1" },
        areaResponsible: { id: "responsible-1", name: "Responsable 1" },
      },
    ],
    id: "observation-1",
    status: { isFinal: false },
  } as never;

  const processOwnerArea = buildRoleDashboardHierarchy(
    [record],
    "PROCESS_OWNER",
  )[0]!;
  assert.equal(processOwnerArea.responsibles?.[0]?.id, "responsible-1");
  assert.equal(
    processOwnerArea.responsibles?.[0]?.executors[0]?.id,
    "executor-1",
  );

  const areaResponsibleArea = buildRoleDashboardHierarchy(
    [record],
    "AREA_RESPONSIBLE",
  )[0]!;
  assert.equal(areaResponsibleArea.responsibles, undefined);
  assert.equal(areaResponsibleArea.executors?.[0]?.id, "executor-1");
});
