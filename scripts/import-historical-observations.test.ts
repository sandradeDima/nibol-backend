import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPlan,
  observationIdentity,
  parseArgs,
  prepareSource,
  readWorkbook,
  reconcileDatabase,
  splitRisks,
  writeIfAuthorized,
} from "./import-historical-observations.js";

type Book = Parameters<typeof prepareSource>[0];
type Snapshot = Parameters<typeof buildPlan>[1];
type Report = Parameters<typeof prepareSource>[1];
const report = (): Report => ({
  mode: "dry-run",
  database: "AVAILABLE",
  counts: {},
  records: {},
  exceptions: [],
  historicalSourceComments: [],
  historicalReprogrammingSource: [],
});
const empty = (): Snapshot => ({
  users: [],
  roles: [],
  userRoles: [],
  permissions: [],
  rolePermissions: [],
  areas: [],
  classes: [],
  dictionaries: [],
  risks: [],
  riskLevels: [],
  statuses: [],
  reports: [],
  observations: [],
  comments: [],
});
const base = {
  "Informe de Auditoría": "AI-01-2022",
  "Título de informe": "Audit",
  "Fecha de informe": "2022-01-01",
  "Número de observación": "AI-01-2022-05",
  "Observación principal": "Principal",
  "Título de observación": "Title",
  "Observación detallada": "Description",
  Recomendación: "Recommendation",
  "Riesgos asociados": "▪ Risk A\n▪ Risk B",
  "Nivel de riesgo": "Medio",
  "Fecha compromiso (vencimiento)": "2023-01-01",
  Área: "North",
  "Dueño de proceso": "Owner",
  "Responsable de área": "Responsible",
  "Plan de acción": "Fix it",
  "Ejecutor (reporte)": "Executor",
  "Fecha compromiso (plan de acción)": "2023-01-01",
  "Estado según avance": "No iniciado (NI)",
};
const detail = (row: number, changes: Record<string, string> = {}) => ({
  _row: row,
  ...base,
  ...changes,
});
const workbook = (rows = [detail(3), detail(4, { Área: "South" })]): Book => ({
  "Detalle de obs. y planes": rows,
  "Riesgos asociados": [
    { _row: 2, "Riesgos asociados": "Risk A" },
    { _row: 3, "Riesgos asociados": "Risk B" },
  ],
  Usuarios: [
    {
      _row: 2,
      Área: "North",
      "Nombre de personal": "Owner",
      Correo: "owner@example.com",
      Rol: "Dueño de proceso",
      Cargo: "Owner job",
    },
    {
      _row: 3,
      Área: "South",
      "Nombre de personal": "Responsible",
      Correo: "responsible@example.com",
      Rol: "Responsable de área",
      Cargo: "Responsible job",
    },
    {
      _row: 4,
      Área: "North",
      "Nombre de personal": "Executor",
      Correo: "executor@example.com",
      Rol: "Ejecutor",
      Cargo: "Executor job",
    },
  ],
  "BD-Observaciones": [{ _row: 2, "Observación principal": "Principal" }],
  "BD-Informes Auditoría": [
    {
      _row: 2,
      "N°-Informe": "AI-01-2022",
      "Título de informe": "Audit",
      Fecha: "2022-01-01",
      Clase: "Annual",
    },
  ],
});
const plan = (rows?: ReturnType<typeof detail>[], db = empty()) => {
  const output = report();
  return {
    output,
    result: buildPlan(
      prepareSource(workbook(rows), output, false),
      db,
      {},
      output,
    ),
  };
};

test("rows group into one historical Observation and two Areas", () => {
  const p = plan().result.observations;
  assert.equal(p.length, 1);
  assert.equal(p[0]?.number, 5);
  assert.equal(p[0]?.areas.length, 2);
});
test("all bullet separators produce independent risks", () => {
  for (const bullet of ["▪", "•", "*"])
    assert.deepEqual(splitRisks(`${bullet} A\n${bullet} B`), ["A", "B"]);
});
test("repeated risks yield one link per risk", () =>
  assert.equal(plan().result.observations[0]?.riskLinks.length, 2));
