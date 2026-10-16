import assert from "node:assert/strict";
import test from "node:test";

import {
  buildObservationDeadlineWhere,
  buildObservationProgressWhere,
  getObservationDeadlineStatus,
  nextAvailableObservationNumber,
} from "./observations.service.js";
import { countWorkflowTasksForObservation } from "./observation-aggregation.service.js";
import { observationDeadlineService } from "./observation-deadline.service.js";
import {
  EDITABLE_PROGRESS_STATUSES,
  FILE_LEVEL_EVIDENCE_REVIEW_CONTEXTS,
  isOfficialProgressStatusTransitionAllowed,
  officialProgressByStatus,
} from "../progress/progress.constants.js";
import { getWorkflowEntityAdapter } from "../workflows/workflow-entity-adapters.js";

test("reutiliza el menor número libre dentro de un informe", () => {
  assert.equal(nextAvailableObservationNumber([1, 2, 4, 5]), 3);
  assert.equal(nextAvailableObservationNumber([1, 2, 3]), 4);
  assert.equal(nextAvailableObservationNumber([]), 1);
});

const allScope = {
  dataScope: "ALL" as const,
  isAdmin: true,
  permissions: [],
  roleCode: "SYSTEM_ADMIN" as const,
  roleName: "Administrador del sistema",
  roles: ["Admin"],
  userId: "user-1",
};

test("el filtro de avance consulta el estado exacto de los planes de acción", () => {
  assert.deepEqual(buildObservationProgressWhere(["CON_AVANCE"], allScope), {
    actionPlans: {
      some: {
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
        status: { in: ["WITH_PROGRESS"] },
      },
    },
  });
  assert.equal(buildObservationProgressWhere([], allScope), null);
});

test("los filtros de plazo coinciden con el estado visible", () => {
  const now = new Date("2026-10-14T00:00:00.000Z");
  assert.deepEqual(buildObservationDeadlineWhere("VIGENTE", now), {
    OR: [
      {
        currentDueDate: { gte: now },
        deadlineExtensionRequests: {
          none: { deletedAt: null, status: "MANAGER_APPROVED" },
        },
      },
      { status: { isFinal: true } },
    ],
  });
  assert.deepEqual(buildObservationDeadlineWhere("REPROGRAMADO", now), {
    currentDueDate: { gte: now },
    deadlineExtensionRequests: {
      some: { deletedAt: null, status: "MANAGER_APPROVED" },
    },
    status: { isFinal: false },
  });
  assert.deepEqual(buildObservationDeadlineWhere("VENCIDO", now), {
    currentDueDate: { lt: now },
    status: { isFinal: false },
  });
  assert.equal(getObservationDeadlineStatus(true, false, false), "VIGENTE");
  assert.equal(getObservationDeadlineStatus(false, true, true), "VENCIDO");
  assert.equal(
    getObservationDeadlineStatus(false, false, true),
    "REPROGRAMADO",
  );
  assert.equal(getObservationDeadlineStatus(false, false, false), "VIGENTE");
});

test("el correlativo se calcula por conjunto de números del informe", () => {
  assert.equal(nextAvailableObservationNumber([1, 2]), 3);
  assert.equal(nextAvailableObservationNumber([2, 3]), 1);
});

test("el estado oficial es la única fuente del porcentaje oficial", () => {
  assert.deepEqual(officialProgressByStatus, {
    CONCLUDED: 100,
    NOT_STARTED: 0,
    STARTED: 20,
    WITH_PROGRESS: 60,
  });
});

test("el conteo de tareas solo considera tareas de evaluaciones relacionadas", () => {
  assert.deepEqual(
    countWorkflowTasksForObservation(
      ["evaluation-1", "evaluation-2"],
      new Map([
        ["evaluation-1", { completed: 1, total: 2 }],
        ["evaluation-2", { completed: 1, total: 1 }],
        ["other", { completed: 8, total: 8 }],
      ]),
    ),
    { completed: 2, total: 3 },
  );
});

test("la evidencia del avance solo es editable en borrador o devolución", () => {
  assert.equal(EDITABLE_PROGRESS_STATUSES.has("DRAFT"), true);
  assert.equal(EDITABLE_PROGRESS_STATUSES.has("RETURNED"), true);
  assert.equal(EDITABLE_PROGRESS_STATUSES.has("SENT_TO_AUDIT"), false);
  assert.equal(EDITABLE_PROGRESS_STATUSES.has("APPROVED"), false);
});

test("la revisión por archivo queda limitada a documentos de observación o cierre", () => {
  assert.equal(FILE_LEVEL_EVIDENCE_REVIEW_CONTEXTS.has("FINDING"), true);
  assert.equal(FILE_LEVEL_EVIDENCE_REVIEW_CONTEXTS.has("CLOSURE"), true);
  assert.equal(FILE_LEVEL_EVIDENCE_REVIEW_CONTEXTS.has("ACTION_PLAN"), false);
  assert.equal(
    FILE_LEVEL_EVIDENCE_REVIEW_CONTEXTS.has("PROGRESS_EVALUATION"),
    false,
  );
});

