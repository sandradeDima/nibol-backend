import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v5 as uuidv5 } from "uuid";
import { SEED_NAMESPACE } from "../prisma/admin-seed-config.js";
import {
  CANONICAL_OBSERVATION_STATUSES,
  CANONICAL_RISK_LEVELS,
} from "../prisma/canonical-historical-catalogs.js";
import {
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_NAMES,
} from "../src/permissions/definitions.js";
import { observationAggregationService } from "../src/modules/observations/observation-aggregation.service.js";
import { prisma } from "../src/utils/prisma.js";

type Row = { _row: number; [key: string]: string | number };
type Workbook = Record<string, Row[]>;
type Override = {
  observations?: Record<
    string,
    Partial<
      Record<
        | "mainObservation"
        | "title"
        | "description"
        | "recommendation"
        | "riskLevel"
        | "originalDueDate",
        string
      >
    > & { risks?: string[] }
  >;
  areaAssignments?: Record<
    string,
    { processOwnerEmail?: string; areaResponsibleEmail?: string }
  >;
};
type Issue = {
  code: string;
  identity: string;
  rows: number[];
  detail: unknown;
};
type Decision =
  | "CREATE"
  | "CREATED"
  | "UPDATE"
  | "UPDATED"
  | "DELETE"
  | "DELETED"
  | "REUSED"
  | "BLOCKED"
  | "CONFLICT"
  | "SKIPPED";
type Item = {
  identity: string;
  decision: Decision;
  id?: string;
  reason?: string;
  metadata?: unknown;
};
type ImportReport = {
  mode: "dry-run" | "execute";
  database: "AVAILABLE" | "UNAVAILABLE";
  sourceCounts?: Record<string, number>;
  summary?: Record<string, Record<string, number>>;
  counts: Record<string, Record<string, number>>;
  records: Record<string, Item[]>;
  exceptions: Issue[];
  historicalSourceComments: {
    observation: string;
    row: number;
    field: string;
    text: string;
  }[];
  historicalReprogrammingSource: {
    observation: string;
    row: number;
    count: string;
    date: string;
    deadlineStatus: string;
  }[];
  actorEmail?: string;
  error?: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");
const output = path.join(project, "docs/historical-import");
const defaultWorkbook = path
  .join(
    project,
    "docs",
    "Detalle de observaciones históricas - BD Observaciones - informes - riesgos asociados.xlsx",
  )
  .normalize("NFC");
const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
const riskKey = (value: string) =>
  normalize(value).normalize("NFD").replace(/\p{M}/gu, "");
const clean = (value: unknown) => String(value ?? "").trim();
const value = (row: Row, column: string) => clean(row[column]);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(date(value).valueOf()) &&
  iso(date(value)) === value;
export const splitRisks = (cell: string) =>
  cell.split(/[▪•*]/).map(clean).filter(Boolean);
export const observationIdentity = (row: Row) => {
  const reportNumber = value(row, "Informe de Auditoría");
  const code = value(row, "Número de observación");
  const match = new RegExp(
    `^${reportNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-([0-9]+)$`,
  ).exec(code);
  if (!match || Number(match[1]) < 1)
    throw new Error(`Invalid observation code at row ${row._row}: ${code}`);
  return { reportNumber, observationNumber: Number(match[1]), code };
};
const rowsBy = <T>(rows: T[], key: (row: T) => string) => {
  const map = new Map<string, T[]>();
  for (const row of rows)
    map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
};
const unique = (values: string[]) => [...new Set(values)];
const field = (rows: Row[], column: string, replacement?: string) => {
  const candidates = unique(
    rows.map((row) => value(row, column)).filter(Boolean),
  );
  return {
    candidates,
    missing: rows.filter((row) => !value(row, column)).map((row) => row._row),
    value: replacement?.trim() || candidates[0] || "",
    conflict: candidates.length > 1 && !replacement?.trim(),
  };
};
const count = (
  report: ImportReport,
  kind: string,
  decision: Decision,
  identity: string,
  id?: string,
  reason?: string,
) => {
  report.records[kind] ??= [];
  report.counts[kind] ??= {};
  report.records[kind].push({
    identity,
    decision,
    ...(id ? { id } : {}),
    ...(reason ? { reason } : {}),
  });
  report.counts[kind][decision] = (report.counts[kind][decision] ?? 0) + 1;
};
const issue = (
  report: ImportReport,
  code: string,
  identity: string,
  rows: number[],
  detail: unknown,
) => report.exceptions.push({ code, identity, rows, detail });
const reportFiles = (report: ImportReport) => {
  const countDecision = (kind: string, decision: Decision) =>
    report.counts[kind]?.[decision] ?? 0;
  const riskCreates = (origin: string) =>
    report.records.Risk?.filter(
      (item) =>
        item.decision === "CREATE" &&
        (item.metadata as { origin?: string } | undefined)?.origin === origin,
    ).length ?? 0;
  const actionStatus = (status: string) =>
    report.records.ActionPlan?.filter(
      (item) =>
        (item.decision === "CREATE" || item.decision === "CREATED") &&
        (item.metadata as { status?: string } | undefined)?.status === status,
    ).length ?? 0;
  const preservationRecords =
    report.records.ObservationComment?.filter(
      (item) =>
        (item.metadata as { status?: string } | undefined)?.status ===
        "HISTORICAL_REPROGRAMMING_SOURCE_PRESERVED",
    ) ?? [];
  const preservationComments = preservationRecords.length;
  const preservationCommitted = preservationRecords.filter((item) =>
    ["CREATED", "REUSED"].includes(item.decision),
  ).length;
  report.summary = {
    users: {
      existing: countDecision("User", "REUSED"),
      wouldCreate: countDecision("User", "CREATE"),
      wouldUpdate: 0,
      unresolved:
        countDecision("User", "BLOCKED") + countDecision("User", "CONFLICT"),
    },
    areas: {
      existing: countDecision("Area", "REUSED"),
      wouldCreate: countDecision("Area", "CREATE"),
      unresolved:
        countDecision("Area", "BLOCKED") + countDecision("Area", "CONFLICT"),
    },
    roles: {
      existing: countDecision("Role", "REUSED"),
      wouldCreate: countDecision("Role", "CREATE"),
    },
    reportClasses: {
      existing: countDecision("AuditReportClass", "REUSED"),
      wouldCreate: countDecision("AuditReportClass", "CREATE"),
    },
    observationDictionary: {
      existing: countDecision("ObservationDictionary", "REUSED"),
      wouldCreate: countDecision("ObservationDictionary", "CREATE"),
    },
    riskLevels: {
      existing: countDecision("RiskLevel", "REUSED"),
      wouldCreate: countDecision("RiskLevel", "CREATE"),
    },
    risks: {
      existing: countDecision("Risk", "REUSED"),
      wouldReactivate: countDecision("Risk", "UPDATE"),
      wouldCreateFromCatalog: riskCreates("CATALOG"),
      wouldCreateHistoricalUnmatched: riskCreates("HISTORICAL_UNMATCHED"),
      wouldCreateDefaultUnspecified: riskCreates("DEFAULT_UNSPECIFIED"),
    },
    reports: {
      existing: countDecision("AuditReport", "REUSED"),
      wouldCreate: countDecision("AuditReport", "CREATE"),
      wouldUpdate: countDecision("AuditReport", "UPDATE"),
      conflicts: countDecision("AuditReport", "CONFLICT"),
    },
    observations: {
      existing: countDecision("Observation", "REUSED"),
      wouldCreate: countDecision("Observation", "CREATE"),
      wouldReplace: countDecision("Observation", "UPDATE"),
      wouldDelete: countDecision("Observation", "DELETE"),
      importedWithDefaults: report.sourceCounts?.defaultedObservations ?? 0,
      importedWithConflicts:
        report.sourceCounts?.importedWithSourceConflicts ?? 0,
    },
    observationAreas: {
      wouldCreate: countDecision("ObservationArea", "CREATE"),
      conflictsAutoResolved: report.exceptions.filter(
        (item) => item.code === "AREA_ASSIGNMENT_CONFLICT_RESOLVED",
      ).length,
    },
    actionPlans: {
      wouldCreate: countDecision("ActionPlan", "CREATE"),
      notStarted: actionStatus("NOT_STARTED"),
      started: actionStatus("STARTED"),
      withProgress: actionStatus("WITH_PROGRESS"),
      concluded: actionStatus("CONCLUDED"),
    },
    comments: {
      wouldCreate: countDecision("ObservationComment", "CREATE"),
      excelHistorical: report.historicalSourceComments.length,
      reprogrammingPreservationPlanned: preservationComments,
      reprogrammingPreservationCommitted: preservationCommitted,
      unknownOriginalMetadata: report.exceptions.filter(
        (item) =>
          item.code === "HISTORICAL_COMMENT_IMPORTED_WITH_UNKNOWN_AUTHOR_DATE",
      ).length,
    },
    reprogramming: {
      fullyRepresentable: 0,
      historicalDueDate: report.sourceCounts?.reprogrammingDirectDueDate ?? 0,
      sourceOnlyFallback: report.sourceCounts?.reprogrammingSourceOnly ?? 0,
      sourcePreservedInDatabase: preservationCommitted,
    },
  };
  const stem =
    report.mode === "execute" ? "latest-execution" : "latest-dry-run";
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(output, `${stem}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  const lines = [
    `# Historical import ${report.mode}`,
    "",
    `Database: **${report.database}**`,
    "",
    report.error ?? "",
    "",
    "## Workbook checkpoints",
    "",
  ];
  for (const [name, n] of Object.entries(report.sourceCounts ?? {}))
    lines.push(`- ${name}: ${n}`);
  lines.push("", "## Live reconciliation counts", "");
  if (report.database === "UNAVAILABLE")
    lines.push(
      "Database-dependent create, reuse, blocked, and conflict counts are unverified.",
    );
  for (const [kind, counts] of Object.entries(report.counts))
    lines.push(
      `- ${kind}: ${Object.entries(counts)
        .map(([key, n]) => `${key} ${n}`)
        .join(", ")}`,
    );
  lines.push("", "## Requested dry-run summary", "");
  for (const [kind, counts] of Object.entries(report.summary))
    lines.push(
      `- ${kind}: ${Object.entries(counts)
        .map(([key, n]) => `${key} ${n}`)
        .join(", ")}`,
    );
  lines.push("", "## Exceptions", "");
  for (const entry of report.exceptions)
    lines.push(
      `- ${entry.code} · ${entry.identity} · rows ${entry.rows.join(", ")} · ${JSON.stringify(entry.detail)}`,
    );
  lines.push(
    "",
    `Excel historical comments: ${report.historicalSourceComments.length}`,
    `Reprogramming preservation comments: ${preservationComments}`,
    `Historical reprogramming rows: ${report.historicalReprogrammingSource.length}`,
    "",
  );
  writeFileSync(path.join(output, `${stem}.md`), lines.join("\n"));
};

export const parseArgs = (args: string[]) => {
  if (args.includes("--dry-run") && args.includes("--execute"))
    throw new Error("Choose --dry-run or --execute");
  const allowed = new Set([
    "--dry-run",
    "--execute",
    "--workbook",
    "--overrides",
  ]);
  for (const arg of args)
    if (arg.startsWith("--") && !allowed.has(arg))
      throw new Error(`Unknown option: ${arg}`);
  const option = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const result = args[index + 1];
    if (!result || result.startsWith("--"))
      throw new Error(`Missing value for ${name}`);
    return result;
  };
  return {
    execute: args.includes("--execute"),
    workbook:
      option("--workbook") ??
      process.env.HISTORICAL_IMPORT_WORKBOOK ??
      defaultWorkbook,
    overrides:
      option("--overrides") ??
      path.join(project, "data/historical-import-overrides.json"),
  };
};

