import assert from "node:assert/strict";
import test from "node:test";

import { createProgressEvaluationSchema } from "../progress/progress.validators.js";
import { createObservationSchema } from "./observations.validators.js";

const ids = {
  area: "00000000-0000-4000-8000-000000000001",
  area2: "00000000-0000-4000-8000-000000000002",
  report: "00000000-0000-4000-8000-000000000003",
  auditor: "00000000-0000-4000-8000-000000000004",
  dictionary: "00000000-0000-4000-8000-000000000005",
  owner: "00000000-0000-4000-8000-000000000006",
  responsible: "00000000-0000-4000-8000-000000000007",
  risk: "00000000-0000-4000-8000-000000000008",
  risk2: "00000000-0000-4000-8000-000000000009",
  level: "00000000-0000-4000-8000-000000000010",
};

const observationInput = () => ({
  areaAssignments: [
    {
      areaId: ids.area,
      areaResponsibleUserId: ids.responsible,
      processOwnerUserId: ids.owner,
    },
    {
      areaId: ids.area2,
      areaResponsibleUserId: ids.owner,
      processOwnerUserId: ids.responsible,
    },
  ],
  auditRecommendation: "Aplicar y documentar el control.",
  auditReportId: ids.report,
  auditorUserId: ids.auditor,
  category: null,
  currentStage: null,
  description: "Debilidad de control identificada por Auditoría.",
  mainObservationId: ids.dictionary,
  observationNumber: 1,
  process: null,
  riskIds: [ids.risk, ids.risk2],
  riskLevelId: ids.level,
  source: null,
  title: "Control insuficiente",
});

test("observation input accepts numeric numbering, multiple risks and independent area roles", () => {
  const result = createObservationSchema.parse(observationInput());
  assert.equal(result.observationNumber, 1);
  assert.equal(result.riskIds.length, 2);
  assert.notEqual(
    result.areaAssignments[0]?.processOwnerUserId,
    result.areaAssignments[0]?.areaResponsibleUserId,
  );
});

test("observation input accepts optional action plans associated with an area", () => {
  const withoutPlans = createObservationSchema.parse(observationInput());
  assert.deepEqual(withoutPlans.actionPlans, []);

  const withPlans = createObservationSchema.parse({
    ...observationInput(),
    actionPlans: [
      {
        areaId: ids.area,
        description: "Documentar el control y capacitar al equipo.",
        dueDate: "2026-09-30",
        responsibleUserId: ids.responsible,
        title: "Implementar control",
      },
    ],
  });
  assert.equal(withPlans.actionPlans.length, 1);
  assert.ok(withPlans.actionPlans[0]?.dueDate instanceof Date);

  assert.equal(
    createObservationSchema.safeParse({
      ...observationInput(),
      actionPlans: [
        {
          areaId: ids.report,
          description: "No corresponde al área.",
          dueDate: "2026-09-30",
          responsibleUserId: ids.responsible,
          title: "Plan inválido",
        },
      ],
    }).success,
    false,
  );
});

test("observation input rejects duplicate risks and duplicate areas", () => {
  const duplicateRisk = observationInput();
  duplicateRisk.riskIds = [ids.risk, ids.risk];
  assert.equal(createObservationSchema.safeParse(duplicateRisk).success, false);

  const duplicateArea = observationInput();
  duplicateArea.areaAssignments[1]!.areaId = ids.area;
  assert.equal(createObservationSchema.safeParse(duplicateArea).success, false);
});

test("observation numbering rejects non-positive and non-integer values", () => {
  for (const observationNumber of [0, -1, 1.5]) {
    const input = observationInput();
    input.observationNumber = observationNumber;
    assert.equal(createObservationSchema.safeParse(input).success, false);
  }
});

test("evaluation status and percentage remain internally consistent", () => {
  assert.equal(
    createProgressEvaluationSchema.safeParse({
      actionPlanStatus: "CONCLUDED",
      comment: "Cierre solicitado.",
      progressPercent: 99,
      type: "FINALIZATION",
    }).success,
    false,
  );
  assert.equal(
    createProgressEvaluationSchema.safeParse({
      actionPlanStatus: "NOT_STARTED",
      comment: "Avance inválido.",
      progressPercent: 10,
      type: "ADVANCE",
    }).success,
    false,
  );
});