test("risk names differing only by accents share the database risk", () => {
  const { result, output } = plan([
    detail(3, { "Riesgos asociados": "▪ Perdida económica" }),
    detail(4, { "Riesgos asociados": "▪ Pérdida económica" }),
  ]);
  assert.equal(result.risks.length, 3);
  assert.equal(result.observations[0]?.riskLinks.length, 1);
  assert.equal(
    output.exceptions.filter((x) => x.code === "RISK_SOURCE_VARIANTS_COLLAPSED_BY_DB_COLLATION").length,
    1,
  );
});
test("risk links reuse an existing risk with accent-only spelling differences", () => {
  const db = empty();
  db.risks = [
    {
      id: "existing-risk",
      name: "Pérdida económica",
      isActive: true,
    },
  ];
  const { result } = plan(
    [detail(3, { "Riesgos asociados": "▪ Perdida economica" })],
    db,
  );
  assert.equal(
    result.observations[0]?.riskLinks.find((link) =>
      link.identity.includes("Perdida"),
    )?.riskId,
    "existing-risk",
  );
});
test("users use roster emails and technical actor is created", () => {
  const p = plan().result;
  assert.equal(p.users.length, 4);
  assert.equal(p.actor.email, "historical-import@nibol.local");
  assert.equal(
    p.users.find((u) => u.name === "Executor")?.email,
    "executor@example.com",
  );
});
test("canonical roles, levels and statuses are planned", () => {
  const p = plan().result;
  assert.deepEqual(p.roles.map((r) => r.code).sort(), [
    "AREA_RESPONSIBLE",
    "EXECUTOR",
    "PROCESS_OWNER",
  ]);
  assert.deepEqual(
    p.riskLevels.map((r) => r.key),
    ["ALTO", "MEDIO", "BAJO"],
  );
  assert.equal(p.statuses.length, 4);
});
test("report references planned class and actor before Observation", () => {
  const p = plan().result;
  assert.equal(p.reports[0]?.creatorId, p.actor.id);
  assert.equal(p.reports[0]?.classId, p.classes[0]?.id);
  assert.equal(p.observations[0]?.reportId, p.reports[0]?.id);
});
test("same plan text in separate Areas remains distinct", () =>
  assert.equal(plan().output.counts.ActionPlan?.CREATE, 2));
test("identical plan source identity is skipped", () =>
  assert.equal(
    plan([detail(3), detail(4)]).output.counts.ActionPlan?.SKIPPED,
    1,
  ));
test("missing text, risk and plan use explicit defaults", () => {
  const { result } = plan([
    detail(3, {
      "Observación detallada": "",
      Recomendación: "",
      "Riesgos asociados": "",
      "Plan de acción": "",
    }),
  ]);
  const o = result.observations[0]!;
  assert.equal(o.decision, "CREATE");
  assert.equal(o.fields.description, "Sin detalle histórico registrado.");
  assert.equal(
    o.fields.recommendation,
    "Sin recomendación histórica registrada.",
  );
  assert.equal(
    o.areas[0]?.plans[0]?.description,
    "Sin plan de acción histórico registrado.",
  );
  assert.equal(o.riskLinks.length, 1);
});
test("observation conflicts use majority and log the choice", () => {
  const { result, output } = plan([
    detail(3),
    detail(4, { Área: "South", Recomendación: "Other" }),
    detail(5, { Área: "South" }),
  ]);
  assert.equal(result.observations[0]?.fields.recommendation, "Recommendation");
  assert.ok(
    output.exceptions.some(
      (x) => x.code === "OBSERVATION_FIELD_CONFLICT_RESOLVED",
    ),
  );
});
test("observation conflict ties choose earliest row", () =>
  assert.equal(
    plan([
      detail(3, { Recomendación: "First" }),
      detail(4, { Área: "South", Recomendación: "Second" }),
    ]).result.observations[0]?.fields.recommendation,
    "First",
  ));