export const readWorkbook = (filename: string): Workbook =>
  JSON.parse(
    execFileSync(
      "python3",
      [path.join(here, "read-historical-workbook.py"), filename],
      { encoding: "utf8", maxBuffer: 15 * 1024 * 1024 },
    ),
  ) as Workbook;

export const prepareSource = (
  book: Workbook,
  report: ImportReport,
  enforceCounts = true,
) => {
  const detail = book["Detalle de obs. y planes"];
  if (!detail) throw new Error("Missing detail sheet");
  const groups = rowsBy(detail, (row) => observationIdentity(row).code);
  const reports = rowsBy(book["BD-Informes Auditoría"] ?? [], (row) =>
    value(row, "N°-Informe"),
  );
  const people = rowsBy(book.Usuarios ?? [], (row) =>
    normalize(value(row, "Nombre de personal")),
  );
  const emails = (book.Usuarios ?? []).map((row) =>
    emailKey(value(row, "Correo")),
  );
  if (emails.some((email) => !email) || new Set(emails).size !== emails.length)
    throw new Error(
      "Workbook Users sheet has missing or duplicate normalized emails",
    );
  const areaNames = new Set(
    (book.Usuarios ?? []).map((row) => normalize(value(row, "Área"))),
  );
  const catalog = (book["Riesgos asociados"] ?? []).map((row) =>
    value(row, "Riesgos asociados"),
  );
  const principals = (book["BD-Observaciones"] ?? []).map((row) =>
    value(row, "Observación principal"),
  );
  const riskOccurrences = detail.flatMap((row) =>
    splitRisks(value(row, "Riesgos asociados")),
  );
  const catalogKeys = new Set(catalog.map(normalize));
  const riskKeys = new Set(riskOccurrences.map(normalize));
  const riskLinks = [...groups.values()].reduce(
    (sum, rows) =>
      sum +
      new Set(
        rows
          .flatMap((row) => splitRisks(value(row, "Riesgos asociados")))
          .map(normalize),
      ).size,
    0,
  );
  const plans = detail.filter((row) => value(row, "Plan de acción"));
  const planKey = (row: Row) =>
    JSON.stringify([
      observationIdentity(row).code,
      ...[
        "Área",
        "Dueño de proceso",
        "Responsable de área",
        "Ejecutor (reporte)",
        "Plan de acción",
        "Fecha compromiso (plan de acción)",
      ].map((column) => normalize(value(row, column))),
    ]);
  const sourceCounts = {
    detailRows: detail.length,
    auditReports: reports.size,
    observations: groups.size,
    repeatedObservationIdentities: [...groups.values()].filter(
      (rows) => rows.length > 1,
    ).length,
    areas: new Set(detail.map((row) => normalize(value(row, "Área")))).size,
    sourcePeople: new Set(
      detail
        .flatMap((row) =>
          ["Dueño de proceso", "Responsable de área", "Ejecutor (reporte)"].map(
            (column) => normalize(value(row, column)),
          ),
        )
        .filter(Boolean),
    ).size,
    actionPlanRows: plans.length,
    actionPlanTuples: new Set(plans.map(planKey)).size,
    riskOccurrences: riskOccurrences.length,
    observationRiskLinks: riskLinks,
    riskCatalogRows: catalog.length,
    distinctRiskCatalogDescriptions: catalogKeys.size,
    unmatchedHistoricalRisks: [...riskKeys].filter(
      (key) => !catalogKeys.has(key),
    ).length,
    observationPrincipalCatalogRows: principals.length,
    longTitleSourceRows: detail.filter(
      (row) => value(row, "Título de observación").length > 191,
    ).length,
    historicalCommentCells: detail.reduce(
      (total, row) =>
        total +
        Number(Boolean(value(row, "Comentario 1"))) +
        Number(Boolean(value(row, "Comentario 2"))),
      0,
    ),
    reprogrammingRows: detail.filter(
      (row) =>
        value(row, "N° reprogramacion") || value(row, "Fecha reprogramación"),
    ).length,
  };
  const expected = {
    detailRows: 364,
    auditReports: 33,
    observations: 242,
    repeatedObservationIdentities: 70,
    areas: 9,
    sourcePeople: 33,
    actionPlanRows: 358,
    actionPlanTuples: 358,
    riskOccurrences: 893,
    observationRiskLinks: 587,
    riskCatalogRows: 193,
    distinctRiskCatalogDescriptions: 192,
    unmatchedHistoricalRisks: 28,
    observationPrincipalCatalogRows: 75,
    longTitleSourceRows: 13,
    historicalCommentCells: 416,
    reprogrammingRows: 18,
  };
  report.sourceCounts = sourceCounts;
  if (enforceCounts)
    for (const [key, n] of Object.entries(expected))
      if (sourceCounts[key as keyof typeof sourceCounts] !== n)
        throw new Error(
          `Workbook count mismatch: ${key} expected ${n}, got ${sourceCounts[key as keyof typeof sourceCounts]}`,
        );
  for (const row of detail) {
    const number = value(row, "Informe de Auditoría");
    const match = reports.get(number);
    if (
      match?.length !== 1 ||
      value(match[0]!, "Título de informe") !==
        value(row, "Título de informe") ||
      value(match[0]!, "Fecha") !== value(row, "Fecha de informe")
    )
      throw new Error(
        `Report metadata differs between worksheets at detail row ${row._row}: ${number}`,
      );
    for (const column of [
      "Fecha de informe",
      "Fecha compromiso (vencimiento)",
      "Fecha compromiso (plan de acción)",
    ]) {
      const candidate = value(row, column);
      if (candidate && !validDate(candidate))
        throw new Error(`Invalid ${column} at detail row ${row._row}`);
    }
  }
  for (const [code, rows] of groups)
    for (const row of rows) {
      for (const column of ["Comentario 1", "Comentario 2"])
        if (value(row, column))
          report.historicalSourceComments.push({
            observation: code,
            row: row._row,
            field: column,
            text: String(row[column] ?? ""),
          });
      if (value(row, "N° reprogramacion") || value(row, "Fecha reprogramación"))
        report.historicalReprogrammingSource.push({
          observation: code,
          row: row._row,
          count: value(row, "N° reprogramacion"),
          date: value(row, "Fecha reprogramación"),
          deadlineStatus: value(row, "Estado según plazo"),
        });
    }
  return {
    detail,
    groups,
    reports,
    people,
    areaNames,
    catalog,
    principals,
    planKey,
  };
};