test("la revisión de un avance solo permite progresar el estado oficial", () => {
  assert.equal(
    isOfficialProgressStatusTransitionAllowed("STARTED", "WITH_PROGRESS"),
    true,
  );
  assert.equal(
    isOfficialProgressStatusTransitionAllowed("WITH_PROGRESS", "STARTED"),
    false,
  );
  assert.equal(
    isOfficialProgressStatusTransitionAllowed("WITH_PROGRESS", "WITH_PROGRESS"),
    true,
  );
});

test("rechazar o devolver una tarea exige comentario", async () => {
  const extensionAdapter = getWorkflowEntityAdapter("DEADLINE_EXTENSION");
  const closureAdapter = getWorkflowEntityAdapter("OBSERVATION_CLOSURE");
  if (
    !extensionAdapter?.validateTaskAction ||
    !closureAdapter?.validateTaskAction
  )
    throw new Error("Los adaptadores no exponen validación de tareas.");
  const validateExtensionTaskAction = extensionAdapter.validateTaskAction;
  const validateClosureTaskAction = closureAdapter.validateTaskAction;
  const input = {
    actorUserId: "user-1",
    entityId: "entity-1",
    node: {} as never,
  };

  await assert.rejects(
    validateExtensionTaskAction({ ...input, action: "REJECT" }),
    /comentario/,
  );
  await assert.doesNotReject(() =>
    validateClosureTaskAction({
      ...input,
      action: "REQUEST_CORRECTION",
      comment: "Falta aclarar el resultado.",
    }),
  );
});

test("el cierre no exige documento pero conserva el avance obligatorio", async () => {
  const adapter = getWorkflowEntityAdapter("OBSERVATION_CLOSURE");
  assert.ok(adapter);
  let reportedProgressPercent = 100;
  const db = {
    progressEvaluation: {
      findFirst: async () => ({
        actionPlan: {
          observation: { id: "observation-1", status: { isFinal: false } },
        },
        evidenceFiles: [],
        reportedProgressPercent,
        reviewStatus: "DRAFT",
      }),
    },
  };

  await assert.doesNotReject(() =>
    adapter.validateStart({
      actorUserId: "user-1",
      db: db as never,
      entityId: "evaluation-1",
    }),
  );
  reportedProgressPercent = 99;
  await assert.rejects(
    adapter.validateStart({
      actorUserId: "user-1",
      db: db as never,
      entityId: "evaluation-1",
    }),
    /100%/,
  );
});

test("el cierre por workflow concluye la observación al terminar todos sus planes", async () => {
  const adapter = getWorkflowEntityAdapter("OBSERVATION_CLOSURE");
  assert.ok(adapter?.applyCompletion);
  const plans = [
    { id: "plan-1", progressPercent: 60, status: "WITH_PROGRESS" },
    { id: "plan-2", progressPercent: 60, status: "WITH_PROGRESS" },
  ];
  const observationUpdates: Array<{
    progressPercent: number;
    statusId: string;
  }> = [];
  let observationLocked = false;
  const db = {
    $queryRaw: async (query: TemplateStringsArray) => {
      assert.match(query.join("?"), /WITH \(UPDLOCK, HOLDLOCK, ROWLOCK\)/);
      if (query[0]?.includes("FROM observations")) {
        observationLocked = true;
        return [{ id: "observation-1" }];
      }
      assert.ok(observationLocked);
      return plans;
    },
    progressEvaluation: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        actionPlan: { id: where.id, observationId: "observation-1" },
        evaluatedStatus: "CONCLUDED",
        reviewStatus: "APPROVED",
      }),
    },
    actionPlan: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string; progressPercent: number };
      }) => {
        assert.ok(observationLocked);
        Object.assign(plans.find((plan) => plan.id === where.id)!, data);
      },
    },
    observation: {
      findUnique: async () => ({ id: "observation-1" }),
      update: async ({
        data,
      }: {
        data: { progressPercent: number; statusId: string };
      }) => {
        observationUpdates.push(data);
      },
    },
    observationStatus: {
      findFirst: async ({ where }: { where: { key: string } }) => ({
        id: where.key,
      }),
    },
  };

  for (const entityId of ["plan-1", "plan-2"])
    await adapter.applyCompletion({
      db: db as never,
      entityId,
      finalResult: "APPROVED",
      instanceId: "workflow-1",
    });

  assert.deepEqual(observationUpdates, [
    { progressPercent: 80, statusId: "CON_AVANCE" },
    { progressPercent: 100, statusId: "CONCLUIDO" },
  ]);
});

test("el límite de plazo se calcula desde la fecha del informe", () => {
  assert.equal(
    observationDeadlineService
      .calculate(new Date("2026-01-01T00:00:00.000Z"), 90)
      .toISOString()
      .slice(0, 10),
    "2026-04-01",
  );
});

test("la fecha de compromiso acepta cualquier fecha hasta el máximo configurable", () => {
  const reportDate = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    observationDeadlineService.isCommitmentDateAllowed(
      reportDate,
      90,
      new Date("2026-04-01T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    observationDeadlineService.isCommitmentDateAllowed(
      reportDate,
      90,
      new Date("2026-04-02T00:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    observationDeadlineService.isCommitmentDateAllowed(
      reportDate,
      180,
      new Date("2026-06-30T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    observationDeadlineService.isCommitmentDateAllowed(
      reportDate,
      90,
      new Date("2025-12-31T00:00:00.000Z"),
    ),
    false,
  );
});