test("area assignment ties choose latest row without dropping plans", () => {
  const { result, output } = plan([
    detail(3),
    detail(4, {
      "Responsable de área": "Owner",
      "Plan de acción": "Another fix",
    }),
  ]);
  assert.equal(
    result.observations[0]?.areas[0]?.responsibleId,
    result.users.find((u) => u.name === "Owner")?.id,
  );
  assert.equal(result.observations[0]?.areas[0]?.plans.length, 2);
  assert.ok(
    output.exceptions.some(
      (x) => x.code === "AREA_ASSIGNMENT_CONFLICT_RESOLVED",
    ),
  );
});
test("long title truncates and full value remains in report", () => {
  const { result, output } = plan([
    detail(3, { "Título de observación": "a".repeat(200) }),
  ]);
  assert.equal(result.observations[0]?.fields.title?.length, 191);
  assert.equal(
    (
      output.exceptions.find((x) => x.code === "TITLE_TRUNCATED")?.detail as {
        original: string;
      }
    ).original.length,
    200,
  );
});
test("comment is planned with stable identity and unknown-author metadata", () => {
  const { result, output } = plan([
    detail(3, { "Comentario 1": "Original comment" }),
  ]);
  assert.equal(result.observations[0]?.comments.length, 1);
  assert.equal(output.counts.ObservationComment?.CREATE, 1);
});
test("explicit Reprogramado changes current due date without an approval record", () => {
  const { result, output } = plan([
    detail(3, {
      "N° reprogramacion": "1",
      "Fecha reprogramación": "2024-01-01",
      "Estado según plazo": "Reprogramado",
    }),
  ]);
  assert.equal(result.observations[0]?.currentDue, "2024-01-01");
  assert.equal(
    result.observations[0]?.areas[0]?.plans[0]?.currentDue,
    "2024-01-01",
  );
  assert.equal(output.sourceCounts?.reprogrammingDirectDueDate, 1);
});
test("source-only reprogramming becomes a technical historical comment", () => {
  const { result, output } = plan([
    detail(3, {
      "N° reprogramacion": "2",
      "Fecha reprogramación": "2024-01-01",
      "Estado según plazo": "Vencido",
    }),
  ]);
  const observation = result.observations[0]!;
  assert.equal(observation.currentDue, "2023-01-01");
  assert.equal(observation.comments.length, 1);
  assert.match(observation.comments[0]!.body, /N° reprogramación: 2/);
  assert.match(observation.comments[0]!.body, /Vencido/);
  assert.equal(output.counts.ObservationComment?.CREATE, 1);
  assert.equal(
    output.exceptions.filter((x) => x.code === "HISTORICAL_REPROGRAMMING_SOURCE_PRESERVED").length,
    1,
  );
});
test("dry-run gate performs zero writes", async () => {
  let writes = 0;
  const { result, output } = plan();
  await writeIfAuthorized(false, result, output, async () => {
    writes++;
  });
  assert.equal(writes, 0);
  assert.equal(parseArgs([]).execute, false);
  assert.equal(parseArgs(["--execute"]).execute, true);
});
test("replanning imported rows reuses deterministic identities", () => {
  const sourceReport = report();
  const source = prepareSource(
    workbook([detail(3, { "Comentario 1": "Kept" })]),
    sourceReport,
    false,
  );
  const first = buildPlan(source, empty(), {}, sourceReport);
  const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const db = {
    users: first.users.map((item) => ({
      ...item,
      deletedAt: null,
      isActive: false,
    })),
    roles: first.roles.map((item) => ({ ...item, deletedAt: null })),
    userRoles: first.userRoles,
    permissions: first.permissions.map((item) => ({
      ...item,
      deletedAt: null,
    })),
    rolePermissions: first.rolePermissions,
    areas: first.areas.map((item) => ({
      ...item,
      active: true,
      deletedAt: null,
    })),
    classes: first.classes.map((item) => ({
      ...item,
      active: true,
      deletedAt: null,
    })),
    dictionaries: first.dictionaries.map((item) => ({
      ...item,
      isActive: true,
    })),
    risks: first.risks.map((item) => ({ ...item, isActive: true })),
    riskLevels: first.riskLevels.map((item) => ({
      ...item,
      active: true,
      deletedAt: null,
    })),
    statuses: first.statuses.map((item) => ({
      ...item,
      active: true,
      deletedAt: null,
    })),
    reports: first.reports.map((item) => ({
      ...item,
      reportNumber: item.identity,
      reportClassId: item.classId,
      reportDate: asDate(item.reportDate),
      deletedAt: null,
    })),
    observations: first.observations.map((item) => ({
      id: item.id,
      auditReportId: item.reportId,
      observationNumber: item.number,
      title: item.fields.title,
      description: item.fields.description,
      auditRecommendation: item.fields.recommendation,
      mainObservationId: item.dictionaryId,
      riskLevelId: item.riskLevelId,
      statusId: item.statusId,
      originalDueDate: asDate(item.fields.originalDueDate!),
      currentDueDate: asDate(item.currentDue),
      deletedAt: null,
      risks: item.riskLinks.map((link) => ({
        id: link.id,
        riskId: link.riskId,
      })),
      areaAssignments: item.areas.map((area) => ({
        id: area.id,
        areaId: area.areaId,
        processOwnerUserId: area.ownerId,
        areaResponsibleUserId: area.responsibleId,
      })),
      actionPlans: item.areas.flatMap((area) =>
        area.plans.map((action) => ({
          id: action.id,
          observationAreaId: area.id,
          responsibleUserId: action.executorId,
          description: action.description,
          originalDueDate: asDate(action.due),
          currentDueDate: asDate(action.currentDue),
          status: action.status,
          deletedAt: null,
        })),
      ),
    })),
    comments: first.observations.flatMap((item) =>
      item.comments.map((comment) => ({
        id: comment.id,
        observationId: item.id,
        actionPlanId: comment.actionPlanId ?? null,
        authorUserId: first.actor.id,
        body: comment.body,
        deletedAt: null,
      })),
    ),
  } as unknown as Snapshot;
  const rerun = report();
  buildPlan(source, db, {}, rerun);
  assert.equal(
    Object.values(rerun.counts).reduce(
      (sum, decisions) =>
        sum +
        (decisions.CREATE ?? 0) +
        (decisions.BLOCKED ?? 0) +
        (decisions.CONFLICT ?? 0),
      0,
    ),
    0,
  );
});
test("unavailable DB and invalid workbook abort safely", async () => {
  await assert.rejects(
    reconcileDatabase(async () => {
      throw new Error("down");
    }),
    /DATABASE UNAVAILABLE/,
  );
  assert.throws(() =>
    observationIdentity(detail(3, { "Número de observación": "bad" })),
  );
  assert.throws(
    () => prepareSource(workbook(), report()),
    /Workbook count mismatch/,
  );
});