export const reportSourceExceptions = (
  source: Source,
  report: ImportReport,
) => {
  const missing = new Set<string>();
  const conflicts = new Set<string>();
  let assignmentConflicts = 0;
  let longTitles = 0;
  const columns = [
    "Observación principal",
    "Título de observación",
    "Observación detallada",
    "Recomendación",
    "Nivel de riesgo",
    "Fecha compromiso (vencimiento)",
  ];
  for (const [code, rows] of source.groups) {
    const missingFields = [
      "Observación detallada",
      "Recomendación",
      "Riesgos asociados",
    ].filter((column) => rows.some((row) => !value(row, column)));
    if (missingFields.length) {
      missing.add(code);
      issue(
        report,
        "SOURCE_DATA_INCOMPLETE",
        code,
        rows
          .filter((row) => missingFields.some((column) => !value(row, column)))
          .map((row) => row._row),
        { fields: missingFields },
      );
    }
    for (const column of columns) {
      const candidates = unique(
        rows.map((row) => value(row, column)).filter(Boolean),
      );
      if (candidates.length > 1) {
        conflicts.add(code);
        issue(
          report,
          "OBSERVATION_FIELD_CONFLICT",
          code,
          rows.map((row) => row._row),
          { field: column, candidates },
        );
      }
    }
    const title = field(rows, "Título de observación").value;
    if (title.length > 191) {
      longTitles++;
      issue(
        report,
        "TITLE_TRUNCATED",
        code,
        rows
          .filter((row) => value(row, "Título de observación").length > 191)
          .map((row) => row._row),
        { original: title, truncated: title.slice(0, 191) },
      );
    }
    for (const areaRows of rowsBy(rows, (row) =>
      normalize(value(row, "Área")),
    ).values()) {
      const owners = unique(
        areaRows.map((row) => value(row, "Dueño de proceso")),
      );
      const responsibles = unique(
        areaRows.map((row) => value(row, "Responsable de área")),
      );
      if (owners.length < 2 && responsibles.length < 2) continue;
      assignmentConflicts++;
      const candidates = (names: string[]) =>
        names.map((name) => ({
          name,
          emails: (source.people.get(normalize(name)) ?? []).map((person) =>
            value(person, "Correo"),
          ),
        }));
      issue(
        report,
        "AREA_ASSIGNMENT_CONFLICT",
        `${code}|${value(areaRows[0]!, "Área")}`,
        areaRows.map((row) => row._row),
        {
          processOwners: candidates(owners),
          areaResponsibles: candidates(responsibles),
        },
      );
    }
  }
  const catalog = new Set(source.catalog.map(normalize));
  const unmatched = rowsBy(
    source.detail.flatMap((row) =>
      splitRisks(value(row, "Riesgos asociados")).map((name) => ({
        name,
        row: row._row,
      })),
    ),
    (item) => normalize(item.name),
  );
  let unmatchedCount = 0;
  for (const [key, items] of unmatched)
    if (!catalog.has(key)) {
      unmatchedCount++;
      issue(
        report,
        "NEW_HISTORICAL_RISK",
        items[0]!.name,
        items.map((item) => item.row),
        "Source detail risk is absent from the workbook risk catalog",
      );
    }
  Object.assign((report.sourceCounts ??= {}), {
    sourceDataIncompleteObservations: missing.size,
    sourceFieldConflictObservations: conflicts.size,
    sourceAreaAssignmentConflicts: assignmentConflicts,
    sourceTitleTruncatedObservations: longTitles,
    unmatchedHistoricalRisks: unmatchedCount,
  });
};

const dbSnapshot = async () => {
  const [
    users,
    roles,
    userRoles,
    permissions,
    rolePermissions,
    areas,
    classes,
    dictionaries,
    risks,
    riskLevels,
    statuses,
    reports,
    observations,
    comments,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true,
        isActive: true,
        deletedAt: true,
      },
    }),
    prisma.role.findMany({
      select: { id: true, code: true, name: true, deletedAt: true },
    }),
    prisma.userRole.findMany({
      select: { id: true, userId: true, roleId: true },
    }),
    prisma.permission.findMany({
      select: { id: true, name: true, deletedAt: true },
    }),
    prisma.rolePermission.findMany({
      select: { id: true, roleId: true, permissionId: true },
    }),
    prisma.area.findMany({
      select: { id: true, name: true, active: true, deletedAt: true },
    }),
    prisma.auditReportClass.findMany({
      select: { id: true, name: true, active: true, deletedAt: true },
    }),
    prisma.observationDictionary.findMany({
      select: { id: true, name: true, isActive: true },
    }),
    prisma.risk.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.riskLevel.findMany({
      select: {
        id: true,
        name: true,
        key: true,
        active: true,
        deletedAt: true,
      },
    }),
    prisma.observationStatus.findMany({
      select: {
        id: true,
        name: true,
        key: true,
        active: true,
        deletedAt: true,
      },
    }),
    prisma.auditReport.findMany({
      select: {
        id: true,
        reportNumber: true,
        title: true,
        reportDate: true,
        reportClassId: true,
        deletedAt: true,
      },
    }),
    prisma.observation.findMany({
      select: {
        id: true,
        auditReportId: true,
        observationNumber: true,
        title: true,
        description: true,
        auditRecommendation: true,
        mainObservationId: true,
        riskLevelId: true,
        statusId: true,
        originalDueDate: true,
        currentDueDate: true,
        deletedAt: true,
        areaAssignments: {
          select: {
            id: true,
            areaId: true,
            processOwnerUserId: true,
            areaResponsibleUserId: true,
          },
        },
        risks: { select: { id: true, riskId: true } },
        actionPlans: {
          select: {
            id: true,
            observationAreaId: true,
            responsibleUserId: true,
            description: true,
            originalDueDate: true,
            currentDueDate: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    }),
    prisma.observationComment.findMany({
      select: {
        id: true,
        observationId: true,
        actionPlanId: true,
        body: true,
        authorUserId: true,
        deletedAt: true,
      },
    }),
  ]);
  return {
    users,
    roles,
    userRoles,
    permissions,
    rolePermissions,
    areas,
    classes,
    dictionaries,
    risks,
    riskLevels,
    statuses,
    reports,
    observations,
    comments,
  };
};
type Snapshot = Awaited<ReturnType<typeof dbSnapshot>>;
type Source = ReturnType<typeof prepareSource>;
type Master = {
  identity: string;
  id: string;
  decision: Decision;
  name: string;
};
type PlannedUser = Master & {
  email: string;
  jobTitle: string | null;
  roleCode?: string;
  technical?: boolean;
  placeholder?: boolean;
};
type PlannedRole = Master & { code: string; description: string };
type PlannedLevel = Master & {
  key: string;
  severityOrder: number;
  maxRemediationDays: number;
  description: string;
  colorToken: string;
};
type PlannedStatus = Master & {
  key: string;
  sortOrder: number;
  isInitial: boolean;
  isFinal: boolean;
  countsAsOverdue: boolean;
  description: string;
};
type PlannedPlan = {
  identity: string;
  id: string;
  decision: Decision;
  row: Row;
  executorId: string;
  description: string;
  status: "NOT_STARTED" | "STARTED" | "WITH_PROGRESS" | "CONCLUDED";
  due: string;
  currentDue: string;
  defaulted: boolean;
};
type PlannedArea = {
  identity: string;
  id: string;
  decision: Decision;
  name: string;
  areaId: string;
  ownerId: string;
  responsibleId: string;
  plans: PlannedPlan[];
};
type PlannedComment = {
  identity: string;
  id: string;
  decision: Decision;
  body: string;
  actionPlanId?: string;
  row: number;
  field: string;
};
type PlannedObservation = {
  identity: string;
  id: string;
  decision: Decision;
  reportNumber: string;
  reportId: string;
  number: number;
  fields: Record<string, string>;
  dictionaryId: string;
  riskLevelId: string;
  statusId: string;
  currentDue: string;
  riskLinks: {
    identity: string;
    id: string;
    riskId: string;
    decision: Decision;
  }[];
  areas: PlannedArea[];
  comments: PlannedComment[];
  defaultedFields: string[];
  sourceConflicts: string[];
};

const stableId = (kind: string, key: string) =>
  uuidv5(`historical-import:${kind}:${key}`, SEED_NAMESPACE);
const emailKey = (email: string) => email.trim().toLowerCase();
const record = (
  report: ImportReport,
  kind: string,
  item: { identity: string; decision: Decision; id: string },
  metadata?: unknown,
) => {
  count(
    report,
    kind,
    item.decision,
    item.identity,
    item.decision === "REUSED" ? item.id : undefined,
  );
  if (metadata !== undefined) report.records[kind]!.at(-1)!.metadata = metadata;
};
const changeDecision = (
  report: ImportReport,
  kind: string,
  identity: string,
  decision: Decision,
) => {
  const entry = report.records[kind]?.find(
    (item) => item.identity === identity,
  );
  if (!entry || entry.decision === decision) return;
  report.counts[kind]![entry.decision] =
    (report.counts[kind]![entry.decision] ?? 1) - 1;
  report.counts[kind]![decision] = (report.counts[kind]![decision] ?? 0) + 1;
  entry.decision = decision;
  if (decision !== "REUSED") delete entry.id;
};
const sourceChoice = (rows: Row[], column: string, replacement?: string) => {
  const entries = rows
    .map((row) => ({ row: row._row, value: value(row, column) }))
    .filter((entry) => entry.value);
  const groups = rowsBy(entries, (entry) => entry.value);
  const ranked = [...groups].sort(
    (a, b) => b[1].length - a[1].length || a[1][0]!.row - b[1][0]!.row,
  );
  return {
    value: replacement?.trim() || ranked[0]?.[0] || "",
    candidates: [...groups].map(([candidate, mentions]) => ({
      value: candidate,
      rows: mentions.map((item) => item.row),
    })),
    conflict: groups.size > 1 && !replacement?.trim(),
    rule: replacement?.trim()
      ? "OVERRIDE"
      : ranked.length > 1 && ranked[0]![1].length === ranked[1]![1].length
        ? "EARLIEST_ROW_TIE"
        : "MOST_FREQUENT",
  };
};
const latestChoice = (rows: Row[], column: string) => {
  const entries = rows
    .map((row) => ({ row: row._row, value: value(row, column) }))
    .filter((entry) => entry.value);
  const groups = rowsBy(entries, (entry) => normalize(entry.value));
  const ranked = [...groups].sort(
    (a, b) => b[1].length - a[1].length || b[1].at(-1)!.row - a[1].at(-1)!.row,
  );
  return {
    value: ranked[0]?.[1].at(-1)?.value ?? "",
    candidates: [...groups].map(([, mentions]) => ({
      name: mentions[0]!.value,
      rows: mentions.map((item) => item.row),
    })),
    conflict: groups.size > 1,
    rule:
      ranked.length > 1 && ranked[0]![1].length === ranked[1]![1].length
        ? "LATEST_ROW_TIE"
        : "MOST_FREQUENT",
  };
};

