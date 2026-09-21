import assert from "node:assert/strict";
import test from "node:test";

import { nextAvailableObservationNumber } from "./observations.service.js";
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