const originalWorkbook = parseArgs([]).workbook;
test(
  "default workbook path matches the Git filename on Linux",
  { skip: Boolean(process.env.HISTORICAL_IMPORT_WORKBOOK) },
  () => assert.equal(originalWorkbook, originalWorkbook.normalize("NFC")),
);
test(
  "full workbook plans every historical observation from an empty database",
  () => {
    const output = report();
    const source = prepareSource(readWorkbook(originalWorkbook), output);
    const p = buildPlan(source, empty(), {}, output);
    assert.equal(output.sourceCounts?.detailRows, 364);
    assert.equal(output.sourceCounts?.riskOccurrences, 893);
    assert.equal(p.users.filter((u) => !u.technical).length, 36);
    assert.equal(p.roles.length, 5);
    assert.equal(output.counts.UserRole?.CREATE, 36);
    assert.equal(p.areas.length, 9);
    assert.equal(p.classes.length, 3);
    assert.equal(p.dictionaries.length, 75);
    assert.equal(p.risks.length, 216);
    assert.equal(p.reports.length, 33);
    assert.equal(p.observations.length, 242);
    assert.equal(
      p.observations.filter((o) => o.decision === "CREATE").length,
      242,
    );
    assert.equal(output.counts.ObservationRisk?.CREATE, 590);
    assert.equal(output.counts.ActionPlan?.CREATE, 363);
    assert.equal(output.counts.ObservationComment?.CREATE, 419);
    assert.equal(
      Object.values(output.records)
        .flat()
        .filter((item) => ["BLOCKED", "CONFLICT"].includes(item.decision))
        .length,
      0,
    );
    assert.equal(output.sourceCounts?.reprogrammingDirectDueDate, 15);
    assert.equal(output.sourceCounts?.reprogrammingSourceOnly, 3);
    assert.equal(
      output.exceptions.filter(
        (x) => x.code === "AREA_ASSIGNMENT_CONFLICT_RESOLVED",
      ).length,
      5,
    );
    assert.equal(
      output.exceptions.filter(
        (x) => x.code === "OBSERVATION_FIELD_CONFLICT_RESOLVED",
      ).length,
      6,
    );
  },
);