export const reconcileDatabase = async (
  reader: () => Promise<Snapshot> = dbSnapshot,
) => {
  try {
    return await reader();
  } catch (error) {
    throw new Error(`IMPORT ABORTED: DATABASE UNAVAILABLE: ${String(error)}`);
  }
};

export const buildPlan = (
  source: Source,
  db: Snapshot,
  overrides: Override,
  report: ImportReport,
) => {
  const userPlans = new Map<string, PlannedUser>();
  const names = new Map<string, string>();
  for (const row of source.people.values())
    for (const person of row) {
      const name = value(person, "Nombre de personal");
      const email = emailKey(value(person, "Correo"));
      if (email) names.set(normalize(name), email);
    }
  const detailedRoles = new Map<string, Set<string>>();
  for (const row of source.detail)
    for (const [column, role] of [
      ["Dueño de proceso", "PROCESS_OWNER"],
      ["Responsable de área", "AREA_RESPONSIBLE"],
      ["Ejecutor (reporte)", "EXECUTOR"],
    ]) {
      const name = normalize(value(row, column!));
      if (!name) continue;
      if (!detailedRoles.has(name)) detailedRoles.set(name, new Set());
      detailedRoles.get(name)!.add(role!);
    }
  const addUser = (
    name: string,
    email: string,
    jobTitle: string | null,
    roleCode?: string,
    technical = false,
    placeholder = false,
  ) => {
    email = emailKey(email);
    if (userPlans.has(email)) return userPlans.get(email)!;
    const matches = db.users.filter((user) => emailKey(user.email) === email);
    const existing = matches[0];
    const decision: Decision =
      matches.length > 1 || existing?.deletedAt
        ? "CONFLICT"
        : existing
          ? "REUSED"
          : "CREATE";
    const item: PlannedUser = {
      identity: email,
      id: existing?.id ?? stableId("user", email),
      decision,
      name,
      email,
      jobTitle,
      ...(roleCode ? { roleCode } : {}),
      ...(technical ? { technical } : {}),
      ...(placeholder ? { placeholder } : {}),
    };
    userPlans.set(email, item);
    record(report, "User", item, {
      name,
      jobTitle,
      roleCode,
      technical,
      placeholder,
      isActiveOnCreate: false,
      emailVerifiedOnCreate: false,
      passwordOnCreate: null,
    });
    if (decision === "CONFLICT")
      issue(
        report,
        "USER_CONFLICT",
        email,
        [],
        "Duplicate or soft-deleted User.email",
      );
    if (placeholder)
      issue(report, "HISTORICAL_USER_PLACEHOLDER", name, [], {
        email,
        noSchemaPlaceholderFlag: true,
      });
    return item;
  };
  for (const row of source.people.values())
    for (const person of row) {
      const name = value(person, "Nombre de personal");
      const nameRoles = detailedRoles.get(normalize(name)) ?? new Set<string>();
      const rosterRole = value(person, "Rol");
      const roleCode =
        ["EXECUTOR", "AREA_RESPONSIBLE", "PROCESS_OWNER"].find((code) =>
          nameRoles.has(code),
        ) ??
        (
          {
            Ejecutor: "EXECUTOR",
            "Responsable de área": "AREA_RESPONSIBLE",
            "Dueño de proceso": "PROCESS_OWNER",
            "Jefe de auditoría": "AUDIT_CHIEF",
            Auditor: "AUDITOR",
          } as Record<string, string>
        )[rosterRole];
      addUser(
        name,
        value(person, "Correo"),
        value(person, "Cargo") || null,
        roleCode,
      );
    }
  for (const [name, roles] of detailedRoles)
    if (!names.has(name)) {
      const sourceName = source.detail
        .flatMap((row) =>
          ["Dueño de proceso", "Responsable de área", "Ejecutor (reporte)"].map(
            (column) => value(row, column),
          ),
        )
        .find((candidate) => normalize(candidate) === name)!;
      const hash = createHash("sha256").update(name).digest("hex").slice(0, 16);
      const email = `historical-user-${hash}@nibol.local`;
      names.set(name, email);
      addUser(
        sourceName,
        email,
        null,
        ["EXECUTOR", "AREA_RESPONSIBLE", "PROCESS_OWNER"].find((code) =>
          roles.has(code),
        ),
        false,
        true,
      );
    }
  const actorEmail = emailKey(
    process.env.HISTORICAL_IMPORT_ACTOR_EMAIL ||
      "historical-import@nibol.local",
  );
  report.actorEmail = actorEmail;
  const actor =
    userPlans.get(actorEmail) ??
    addUser("Importación Histórica NIBOL", actorEmail, null, undefined, true);
  const userFor = (name: string, overrideEmail?: string) =>
    userPlans.get(emailKey(overrideEmail || names.get(normalize(name)) || ""));

  const requiredRoleCodes = new Set(
    [...userPlans.values()]
      .map((user) => user.roleCode)
      .filter((code): code is string => Boolean(code)),
  );
  const rolePlans = new Map<string, PlannedRole>();
  for (const definition of ROLE_DEFINITIONS.filter((role) =>
    requiredRoleCodes.has(role.code),
  )) {
    const matches = db.roles.filter((role) => role.code === definition.code);
    const existing = matches[0];
    const item: PlannedRole = {
      identity: definition.code,
      id: existing?.id ?? uuidv5(`role:${definition.code}`, SEED_NAMESPACE),
      decision:
        matches.length > 1 ||
        existing?.deletedAt ||
        (existing && existing.name !== definition.name)
          ? "CONFLICT"
          : existing
            ? "REUSED"
            : "CREATE",
      code: definition.code,
      name: definition.name,
      description: definition.description,
    };
    rolePlans.set(item.code, item);
    record(report, "Role", item);
    if (item.decision === "CONFLICT")
      issue(report, "ROLE_CONFLICT", item.code, [], {
        database: existing,
        canonical: definition,
      });
  }
  const permissionPlans = new Map<string, Master>();
  const rolePermissionPlans: (Master & {
    roleId: string;
    permissionId: string;
  })[] = [];
  for (const role of rolePlans.values())
    for (const permissionName of ROLE_PERMISSION_NAMES[
      role.code as keyof typeof ROLE_PERMISSION_NAMES
    ] ?? []) {
      let permission = permissionPlans.get(permissionName);
      if (!permission) {
        const found = db.permissions.find(
          (entry) => entry.name === permissionName,
        );
        permission = {
          identity: permissionName,
          id:
            found?.id ?? uuidv5(`permission:${permissionName}`, SEED_NAMESPACE),
          decision: found?.deletedAt ? "CONFLICT" : found ? "REUSED" : "CREATE",
          name: permissionName,
        };
        permissionPlans.set(permissionName, permission);
        record(report, "Permission", permission);
      }
      const found = db.rolePermissions.find(
        (entry) =>
          entry.roleId === role.id && entry.permissionId === permission.id,
      );
      const item = {
        identity: `${role.code}|${permissionName}`,
        id:
          found?.id ??
          stableId("role-permission", `${role.code}|${permissionName}`),
        decision: found ? ("REUSED" as Decision) : ("CREATE" as Decision),
        name: permissionName,
        roleId: role.id,
        permissionId: permission.id,
      };
      rolePermissionPlans.push(item);
      record(report, "RolePermission", item);
    }
  const userRolePlans: (Master & { userId: string; roleId: string })[] = [];
  for (const user of userPlans.values())
    if (user.roleCode) {
      const role = rolePlans.get(user.roleCode);
      if (!role) {
        issue(report, "UNRESOLVED_ROLE", user.email, [], user.roleCode);
        continue;
      }
      const existing = db.userRoles.find((entry) => entry.userId === user.id);
      const item = {
        identity: user.email,
        id: existing?.id ?? stableId("user-role", user.email),
        decision: existing ? ("REUSED" as Decision) : ("CREATE" as Decision),
        name: role.name,
        userId: user.id,
        roleId: role.id,
      };
      userRolePlans.push(item);
      record(report, "UserRole", item, { roleCode: role.code });
      if (existing && existing.roleId !== role.id)
        issue(report, "EXISTING_USER_ROLE_PRESERVED", user.email, [], {
          existingRoleId: existing?.roleId,
          sourceRole: role.code,
        });
    }

  const planCatalog = <T extends { id: string; name: string }>(
    kind: string,
    namesToPlan: string[],
    existing: T[],
    invalid: (entry: T) => boolean,
    keyOf = riskKey,
  ) => {
    const result = new Map<string, Master>();
    for (const name of namesToPlan) {
      const key = keyOf(name);
      if (!key || result.has(key)) continue;
      const matches = existing.filter((entry) => keyOf(entry.name) === key);
      const found = matches[0];
      const item: Master = {
        identity: name,
        id: found?.id ?? stableId(kind, key),
        decision:
          matches.length > 1 || (found && invalid(found)) || name.length > 191
            ? "CONFLICT"
            : found
              ? "REUSED"
              : "CREATE",
        name,
      };
      result.set(key, item);
      record(report, kind, item);
      if (item.decision === "CONFLICT")
        issue(report, `${kind.toUpperCase()}_CONFLICT`, name, [], {
          matches: matches.map((entry) => entry.id),
        });
    }
    return result;
  };
  const areaNames = unique(
    [...source.detail, ...[...source.people.values()].flat()].map((row) =>
      value(row, "Área"),
    ),
  );
  const areas = planCatalog(
    "Area",
    areaNames,
    db.areas,
    (entry) => !entry.active || Boolean(entry.deletedAt),
  );
  const classes = planCatalog(
    "AuditReportClass",
    [...source.reports.values()].map((rows) => value(rows[0]!, "Clase")),
    db.classes,
    (entry) => !entry.active || Boolean(entry.deletedAt),
  );
  const dictionaries = planCatalog(
    "ObservationDictionary",
    source.principals,
    db.dictionaries,
    (entry) => !entry.isActive,
  );
  const catalogKeys = new Set(source.catalog.map(riskKey));
  const detailRisks = source.detail.flatMap((row) =>
    splitRisks(value(row, "Riesgos asociados")),
  );
  const defaultRisk = "Riesgo histórico no especificado.";
  const missingRiskNeeded = [...source.groups.values()].some((rows) =>
    rows.every((row) => !splitRisks(value(row, "Riesgos asociados")).length),
  );
  const riskNames = [
    ...source.catalog,
    ...detailRisks,
    ...(missingRiskNeeded ? [defaultRisk] : []),
  ];
  const risks = planCatalog("Risk", riskNames, db.risks, () => false, riskKey);
  for (const risk of risks.values())
    if (db.risks.some((entry) => entry.id === risk.id && !entry.isActive)) {
      changeDecision(report, "Risk", risk.identity, "UPDATE");
      risk.decision = "UPDATE";
      issue(report, "INACTIVE_RISK_REACTIVATED", risk.name, [], {
        id: risk.id,
      });
    }
  for (const [key, variants] of rowsBy(riskNames, riskKey)) {
    const names = unique(variants.map(normalize));
    if (names.length > 1)
      issue(report, "RISK_SOURCE_VARIANTS_COLLAPSED_BY_DB_COLLATION", key, [], {
        variants: unique(variants),
        collation: "utf8mb4_unicode_ci",
      });
  }
  for (const [key, risk] of risks) {
    const origin =
      key === riskKey(defaultRisk) && missingRiskNeeded
        ? "DEFAULT_UNSPECIFIED"
        : catalogKeys.has(key)
          ? "CATALOG"
          : "HISTORICAL_UNMATCHED";
    report.records.Risk!.find(
      (entry) => entry.identity === risk.identity,
    )!.metadata = { origin };
    if (origin === "HISTORICAL_UNMATCHED")
      issue(
        report,
        "NEW_HISTORICAL_RISK",
        risk.identity,
        source.detail
          .filter((row) =>
            splitRisks(value(row, "Riesgos asociados")).some(
              (name) => riskKey(name) === key,
            ),
          )
          .map((row) => row._row),
        "Absent from workbook risk catalog",
      );
  }
  const levelPlans = new Map<string, PlannedLevel>();
  for (const canonical of CANONICAL_RISK_LEVELS) {
    const matches = db.riskLevels.filter(
      (entry) =>
        entry.key === canonical.key ||
        normalize(entry.name) === normalize(canonical.name),
    );
    const found = matches[0];
    const item: PlannedLevel = {
      ...canonical,
      identity: canonical.key,
      id: found?.id ?? stableId("risk-level", canonical.key),
      decision:
        matches.length > 1 || found?.deletedAt || (found && !found.active)
          ? "CONFLICT"
          : found
            ? "REUSED"
            : "CREATE",
    };
    levelPlans.set(canonical.key, item);
    record(report, "RiskLevel", item);
  }
  const statusPlans = new Map<string, PlannedStatus>();
  for (const canonical of CANONICAL_OBSERVATION_STATUSES) {
    const matches = db.statuses.filter(
      (entry) =>
        entry.key === canonical.key ||
        normalize(entry.name) === normalize(canonical.name),
    );
    const found = matches[0];
    const item: PlannedStatus = {
      ...canonical,
      identity: canonical.key,
      id: found?.id ?? stableId("observation-status", canonical.key),
      decision:
        matches.length > 1 || found?.deletedAt || (found && !found.active)
          ? "CONFLICT"
          : found
            ? "REUSED"
            : "CREATE",
    };
    statusPlans.set(canonical.key, item);
    record(report, "ObservationStatus", item);
  }

  const reports = new Map<
    string,
    Master & {
      title: string;
      reportDate: string;
      classId: string;
      creatorId: string;
    }
  >();
  for (const [number, rows] of source.reports) {
    const row = rows[0]!;
    const classPlan = classes.get(riskKey(value(row, "Clase")));
    const found = db.reports.find((entry) => entry.reportNumber === number);
    const title = value(row, "Título de informe");
    const reportDate = value(row, "Fecha");
    const decision: Decision =
      classPlan?.decision === "CONFLICT" || actor.decision === "CONFLICT"
        ? "BLOCKED"
        : found &&
            (found.deletedAt ||
              found.title !== title ||
              iso(found.reportDate) !== reportDate ||
              found.reportClassId !== classPlan?.id)
          ? "UPDATE"
          : found
            ? "REUSED"
            : "CREATE";
    const item = {
      identity: number,
      id: found?.id ?? stableId("audit-report", number),
      decision,
      name: number,
      title,
      reportDate,
      classId: classPlan?.id ?? "",
      creatorId: actor.id,
    };
    reports.set(number, item);
    record(report, "AuditReport", item, {
      title,
      reportDate,
      reportClass: value(row, "Clase"),
    });
    if (decision === "UPDATE")
      issue(
        report,
        "REPORT_METADATA_OVERWRITTEN",
        number,
        rows.map((entry) => entry._row),
        {
          workbook: { title, reportDate, class: value(row, "Clase") },
          database: found,
        },
      );
  }

  const observationPlans: PlannedObservation[] = [];
  let directReprogramming = 0;
  let sourceOnlyReprogramming = 0;
  const statusMap = {
    "No iniciado (NI)": "NOT_STARTED",
    "Iniciado (I)": "STARTED",
    "Con avance (CA)": "WITH_PROGRESS",
    "Concluido (CO)": "CONCLUDED",
  } as const;
  for (const [code, rows] of source.groups) {
    const identity = observationIdentity(rows[0]!);
    const replacement = overrides.observations?.[code];
    const columns = {
      mainObservation: "Observación principal",
      title: "Título de observación",
      description: "Observación detallada",
      recommendation: "Recomendación",
      riskLevel: "Nivel de riesgo",
      originalDueDate: "Fecha compromiso (vencimiento)",
    } as const;
    const fields: Record<string, string> = {};
    const sourceConflicts: string[] = [];
    const defaultedFields: string[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const chosen = sourceChoice(
        rows,
        column,
        replacement?.[key as keyof typeof columns],
      );
      fields[key] = chosen.value;
      if (chosen.conflict) {
        sourceConflicts.push(key);
        issue(
          report,
          "OBSERVATION_FIELD_CONFLICT_RESOLVED",
          code,
          rows.map((row) => row._row),
          {
            field: key,
            chosen: chosen.value,
            candidates: chosen.candidates,
            resolutionRule: chosen.rule,
            status: "IMPORTED_WITH_SOURCE_CONFLICT",
          },
        );
      }
    }
    for (const [key, substitute] of [
      ["description", "Sin detalle histórico registrado."],
      ["recommendation", "Sin recomendación histórica registrada."],
    ] as const)
      if (!fields[key]) {
        fields[key] = substitute;
        defaultedFields.push(key);
        issue(
          report,
          "HISTORICAL_TEXT_DEFAULTED",
          code,
          rows.map((row) => row._row),
          { field: key, value: substitute },
        );
      }
    const fullTitle = fields.title ?? "";
    if (fullTitle.length > 191) {
      fields.title = fullTitle.slice(0, 191);
      issue(
        report,
        "TITLE_TRUNCATED",
        code,
        rows
          .filter((row) => value(row, "Título de observación").length > 191)
          .map((row) => row._row),
        { original: fullTitle, truncated: fields.title },
      );
    }
    const dictionary = dictionaries.get(riskKey(fields.mainObservation ?? ""));
    const riskLevel = [...levelPlans.values()].find(
      (entry) =>
        normalize(entry.name) === normalize(fields.riskLevel ?? "") ||
        normalize(entry.key) === normalize(fields.riskLevel ?? ""),
    );
    const reportPlan = reports.get(identity.reportNumber);
    const sourcePlans = rows.map((row) => ({
      status:
        statusMap[
          value(row, "Estado según avance") as keyof typeof statusMap
        ] ?? ("NOT_STARTED" as const),
      progressPercent: 0,
    }));
    const statusKey =
      observationAggregationService.calculateStatus(sourcePlans);
    const status = statusPlans.get(statusKey);
    const found = db.observations.find(
      (entry) =>
        entry.auditReportId === reportPlan?.id &&
        entry.observationNumber === identity.observationNumber,
    );
    const originalDue = fields.originalDueDate ?? "";
    const reprogramRows = rows.filter(
      (row) =>
        value(row, "N° reprogramacion") || value(row, "Fecha reprogramación"),
    );
    const eligibleReprogram = reprogramRows.filter(
      (row) =>
        value(row, "Estado según plazo") === "Reprogramado" &&
        validDate(value(row, "Fecha reprogramación")) &&
        value(row, "Fecha reprogramación") > originalDue,
    );
    const currentDue =
      eligibleReprogram.length === 1
        ? value(eligibleReprogram[0]!, "Fecha reprogramación")
        : originalDue;
    for (const row of reprogramRows) {
      const direct = eligibleReprogram.includes(row);
      if (direct) directReprogramming++;
      else sourceOnlyReprogramming++;
      issue(
        report,
        "HISTORICAL_REPROGRAMMING_WITH_INCOMPLETE_APPROVAL_METADATA",
        code,
        [row._row],
        {
          handling: direct ? "DIRECT_DUE_DATE" : "SOURCE_ONLY",
          originalDueDate: originalDue,
          sourceDate: value(row, "Fecha reprogramación"),
          sourceStatus: value(row, "Estado según plazo"),
          noApprovalWorkflowCreated: true,
        },
      );
    }
    let decision: Decision = found ? "REUSED" : "CREATE";
    if (
      !fields.mainObservation ||
      !fields.title ||
      !validDate(originalDue) ||
      !dictionary ||
      !riskLevel ||
      !reportPlan ||
      !status ||
      [dictionary, riskLevel, reportPlan, status].some(
        (entry) =>
          entry.decision === "CONFLICT" || entry.decision === "BLOCKED",
      )
    )
      decision = "BLOCKED";
    if (
      decision !== "BLOCKED" &&
      found &&
      (found.deletedAt ||
        found.title !== fields.title ||
        found.description !== fields.description ||
        found.auditRecommendation !== fields.recommendation ||
        found.mainObservationId !== dictionary?.id ||
        found.riskLevelId !== riskLevel?.id ||
        found.statusId !== status?.id ||
        iso(found.originalDueDate) !== originalDue ||
        iso(found.currentDueDate) !== currentDue)
    ) {
      decision = "UPDATE";
      issue(
        report,
        "EXISTING_OBSERVATION_OVERWRITTEN",
        code,
        rows.map((row) => row._row),
        { databaseId: found.id },
      );
    }
    const observationId = found?.id ?? stableId("observation", code);
    const sourceRiskNames = replacement?.risks?.length
      ? replacement.risks
      : rows.flatMap((row) => splitRisks(value(row, "Riesgos asociados")));
    if (!sourceRiskNames.length) {
      sourceRiskNames.push(defaultRisk);
      defaultedFields.push("risks");
      issue(
        report,
        "HISTORICAL_RISK_DEFAULTED",
        code,
        rows.map((row) => row._row),
        { value: defaultRisk },
      );
    }
    const riskLinks: PlannedObservation["riskLinks"] = [];
    for (const riskName of unique(sourceRiskNames.map(riskKey))) {
      const risk = risks.get(riskName);
      if (!risk || risk.decision === "CONFLICT") {
        decision = "BLOCKED";
        continue;
      }
      const existingLink = found?.risks.find(
        (entry) => entry.riskId === risk.id,
      );
      const item = {
        identity: `${code}|${risk.name}`,
        id:
          existingLink?.id ??
          stableId("observation-risk", `${code}|${riskName}`),
        riskId: risk.id,
        decision: existingLink
          ? ("REUSED" as Decision)
          : ("CREATE" as Decision),
      };
      riskLinks.push(item);
    }
    const areaPlans: PlannedArea[] = [];
    const rowToPlan = new Map<number, string>();
    for (const areaRows of rowsBy(rows, (row) =>
      riskKey(value(row, "Área")),
    ).values()) {
      const areaName = value(areaRows[0]!, "Área");
      const area = areas.get(riskKey(areaName));
      const override = overrides.areaAssignments?.[`${code}|${areaName}`];
      const ownerChoice = latestChoice(areaRows, "Dueño de proceso");
      const responsibleChoice = latestChoice(areaRows, "Responsable de área");
      const owner = userFor(ownerChoice.value, override?.processOwnerEmail);
      const responsible = userFor(
        responsibleChoice.value,
        override?.areaResponsibleEmail,
      );
      if (ownerChoice.conflict || responsibleChoice.conflict)
        issue(
          report,
          "AREA_ASSIGNMENT_CONFLICT_RESOLVED",
          `${code}|${areaName}`,
          areaRows.map((row) => row._row),
          {
            processOwners: ownerChoice.candidates,
            areaResponsibles: responsibleChoice.candidates,
            selectedProcessOwner: owner?.email,
            selectedAreaResponsible: responsible?.email,
            resolutionRule: {
              processOwner: override?.processOwnerEmail
                ? "OVERRIDE"
                : ownerChoice.rule,
              areaResponsible: override?.areaResponsibleEmail
                ? "OVERRIDE"
                : responsibleChoice.rule,
            },
          },
        );
      const assignment = found?.areaAssignments.find(
        (entry) => entry.areaId === area?.id,
      );
      const areaId =
        assignment?.id ??
        stableId("observation-area", `${code}|${normalize(areaName)}`);
      let areaDecision: Decision = assignment ? "REUSED" : "CREATE";
      if (
        decision === "BLOCKED" ||
        !area ||
        !owner ||
        !responsible ||
        [area, owner, responsible].some(
          (entry) => entry.decision === "CONFLICT",
        )
      )
        areaDecision = "BLOCKED";
      if (
        areaDecision !== "BLOCKED" &&
        assignment &&
        (assignment.processOwnerUserId !== owner?.id ||
          assignment.areaResponsibleUserId !== responsible?.id)
      ) {
        areaDecision = "UPDATE";
        issue(
          report,
          "EXISTING_AREA_ASSIGNMENT_OVERWRITTEN",
          `${code}|${areaName}`,
          areaRows.map((row) => row._row),
          { databaseId: assignment.id },
        );
      }
      const plans: PlannedPlan[] = [];
      const seen = new Map<string, string>();
      for (const row of areaRows) {
        const description =
          value(row, "Plan de acción") ||
          "Sin plan de acción histórico registrado.";
        const defaulted = !value(row, "Plan de acción");
        if (defaulted)
          issue(report, "HISTORICAL_ACTION_PLAN_DEFAULTED", code, [row._row], {
            value: description,
          });
        const executor = userFor(value(row, "Ejecutor (reporte)"));
        const due = value(row, "Fecha compromiso (plan de acción)");
        const statusValue =
          statusMap[
            value(row, "Estado según avance") as keyof typeof statusMap
          ];
        const reprogrammed = eligibleReprogram.includes(row)
          ? value(row, "Fecha reprogramación")
          : due;
        const natural = JSON.stringify([
          code,
          normalize(areaName),
          executor?.email,
          normalize(description),
          due,
        ]);
        const previous = seen.get(natural);
        if (previous) {
          rowToPlan.set(row._row, previous);
          count(
            report,
            "ActionPlan",
            "SKIPPED",
            `${code}|row:${row._row}`,
            undefined,
            "Duplicate source identity",
          );
          continue;
        }
        const match = found?.actionPlans.find(
          (entry) =>
            !entry.deletedAt &&
            entry.observationAreaId === assignment?.id &&
            entry.responsibleUserId === executor?.id &&
            normalize(entry.description) === normalize(description) &&
            iso(entry.originalDueDate) === due,
        );
        let planDecision: Decision = match ? "REUSED" : "CREATE";
        if (
          areaDecision === "BLOCKED" ||
          !executor ||
          executor.decision === "CONFLICT" ||
          !validDate(due) ||
          !statusValue
        )
          planDecision = "BLOCKED";
        if (
          planDecision !== "BLOCKED" &&
          match &&
          (match.status !== statusValue ||
            iso(match.currentDueDate) !== reprogrammed)
        ) {
          planDecision = "UPDATE";
          issue(
            report,
            "EXISTING_ACTION_PLAN_OVERWRITTEN",
            `${code}|row:${row._row}`,
            [row._row],
            { databaseId: match.id },
          );
        }
        const item: PlannedPlan = {
          identity: `${code}|row:${row._row}`,
          id: match?.id ?? stableId("action-plan", natural),
          decision: planDecision,
          row,
          executorId: executor?.id ?? "",
          description,
          status: statusValue ?? "NOT_STARTED",
          due,
          currentDue: reprogrammed,
          defaulted,
        };
        plans.push(item);
        seen.set(natural, item.id);
        rowToPlan.set(row._row, item.id);
        record(report, "ActionPlan", item, {
          description,
          executorEmail: executor?.email,
          status: item.status,
          defaultedDescription: defaulted,
          area: areaName,
          due,
          currentDue: reprogrammed,
        });
      }
      const areaItem: PlannedArea = {
        identity: `${code}|${areaName}`,
        id: areaId,
        decision: areaDecision,
        name: areaName,
        areaId: area?.id ?? "",
        ownerId: owner?.id ?? "",
        responsibleId: responsible?.id ?? "",
        plans,
      };
      areaPlans.push(areaItem);
      record(report, "ObservationArea", areaItem, {
        selectedProcessOwnerEmail: owner?.email,
        selectedAreaResponsibleEmail: responsible?.email,
      });
    }
    if (areaPlans.some((area) => area.plans.some((plan) => plan.defaulted)))
      defaultedFields.push("actionPlans");
    const comments: PlannedComment[] = [];
    for (const row of rows)
      for (const column of ["Comentario 1", "Comentario 2"]) {
        const body = String(row[column] ?? "");
        if (!body.trim()) continue;
        const id = stableId(
          "observation-comment",
          `${code}|${row._row}|${column}`,
        );
        const foundComment = db.comments.find((entry) => entry.id === id);
        const actionPlanId = rowToPlan.get(row._row);
        const linkedPlan = areaPlans
          .flatMap((area) => area.plans)
          .find((plan) => plan.id === actionPlanId);
        const commentDecision: Decision =
          foundComment && foundComment.observationId !== observationId
            ? "CONFLICT"
            : foundComment &&
                (foundComment.deletedAt ||
                  foundComment.body !== body ||
                  foundComment.authorUserId !== actor.id ||
                  foundComment.actionPlanId !== (actionPlanId ?? null))
              ? "UPDATE"
              : foundComment
                ? "REUSED"
                : decision === "BLOCKED" ||
                    linkedPlan?.decision === "BLOCKED" ||
                    linkedPlan?.decision === "CONFLICT"
                  ? "BLOCKED"
                  : "CREATE";
        const item: PlannedComment = {
          identity: `${code}|row:${row._row}|${column}`,
          id,
          decision: commentDecision,
          body,
          row: row._row,
          field: column,
          ...(actionPlanId ? { actionPlanId } : {}),
        };
        comments.push(item);
        record(report, "ObservationComment", item, {
          status: "HISTORICAL_COMMENT_IMPORTED_WITH_UNKNOWN_AUTHOR_DATE",
          authorIsTechnical: true,
          originalAuthorAndDateUnknown: true,
        });
        if (commentDecision === "CREATE")
          issue(
            report,
            "HISTORICAL_COMMENT_IMPORTED_WITH_UNKNOWN_AUTHOR_DATE",
            code,
            [row._row],
            { field: column, technicalAuthorEmail: actor.email },
          );
      }
    for (const row of reprogramRows.filter(
      (entry) => !eligibleReprogram.includes(entry),
    )) {
      const id = stableId(
        "reprogramming-source-comment",
        `${code}|${row._row}`,
      );
      const body = [
        "Reprogramación histórica registrada en fuente.",
        `Fecha de reprogramación: ${value(row, "Fecha reprogramación") || "no indicada"}.`,
        `N° reprogramación: ${value(row, "N° reprogramacion") || "no indicado"}.`,
        `Estado según plazo en fuente: ${value(row, "Estado según plazo") || "no indicado"}.`,
        "No se dispone de metadata suficiente para reconstruir el flujo de aprobación original.",
      ].join(" ");
      const foundComment = db.comments.find((entry) => entry.id === id);
      const commentDecision: Decision =
        foundComment && foundComment.observationId !== observationId
          ? "CONFLICT"
          : foundComment &&
              (foundComment.deletedAt ||
                foundComment.body !== body ||
                foundComment.authorUserId !== actor.id ||
                foundComment.actionPlanId !== null)
            ? "UPDATE"
            : foundComment
              ? "REUSED"
              : decision === "BLOCKED"
                ? "BLOCKED"
                : "CREATE";
      const item: PlannedComment = {
        identity: `${code}|row:${row._row}|reprogramming-source`,
        id,
        decision: commentDecision,
        body,
        row: row._row,
        field: "reprogramming-source",
      };
      comments.push(item);
      record(report, "ObservationComment", item, {
        status: "HISTORICAL_REPROGRAMMING_SOURCE_PRESERVED",
        approvalWorkflowEvent: false,
        authorIsTechnical: true,
        sourceRow: row._row,
      });
      issue(
        report,
        "HISTORICAL_REPROGRAMMING_SOURCE_PRESERVED",
        code,
        [row._row],
        {
          commentId: id,
          decision: commentDecision,
          approvalWorkflowEvent: false,
        },
      );
    }
    const plans = areaPlans.flatMap((area) => area.plans);
    const existingComments = db.comments.filter(
      (comment) => comment.observationId === observationId,
    );
    const replacedChildren = found && {
      risks: found.risks.filter(
        (entry) => !riskLinks.some((link) => link.riskId === entry.riskId),
      ).length,
      areas: found.areaAssignments.filter(
        (entry) => !areaPlans.some((area) => area.areaId === entry.areaId),
      ).length,
      plans: found.actionPlans.filter(
        (entry) => !plans.some((plan) => plan.id === entry.id),
      ).length,
      comments: existingComments.filter(
        (entry) => !comments.some((comment) => comment.id === entry.id),
      ).length,
    };
    if (comments.some((comment) => comment.decision === "CONFLICT"))
      decision = "BLOCKED";
    if (
      found &&
      decision !== "BLOCKED" &&
      (decision === "UPDATE" ||
        [...riskLinks, ...areaPlans, ...plans, ...comments].some(
          (entry) => entry.decision !== "REUSED",
        ) ||
        Object.values(replacedChildren!).some(Boolean))
    ) {
      decision = "UPDATE";
      issue(report, "EXISTING_OBSERVATION_REPLACED", code, [], {
        databaseId: found.id,
        removedChildren: replacedChildren,
      });
      for (const [kind, entries] of [
        ["ObservationArea", areaPlans],
        ["ActionPlan", plans],
        ["ObservationComment", comments],
      ] as const)
        for (const entry of entries)
          if (entry.decision !== "BLOCKED" && entry.decision !== "CONFLICT") {
            changeDecision(report, kind, entry.identity, "CREATE");
            entry.decision = "CREATE";
          }
      for (const link of riskLinks) link.decision = "CREATE";
    }
    const item: PlannedObservation = {
      identity: code,
      id: observationId,
      decision,
      reportNumber: identity.reportNumber,
      reportId: reportPlan?.id ?? "",
      number: identity.observationNumber,
      fields,
      dictionaryId: dictionary?.id ?? "",
      riskLevelId: riskLevel?.id ?? "",
      statusId: status?.id ?? "",
      currentDue,
      riskLinks,
      areas: areaPlans,
      comments,
      defaultedFields,
      sourceConflicts,
    };
    observationPlans.push(item);
    record(report, "Observation", item, {
      title: fields.title,
      statusKey,
      defaultedFields,
      sourceConflicts,
      status: sourceConflicts.length
        ? "IMPORTED_WITH_SOURCE_CONFLICT"
        : "STANDARD",
      originalDue,
      currentDue,
      historicalObservationNumber: identity.observationNumber,
    });
    for (const link of riskLinks) {
      if (decision === "BLOCKED") link.decision = "BLOCKED";
      record(report, "ObservationRisk", link);
    }
  }
  const sourceNumbers = new Map<string, Set<number>>();
  for (const item of observationPlans) {
    if (!sourceNumbers.has(item.reportId))
      sourceNumbers.set(item.reportId, new Set());
    sourceNumbers.get(item.reportId)!.add(item.number);
  }
  const extraObservations = db.observations.flatMap((entry) => {
    const reportPlan = [...reports.values()].find(
      (item) => item.id === entry.auditReportId,
    );
    if (
      !reportPlan ||
      sourceNumbers.get(reportPlan.id)?.has(entry.observationNumber)
    )
      return [];
    const item = {
      identity: `${reportPlan.identity}-${String(entry.observationNumber).padStart(2, "0")}`,
      id: entry.id,
      decision: "DELETE" as Decision,
    };
    record(report, "Observation", item);
    issue(report, "EXTRA_OBSERVATION_REMOVED", item.identity, [], {
      databaseId: entry.id,
    });
    return [item];
  });
  Object.assign((report.sourceCounts ??= {}), {
    reprogrammingDirectDueDate: directReprogramming,
    reprogrammingSourceOnly: sourceOnlyReprogramming,
    defaultedObservations: observationPlans.filter(
      (item) => item.defaultedFields.length,
    ).length,
    importedWithSourceConflicts: observationPlans.filter(
      (item) => item.sourceConflicts.length,
    ).length,
  });
  return {
    actor,
    roles: [...rolePlans.values()],
    permissions: [...permissionPlans.values()],
    rolePermissions: rolePermissionPlans,
    users: [...userPlans.values()],
    userRoles: userRolePlans,
    areas: [...areas.values()],
    classes: [...classes.values()],
    dictionaries: [...dictionaries.values()],
    riskLevels: [...levelPlans.values()],
    risks: [...risks.values()],
    statuses: [...statusPlans.values()],
    reports: [...reports.values()],
    observations: observationPlans,
    extraObservations,
  };
};

type Plan = ReturnType<typeof buildPlan>;
export const writePlan = async (plan: Plan, report: ImportReport) => {
  const saved = (kind: string, identity: string, id: string) => {
    const entry = report.records[kind]?.find(
      (item) => item.identity === identity,
    );
    if (entry) entry.id = id;
  };
  for (const item of plan.roles)
    if (item.decision === "CREATE") {
      const row = await prisma.role.upsert({
        where: { code: item.code },
        create: {
          id: item.id,
          code: item.code,
          name: item.name,
          description: item.description,
        },
        update: {},
      });
      saved("Role", item.identity, row.id);
    }
  for (const item of plan.permissions)
    if (item.decision === "CREATE") {
      const row = await prisma.permission.upsert({
        where: { name: item.name },
        create: {
          id: item.id,
          name: item.name,
          description: `${item.name} permission.`,
        },
        update: {},
      });
      saved("Permission", item.identity, row.id);
    }
  for (const item of plan.rolePermissions)
    if (item.decision === "CREATE") {
      const row = await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: item.roleId,
            permissionId: item.permissionId,
          },
        },
        create: {
          id: item.id,
          roleId: item.roleId,
          permissionId: item.permissionId,
        },
        update: {},
      });
      saved("RolePermission", item.identity, row.id);
    }
  for (const item of plan.users)
    if (item.decision === "CREATE") {
      const row = await prisma.user.upsert({
        where: { email: item.email },
        create: {
          id: item.id,
          name: item.name,
          email: item.email,
          jobTitle: item.jobTitle,
          isActive: false,
          emailVerified: false,
          password: null,
        },
        update: {},
      });
      saved("User", item.identity, row.id);
    }
  for (const item of plan.userRoles)
    if (item.decision === "CREATE") {
      const row = await prisma.userRole.upsert({
        where: { userId: item.userId },
        create: { id: item.id, userId: item.userId, roleId: item.roleId },
        update: {},
      });
      saved("UserRole", item.identity, row.id);
    }
  for (const item of plan.areas)
    if (item.decision === "CREATE") {
      const row = await prisma.area.upsert({
        where: { name: item.name },
        create: { id: item.id, name: item.name },
        update: {},
      });
      saved("Area", item.identity, row.id);
    }
  for (const item of plan.classes)
    if (item.decision === "CREATE") {
      const row = await prisma.auditReportClass.upsert({
        where: { name: item.name },
        create: { id: item.id, name: item.name },
        update: {},
      });
      saved("AuditReportClass", item.identity, row.id);
    }
  for (const item of plan.dictionaries)
    if (item.decision === "CREATE") {
      const row = await prisma.observationDictionary.upsert({
        where: { name: item.name },
        create: { id: item.id, name: item.name },
        update: {},
      });
      saved("ObservationDictionary", item.identity, row.id);
    }
  for (const item of plan.riskLevels)
    if (item.decision === "CREATE") {
      const row = await prisma.riskLevel.upsert({
        where: { key: item.key },
        create: {
          id: item.id,
          name: item.name,
          key: item.key,
          severityOrder: item.severityOrder,
          maxRemediationDays: item.maxRemediationDays,
          description: item.description,
          colorToken: item.colorToken,
        },
        update: {},
      });
      saved("RiskLevel", item.identity, row.id);
    }
  for (const item of plan.risks)
    if (item.decision === "CREATE" || item.decision === "UPDATE") {
      const row =
        item.decision === "UPDATE"
          ? await prisma.risk.update({
              where: { id: item.id },
              data: { isActive: true },
            })
          : await prisma.risk.upsert({
              where: { name: item.name },
              create: { id: item.id, name: item.name },
              update: {},
            });
      if (row.id !== item.id) {
        for (const observation of plan.observations)
          for (const link of observation.riskLinks)
            if (link.riskId === item.id) link.riskId = row.id;
        item.id = row.id;
      }
      saved("Risk", item.identity, row.id);
    }
  for (const item of plan.statuses)
    if (item.decision === "CREATE") {
      const row = await prisma.observationStatus.upsert({
        where: { key: item.key },
        create: {
          id: item.id,
          name: item.name,
          key: item.key,
          sortOrder: item.sortOrder,
          isInitial: item.isInitial,
          isFinal: item.isFinal,
          countsAsOverdue: item.countsAsOverdue,
          description: item.description,
        },
        update: {},
      });
      saved("ObservationStatus", item.identity, row.id);
    }
  for (const item of plan.reports)
    if (item.decision === "CREATE" || item.decision === "UPDATE") {
      const row = await prisma.auditReport.upsert({
        where: { reportNumber: item.identity },
        create: {
          id: item.id,
          reportNumber: item.identity,
          title: item.title,
          reportDate: date(item.reportDate),
          reportClassId: item.classId,
          createdByUserId: item.creatorId,
        },
        update: {
          title: item.title,
          reportDate: date(item.reportDate),
          reportClassId: item.classId,
          deletedAt: null,
        },
      });
      saved("AuditReport", item.identity, row.id);
    }
  for (const item of plan.extraObservations) {
    await prisma.$transaction(async (tx) => {
      await tx.actionPlan.deleteMany({ where: { observationId: item.id } });
      await tx.observation.delete({ where: { id: item.id } });
    });
    saved("Observation", item.identity, item.id);
  }
  for (const item of plan.observations) {
    if (item.decision === "BLOCKED" || item.decision === "CONFLICT") continue;
    const committed = await prisma.$transaction(async (tx) => {
      const ids: { kind: string; identity: string; id: string }[] = [];
      if (item.decision === "UPDATE") {
        await tx.actionPlan.deleteMany({ where: { observationId: item.id } });
        await tx.observation.delete({ where: { id: item.id } });
      }
      const observation =
        item.decision === "CREATE" || item.decision === "UPDATE"
          ? await tx.observation.create({
              data: {
                id: item.id,
                auditReportId: item.reportId,
                observationNumber: item.number,
                mainObservationId: item.dictionaryId,
                title: item.fields.title!,
                description: item.fields.description!,
                auditRecommendation: item.fields.recommendation!,
                riskLevelId: item.riskLevelId,
                statusId: item.statusId,
                originalDueDate: date(item.fields.originalDueDate!),
                currentDueDate: date(item.currentDue),
              },
            })
          : { id: item.id };
      ids.push({
        kind: "Observation",
        identity: item.identity,
        id: observation.id,
      });
      for (const link of item.riskLinks)
        if (link.decision === "CREATE") {
          const row = await tx.observationRisk.upsert({
            where: {
              observationId_riskId: {
                observationId: observation.id,
                riskId: link.riskId,
              },
            },
            create: {
              id: link.id,
              observationId: observation.id,
              riskId: link.riskId,
            },
            update: {},
          });
          ids.push({
            kind: "ObservationRisk",
            identity: link.identity,
            id: row.id,
          });
        }
      for (const area of item.areas) {
        if (area.decision === "BLOCKED" || area.decision === "CONFLICT")
          continue;
        const assignment =
          area.decision === "CREATE"
            ? await tx.observationArea.upsert({
                where: {
                  observationId_areaId: {
                    observationId: observation.id,
                    areaId: area.areaId,
                  },
                },
                create: {
                  id: area.id,
                  observationId: observation.id,
                  areaId: area.areaId,
                  processOwnerUserId: area.ownerId,
                  areaResponsibleUserId: area.responsibleId,
                },
                update: {},
              })
            : { id: area.id };
        ids.push({
          kind: "ObservationArea",
          identity: area.identity,
          id: assignment.id,
        });
        for (const action of area.plans)
          if (action.decision === "CREATE") {
            const found = (
              await tx.actionPlan.findMany({
                where: {
                  observationId: observation.id,
                  observationAreaId: assignment.id,
                  responsibleUserId: action.executorId,
                  originalDueDate: date(action.due),
                  deletedAt: null,
                },
              })
            ).find(
              (row) =>
                normalize(row.description) === normalize(action.description),
            );
            const row =
              found ??
              (await tx.actionPlan.create({
                data: {
                  id: action.id,
                  observationId: observation.id,
                  observationAreaId: assignment.id,
                  responsibleUserId: action.executorId,
                  title: action.description.slice(0, 191),
                  description: action.description,
                  originalDueDate: date(action.due),
                  currentDueDate: date(action.currentDue),
                  status: action.status,
                },
              }));
            ids.push({
              kind: "ActionPlan",
              identity: action.identity,
              id: row.id,
            });
          }
      }
      for (const comment of item.comments)
        if (comment.decision === "CREATE") {
          const row = await tx.observationComment.upsert({
            where: { id: comment.id },
            create: {
              id: comment.id,
              observationId: observation.id,
              authorUserId: plan.actor.id,
              visibility: "SYSTEM",
              body: comment.body,
              ...(comment.actionPlanId
                ? { actionPlanId: comment.actionPlanId }
                : {}),
            },
            update: {},
          });
          ids.push({
            kind: "ObservationComment",
            identity: comment.identity,
            id: row.id,
          });
        }
      return ids;
    });
    for (const row of committed) saved(row.kind, row.identity, row.id);
  }
};

export const writeIfAuthorized = async (
  execute: boolean,
  plan: Plan,
  report: ImportReport,
  writer = writePlan,
) => {
  if (!execute) return;
  const blockers = Object.values(report.records).some((entries) =>
    entries.some(
      (entry) => entry.decision === "BLOCKED" || entry.decision === "CONFLICT",
    ),
  );
  if (blockers)
    throw new Error("IMPORT ABORTED: unresolved required master data");
  await writer(plan, report);
};

const finalizeExecution = (report: ImportReport) => {
  for (const [kind, records] of Object.entries(report.records)) {
    for (const entry of records)
      if (["CREATE", "UPDATE", "DELETE"].includes(entry.decision)) {
        const completed = {
          CREATE: "CREATED",
          UPDATE: "UPDATED",
          DELETE: "DELETED",
        } as const;
        entry.decision = entry.id
          ? completed[entry.decision as keyof typeof completed]
          : "SKIPPED";
        if (!entry.id && report.error)
          entry.reason = `Not committed: ${report.error}`;
      }
    report.counts[kind] = {};
    for (const entry of records)
      report.counts[kind]![entry.decision] =
        (report.counts[kind]![entry.decision] ?? 0) + 1;
  }
};

export const run = async (args = process.argv.slice(2)) => {
  const options = parseArgs(args);
  const report: ImportReport = {
    mode: options.execute ? "execute" : "dry-run",
    database: "UNAVAILABLE",
    counts: {},
    records: {},
    exceptions: [],
    historicalSourceComments: [],
    historicalReprogrammingSource: [],
  };
  try {
    const book = readWorkbook(options.workbook);
    const source = prepareSource(book, report);
    let db: Snapshot;
    try {
      db = await reconcileDatabase();
      report.database = "AVAILABLE";
    } catch (error) {
      reportSourceExceptions(source, report);
      report.error = String(error);
      issue(report, "DATABASE_UNAVAILABLE", "database", [], report.error);
      reportFiles(report);
      console.error(report.error);
      return 2;
    }
    const overrides = JSON.parse(
      readFileSync(options.overrides, "utf8"),
    ) as Override;
    const plan = buildPlan(source, db, overrides, report);
    await writeIfAuthorized(options.execute, plan, report);
    if (options.execute) finalizeExecution(report);
    reportFiles(report);
    console.log(
      JSON.stringify(
        {
          mode: report.mode,
          database: report.database,
          counts: report.counts,
          exceptions: report.exceptions.length,
        },
        null,
        2,
      ),
    );
    return 0;
  } catch (error) {
    report.error = String(error);
    if (options.execute) finalizeExecution(report);
    reportFiles(report);
    console.error(report.error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await run();
