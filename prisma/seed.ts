import "dotenv/config";

import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../src/utils/prisma.js";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

import {
  getAdminSeedIds,
  getPrimaryAdminSeed,
  resolveAdminSeedConfigs,
  SEED_NAMESPACE,
  type AdminSeedConfig,
} from "./admin-seed-config.js";
import {
  ADMIN_ROLE_CODE,
  ALL_PERMISSION_NAMES,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_NAMES,
  type RoleCode,
} from "../src/permissions/definitions.js";
import { DEADLINE_REMINDER_PARAMETER_DEFAULTS } from "../src/jobs/deadline-monitor/deadline-reminder.constants.js";
import {
  CANONICAL_OBSERVATION_STATUSES,
  CANONICAL_RISK_LEVELS,
} from "./canonical-historical-catalogs.js";

const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SEED_APP_NAME: z
    .string()
    .min(1)
    .default("NIBOL Bolivia | Seguimiento de Auditoría"),
  SEED_SUPPORT_EMAIL: z.email().default("auditoria@nibol.com.bo"),
  SEED_TIMEZONE: z.string().min(1).default("America/La_Paz"),
  SEED_DATE_FORMAT: z.string().min(1).default("YYYY-MM-DD"),
  SEED_SENDER_NAME: z.string().min(1).default("NIBOL Bolivia"),
  SEED_SENDER_EMAIL: z.email().default("no-reply@nibol.com.bo"),
  SEED_PRIMARY_COLOR: z.string().min(1).default("#07142d"),
  SEED_LOGO: z.string().optional(),
  SEED_DEMO_PASSWORD: z.string().min(8).optional(),
});

const env = seedEnvSchema.parse(process.env);
const includeDemo = process.argv.includes("--demo");
const adminSeeds = resolveAdminSeedConfigs(process.env);
const primaryAdminSeed = getPrimaryAdminSeed(adminSeeds);

type SeedRole = {
  code: RoleCode;
  key: RoleCode;
  name: string;
  description: string;
};

type SeedPermission = {
  key: string;
  name: string;
  description: string;
};

type SeedRiskLevelKey = "ALTO" | "MEDIO" | "BAJO";
type SeedExtensionClassification = {
  code: string;
  description: string;
  maxAdditionalDays: number;
  name: string;
};
type SeedObservationStatusKey =
  | "NO_INICIADO"
  | "INICIADO"
  | "CON_AVANCE"
  | "CONCLUIDO";
type SeedAreaKey =
  | "technology"
  | "operations"
  | "finance"
  | "commercial"
  | "warehouse";
type SeedSystemParameterValueType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "date";
type SeedCatalogType =
  | "proceso_auditado"
  | "tipo_observacion"
  | "fuente_hallazgo"
  | "categoria_hallazgo"
  | "workflow_process_type";

type SeedRiskLevel = {
  colorToken: string | null;
  maxRemediationDays: number | null;
  description: string | null;
  key: SeedRiskLevelKey;
  name: string;
  severityOrder: number;
};

type SeedObservationStatus = {
  countsAsOverdue: boolean;
  description: string | null;
  isFinal: boolean;
  isInitial: boolean;
  key: SeedObservationStatusKey;
  name: string;
  sortOrder: number;
};

type SeedArea = {
  code: string;
  description: string | null;
  key: SeedAreaKey;
  name: string;
};

type SeedSystemParameter = {
  active: boolean;
  description: string | null;
  editable: boolean;
  group: string;
  key: string;
  name: string;
  value: string;
  valueType: SeedSystemParameterValueType;
};

type SeedCatalog = {
  active: boolean;
  description: string | null;
  key: string | null;
  name: string;
  sortOrder: number;
  type: SeedCatalogType;
};

const roles: SeedRole[] = ROLE_DEFINITIONS.map((role) => ({
  code: role.code,
  description: role.description,
  key: role.code,
  name: role.name,
}));

const riskLevels: SeedRiskLevel[] = CANONICAL_RISK_LEVELS.map((entry) => ({
  ...entry,
}));

const extensionClassifications: SeedExtensionClassification[] = [
  {
    code: "EXECUTION",
    description: "Aprobación, ajuste, validación o formalización.",
    maxAdditionalDays: 15,
    name: "Ejecución",
  },
  {
    code: "PROCEDURE_DEVELOPMENT",
    description: "Creación o actualización de procedimientos.",
    maxAdditionalDays: 30,
    name: "Elaboración de procedimientos",
  },
  {
    code: "SYSTEM_IMPROVEMENT",
    description: "Modificaciones o desarrollos requeridos en sistemas.",
    maxAdditionalDays: 60,
    name: "Mejora en sistemas",
  },
];

const observationStatuses: SeedObservationStatus[] =
  CANONICAL_OBSERVATION_STATUSES.map((entry) => ({ ...entry }));

const areas: SeedArea[] = [
  {
    code: "TI",
    description:
      "Gobierno y operación de plataformas, accesos e infraestructura.",
    key: "technology",
    name: "Tecnología de la Información",
  },
  {
    code: "OPER",
    description:
      "Ejecución operativa, control diario y continuidad del servicio.",
    key: "operations",
    name: "Operaciones",
  },
  {
    code: "FIN",
    description: "Tesorería, conciliaciones y control financiero.",
    key: "finance",
    name: "Finanzas",
  },
  {
    code: "COM",
    description: "Gestión comercial, descuentos y relación con clientes.",
    key: "commercial",
    name: "Comercial",
  },
  {
    code: "ALM",
    description: "Inventarios, almacenes y logística de distribución.",
    key: "warehouse",
    name: "Almacenes y Logística",
  },
];

const demoUsers = [
  {
    areaKey: "finance" as const,
    email: "auditor@nibol.local",
    jobTitle: "Auditoría interna",
    name: "Auditor Demo",
    roleCode: "AUDITOR" as const,
  },
  {
    areaKey: "finance" as const,
    email: "dueno.proceso@nibol.local",
    jobTitle: "Dueño del proceso de Finanzas",
    name: "Dueño Proceso Demo",
    roleCode: "PROCESS_OWNER" as const,
  },
  {
    areaKey: "finance" as const,
    email: "responsable.area@nibol.local",
    jobTitle: "Responsable del área de Finanzas",
    name: "Responsable Área Demo",
    roleCode: "AREA_RESPONSIBLE" as const,
  },
  {
    areaKey: "finance" as const,
    email: "ejecutor@nibol.local",
    jobTitle: "Ejecutor de planes de acción",
    name: "Ejecutor Demo",
    roleCode: "EXECUTOR" as const,
  },
] as const;

const systemParameters: SeedSystemParameter[] = [
  {
    active: true,
    description:
      "Días de anticipación para enviar recordatorios antes del vencimiento.",
    editable: true,
    group: "seguimiento",
    key: "reminder_days_before_due",
    name: "Días previos para recordatorio",
    value: "7",
    valueType: "number",
  },
  {
    active: true,
    description: "Activa la revisión automática de observaciones vencidas.",
    editable: true,
    group: "seguimiento",
    key: "overdue_check_enabled",
    name: "Revisión automática de vencimientos",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description:
      "Repite los recordatorios de vencimiento cada cierta cantidad de días.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "reminder_repeat_days",
    name: "Frecuencia de repetición de recordatorios",
    value: "3",
    valueType: "number",
  },
  {
    active: true,
    description: "Notifica al usuario responsable de la observación.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "notify_observation_assignee",
    name: "Notificar al responsable de observación",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description: "Incluye a la gerencia del área en las alertas automáticas.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "notify_area_manager",
    name: "Notificar a gerencia del área",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description: "Incluye a los usuarios con rol de Auditoría.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "notify_audit_team",
    name: "Notificar al equipo de Auditoría",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description: "Activa la creación de notificaciones dentro de NIBOL.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "notify_in_app",
    name: "Notificaciones dentro del sistema",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description: "Activa el envío de alertas por correo electrónico.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "notify_by_email",
    name: "Notificaciones por correo",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description:
      "Horas de antigüedad para recordar avances enviados a Auditoría.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "pending_review_reminder_hours",
    name: "Horas para revisión pendiente",
    value: "48",
    valueType: "number",
  },
  {
    active: true,
    description:
      "Horas de antigüedad para recordar aprobaciones de ampliación.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "pending_extension_reminder_hours",
    name: "Horas para aprobación de ampliación",
    value: "48",
    valueType: "number",
  },
  {
    active: true,
    description: "Días de antigüedad para recordar avances devueltos.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "returned_progress_reminder_days",
    name: "Días para corrección de avance devuelto",
    value: "3",
    valueType: "number",
  },
  {
    active: true,
    description:
      "Registra de forma idempotente la detección de vencimientos sin alterar el estado de negocio.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "overdue_activity_enabled",
    name: "Trazabilidad automática de vencimientos",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description:
      "Tamaño máximo permitido para archivos de evidencia en megabytes.",
    editable: true,
    group: "evidencias",
    key: "evidence_max_file_size_mb",
    name: "Tamaño máximo de evidencia",
    value: "10",
    valueType: "number",
  },
  {
    active: true,
    description:
      "Permite solicitar prórrogas sobre la fecha límite de la observación.",
    editable: true,
    group: "seguimiento",
    key: "allow_deadline_extension",
    name: "Permitir ampliación de plazo",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description:
      "Requiere aprobación de gerencia para ampliar una fecha límite.",
    editable: true,
    group: "seguimiento",
    key: "extension_requires_manager_approval",
    name: "Ampliación requiere aprobación de gerencia",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description:
      "Requiere aprobación de auditoría para ampliar una fecha límite.",
    editable: true,
    group: "seguimiento",
    key: "extension_requires_audit_approval",
    name: "Ampliación requiere aprobación de auditoría",
    value: "true",
    valueType: "boolean",
  },
  ...Object.entries(DEADLINE_REMINDER_PARAMETER_DEFAULTS).map(
    ([key, parameter]) => ({
      active: true,
      description: parameter.description,
      editable: true,
      group: "notificaciones_automaticas",
      key,
      name: parameter.name,
      value: parameter.value,
      valueType: parameter.valueType,
    }),
  ),
];

const catalogs: SeedCatalog[] = [
  {
    active: true,
    description: "Proceso que puede iniciar una instancia de workflow.",
    key: "DEADLINE_EXTENSION",
    name: "Ampliación de plazo",
    sortOrder: 10,
    type: "workflow_process_type",
  },
  {
    active: true,
    description: "Proceso que puede iniciar una instancia de workflow.",
    key: "OBSERVATION_CLOSURE",
    name: "Cierre de observación",
    sortOrder: 20,
    type: "workflow_process_type",
  },
  {
    active: true,
    description: "Proceso que puede iniciar una instancia de workflow.",
    key: "REMEDIATION_PLAN_APPROVAL",
    name: "Aprobación de plan de remediación",
    sortOrder: 30,
    type: "workflow_process_type",
  },
  {
    active: true,
    description: "Proceso que puede iniciar una instancia de workflow.",
    key: "EVIDENCE_REVIEW",
    name: "Revisión de evidencia",
    sortOrder: 40,
    type: "workflow_process_type",
  },
  {
    active: true,
    description: "Proceso configurable para solicitudes especiales.",
    key: "SPECIAL_REQUEST",
    name: "Solicitud especial",
    sortOrder: 50,
    type: "workflow_process_type",
  },
  {
    active: true,
    description:
      "Orquestador visual del ciclo completo de seguimiento de observaciones.",
    key: "OBSERVATION_LIFECYCLE",
    name: "Ciclo completo de seguimiento de observaciones",
    sortOrder: 60,
    type: "workflow_process_type",
  },
  {
    active: true,
    description: "Proceso auditado asociado a la observación.",
    key: "GESTION_ACCESOS",
    name: "Gestión de accesos",
    sortOrder: 10,
    type: "proceso_auditado",
  },
  {
    active: true,
    description: "Proceso auditado asociado a la observación.",
    key: "TESORERIA",
    name: "Tesorería",
    sortOrder: 20,
    type: "proceso_auditado",
  },
  {
    active: true,
    description: "Proceso auditado asociado a la observación.",
    key: "CONTROL_INVENTARIOS",
    name: "Control de inventarios",
    sortOrder: 30,
    type: "proceso_auditado",
  },
  {
    active: true,
    description: "Proceso auditado asociado a la observación.",
    key: "APROBACION_DESCUENTOS",
    name: "Aprobación de descuentos",
    sortOrder: 40,
    type: "proceso_auditado",
  },
  {
    active: true,
    description: "Proceso auditado asociado a la observación.",
    key: "CIERRE_OPERATIVO_DIARIO",
    name: "Cierre operativo diario",
    sortOrder: 50,
    type: "proceso_auditado",
  },
  {
    active: true,
    description: "Tipo funcional de observación utilizado por auditoría.",
    key: "HALLAZGO",
    name: "Hallazgo",
    sortOrder: 10,
    type: "tipo_observacion",
  },
  {
    active: true,
    description: "Tipo funcional de observación utilizado por auditoría.",
    key: "OBSERVACION",
    name: "Observación",
    sortOrder: 20,
    type: "tipo_observacion",
  },
  {
    active: true,
    description: "Tipo funcional de observación utilizado por auditoría.",
    key: "RECOMENDACION",
    name: "Recomendación",
    sortOrder: 30,
    type: "tipo_observacion",
  },
  {
    active: true,
    description: "Fuente desde la cual se originó el hallazgo.",
    key: "AUDITORIA_INTERNA",
    name: "Auditoría interna",
    sortOrder: 10,
    type: "fuente_hallazgo",
  },
  {
    active: true,
    description: "Fuente desde la cual se originó el hallazgo.",
    key: "REVISION_CORPORATIVA",
    name: "Revisión corporativa",
    sortOrder: 20,
    type: "fuente_hallazgo",
  },
  {
    active: true,
    description: "Fuente desde la cual se originó el hallazgo.",
    key: "AUDITORIA_PROCESOS",
    name: "Auditoría de procesos",
    sortOrder: 30,
    type: "fuente_hallazgo",
  },
  {
    active: true,
    description: "Fuente desde la cual se originó el hallazgo.",
    key: "SEGUIMIENTO_CIERRE",
    name: "Seguimiento de cierre",
    sortOrder: 40,
    type: "fuente_hallazgo",
  },
  {
    active: true,
    description: "Fuente desde la cual se originó el hallazgo.",
    key: "COMITE_RIESGOS",
    name: "Comité de riesgos",
    sortOrder: 50,
    type: "fuente_hallazgo",
  },
  {
    active: true,
    description: "Clasificación temática del hallazgo.",
    key: "CONTROLES_TI",
    name: "Controles de TI",
    sortOrder: 10,
    type: "categoria_hallazgo",
  },
  {
    active: true,
    description: "Clasificación temática del hallazgo.",
    key: "CONTROL_FINANCIERO",
    name: "Control financiero",
    sortOrder: 20,
    type: "categoria_hallazgo",
  },
  {
    active: true,
    description: "Clasificación temática del hallazgo.",
    key: "INVENTARIOS",
    name: "Inventarios",
    sortOrder: 30,
    type: "categoria_hallazgo",
  },
  {
    active: true,
    description: "Clasificación temática del hallazgo.",
    key: "GOBIERNO_COMERCIAL",
    name: "Gobierno comercial",
    sortOrder: 40,
    type: "categoria_hallazgo",
  },
  {
    active: true,
    description: "Clasificación temática del hallazgo.",
    key: "CUMPLIMIENTO_OPERATIVO",
    name: "Cumplimiento operativo",
    sortOrder: 50,
    type: "categoria_hallazgo",
  },
];

const permissions: SeedPermission[] = ALL_PERMISSION_NAMES.map((name) => ({
  key: name.replaceAll(".", ":"),
  name,
  description: `${name} permission.`,
}));

const ids = {
  settings: uuidv5("settings:default", SEED_NAMESPACE),
};

const permissionIdByName = new Map(
  permissions.map((permission) => [
    permission.name,
    uuidv5(`permission:${permission.name}`, SEED_NAMESPACE),
  ]),
);

const requiredTables = [
  "roles",
  "permissions",
  "role_permissions",
  "accounts",
  "users",
  "user_roles",
  "settings",
  "risk_levels",
  "observation_statuses",
  "areas",
  "system_parameters",
  "catalogs",
  "observations",
  "audit_reports",
  "observation_dictionary",
  "risks",
  "observation_risks",
  "observation_areas",
  "remediation_plans",
  "action_plans",
  "progress_evaluations",
  "evidence_files",
  "observation_comments",
  "deadline_extension_requests",
  "deadline_extension_classifications",
  "progress_review_history",
  "workflow_definitions",
  "workflow_versions",
  "workflow_nodes",
  "workflow_transitions",
] as const;

type NamedIdRow = {
  code?: string;
  id: string;
  name: string;
};

type AreaRow = {
  code: string;
  id: string;
};

type CountRow = {
  total: number;
};

type RiskLevelRow = {
  id: string;
  name: string;
};

type ObservationStatusRow = {
  id: string;
  key: string;
};

type UserRow = {
  id: string;
};

const executeSqlServer = async (
  connection: Prisma.TransactionClient,
  query: string,
  parameters: unknown[] = [],
): Promise<void> => {
  await connection.$executeRawUnsafe(query, ...parameters);
};

const querySqlServer = async <T>(
  connection: Prisma.TransactionClient,
  query: string,
  parameters: unknown[] = [],
): Promise<T[]> => connection.$queryRawUnsafe<T[]>(query, ...parameters);

const placeholders = (length: number): string =>
  Array.from({ length }, (_, index) => `@P${index + 1}`).join(", ");

const assertTablesExist = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  const rows = await querySqlServer<{ name: string }>(
    connection,
    "SELECT [name] FROM [sys].[tables] WHERE [schema_id] = SCHEMA_ID('dbo')",
  );
  const availableTables = new Set(rows.map((row) => row.name));

  const missingTables = requiredTables.filter(
    (table) => !availableTables.has(table),
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Missing required tables: ${missingTables.join(", ")}. Run migrations before seeding.`,
    );
  }
};

const seedRoles = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  for (const role of roles) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[roles] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [code], [name], [description], [created_at], [updated_at], [deleted_at])
 ON target.[code] = source.[code]
 WHEN MATCHED THEN UPDATE SET target.[code] = source.[code], target.[name] = source.[name], target.[description] = source.[description], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [code], [name], [description], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[code], source.[name], source.[description], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        uuidv5(`role:${role.code}`, SEED_NAMESPACE),
        role.code,
        role.name,
        role.description,
      ],
    );
  }
};

const seedPermissions = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  for (const permission of permissions) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[permissions] AS target
 USING (VALUES (@P1, @P2, @P3, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [name], [description], [created_at], [updated_at], [deleted_at])
 ON target.[name] = source.[name]
 WHEN MATCHED THEN UPDATE SET target.[description] = source.[description], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [description], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[name], source.[description], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        permissionIdByName.get(permission.name),
        permission.name,
        permission.description,
      ],
    );
  }
};

const seedRiskLevels = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  for (const riskLevel of riskLevels) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[risk_levels] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [name], [key], [description], [color_token], [severity_order], [max_remediation_days], [active], [created_at], [updated_at], [deleted_at])
 ON target.[key] = source.[key]
 WHEN MATCHED THEN UPDATE SET target.[key] = source.[key], target.[description] = source.[description], target.[color_token] = source.[color_token], target.[severity_order] = source.[severity_order], target.[max_remediation_days] = source.[max_remediation_days], target.[active] = source.[active], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [key], [description], [color_token], [severity_order], [max_remediation_days], [active], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[name], source.[key], source.[description], source.[color_token], source.[severity_order], source.[max_remediation_days], source.[active], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        uuidv5(`risk-level:${riskLevel.key}`, SEED_NAMESPACE),
        riskLevel.name,
        riskLevel.key,
        riskLevel.description,
        riskLevel.colorToken,
        riskLevel.severityOrder,
        riskLevel.maxRemediationDays,
      ],
    );
  }
};

const seedExtensionClassifications = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  for (const item of extensionClassifications) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[deadline_extension_classifications] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, 1, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [code], [name], [description], [max_additional_days], [active], [created_at], [updated_at])
 ON target.[code] = source.[code]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[description] = source.[description], target.[max_additional_days] = source.[max_additional_days], target.[active] = 1, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [code], [name], [description], [max_additional_days], [active], [created_at], [updated_at]) VALUES (source.[id], source.[code], source.[name], source.[description], source.[max_additional_days], source.[active], source.[created_at], source.[updated_at]);
`,
      [
        uuidv5(`extension-classification:${item.code}`, SEED_NAMESPACE),
        item.code,
        item.name,
        item.description,
        item.maxAdditionalDays,
      ],
    );
  }
};

const seedObservationStatuses = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  for (const status of observationStatuses) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[observation_statuses] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [name], [key], [description], [sort_order], [is_initial], [is_final], [counts_as_overdue], [active], [created_at], [updated_at], [deleted_at])
 ON target.[key] = source.[key]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[key] = source.[key], target.[description] = source.[description], target.[sort_order] = source.[sort_order], target.[is_initial] = source.[is_initial], target.[is_final] = source.[is_final], target.[counts_as_overdue] = source.[counts_as_overdue], target.[active] = source.[active], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [key], [description], [sort_order], [is_initial], [is_final], [counts_as_overdue], [active], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[name], source.[key], source.[description], source.[sort_order], source.[is_initial], source.[is_final], source.[counts_as_overdue], source.[active], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        uuidv5(`observation-status:${status.key}`, SEED_NAMESPACE),
        status.name,
        status.key,
        status.description,
        status.sortOrder,
        status.isInitial,
        status.isFinal,
        status.countsAsOverdue,
      ],
    );
  }
};

const seedAreas = async (
  connection: Prisma.TransactionClient,
  managerUserId: string,
): Promise<void> => {
  for (const area of areas) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[areas] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [name], [code], [description], [manager_user_id], [active], [created_at], [updated_at], [deleted_at])
 ON target.[code] = source.[code]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[code] = source.[code], target.[description] = source.[description], target.[manager_user_id] = source.[manager_user_id], target.[active] = source.[active], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [code], [description], [manager_user_id], [active], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[name], source.[code], source.[description], source.[manager_user_id], source.[active], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        uuidv5(`area:${area.key}`, SEED_NAMESPACE),
        area.name,
        area.code,
        area.description,
        managerUserId,
      ],
    );
  }
};

const seedSystemParameters = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  for (const parameter of systemParameters) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[system_parameters] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [key], [name], [value], [value_type], [group_name], [description], [editable], [active], [created_at], [updated_at], [deleted_at])
 ON target.[key] = source.[key]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[value] = source.[value], target.[value_type] = source.[value_type], target.[group_name] = source.[group_name], target.[description] = source.[description], target.[editable] = source.[editable], target.[active] = source.[active], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [key], [name], [value], [value_type], [group_name], [description], [editable], [active], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[key], source.[name], source.[value], source.[value_type], source.[group_name], source.[description], source.[editable], source.[active], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        uuidv5(`system-parameter:${parameter.key}`, SEED_NAMESPACE),
        parameter.key,
        parameter.name,
        parameter.value,
        parameter.valueType,
        parameter.group,
        parameter.description,
        parameter.editable,
        parameter.active,
      ],
    );
  }
};

const seedCatalogs = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  for (const catalog of catalogs) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[catalogs] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [type], [name], [key], [description], [active], [sort_order], [created_at], [updated_at], [deleted_at])
 ON target.[id] = source.[id] OR (source.[key] IS NOT NULL AND target.[type] = source.[type] AND target.[key] = source.[key])
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[description] = source.[description], target.[active] = source.[active], target.[sort_order] = source.[sort_order], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [type], [name], [key], [description], [active], [sort_order], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[type], source.[name], source.[key], source.[description], source.[active], source.[sort_order], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        uuidv5(
          `catalog:${catalog.type}:${catalog.key ?? catalog.name}`,
          SEED_NAMESPACE,
        ),
        catalog.type,
        catalog.name,
        catalog.key,
        catalog.description,
        catalog.active,
        catalog.sortOrder,
      ],
    );
  }
};

const getRoleMap = async (
  connection: Prisma.TransactionClient,
): Promise<Map<string, string>> => {
  const rows = await querySqlServer<NamedIdRow>(
    connection,
    `
      SELECT id, code
      FROM [dbo].[roles]
    `,
  );

  return new Map(
    rows
      .filter((row): row is NamedIdRow & { code: string } => Boolean(row.code))
      .map((row) => [row.code, row.id] as [string, string]),
  );
};

const getAreaMap = async (
  connection: Prisma.TransactionClient,
): Promise<Map<SeedAreaKey, string>> => {
  const rows = await querySqlServer<AreaRow>(
    connection,
    `
      SELECT id, code
      FROM [dbo].[areas]
      WHERE code IN (${placeholders(areas.length)})
    `,
    areas.map((area) => area.code),
  );

  const idByCode = new Map(rows.map((row) => [row.code, row.id]));

  return new Map(
    areas.map((area) => {
      const areaId = idByCode.get(area.code);

      if (!areaId) {
        throw new Error(
          `Area ${area.name} (${area.code}) not found after seeding.`,
        );
      }

      return [area.key, areaId];
    }),
  );
};

const getRiskLevelMap = async (
  connection: Prisma.TransactionClient,
): Promise<Map<SeedRiskLevelKey, string>> => {
  const rows = await querySqlServer<RiskLevelRow>(
    connection,
    `
      SELECT id, name
      FROM [dbo].[risk_levels]
      WHERE name IN (${placeholders(riskLevels.length)})
    `,
    riskLevels.map((riskLevel) => riskLevel.name),
  );

  const idByName = new Map(rows.map((row) => [row.name, row.id]));

  return new Map(
    riskLevels.map((riskLevel) => {
      const riskLevelId = idByName.get(riskLevel.name);

      if (!riskLevelId) {
        throw new Error(
          `Risk level ${riskLevel.name} not found after seeding.`,
        );
      }

      return [riskLevel.key, riskLevelId];
    }),
  );
};

const getObservationStatusMap = async (
  connection: Prisma.TransactionClient,
): Promise<Map<SeedObservationStatusKey, string>> => {
  const rows = await querySqlServer<ObservationStatusRow>(
    connection,
    `
      SELECT id, [key]
      FROM [dbo].[observation_statuses]
      WHERE [key] IN (${placeholders(observationStatuses.length)})
    `,
    observationStatuses.map((status) => status.key),
  );

  const idByKey = new Map(rows.map((row) => [row.key, row.id]));

  return new Map(
    observationStatuses.map((status) => {
      const statusId = idByKey.get(status.key);

      if (!statusId) {
        throw new Error(
          `Observation status ${status.key} not found after seeding.`,
        );
      }

      return [status.key, statusId];
    }),
  );
};

type CanonicalWorkflowProcess =
  | "DEADLINE_EXTENSION"
  | "EVIDENCE_REVIEW"
  | "OBSERVATION_CLOSURE"
  | "REMEDIATION_PLAN_APPROVAL"
  | "OBSERVATION_LIFECYCLE";

type SeedWorkflowNode = {
  assignmentStrategy: string | null;
  configuration: Record<string, unknown>;
  description: string;
  key: string;
  name: string;
  positionX: number;
  positionY: number;
  type: string;
};

type SeedWorkflowTransition = {
  condition?: {
    conditions: Array<{
      description: string;
      field: string;
      operator: string;
      value:
        | string
        | number
        | boolean
        | Array<string | number | boolean>
        | null;
    }>;
    description: string;
    logicOperator: "AND" | "OR";
  };
  label: string;
  priority?: number;
  source: string;
  target: string;
  type: string;
};

type CanonicalWorkflowGraph = {
  description: string;
  definitionId: string;
  name: string;
  nodes: SeedWorkflowNode[];
  processType: CanonicalWorkflowProcess;
  transitions: SeedWorkflowTransition[];
  versionId: string;
};

const canonicalWorkflowGraph = (input: {
  processType: CanonicalWorkflowProcess;
  reviewerRoleId: string;
  reviewerLabel: string;
  reviewerAssignmentStrategy?: "ROLE" | "FIELD_REFERENCE";
  reviewerFieldReference?: string | null;
  allowsCorrection?: boolean;
  allowsRejection?: boolean;
}): CanonicalWorkflowGraph => {
  const {
    processType,
    reviewerRoleId,
    reviewerLabel,
    reviewerAssignmentStrategy = "ROLE",
    reviewerFieldReference = null,
  } = input;
  const allowsCorrection = input.allowsCorrection ?? true;
  const allowsRejection = input.allowsRejection ?? false;
  const prefix = `canonical-workflow:${processType}`;
  const definitionId = uuidv5(`${prefix}:definition`, SEED_NAMESPACE);
  const versionId = uuidv5(`${prefix}:version:1`, SEED_NAMESPACE);
  const reviewName =
    processType === "EVIDENCE_REVIEW"
      ? "Evaluar evidencia"
      : processType === "REMEDIATION_PLAN_APPROVAL"
        ? "Revisar plan de acción recomendado"
        : processType === "DEADLINE_EXTENSION"
          ? "Evaluar ampliación de plazo"
          : "Evaluar cierre de observación";
  const endName =
    processType === "DEADLINE_EXTENSION"
      ? "Nueva fecha autorizada"
      : processType === "OBSERVATION_CLOSURE"
        ? "Observación cerrada"
        : "Validado";
  const approvalActions = [
    "APPROVE",
    ...(allowsRejection ? ["REJECT"] : []),
    ...(allowsCorrection ? ["REQUEST_CORRECTION"] : []),
  ];
  const nodes: SeedWorkflowNode[] = [
    {
      assignmentStrategy: null,
      configuration: {
        activationNote: "Flujo canónico NIBOL para seguimiento de auditoría.",
        description: "Punto de inicio del proceso.",
        initialWorkflowState: "PENDING",
        name: "Inicio",
        nodeType: "START",
        processType,
        schemaVersion: 1,
        triggerProcess: processType,
      },
      description: "Inicio del flujo publicado.",
      key: "start",
      name: "Inicio",
      positionX: 80,
      positionY: 220,
      type: "START",
    },
    {
      assignmentStrategy: "ROLE",
      configuration: {
        allowedActions: approvalActions,
        areaId: null,
        assignmentStrategy: reviewerAssignmentStrategy,
        commentRequired: false,
        description: `Revisión a cargo de ${reviewerLabel}.`,
        electronicSignature: false,
        evidenceRequired: false,
        fallbackRoleId: reviewerRoleId,
        fallbackStrategy: "ROLE",
        fallbackUserId: null,
        fieldReference: reviewerFieldReference,
        name: reviewName,
        nodeType: "APPROVAL",
        roleId: reviewerRoleId,
        routeLabelOnApproval: "APROBADO",
        routeLabelOnRejection: allowsCorrection ? "DEVUELTO" : "RECHAZADO",
        schemaVersion: 1,
        stateAfterApproval: "APPROVED",
        stateAfterRejection: allowsCorrection ? "RETURNED" : "REJECTED",
        userId: null,
      },
      description: `Decisión humana de ${reviewerLabel}.`,
      key: "review",
      name: reviewName,
      positionX: 300,
      positionY: 220,
      type: "APPROVAL",
    },
    {
      assignmentStrategy: null,
      configuration: {
        channel: "EMAIL",
        description: "Informa al solicitante que debe corregir y reenviar.",
        includeRelatedRecordLink: true,
        includeWorkflowContext: true,
        name: "Notificar devolución",
        nodeType: "NOTIFICATION",
        recipientAreaId: null,
        recipientRoleId: null,
        recipientStrategy: "REQUESTER",
        recipientUserId: null,
        schemaVersion: 1,
        subjectOverride: "Solicitud devuelta para corrección",
        template: "genericNotification",
      },
      description: "Notificación de devolución.",
      key: "notify-return",
      name: "Notificar devolución",
      positionX: 540,
      positionY: 360,
      type: "NOTIFICATION",
    },
    {
      assignmentStrategy: null,
      configuration: {
        behavior: "RETURN_TO_STAGE",
        description: "Permite corregir y reenviar la información.",
        finalResult: "CORRECTION_REQUESTED",
        name: "Corrección y reenvío",
        nodeType: "REJECTION",
        notifyRequester: true,
        preserveOriginalDeadline: true,
        requireComment: false,
        returnTargetNodeKey: "review",
        resultingState: "RETURNED",
        schemaVersion: 1,
      },
      description: "Retorno controlado a revisión.",
      key: "return-correction",
      name: "Corrección y reenvío",
      positionX: 760,
      positionY: 360,
      type: "REJECTION",
    },
    {
      assignmentStrategy: null,
      configuration: {
        completionMessage: "La solicitud fue aprobada y validada.",
        description: "Fin aprobado del proceso.",
        finalResult: "APPROVED",
        finalWorkflowStatus: "COMPLETED",
        name: endName,
        nodeType: "END",
        notifyParticipants: true,
        relatedRecordTargetState: "APPROVED",
        schemaVersion: 1,
      },
      description: "Resultado aprobado.",
      key: "approved",
      name: endName,
      positionX: 760,
      positionY: 170,
      type: "END",
    },
  ].filter(
    (item) =>
      allowsCorrection ||
      !["notify-return", "return-correction"].includes(item.key),
  );
  const transitions: SeedWorkflowTransition[] = [
    { label: "Continuar", source: "start", target: "review", type: "DEFAULT" },
    {
      label: "APROBADO",
      source: "review",
      target: "approved",
      type: "APPROVE",
    },
  ];
  if (allowsCorrection) {
    transitions.push(
      {
        label: "DEVUELTO",
        source: "review",
        target: "notify-return",
        type: "REQUEST_CORRECTION",
      },
      {
        label: "Notificar",
        source: "notify-return",
        target: "return-correction",
        type: "DEFAULT",
      },
      {
        label: "Corregir y reenviar",
        source: "return-correction",
        target: "review",
        type: "RETURN",
      },
    );
  }
  if (allowsRejection) {
    nodes.push({
      assignmentStrategy: null,
      configuration: {
        channel: "EMAIL",
        description: "Informa el rechazo y devuelve la gestión al área.",
        includeRelatedRecordLink: true,
        includeWorkflowContext: true,
        name: "Notificar rechazo",
        nodeType: "NOTIFICATION",
        recipientAreaId: null,
        recipientRoleId: null,
        recipientStrategy: "REQUESTER",
        recipientUserId: null,
        schemaVersion: 1,
        subjectOverride: "Solicitud rechazada",
        template: "genericNotification",
      },
      description: "Notificación de rechazo.",
      key: "notify-rejection",
      name: "Notificar rechazo",
      positionX: 540,
      positionY: 90,
      type: "NOTIFICATION",
    });
    nodes.push({
      assignmentStrategy: null,
      configuration: {
        completionMessage: "La solicitud fue rechazada; la ejecución continúa.",
        description: "Fin de la solicitud de ampliación.",
        finalResult: "REJECTED",
        finalWorkflowStatus: "REJECTED",
        name: "Rechazado",
        nodeType: "END",
        notifyParticipants: true,
        relatedRecordTargetState: "REJECTED",
        schemaVersion: 1,
      },
      description: "Resultado rechazado.",
      key: "rejected",
      name: "Rechazado",
      positionX: 760,
      positionY: 90,
      type: "END",
    });
    transitions.push(
      {
        label: "RECHAZADO",
        source: "review",
        target: "notify-rejection",
        type: "REJECT",
      },
      {
        label: "Notificar",
        source: "notify-rejection",
        target: "rejected",
        type: "DEFAULT",
      },
    );
  }
  return {
    description: `Configuración publicada NIBOL para ${processType}. Integra las decisiones de dominio con el motor configurable.`,
    definitionId,
    name:
      processType === "EVIDENCE_REVIEW"
        ? "NIBOL — Flujo base de seguimiento de observaciones — Revisión de evidencias"
        : `NIBOL — ${reviewName}`,
    nodes,
    processType,
    transitions,
    versionId,
  };
};

const lifecycleStage = (input: {
  key: string;
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  roleId: string;
}): SeedWorkflowNode => ({
  assignmentStrategy: "ROLE",
  configuration: {
    allowedActions: ["COMPLETE"],
    areaId: null,
    assignmentStrategy: "ROLE",
    description: input.description,
    fallbackRoleId: null,
    fallbackStrategy: "STOP",
    fallbackUserId: null,
    fieldReference: null,
    name: input.name,
    nodeType: "STAGE",
    requiredComment: false,
    requiredEvidence: false,
    resultingState: null,
    roleId: input.roleId,
    schemaVersion: 1,
    sla: null,
    userId: null,
  },
  description: input.description,
  key: input.key,
  name: input.name,
  positionX: input.positionX,
  positionY: input.positionY,
  type: "STAGE",
});

const lifecycleApproval = (input: {
  key: string;
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  roleId: string;
  allowedActions: string[];
}): SeedWorkflowNode => ({
  assignmentStrategy: "ROLE",
  configuration: {
    allowedActions: input.allowedActions,
    areaId: null,
    assignmentStrategy: "ROLE",
    commentRequired: false,
    description: input.description,
    electronicSignature: false,
    evidenceRequired: false,
    fallbackRoleId: null,
    fallbackStrategy: "STOP",
    fallbackUserId: null,
    fieldReference: null,
    name: input.name,
    nodeType: "APPROVAL",
    roleId: input.roleId,
    routeLabelOnApproval: "APROBADO",
    routeLabelOnRejection: "DEVUELTO",
    schemaVersion: 1,
    sla: null,
    stateAfterApproval: "APPROVED",
    stateAfterRejection: "RETURNED",
    userId: null,
  },
  description: input.description,
  key: input.key,
  name: input.name,
  positionX: input.positionX,
  positionY: input.positionY,
  type: "APPROVAL",
});

const lifecycleSubflow = (input: {
  key: string;
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  referencedProcessType: CanonicalWorkflowProcess;
}): SeedWorkflowNode => ({
  assignmentStrategy: null,
  configuration: {
    description: input.description,
    name: input.name,
    nodeType: "SUBFLOW",
    referencedProcessType: input.referencedProcessType,
    schemaVersion: 1,
  },
  description: input.description,
  key: input.key,
  name: input.name,
  positionX: input.positionX,
  positionY: input.positionY,
  type: "SUBFLOW",
});

const lifecycleNotification = (input: {
  key: string;
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  subject: string;
}): SeedWorkflowNode => ({
  assignmentStrategy: null,
  configuration: {
    channel: "EMAIL",
    description: input.description,
    includeRelatedRecordLink: true,
    includeWorkflowContext: true,
    name: input.name,
    nodeType: "NOTIFICATION",
    recipientAreaId: null,
    recipientRoleId: null,
    recipientStrategy: "REQUESTER",
    recipientUserId: null,
    schemaVersion: 1,
    subjectOverride: input.subject,
    template: "genericNotification",
  },
  description: input.description,
  key: input.key,
  name: input.name,
  positionX: input.positionX,
  positionY: input.positionY,
  type: "NOTIFICATION",
});

const lifecycleCondition = (input: {
  key: string;
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  defaultRouteLabel: string;
  field: string;
  operator: string;
  value: string | number | boolean | Array<string | number | boolean>;
}): SeedWorkflowNode => ({
  assignmentStrategy: null,
  configuration: {
    defaultRouteLabel: input.defaultRouteLabel,
    description: input.description,
    logicalOperator: "AND",
    name: input.name,
    nodeType: "CONDITION",
    rules: [
      {
        field: input.field,
        operator: input.operator,
        resultLabel: input.defaultRouteLabel,
        value: input.value,
      },
    ],
    schemaVersion: 1,
  },
  description: input.description,
  key: input.key,
  name: input.name,
  positionX: input.positionX,
  positionY: input.positionY,
  type: "CONDITION",
});

const lifecycleEnd = (input: {
  key: string;
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  finalResult: "APPROVED" | "RETURNED";
  finalWorkflowStatus: string;
}): SeedWorkflowNode => ({
  assignmentStrategy: null,
  configuration: {
    completionMessage: input.description,
    description: input.description,
    finalResult: input.finalResult,
    finalWorkflowStatus: input.finalWorkflowStatus,
    name: input.name,
    nodeType: "END",
    notifyParticipants: true,
    relatedRecordTargetState:
      input.finalResult === "APPROVED" ? "CLOSED" : null,
    schemaVersion: 1,
  },
  description: input.description,
  key: input.key,
  name: input.name,
  positionX: input.positionX,
  positionY: input.positionY,
  type: "END",
});

const lifecycleRejection = (input: {
  key: string;
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  returnTargetNodeKey: string;
}): SeedWorkflowNode => ({
  assignmentStrategy: null,
  configuration: {
    behavior: "RETURN_TO_STAGE",
    description: input.description,
    finalResult: "CORRECTION_REQUESTED",
    name: input.name,
    nodeType: "REJECTION",
    notifyRequester: true,
    preserveOriginalDeadline: true,
    requireComment: false,
    returnTargetNodeKey: input.returnTargetNodeKey,
    resultingState: "RETURNED",
    schemaVersion: 1,
  },
  description: input.description,
  key: input.key,
  name: input.name,
  positionX: input.positionX,
  positionY: input.positionY,
  type: "REJECTION",
});

const lifecycleWorkflowGraph = (input: {
  auditorRoleId: string;
  areaResponsibleRoleId: string;
  executorRoleId: string;
}): CanonicalWorkflowGraph => {
  const definitionId = uuidv5(
    "canonical-workflow:OBSERVATION_LIFECYCLE:definition",
    SEED_NAMESPACE,
  );
  const versionId = uuidv5(
    "canonical-workflow:OBSERVATION_LIFECYCLE:version:1",
    SEED_NAMESPACE,
  );
  const nodes: SeedWorkflowNode[] = [
    {
      assignmentStrategy: null,
      configuration: {
        activationNote: "Orquestador visual del Flujo base NIBOL.",
        description: "Inicio del ciclo completo.",
        initialWorkflowState: "PENDING",
        name: "Inicio",
        nodeType: "START",
        processType: "OBSERVATION_LIFECYCLE",
        schemaVersion: 1,
        triggerProcess: "OBSERVATION_LIFECYCLE",
      },
      description: "Inicio del ciclo completo de seguimiento.",
      key: "start",
      name: "INICIO",
      positionX: 80,
      positionY: 300,
      type: "START",
    },
    lifecycleStage({
      description: "Auditoría crea y registra la observación.",
      key: "audit-create-observation",
      name: "AUDITORÍA · Crear / registrar observación",
      positionX: 340,
      positionY: 300,
      roleId: input.auditorRoleId,
    }),
    lifecycleStage({
      description: "Auditoría registra el plan recomendado.",
      key: "audit-register-plan",
      name: "AUDITORÍA · Registrar plan recomendado",
      positionX: 600,
      positionY: 300,
      roleId: input.auditorRoleId,
    }),
    lifecycleStage({
      description: "Auditoría envía las observaciones.",
      key: "audit-send-observations",
      name: "AUDITORÍA · Enviar observaciones",
      positionX: 860,
      positionY: 300,
      roleId: input.auditorRoleId,
    }),
    lifecycleNotification({
      description: "Notifica a las personas involucradas.",
      key: "notify-involved",
      name: "SISTEMA · Notificar involucrados",
      positionX: 1120,
      positionY: 300,
      subject: "Observación asignada para seguimiento",
    }),
    lifecycleApproval({
      allowedActions: ["APPROVE"],
      description: "Dueño o responsable revisa el plan recomendado.",
      key: "review-recommended-plan",
      name: "DUEÑO / RESPONSABLE · Revisar plan recomendado",
      positionX: 1380,
      positionY: 300,
      roleId: input.areaResponsibleRoleId,
    }),
    lifecycleCondition({
      defaultRouteLabel: "NO",
      description: "¿Crear plan de acción del área?",
      field: "areaPlanRequired",
      key: "area-plan-condition",
      name: "CONDICIÓN · ¿Crear plan de acción del área?",
      operator: "EQUALS",
      positionX: 1640,
      positionY: 300,
      value: true,
    }),
    lifecycleStage({
      description: "El área crea su plan de acción.",
      key: "create-area-plan",
      name: "Crear plan del área",
      positionX: 1900,
      positionY: 120,
      roleId: input.areaResponsibleRoleId,
    }),
    lifecycleStage({
      description: "Dueño o responsable asigna o reasigna al ejecutor.",
      key: "assign-executor",
      name: "DUEÑO / RESPONSABLE · Asignar o reasignar ejecutor",
      positionX: 2160,
      positionY: 300,
      roleId: input.areaResponsibleRoleId,
    }),
    lifecycleStage({
      description: "Ejecutor registra avance y carga evidencias.",
      key: "execute-and-evidence",
      name: "EJECUTOR · Ejecutar / registrar avance / cargar evidencias",
      positionX: 2420,
      positionY: 300,
      roleId: input.executorRoleId,
    }),
    lifecycleCondition({
      defaultRouteLabel: "NO",
      description: "¿Solicita ampliación?",
      field: "requestedExtensionDays",
      key: "extension-condition",
      name: "CONDICIÓN · ¿Solicita ampliación?",
      operator: "GREATER_THAN",
      positionX: 2680,
      positionY: 300,
      value: 0,
    }),
    lifecycleSubflow({
      description: "Referencia al workflow especializado DEADLINE_EXTENSION.",
      key: "deadline-extension-subflow",
      name: "Solicitar / resolver ampliación",
      positionX: 2940,
      positionY: 120,
      referencedProcessType: "DEADLINE_EXTENSION",
    }),
    lifecycleCondition({
      defaultRouteLabel: "APROBADO",
      description:
        "La ampliación aprobada actualiza la fecha; la rechazada no detiene la ejecución.",
      field: "previousDecision",
      key: "extension-result-condition",
      name: "CONDICIÓN · Resultado de ampliación",
      operator: "EQUALS",
      positionX: 3200,
      positionY: 120,
      value: "REJECT",
    }),
    lifecycleNotification({
      description: "Notifica el rechazo y permite continuar la ejecución.",
      key: "extension-rejected",
      name: "Ampliación rechazada · Continuar ejecución",
      positionX: 3460,
      positionY: 40,
      subject: "Ampliación de plazo rechazada",
    }),
    lifecycleNotification({
      description: "Notifica la nueva fecha efectiva.",
      key: "extension-approved",
      name: "Nueva fecha / notificación",
      positionX: 3460,
      positionY: 200,
      subject: "Ampliación de plazo aprobada",
    }),
    lifecycleStage({
      description: "Ejecutor o responsable envía el plan a Auditoría.",
      key: "send-to-audit",
      name: "EJECUTOR / RESPONSABLE · Enviar a Auditoría",
      positionX: 3720,
      positionY: 300,
      roleId: input.executorRoleId,
    }),
    lifecycleSubflow({
      description: "Referencia al workflow especializado EVIDENCE_REVIEW.",
      key: "evidence-review-subflow",
      name: "Revisión de evidencia",
      positionX: 3980,
      positionY: 300,
      referencedProcessType: "EVIDENCE_REVIEW",
    }),
    lifecycleApproval({
      allowedActions: ["APPROVE", "REQUEST_CORRECTION"],
      description:
        "Auditoría evalúa la gestión y decide si está aprobada o devuelta.",
      key: "audit-evaluate",
      name: "AUDITORÍA · Evaluar",
      positionX: 4240,
      positionY: 300,
      roleId: input.auditorRoleId,
    }),
    lifecycleNotification({
      description: "Informa que la gestión fue devuelta para corrección.",
      key: "notify-return",
      name: "Notificar devolución",
      positionX: 4500,
      positionY: 500,
      subject: "Gestión devuelta para corrección",
    }),
    lifecycleRejection({
      description: "Retorno controlado al ciclo de corrección.",
      key: "return-to-correction",
      name: "DEVUELTO · Corrección / completar",
      positionX: 4760,
      positionY: 500,
      returnTargetNodeKey: "correction",
    }),
    lifecycleStage({
      description: "Responsable completa la corrección y reenvía.",
      key: "correction",
      name: "Corrección / completar",
      positionX: 5020,
      positionY: 500,
      roleId: input.executorRoleId,
    }),
    lifecycleNotification({
      description: "La evaluación aprobada deja el plan validado.",
      key: "plan-validated",
      name: "Plan validado",
      positionX: 4500,
      positionY: 180,
      subject: "Plan validado por Auditoría",
    }),
    lifecycleCondition({
      defaultRouteLabel: "NO",
      description: "¿Todos los planes están validados?",
      field: "allPlansValidated",
      key: "all-plans-condition",
      name: "CONDICIÓN · ¿Todos los planes validados?",
      operator: "EQUALS",
      positionX: 4760,
      positionY: 180,
      value: true,
    }),
    lifecycleSubflow({
      description: "Referencia al workflow especializado OBSERVATION_CLOSURE.",
      key: "observation-closure-subflow",
      name: "Validar cierre",
      positionX: 5020,
      positionY: 40,
      referencedProcessType: "OBSERVATION_CLOSURE",
    }),
    lifecycleEnd({
      description: "Auditoría cerró la observación.",
      finalResult: "APPROVED",
      finalWorkflowStatus: "COMPLETED",
      key: "finish",
      name: "FIN · Observación cerrada",
      positionX: 5280,
      positionY: 40,
    }),
    lifecycleStage({
      description: "Se continúa la gestión del plan pendiente.",
      key: "continue-management",
      name: "Continuar gestión",
      positionX: 5020,
      positionY: 220,
      roleId: input.areaResponsibleRoleId,
    }),
    lifecycleCondition({
      defaultRouteLabel: "Continuar ciclo",
      description:
        "Una gestión pendiente bloquea el cierre hasta que se valide.",
      key: "pending-plan-condition",
      name: "CONDICIÓN · Plan pendiente",
      operator: "EQUALS",
      positionX: 5280,
      positionY: 220,
      field: "allPlansValidated",
      value: false,
    }),
    lifecycleEnd({
      description:
        "El cierre está bloqueado porque aún existe un plan pendiente.",
      finalResult: "RETURNED",
      finalWorkflowStatus: "BLOCKED",
      key: "closure-blocked",
      name: "CIERRE BLOQUEADO · Plan pendiente",
      positionX: 5540,
      positionY: 120,
    }),
    lifecycleRejection({
      description:
        "Regresa al ciclo correspondiente para continuar la gestión.",
      key: "return-to-cycle",
      name: "Continuar gestión · Volver al ciclo",
      positionX: 5540,
      positionY: 320,
      returnTargetNodeKey: "execute-and-evidence",
    }),
  ];
  const transition = (
    source: string,
    target: string,
    label: string,
    type = "DEFAULT",
    options: Pick<SeedWorkflowTransition, "condition" | "priority"> = {},
  ): SeedWorkflowTransition => ({
    label,
    source,
    target,
    type,
    ...options,
  });
  const condition = (
    description: string,
    field: string,
    operator: string,
    value: string | number | boolean | Array<string | number | boolean>,
  ): NonNullable<SeedWorkflowTransition["condition"]> => ({
    conditions: [{ description, field, operator, value }],
    description,
    logicOperator: "AND",
  });
  const transitions: SeedWorkflowTransition[] = [
    transition("start", "audit-create-observation", "Continuar"),
    transition("audit-create-observation", "audit-register-plan", "Continuar"),
    transition("audit-register-plan", "audit-send-observations", "Continuar"),
    transition("audit-send-observations", "notify-involved", "Notificar"),
    transition("notify-involved", "review-recommended-plan", "Revisar"),
    transition(
      "review-recommended-plan",
      "area-plan-condition",
      "APROBADO",
      "APPROVE",
    ),
    transition("area-plan-condition", "create-area-plan", "YES", "CONDITION", {
      condition: condition(
        "La gestión requiere crear un plan de acción del área.",
        "areaPlanRequired",
        "EQUALS",
        true,
      ),
      priority: 1,
    }),
    transition("area-plan-condition", "assign-executor", "NO", "FALLBACK", {
      priority: 99,
    }),
    transition("create-area-plan", "assign-executor", "Continuar"),
    transition("assign-executor", "execute-and-evidence", "Ejecutar"),
    transition("execute-and-evidence", "extension-condition", "Continuar"),
    transition(
      "extension-condition",
      "deadline-extension-subflow",
      "YES",
      "CONDITION",
      {
        condition: condition(
          "Existe una ampliación solicitada.",
          "requestedExtensionDays",
          "GREATER_THAN",
          0,
        ),
        priority: 1,
      },
    ),
    transition("extension-condition", "send-to-audit", "NO", "FALLBACK", {
      priority: 99,
    }),
    transition(
      "deadline-extension-subflow",
      "extension-result-condition",
      "Resolver",
    ),
    transition(
      "extension-result-condition",
      "extension-rejected",
      "RECHAZADO",
      "CONDITION",
      {
        condition: condition(
          "La ampliación fue rechazada; la ejecución continúa.",
          "previousDecision",
          "EQUALS",
          "REJECT",
        ),
        priority: 1,
      },
    ),
    transition(
      "extension-result-condition",
      "extension-approved",
      "APROBADO",
      "FALLBACK",
      { priority: 99 },
    ),
    transition("extension-rejected", "send-to-audit", "Continuar"),
    transition("extension-approved", "send-to-audit", "Continuar"),
    transition("send-to-audit", "evidence-review-subflow", "Evaluar"),
    transition("evidence-review-subflow", "audit-evaluate", "Evaluar"),
    transition("audit-evaluate", "plan-validated", "APROBADO", "APPROVE"),
    transition(
      "audit-evaluate",
      "notify-return",
      "DEVUELTO",
      "REQUEST_CORRECTION",
    ),
    transition("notify-return", "return-to-correction", "Notificar"),
    transition(
      "return-to-correction",
      "correction",
      "Corregir y completar",
      "RETURN",
    ),
    transition("correction", "evidence-review-subflow", "Reenviar"),
    transition("plan-validated", "all-plans-condition", "Continuar"),
    transition(
      "all-plans-condition",
      "observation-closure-subflow",
      "YES",
      "CONDITION",
      {
        condition: condition(
          "Todos los planes requeridos están validados.",
          "allPlansValidated",
          "EQUALS",
          true,
        ),
        priority: 1,
      },
    ),
    transition("all-plans-condition", "continue-management", "NO", "FALLBACK", {
      priority: 99,
    }),
    transition("observation-closure-subflow", "finish", "Cerrar"),
    transition("continue-management", "pending-plan-condition", "Revisar"),
    transition(
      "pending-plan-condition",
      "closure-blocked",
      "YES",
      "CONDITION",
      {
        condition: condition(
          "Existe al menos un plan pendiente.",
          "allPlansValidated",
          "EQUALS",
          false,
        ),
        priority: 1,
      },
    ),
    transition(
      "pending-plan-condition",
      "return-to-cycle",
      "Continuar ciclo",
      "FALLBACK",
      {
        priority: 99,
      },
    ),
    transition(
      "return-to-cycle",
      "execute-and-evidence",
      "Volver al ciclo",
      "RETURN",
    ),
  ];
  return {
    description:
      "Orquestador visual del Flujo base NIBOL. Referencia los workflows especializados sin duplicar sus reglas de dominio.",
    definitionId,
    name: "NIBOL — Flujo completo de seguimiento de observaciones",
    nodes,
    processType: "OBSERVATION_LIFECYCLE",
    transitions,
    versionId,
  };
};

const seedCanonicalWorkflows = async (
  connection: Prisma.TransactionClient,
  roleMap: Map<string, string>,
  adminUserId: string,
): Promise<number> => {
  const auditorRoleId = roleMap.get("AUDITOR");
  const areaResponsibleRoleId = roleMap.get("AREA_RESPONSIBLE");
  const executorRoleId = roleMap.get("EXECUTOR");
  if (!auditorRoleId || !areaResponsibleRoleId || !executorRoleId) {
    throw new Error("Canonical workflow roles are not available.");
  }
  const graphs = [
    canonicalWorkflowGraph({
      processType: "EVIDENCE_REVIEW",
      reviewerRoleId: auditorRoleId,
      reviewerLabel: "Auditoría",
    }),
    canonicalWorkflowGraph({
      processType: "REMEDIATION_PLAN_APPROVAL",
      reviewerRoleId: areaResponsibleRoleId,
      reviewerLabel: "Responsable de Área",
    }),
    canonicalWorkflowGraph({
      allowsCorrection: true,
      processType: "OBSERVATION_CLOSURE",
      reviewerRoleId: auditorRoleId,
      reviewerLabel: "Auditoría",
    }),
    canonicalWorkflowGraph({
      allowsCorrection: false,
      allowsRejection: true,
      processType: "DEADLINE_EXTENSION",
      reviewerRoleId: areaResponsibleRoleId,
      reviewerLabel: "Responsable de Área",
      reviewerAssignmentStrategy: "FIELD_REFERENCE",
      reviewerFieldReference: "custom.areaResponsibleUserId",
    }),
    lifecycleWorkflowGraph({
      areaResponsibleRoleId,
      auditorRoleId,
      executorRoleId,
    }),
  ];

  for (const graph of graphs) {
    const publishedRows = await querySqlServer<{ id: string }>(
      connection,
      `SELECT id FROM [dbo].[workflow_definitions]
       WHERE process_type = @P1 AND status = 'PUBLISHED' AND id <> @P2`,
      [graph.processType, graph.definitionId],
    );
    if (publishedRows.length > 0) {
      throw new Error(
        `A different published workflow already exists for ${graph.processType}.`,
      );
    }
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[workflow_definitions] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, 'DRAFT', NULL, @P5, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [name], [description], [process_type], [status], [active_version_id], [created_by_id], [created_at], [updated_at], [archived_at])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[description] = source.[description], target.[process_type] = source.[process_type], target.[status] = 'PUBLISHED', target.[archived_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [description], [process_type], [status], [active_version_id], [created_by_id], [created_at], [updated_at], [archived_at]) VALUES (source.[id], source.[name], source.[description], source.[process_type], source.[status], source.[active_version_id], source.[created_by_id], source.[created_at], source.[updated_at], source.[archived_at]);
`,
      [
        graph.definitionId,
        graph.name,
        graph.description,
        graph.processType,
        adminUserId,
      ],
    );
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[workflow_versions] AS target
 USING (VALUES (@P1, @P2, 1, 'PUBLISHED', @P3, @P4, @P5, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [workflow_definition_id], [version_number], [status], [change_description], [created_by_id], [published_by_id], [created_at], [published_at])
 ON target.[workflow_definition_id] = source.[workflow_definition_id] AND target.[version_number] = source.[version_number]
 WHEN MATCHED THEN UPDATE SET target.[status] = 'PUBLISHED', target.[change_description] = source.[change_description], target.[created_by_id] = source.[created_by_id], target.[published_by_id] = source.[published_by_id], target.[published_at] = COALESCE(target.[published_at], SYSUTCDATETIME())
 WHEN NOT MATCHED THEN INSERT ([id], [workflow_definition_id], [version_number], [status], [change_description], [created_by_id], [published_by_id], [created_at], [published_at]) VALUES (source.[id], source.[workflow_definition_id], source.[version_number], source.[status], source.[change_description], source.[created_by_id], source.[published_by_id], source.[created_at], source.[published_at]);
`,
      [
        graph.versionId,
        graph.definitionId,
        graph.description,
        adminUserId,
        adminUserId,
      ],
    );
    for (const item of graph.nodes) {
      await executeSqlServer(
        connection,
        `
MERGE [dbo].[workflow_nodes] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [workflow_version_id], [node_key], [name], [description], [type], [assignment_strategy], [position_x], [position_y], [configuration_json], [created_at], [updated_at])
 ON target.[workflow_version_id] = source.[workflow_version_id] AND target.[node_key] = source.[node_key]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[description] = source.[description], target.[type] = source.[type], target.[assignment_strategy] = source.[assignment_strategy], target.[position_x] = source.[position_x], target.[position_y] = source.[position_y], target.[configuration_json] = source.[configuration_json], target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [workflow_version_id], [node_key], [name], [description], [type], [assignment_strategy], [position_x], [position_y], [configuration_json], [created_at], [updated_at]) VALUES (source.[id], source.[workflow_version_id], source.[node_key], source.[name], source.[description], source.[type], source.[assignment_strategy], source.[position_x], source.[position_y], source.[configuration_json], source.[created_at], source.[updated_at]);
`,
        [
          uuidv5(`${graph.versionId}:node:${item.key}`, SEED_NAMESPACE),
          graph.versionId,
          item.key,
          item.name,
          item.description,
          item.type,
          item.assignmentStrategy,
          item.positionX,
          item.positionY,
          JSON.stringify(item.configuration),
        ],
      );
    }
    const nodeRows = await querySqlServer<{ id: string; node_key: string }>(
      connection,
      `SELECT id, node_key FROM [dbo].[workflow_nodes] WHERE workflow_version_id = @P1`,
      [graph.versionId],
    );
    const nodeIds = new Map(
      nodeRows.map((row) => [String(row.node_key), String(row.id)]),
    );
    await executeSqlServer(
      connection,
      `UPDATE [dbo].[workflow_transitions]
       SET [condition_group_id] = NULL
       WHERE [workflow_version_id] = @P1 AND [condition_group_id] IS NOT NULL`,
      [graph.versionId],
    );
    await executeSqlServer(
      connection,
      `DELETE FROM [dbo].[workflow_condition_groups] WHERE workflow_version_id = @P1`,
      [graph.versionId],
    );
    const conditionGroupIds = new Map<string, string>();
    for (const item of graph.transitions) {
      if (!item.condition) continue;
      const groupId = uuidv5(
        `${graph.versionId}:condition:${item.source}:${item.target}`,
        SEED_NAMESPACE,
      );
      conditionGroupIds.set(`${item.source}:${item.target}`, groupId);
      await executeSqlServer(
        connection,
        `
MERGE [dbo].[workflow_condition_groups] AS target
 USING (VALUES (@P1, @P2, @P3, @P4)) AS source ([id], [workflow_version_id], [logic_operator], [description])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[logic_operator] = source.[logic_operator], target.[description] = source.[description]
 WHEN NOT MATCHED THEN INSERT ([id], [workflow_version_id], [logic_operator], [description]) VALUES (source.[id], source.[workflow_version_id], source.[logic_operator], source.[description]);
`,
        [
          groupId,
          graph.versionId,
          item.condition.logicOperator,
          item.condition.description,
        ],
      );
      for (const [sequence, condition] of item.condition.conditions.entries()) {
        await executeSqlServer(
          connection,
          `
MERGE [dbo].[workflow_conditions] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7)) AS source ([id], [condition_group_id], [field], [operator], [value_json], [sequence], [description])
 ON target.[condition_group_id] = source.[condition_group_id] AND target.[sequence] = source.[sequence]
 WHEN MATCHED THEN UPDATE SET target.[field] = source.[field], target.[operator] = source.[operator], target.[value_json] = source.[value_json], target.[description] = source.[description]
 WHEN NOT MATCHED THEN INSERT ([id], [condition_group_id], [field], [operator], [value_json], [sequence], [description]) VALUES (source.[id], source.[condition_group_id], source.[field], source.[operator], source.[value_json], source.[sequence], source.[description]);
`,
          [
            uuidv5(`${groupId}:condition:${sequence}`, SEED_NAMESPACE),
            groupId,
            condition.field,
            condition.operator,
            JSON.stringify(condition.value),
            sequence,
            condition.description,
          ],
        );
      }
    }
    for (const item of graph.transitions) {
      const sourceNodeId = nodeIds.get(item.source);
      const targetNodeId = nodeIds.get(item.target);
      if (!sourceNodeId || !targetNodeId)
        throw new Error(
          `Canonical workflow transition references a missing node: ${item.source} -> ${item.target}.`,
        );
      const conditionGroupId = item.condition
        ? (conditionGroupIds.get(`${item.source}:${item.target}`) ?? null)
        : null;
      await executeSqlServer(
        connection,
        `
MERGE [dbo].[workflow_transitions] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8)) AS source ([id], [workflow_version_id], [source_node_id], [target_node_id], [label], [priority], [transition_type], [condition_group_id])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[source_node_id] = source.[source_node_id], target.[target_node_id] = source.[target_node_id], target.[label] = source.[label], target.[priority] = source.[priority], target.[transition_type] = source.[transition_type], target.[condition_group_id] = source.[condition_group_id]
 WHEN NOT MATCHED THEN INSERT ([id], [workflow_version_id], [source_node_id], [target_node_id], [label], [priority], [transition_type], [condition_group_id]) VALUES (source.[id], source.[workflow_version_id], source.[source_node_id], source.[target_node_id], source.[label], source.[priority], source.[transition_type], source.[condition_group_id]);
`,
        [
          uuidv5(
            `${graph.versionId}:transition:${item.source}:${item.target}:${item.type}`,
            SEED_NAMESPACE,
          ),
          graph.versionId,
          sourceNodeId,
          targetNodeId,
          item.label,
          item.priority ?? 0,
          item.type,
          conditionGroupId,
        ],
      );
    }
    await executeSqlServer(
      connection,
      `UPDATE [dbo].[workflow_definitions] SET active_version_id = @P1, status = 'PUBLISHED', archived_at = NULL, updated_at = SYSUTCDATETIME() WHERE id = @P2`,
      [graph.versionId, graph.definitionId],
    );
  }
  return graphs.length;
};

const getPermissionMap = async (
  connection: Prisma.TransactionClient,
): Promise<Map<string, string>> => {
  const rows = await querySqlServer<NamedIdRow>(
    connection,
    `
      SELECT id, name
      FROM [dbo].[permissions]
      WHERE name IN (${placeholders(permissions.length)})
    `,
    permissions.map((permission) => permission.name),
  );

  return new Map(rows.map((row) => [row.name, row.id]));
};

const syncRolePermissions = async (
  connection: Prisma.TransactionClient,
  roleMap: Map<string, string>,
  permissionMap: Map<string, string>,
): Promise<void> => {
  for (const role of roles) {
    const roleId = roleMap.get(role.code);
    if (!roleId) throw new Error(`Role ${role.code} not found after seeding.`);
    await executeSqlServer(
      connection,
      "DELETE FROM [dbo].[role_permissions] WHERE role_id = @P1",
      [roleId],
    );
    for (const permissionName of ROLE_PERMISSION_NAMES[role.code]) {
      const permissionId = permissionMap.get(permissionName);
      if (!permissionId) {
        throw new Error(
          `Permission ${permissionName} not found after seeding.`,
        );
      }

      await executeSqlServer(
        connection,
        `INSERT INTO [dbo].[role_permissions]
          (id, role_id, permission_id, created_at, updated_at)
          VALUES (@P1, @P2, @P3, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        [
          uuidv5(`role-permission:${roleId}:${permissionId}`, SEED_NAMESPACE),
          roleId,
          permissionId,
        ],
      );
    }
  }
};

const seedAdminUser = async (
  connection: Prisma.TransactionClient,
  adminSeed: AdminSeedConfig,
): Promise<string> => {
  const passwordHash = await bcrypt.hash(adminSeed.password, 12);
  const adminIds = getAdminSeedIds(adminSeed);

  await executeSqlServer(
    connection,
    `
MERGE [dbo].[users] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, NULL, 1, 1, NULL, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [name], [email], [password], [avatar], [is_active], [email_verified], [last_login_at], [created_at], [updated_at], [deleted_at])
 ON target.[email] = source.[email]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[email] = source.[email], target.[password] = source.[password], target.[avatar] = source.[avatar], target.[is_active] = source.[is_active], target.[email_verified] = source.[email_verified], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [email], [password], [avatar], [is_active], [email_verified], [last_login_at], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[name], source.[email], source.[password], source.[avatar], source.[is_active], source.[email_verified], source.[last_login_at], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
    [adminIds.userId, adminSeed.name, adminSeed.email, passwordHash],
  );

  const rows = await querySqlServer<UserRow>(
    connection,
    `
      SELECT TOP (1) id
      FROM [dbo].[users]
      WHERE email = @P1
    `,
    [adminSeed.email],
  );

  const adminUser = rows[0];

  if (!adminUser) {
    throw new Error("Admin user not found after seeding.");
  }

  return adminUser.id;
};

const seedAdminUserRole = async (
  connection: Prisma.TransactionClient,
  adminUserId: string,
  roleMap: Map<string, string>,
): Promise<void> => {
  const adminRoleId = roleMap.get(ADMIN_ROLE_CODE);

  if (!adminRoleId) {
    throw new Error("System admin role not found before assigning user role.");
  }

  await executeSqlServer(
    connection,
    "DELETE FROM [dbo].[user_roles] WHERE user_id = @P1",
    [adminUserId],
  );

  await executeSqlServer(
    connection,
    `
MERGE [dbo].[user_roles] AS target
 USING (VALUES (@P1, @P2, @P3, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [user_id], [role_id], [created_at], [updated_at])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [user_id], [role_id], [created_at], [updated_at]) VALUES (source.[id], source.[user_id], source.[role_id], source.[created_at], source.[updated_at]);
`,
    [
      uuidv5(`user-role:${adminUserId}:${adminRoleId}`, SEED_NAMESPACE),
      adminUserId,
      adminRoleId,
    ],
  );
};

const seedAdminAccount = async (
  connection: Prisma.TransactionClient,
  adminUserId: string,
  adminSeed: AdminSeedConfig,
): Promise<void> => {
  const passwordHash = await bcrypt.hash(adminSeed.password, 12);
  const adminIds = getAdminSeedIds(adminSeed);

  await executeSqlServer(
    connection,
    `
MERGE [dbo].[accounts] AS target
 USING (VALUES (@P1, @P2, 'credential', @P3, NULL, NULL, NULL, NULL, NULL, NULL, @P4, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [account_id], [provider_id], [user_id], [access_token], [refresh_token], [id_token], [access_token_expires_at], [refresh_token_expires_at], [scope], [password], [created_at], [updated_at])
 ON target.[provider_id] = source.[provider_id] AND target.[account_id] = source.[account_id]
 WHEN MATCHED THEN UPDATE SET target.[user_id] = source.[user_id], target.[password] = source.[password], target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [account_id], [provider_id], [user_id], [access_token], [refresh_token], [id_token], [access_token_expires_at], [refresh_token_expires_at], [scope], [password], [created_at], [updated_at]) VALUES (source.[id], source.[account_id], source.[provider_id], source.[user_id], source.[access_token], source.[refresh_token], source.[id_token], source.[access_token_expires_at], source.[refresh_token_expires_at], source.[scope], source.[password], source.[created_at], source.[updated_at]);
`,
    [adminIds.accountId, adminUserId, adminUserId, passwordHash],
  );
};

type DemoUserIds = {
  areaResponsibleId: string;
  auditorId: string;
  executorId: string;
  processOwnerId: string;
};

const seedDemoUsers = async (
  connection: Prisma.TransactionClient,
  roleMap: Map<string, string>,
): Promise<DemoUserIds> => {
  if (!env.SEED_DEMO_PASSWORD && process.env.NODE_ENV === "production")
    throw new Error("SEED_DEMO_PASSWORD is required in production.");
  const passwordHash = await bcrypt.hash(
    env.SEED_DEMO_PASSWORD ?? "nibol-demo-local-change-me",
    12,
  );
  const userIds = {
    areaResponsibleId: "",
    auditorId: "",
    executorId: "",
    processOwnerId: "",
  };

  for (const user of demoUsers) {
    const plannedUserId = uuidv5(`demo-user:${user.email}`, SEED_NAMESPACE);
    const roleId = roleMap.get(user.roleCode);
    if (!roleId)
      throw new Error(`Role ${user.roleCode} not found for demo user.`);

    await executeSqlServer(
      connection,
      `
MERGE [dbo].[users] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, NULL, @P5, 1, 1, NULL, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [name], [email], [password], [avatar], [job_title], [is_active], [email_verified], [last_login_at], [created_at], [updated_at], [deleted_at])
 ON target.[email] = source.[email]
 WHEN MATCHED THEN UPDATE SET target.[name] = source.[name], target.[password] = source.[password], target.[job_title] = source.[job_title], target.[is_active] = 1, target.[email_verified] = 1, target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [email], [password], [avatar], [job_title], [is_active], [email_verified], [last_login_at], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[name], source.[email], source.[password], source.[avatar], source.[job_title], source.[is_active], source.[email_verified], source.[last_login_at], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [plannedUserId, user.name, user.email, passwordHash, user.jobTitle],
    );
    const userRows = await querySqlServer<UserRow>(
      connection,
      `SELECT TOP (1) id FROM [dbo].[users] WHERE email = @P1`,
      [user.email],
    );
    const userId = userRows[0]?.id;
    if (!userId) throw new Error(`Demo user ${user.email} was not seeded.`);
    if (user.roleCode === "AUDITOR") userIds.auditorId = userId;
    if (user.roleCode === "PROCESS_OWNER") userIds.processOwnerId = userId;
    if (user.roleCode === "AREA_RESPONSIBLE")
      userIds.areaResponsibleId = userId;
    if (user.roleCode === "EXECUTOR") userIds.executorId = userId;
    await executeSqlServer(
      connection,
      "DELETE FROM [dbo].[user_roles] WHERE user_id = @P1",
      [userId],
    );
    await executeSqlServer(
      connection,
      `INSERT INTO [dbo].[user_roles] (id, user_id, role_id, created_at, updated_at)
       VALUES (@P1, @P2, @P3, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [uuidv5(`user-role:${userId}:${roleId}`, SEED_NAMESPACE), userId, roleId],
    );
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[accounts] AS target
 USING (VALUES (@P1, @P2, 'credential', @P3, NULL, NULL, NULL, NULL, NULL, NULL, @P4, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [account_id], [provider_id], [user_id], [access_token], [refresh_token], [id_token], [access_token_expires_at], [refresh_token_expires_at], [scope], [password], [created_at], [updated_at])
 ON target.[provider_id] = source.[provider_id] AND target.[account_id] = source.[account_id]
 WHEN MATCHED THEN UPDATE SET target.[user_id] = source.[user_id], target.[password] = source.[password], target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [account_id], [provider_id], [user_id], [access_token], [refresh_token], [id_token], [access_token_expires_at], [refresh_token_expires_at], [scope], [password], [created_at], [updated_at]) VALUES (source.[id], source.[account_id], source.[provider_id], source.[user_id], source.[access_token], source.[refresh_token], source.[id_token], source.[access_token_expires_at], source.[refresh_token_expires_at], source.[scope], source.[password], source.[created_at], source.[updated_at]);
`,
      [
        uuidv5(`demo-account:${user.email}`, SEED_NAMESPACE),
        userId,
        userId,
        passwordHash,
      ],
    );
  }
  return userIds;
};

const seedDefaultSettings = async (
  connection: Prisma.TransactionClient,
): Promise<void> => {
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[settings] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [app_name], [logo], [primary_color], [support_email], [timezone], [date_format], [sender_name], [sender_email], [created_at], [updated_at], [deleted_at])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[app_name] = source.[app_name], target.[logo] = source.[logo], target.[primary_color] = source.[primary_color], target.[support_email] = source.[support_email], target.[timezone] = source.[timezone], target.[date_format] = source.[date_format], target.[sender_name] = source.[sender_name], target.[sender_email] = source.[sender_email], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [app_name], [logo], [primary_color], [support_email], [timezone], [date_format], [sender_name], [sender_email], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[app_name], source.[logo], source.[primary_color], source.[support_email], source.[timezone], source.[date_format], source.[sender_name], source.[sender_email], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
    [
      ids.settings,
      env.SEED_APP_NAME,
      env.SEED_LOGO ?? null,
      env.SEED_PRIMARY_COLOR,
      env.SEED_SUPPORT_EMAIL,
      env.SEED_TIMEZONE,
      env.SEED_DATE_FORMAT,
      env.SEED_SENDER_NAME,
      env.SEED_SENDER_EMAIL,
    ],
  );
};

const seedSampleObservationsIfEmpty = async (
  connection: Prisma.TransactionClient,
  options: {
    adminUserId: string;
    areaMap: Map<SeedAreaKey, string>;
    demoUserIds: DemoUserIds;
    riskLevelMap: Map<SeedRiskLevelKey, string>;
    statusMap: Map<SeedObservationStatusKey, string>;
  },
): Promise<number> => {
  const countRows = await querySqlServer<CountRow>(
    connection,
    `
      SELECT COUNT(*) AS total
      FROM [dbo].[observations]
      WHERE deleted_at IS NULL
    `,
  );

  if ((countRows[0]?.total ?? 0) > 0) {
    return 0;
  }
  const auditReportId = uuidv5("audit-report:AI-2026-004", SEED_NAMESPACE);
  const secondAuditReportId = uuidv5(
    "audit-report:AI-2026-005",
    SEED_NAMESPACE,
  );
  const dictionaryId = uuidv5(
    "observation-dictionary:control-interno",
    SEED_NAMESPACE,
  );
  const riskIds = {
    access: uuidv5("risk:acceso-no-autorizado", SEED_NAMESPACE),
    continuity: uuidv5("risk:continuidad-operativa", SEED_NAMESPACE),
    financial: uuidv5("risk:informacion-financiera-incorrecta", SEED_NAMESPACE),
  };

  await executeSqlServer(
    connection,
    `INSERT INTO [dbo].[audit_reports] (id, report_number, title, report_date, created_by_user_id, created_at, updated_at, deleted_at)
     VALUES (@P1, @P2, @P3, @P4, @P5, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)`,
    [
      auditReportId,
      "AI-2026-004",
      "Auditoría integral de procesos críticos",
      "2026-05-15",
      options.adminUserId,
    ],
  );
  await executeSqlServer(
    connection,
    `INSERT INTO [dbo].[observation_dictionary] (id, name, description, is_active, created_at, updated_at)
     VALUES (@P1, @P2, @P3, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    [
      dictionaryId,
      "Debilidad de control interno",
      "Diseño o ejecución insuficiente de un control clave.",
    ],
  );
  await executeSqlServer(
    connection,
    `INSERT INTO [dbo].[audit_reports] (id, report_number, title, report_date, created_by_user_id, created_at, updated_at, deleted_at)
     VALUES (@P1, @P2, @P3, @P4, @P5, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)`,
    [
      secondAuditReportId,
      "AI-2026-005",
      "Auditoría de inventarios y continuidad",
      "2026-06-01",
      options.adminUserId,
    ],
  );

  for (const [key, id, name] of [
    ["access", riskIds.access, "Acceso no autorizado"],
    [
      "continuity",
      riskIds.continuity,
      "Interrupción de la continuidad operativa",
    ],
    ["financial", riskIds.financial, "Información financiera incorrecta"],
  ] as const) {
    await executeSqlServer(
      connection,
      `INSERT INTO [dbo].[risks] (id, name, description, is_active, created_at, updated_at)
       VALUES (@P1, @P2, @P3, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [id, name, `Riesgo de referencia ${key} para datos demostrativos.`],
    );
  }

  const sampleObservations = [
    {
      auditReportId,
      reportNumber: "AI-2026-004",
      number: 1,
      title: "Segregación insuficiente de accesos privilegiados",
      description:
        "Se identificó uso compartido de credenciales administrativas sin trazabilidad individual.",
      recommendation:
        "Formalizar la segregación de funciones y evidenciar revisiones mensuales.",
      riskLevelKey: "ALTO" as const,
      statusKey: "CON_AVANCE" as const,
      originalDueDate: "2026-08-13",
      currentDueDate: "2026-08-13",
      progressPercent: 45,
      currentStage: "Ejecución de planes de acción",
      areaKeys: ["finance"] as const,
      riskIds: [riskIds.access, riskIds.continuity],
    },
    {
      auditReportId,
      reportNumber: "AI-2026-004",
      number: 2,
      title: "Conciliaciones bancarias fuera de plazo",
      description:
        "Existen conciliaciones pendientes en cuentas operativas con más de treinta días de rezago.",
      recommendation:
        "Definir responsables y ejecutar un seguimiento semanal hasta su cierre.",
      riskLevelKey: "MEDIO" as const,
      statusKey: "CON_AVANCE" as const,
      originalDueDate: "2026-09-12",
      currentDueDate: "2026-09-12",
      progressPercent: 75,
      currentStage: "Evaluación de avance",
      areaKeys: ["finance"] as const,
      riskIds: [riskIds.financial],
    },
    {
      auditReportId: secondAuditReportId,
      reportNumber: "AI-2026-005",
      number: 1,
      title: "Diferencias de inventario sin conciliación documentada",
      description:
        "El conteo selectivo mostró diferencias entre existencia física y sistema.",
      recommendation:
        "Actualizar la matriz de inventario y documentar validaciones cruzadas.",
      riskLevelKey: "BAJO" as const,
      statusKey: "NO_INICIADO" as const,
      originalDueDate: "2026-11-28",
      currentDueDate: "2026-11-28",
      progressPercent: 0,
      currentStage: "Asignación de responsables",
      areaKeys: ["finance"] as const,
      riskIds: [riskIds.continuity],
    },
  ];

  for (const sample of sampleObservations) {
    const displayCode = `${sample.reportNumber}-${sample.number}`;
    const observationId = uuidv5(`observation:${displayCode}`, SEED_NAMESPACE);
    const riskLevelId = options.riskLevelMap.get(sample.riskLevelKey);
    const statusId = options.statusMap.get(sample.statusKey);

    if (!riskLevelId || !statusId) {
      throw new Error(
        `Missing catalog references while seeding ${displayCode}.`,
      );
    }

    await executeSqlServer(
      connection,
      `INSERT INTO [dbo].[observations] (
        id, audit_report_id, observation_number, main_observation_id, title, description,
        audit_recommendation, risk_level_id, status_id, auditor_user_id,
        original_due_date, current_due_date, source, process_name, category,
        progress_percent, current_stage, created_at, updated_at, deleted_at
      ) VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, @P11, @P12, @P13, @P14, @P15, @P16, @P17, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)`,
      [
        observationId,
        sample.auditReportId,
        sample.number,
        dictionaryId,
        sample.title,
        sample.description,
        sample.recommendation,
        riskLevelId,
        statusId,
        options.demoUserIds.auditorId,
        sample.originalDueDate,
        sample.currentDueDate,
        "Auditoría interna",
        "Control interno",
        "Hallazgo de auditoría",
        sample.progressPercent,
        sample.currentStage,
      ],
    );

    for (const riskId of sample.riskIds) {
      await executeSqlServer(
        connection,
        `INSERT INTO [dbo].[observation_risks] (id, observation_id, risk_id, created_at) VALUES (@P1, @P2, @P3, SYSUTCDATETIME())`,
        [
          uuidv5(`observation-risk:${displayCode}:${riskId}`, SEED_NAMESPACE),
          observationId,
          riskId,
        ],
      );
    }

    for (const [areaIndex, areaKey] of sample.areaKeys.entries()) {
      const areaId = options.areaMap.get(areaKey);
      if (!areaId)
        throw new Error(
          `Missing area ${areaKey} while seeding ${displayCode}.`,
        );
      const observationAreaId = uuidv5(
        `observation-area:${displayCode}:${areaKey}`,
        SEED_NAMESPACE,
      );
      const processOwnerUserId = options.demoUserIds.processOwnerId;
      const areaResponsibleUserId = options.demoUserIds.areaResponsibleId;
      await executeSqlServer(
        connection,
        `INSERT INTO [dbo].[observation_areas] (
          id, observation_id, area_id, process_owner_user_id, area_responsible_user_id, created_at, updated_at
        ) VALUES (@P1, @P2, @P3, @P4, @P5, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        [
          observationAreaId,
          observationId,
          areaId,
          processOwnerUserId,
          areaResponsibleUserId,
        ],
      );

      if (sample.auditReportId === auditReportId && sample.number === 1) {
        const actionPlanId = uuidv5(
          `action-plan:${displayCode}:${areaKey}`,
          SEED_NAMESPACE,
        );
        const actionOriginalDueDate =
          areaIndex === 0 ? "2026-08-05" : "2026-08-20";
        const actionCurrentDueDate =
          areaIndex === 0 ? "2026-09-30" : "2026-08-20";
        const progressPercent = [60, 25, 0][areaIndex] ?? 0;
        const planStatus = ["WITH_PROGRESS", "STARTED", "NOT_STARTED"][
          areaIndex
        ]!;
        const planTitles = [
          "Conciliar saldos y formalizar revisión financiera",
          "Individualizar cuentas privilegiadas",
          "Actualizar protocolo de contingencia operativa",
        ];
        await executeSqlServer(
          connection,
          `INSERT INTO [dbo].[action_plans] (
            id, remediation_plan_id, observation_id, observation_area_id, responsible_user_id,
            title, description, original_due_date, current_due_date, completed_at,
            progress_percent, status, sort_order, created_at, updated_at, deleted_at
          ) VALUES (@P1, NULL, @P2, @P3, @P4, @P5, @P6, @P7, @P8, NULL, @P9, @P10, @P11, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)`,
          [
            actionPlanId,
            observationId,
            observationAreaId,
            options.demoUserIds.executorId,
            planTitles[areaIndex] ?? "Ejecutar control correctivo",
            "Ejecutar, documentar y validar el control asignado.",
            actionOriginalDueDate,
            actionCurrentDueDate,
            progressPercent,
            planStatus,
            areaIndex,
          ],
        );

        const evaluationId = uuidv5(
          `progress-evaluation:${actionPlanId}`,
          SEED_NAMESPACE,
        );
        await executeSqlServer(
          connection,
          `INSERT INTO [dbo].[progress_evaluations] (
            id, action_plan_id, submitted_by_user_id, type, reported_progress_percent, evaluated_status,
            comment, review_status, reviewed_by_user_id, submitted_at, reviewed_at,
            review_comment, created_at, updated_at, deleted_at, workflow_instance_id
          ) VALUES (@P1, @P2, @P3, 'ADVANCE', @P4, @P5, @P6, 'APPROVED', @P7, SYSUTCDATETIME(), SYSUTCDATETIME(), @P8, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)`,
          [
            evaluationId,
            actionPlanId,
            options.demoUserIds.executorId,
            progressPercent,
            planStatus,
            "Avance respaldado y enviado a auditoría.",
            options.demoUserIds.auditorId,
            "Evaluación aprobada para datos demostrativos.",
          ],
        );

        if (areaIndex === 0) {
          await executeSqlServer(
            connection,
            `INSERT INTO [dbo].[deadline_extension_requests] (
              id, target_type, observation_id, action_plan_id, observation_area_id, requested_by_user_id,
              classification_id, max_additional_days, max_allowed_date, previous_due_date, proposed_due_date, reason, status, manager_reviewer_id,
              manager_reviewed_at, manager_comment, final_approved_at, created_at, updated_at, deleted_at, workflow_instance_id
            ) VALUES (@P1, 'ACTION_PLAN', NULL, @P2, @P3, @P4, @P5, 15, @P6, @P7, @P8, @P9, 'MANAGER_APPROVED', @P10, SYSUTCDATETIME(), @P11, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)`,
            [
              uuidv5(`extension:${actionPlanId}`, SEED_NAMESPACE),
              actionPlanId,
              observationAreaId,
              options.demoUserIds.executorId,
              uuidv5("extension-classification:EXECUTION", SEED_NAMESPACE),
              "2026-09-30",
              "2026-09-15",
              "2026-09-30",
              "Se requiere una ventana adicional para concluir las pruebas de acceso.",
              processOwnerUserId,
              "Conforme por la jefatura.",
            ],
          );
        }
      }
    }
  }

  return sampleObservations.length;
};

const seedCanonicalQaFixture = async (
  connection: Prisma.TransactionClient,
  options: {
    adminUserId: string;
    areaMap: Map<SeedAreaKey, string>;
    demoUserIds: DemoUserIds;
    riskLevelMap: Map<SeedRiskLevelKey, string>;
    statusMap: Map<SeedObservationStatusKey, string>;
  },
): Promise<number> => {
  const reportId = uuidv5("qa-report:NIBOL-QA-2026-001", SEED_NAMESPACE);
  const dictionaryId = uuidv5(
    "qa-dictionary:control-auditoria",
    SEED_NAMESPACE,
  );
  const riskId = uuidv5("qa-risk:control-financiero", SEED_NAMESPACE);
  const financeAreaId = options.areaMap.get("finance");
  const operationsAreaId = options.areaMap.get("operations");
  if (!financeAreaId || !operationsAreaId) {
    throw new Error("Canonical QA areas are not available.");
  }

  await executeSqlServer(
    connection,
    `
MERGE [dbo].[audit_reports] AS target
 USING (VALUES (@P1, 'NIBOL-QA-2026-001', @P2, '2026-09-09', @P3, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [report_number], [title], [report_date], [created_by_user_id], [created_at], [updated_at], [deleted_at])
 ON target.[report_number] = source.[report_number]
 WHEN MATCHED THEN UPDATE SET target.[title] = source.[title], target.[report_date] = source.[report_date], target.[created_by_user_id] = source.[created_by_user_id], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [report_number], [title], [report_date], [created_by_user_id], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[report_number], source.[title], source.[report_date], source.[created_by_user_id], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
    [reportId, "Auditoría QA del Flujo Base NIBOL", options.adminUserId],
  );
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[observation_dictionary] AS target
 USING (VALUES (@P1, 'Control de seguimiento QA', @P2, 1, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [name], [description], [is_active], [created_at], [updated_at])
 ON target.[name] = source.[name]
 WHEN MATCHED THEN UPDATE SET target.[description] = source.[description], target.[is_active] = 1, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [description], [is_active], [created_at], [updated_at]) VALUES (source.[id], source.[name], source.[description], source.[is_active], source.[created_at], source.[updated_at]);
`,
    [
      dictionaryId,
      "Hallazgo estable para validar el ciclo completo de auditoría.",
    ],
  );
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[risks] AS target
 USING (VALUES (@P1, 'Riesgo financiero QA', @P2, 1, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [name], [description], [is_active], [created_at], [updated_at])
 ON target.[name] = source.[name]
 WHEN MATCHED THEN UPDATE SET target.[description] = source.[description], target.[is_active] = 1, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [name], [description], [is_active], [created_at], [updated_at]) VALUES (source.[id], source.[name], source.[description], source.[is_active], source.[created_at], source.[updated_at]);
`,
    [riskId, "Riesgo estable del fixture canónico NIBOL."],
  );

  const observations = [
    {
      id: uuidv5("qa-observation:NIBOL-QA-2026-001:1", SEED_NAMESPACE),
      number: 1,
      title: "Conciliación documental pendiente",
      description:
        "La evidencia de conciliación requiere formalización y seguimiento por las áreas involucradas.",
      recommendation:
        "Definir un plan recomendado, asignar responsables y documentar la ejecución.",
      riskLevelId: options.riskLevelMap.get("MEDIO")!,
      statusId: options.statusMap.get("NO_INICIADO")!,
      currentDueDate: "2026-12-20",
      progressPercent: 0,
      currentStage: "Borrador para revisión",
      sentAt: null,
      areaIds: [financeAreaId, operationsAreaId],
    },
    {
      id: uuidv5("qa-observation:NIBOL-QA-2026-001:2", SEED_NAMESPACE),
      number: 2,
      title: "Control de accesos con avance",
      description:
        "El control de accesos ya tiene ejecución iniciada y necesita evidencia de cierre.",
      recommendation:
        "Completar las pruebas, adjuntar evidencias y enviar el avance a Auditoría.",
      riskLevelId: options.riskLevelMap.get("ALTO")!,
      statusId: options.statusMap.get("INICIADO")!,
      currentDueDate: "2026-08-15",
      progressPercent: 20,
      currentStage: "Ejecución y carga de evidencias",
      sentAt: "2026-09-09 10:00:00",
      areaIds: [financeAreaId],
    },
    {
      id: uuidv5("qa-observation:NIBOL-QA-2026-001:3", SEED_NAMESPACE),
      number: 3,
      title: "Cierre de control documentado",
      description:
        "La ejecución está concluida y cuenta con un registro preparado para evaluación final y cierre.",
      recommendation:
        "Validar la evidencia final y cerrar la observación cuando todos los planes estén aprobados.",
      riskLevelId: options.riskLevelMap.get("BAJO")!,
      statusId: options.statusMap.get("CON_AVANCE")!,
      currentDueDate: "2026-12-31",
      progressPercent: 60,
      currentStage: "Evaluación final pendiente",
      sentAt: "2026-09-09 10:00:00",
      areaIds: [financeAreaId],
    },
  ];

  for (const observation of observations) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[observations] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, @P11, @P12, 'Auditoría interna', 'Control financiero', 'Hallazgo QA', @P13, @P14, @P15, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [audit_report_id], [observation_number], [main_observation_id], [title], [description], [audit_recommendation], [risk_level_id], [status_id], [auditor_user_id], [original_due_date], [current_due_date], [source], [process_name], [category], [progress_percent], [current_stage], [sent_at], [created_at], [updated_at], [deleted_at])
 ON target.[audit_report_id] = source.[audit_report_id] AND target.[observation_number] = source.[observation_number]
 WHEN MATCHED THEN UPDATE SET target.[title] = source.[title], target.[description] = source.[description], target.[audit_recommendation] = source.[audit_recommendation], target.[risk_level_id] = source.[risk_level_id], target.[status_id] = source.[status_id], target.[auditor_user_id] = source.[auditor_user_id], target.[original_due_date] = source.[original_due_date], target.[current_due_date] = source.[current_due_date], target.[progress_percent] = source.[progress_percent], target.[current_stage] = source.[current_stage], target.[sent_at] = source.[sent_at], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [audit_report_id], [observation_number], [main_observation_id], [title], [description], [audit_recommendation], [risk_level_id], [status_id], [auditor_user_id], [original_due_date], [current_due_date], [source], [process_name], [category], [progress_percent], [current_stage], [sent_at], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[audit_report_id], source.[observation_number], source.[main_observation_id], source.[title], source.[description], source.[audit_recommendation], source.[risk_level_id], source.[status_id], source.[auditor_user_id], source.[original_due_date], source.[current_due_date], source.[source], source.[process_name], source.[category], source.[progress_percent], source.[current_stage], source.[sent_at], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        observation.id,
        reportId,
        observation.number,
        dictionaryId,
        observation.title,
        observation.description,
        observation.recommendation,
        observation.riskLevelId,
        observation.statusId,
        options.demoUserIds.auditorId,
        observation.currentDueDate,
        observation.currentDueDate,
        observation.progressPercent,
        observation.currentStage,
        observation.sentAt,
      ],
    );
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[observation_risks] AS target
 USING (VALUES (@P1, @P2, @P3, SYSUTCDATETIME())) AS source ([id], [observation_id], [risk_id], [created_at])
 ON target.[observation_id] = source.[observation_id] AND target.[risk_id] = source.[risk_id]
 WHEN MATCHED THEN UPDATE SET target.[risk_id] = source.[risk_id]
 WHEN NOT MATCHED THEN INSERT ([id], [observation_id], [risk_id], [created_at]) VALUES (source.[id], source.[observation_id], source.[risk_id], source.[created_at]);
`,
      [
        uuidv5(`qa-observation-risk:${observation.number}`, SEED_NAMESPACE),
        observation.id,
        riskId,
      ],
    );
    for (const [areaIndex, areaId] of observation.areaIds.entries()) {
      await executeSqlServer(
        connection,
        `
MERGE [dbo].[observation_areas] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, SYSUTCDATETIME(), SYSUTCDATETIME())) AS source ([id], [observation_id], [area_id], [process_owner_user_id], [area_responsible_user_id], [created_at], [updated_at])
 ON target.[observation_id] = source.[observation_id] AND target.[area_id] = source.[area_id]
 WHEN MATCHED THEN UPDATE SET target.[process_owner_user_id] = source.[process_owner_user_id], target.[area_responsible_user_id] = source.[area_responsible_user_id], target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [observation_id], [area_id], [process_owner_user_id], [area_responsible_user_id], [created_at], [updated_at]) VALUES (source.[id], source.[observation_id], source.[area_id], source.[process_owner_user_id], source.[area_responsible_user_id], source.[created_at], source.[updated_at]);
`,
        [
          uuidv5(
            `qa-observation-area:${observation.number}:${areaId}`,
            SEED_NAMESPACE,
          ),
          observation.id,
          areaId,
          options.demoUserIds.processOwnerId,
          options.demoUserIds.areaResponsibleId,
        ],
      );
      if (observation.number === 1 && areaIndex === 0) {
        await executeSqlServer(
          connection,
          `
MERGE [dbo].[remediation_plans] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, 'DRAFT', NULL, NULL, NULL, NULL, NULL, NULL, @P8, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)) AS source ([id], [observation_id], [area_id], [owner_user_id], [strategy_text], [mitigation_text], [additional_comments], [status], [sent_to_audit_at], [approved_at], [approved_by_user_id], [returned_at], [returned_by_user_id], [return_reason], [created_by_user_id], [created_at], [updated_at], [deleted_at], [workflow_instance_id])
 ON target.[observation_id] = source.[observation_id] AND target.[area_id] = source.[area_id]
 WHEN MATCHED THEN UPDATE SET target.[owner_user_id] = source.[owner_user_id], target.[strategy_text] = source.[strategy_text], target.[mitigation_text] = source.[mitigation_text], target.[additional_comments] = source.[additional_comments], target.[status] = 'DRAFT', target.[sent_to_audit_at] = NULL, target.[approved_at] = NULL, target.[approved_by_user_id] = NULL, target.[returned_at] = NULL, target.[returned_by_user_id] = NULL, target.[return_reason] = NULL, target.[created_by_user_id] = source.[created_by_user_id], target.[deleted_at] = NULL, target.[workflow_instance_id] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [observation_id], [area_id], [owner_user_id], [strategy_text], [mitigation_text], [additional_comments], [status], [sent_to_audit_at], [approved_at], [approved_by_user_id], [returned_at], [returned_by_user_id], [return_reason], [created_by_user_id], [created_at], [updated_at], [deleted_at], [workflow_instance_id]) VALUES (source.[id], source.[observation_id], source.[area_id], source.[owner_user_id], source.[strategy_text], source.[mitigation_text], source.[additional_comments], source.[status], source.[sent_to_audit_at], source.[approved_at], source.[approved_by_user_id], source.[returned_at], source.[returned_by_user_id], source.[return_reason], source.[created_by_user_id], source.[created_at], source.[updated_at], source.[deleted_at], source.[workflow_instance_id]);
`,
          [
            uuidv5("qa-remediation-plan:1", SEED_NAMESPACE),
            observation.id,
            areaId,
            options.demoUserIds.executorId,
            "Formalizar la conciliación y documentar las revisiones mensuales.",
            "Validación por el responsable de área y evidencia en la plataforma.",
            "Plan recomendado listo para revisión de Dueño de Proceso y Responsable de Área.",
            options.demoUserIds.auditorId,
          ],
        );
      }
    }
  }

  const qaPlans = [
    {
      actionPlanId: uuidv5("qa-action-plan:1", SEED_NAMESPACE),
      areaId: financeAreaId,
      observationId: observations[0]!.id,
      observationAreaId: uuidv5(
        `qa-observation-area:1:${financeAreaId}`,
        SEED_NAMESPACE,
      ),
      remediationPlanId: uuidv5("qa-remediation-plan:1", SEED_NAMESPACE),
      status: "NOT_STARTED",
      progressPercent: 0,
      originalDueDate: "2026-12-20",
      currentDueDate: "2026-12-20",
      title: "Formalizar la conciliación documental",
    },
    {
      actionPlanId: uuidv5("qa-action-plan:2", SEED_NAMESPACE),
      areaId: financeAreaId,
      observationId: observations[1]!.id,
      observationAreaId: uuidv5(
        `qa-observation-area:2:${financeAreaId}`,
        SEED_NAMESPACE,
      ),
      remediationPlanId: uuidv5("qa-remediation-plan:2", SEED_NAMESPACE),
      status: "STARTED",
      progressPercent: 20,
      originalDueDate: "2026-08-15",
      currentDueDate: "2026-08-15",
      title: "Completar pruebas de control de accesos",
    },
    {
      actionPlanId: uuidv5("qa-action-plan:3", SEED_NAMESPACE),
      areaId: financeAreaId,
      observationId: observations[2]!.id,
      observationAreaId: uuidv5(
        `qa-observation-area:3:${financeAreaId}`,
        SEED_NAMESPACE,
      ),
      remediationPlanId: uuidv5("qa-remediation-plan:3", SEED_NAMESPACE),
      status: "CONCLUDED",
      progressPercent: 100,
      originalDueDate: "2026-08-20",
      currentDueDate: "2026-08-20",
      title: "Validar evidencia final del control",
    },
    {
      actionPlanId: uuidv5("qa-action-plan:4", SEED_NAMESPACE),
      areaId: financeAreaId,
      observationId: observations[1]!.id,
      observationAreaId: uuidv5(
        `qa-observation-area:2:${financeAreaId}`,
        SEED_NAMESPACE,
      ),
      remediationPlanId: uuidv5("qa-remediation-plan:2", SEED_NAMESPACE),
      status: "WITH_PROGRESS",
      progressPercent: 60,
      originalDueDate: "2026-08-01",
      currentDueDate: "2026-08-16",
      title: "Revisar controles después de la ampliación aprobada",
    },
    {
      actionPlanId: uuidv5("qa-action-plan:5", SEED_NAMESPACE),
      areaId: operationsAreaId,
      observationId: observations[0]!.id,
      observationAreaId: uuidv5(
        `qa-observation-area:1:${operationsAreaId}`,
        SEED_NAMESPACE,
      ),
      remediationPlanId: uuidv5("qa-remediation-plan:5", SEED_NAMESPACE),
      status: "WITH_PROGRESS",
      progressPercent: 60,
      originalDueDate: "2026-09-01",
      currentDueDate: "2026-09-15",
      title: "Validar controles operativos reprogramados",
    },
  ] as const;

  for (const plan of qaPlans) {
    const isConcluded = plan.status === "CONCLUDED";
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[remediation_plans] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, 'APPROVED', '2026-09-09 10:00:00', '2026-09-09 10:05:00', @P8, NULL, NULL, NULL, @P9, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)) AS source ([id], [observation_id], [area_id], [owner_user_id], [strategy_text], [mitigation_text], [additional_comments], [status], [sent_to_audit_at], [approved_at], [approved_by_user_id], [returned_at], [returned_by_user_id], [return_reason], [created_by_user_id], [created_at], [updated_at], [deleted_at], [workflow_instance_id])
 ON target.[observation_id] = source.[observation_id] AND target.[area_id] = source.[area_id]
 WHEN MATCHED THEN UPDATE SET target.[owner_user_id] = source.[owner_user_id], target.[status] = 'APPROVED', target.[sent_to_audit_at] = source.[sent_to_audit_at], target.[approved_at] = source.[approved_at], target.[approved_by_user_id] = source.[approved_by_user_id], target.[deleted_at] = NULL, target.[workflow_instance_id] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [observation_id], [area_id], [owner_user_id], [strategy_text], [mitigation_text], [additional_comments], [status], [sent_to_audit_at], [approved_at], [approved_by_user_id], [returned_at], [returned_by_user_id], [return_reason], [created_by_user_id], [created_at], [updated_at], [deleted_at], [workflow_instance_id]) VALUES (source.[id], source.[observation_id], source.[area_id], source.[owner_user_id], source.[strategy_text], source.[mitigation_text], source.[additional_comments], source.[status], source.[sent_to_audit_at], source.[approved_at], source.[approved_by_user_id], source.[returned_at], source.[returned_by_user_id], source.[return_reason], source.[created_by_user_id], source.[created_at], source.[updated_at], source.[deleted_at], source.[workflow_instance_id]);
`,
      [
        plan.remediationPlanId,
        plan.observationId,
        plan.areaId,
        options.demoUserIds.executorId,
        plan.title,
        "Ejecutar, evidenciar y remitir a Auditoría.",
        "Fixture QA estable para el Flujo base.",
        options.demoUserIds.areaResponsibleId,
        options.demoUserIds.areaResponsibleId,
      ],
    );
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[action_plans] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, @P11, @P12, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [remediation_plan_id], [observation_id], [observation_area_id], [responsible_user_id], [title], [description], [original_due_date], [current_due_date], [completed_at], [progress_percent], [status], [sort_order], [created_at], [updated_at], [deleted_at])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[responsible_user_id] = source.[responsible_user_id], target.[title] = source.[title], target.[description] = source.[description], target.[original_due_date] = source.[original_due_date], target.[current_due_date] = source.[current_due_date], target.[completed_at] = source.[completed_at], target.[progress_percent] = source.[progress_percent], target.[status] = source.[status], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [remediation_plan_id], [observation_id], [observation_area_id], [responsible_user_id], [title], [description], [original_due_date], [current_due_date], [completed_at], [progress_percent], [status], [sort_order], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[remediation_plan_id], source.[observation_id], source.[observation_area_id], source.[responsible_user_id], source.[title], source.[description], source.[original_due_date], source.[current_due_date], source.[completed_at], source.[progress_percent], source.[status], source.[sort_order], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
      [
        plan.actionPlanId,
        plan.remediationPlanId,
        plan.observationId,
        plan.observationAreaId,
        options.demoUserIds.executorId,
        plan.title,
        "Ejecutar y documentar el control correctivo asignado.",
        plan.originalDueDate,
        plan.currentDueDate,
        isConcluded ? "2026-09-08 16:00:00" : null,
        plan.progressPercent,
        plan.status,
      ],
    );
  }

  const advanceEvaluationId = uuidv5(
    "qa-progress-evaluation:2",
    SEED_NAMESPACE,
  );
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[progress_evaluations] AS target
 USING (VALUES (@P1, @P2, @P3, 'ADVANCE', 20, 'STARTED', @P4, 'APPROVED', @P5, '2026-09-08 14:00:00', '2026-09-08 16:00:00', @P6, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)) AS source ([id], [action_plan_id], [submitted_by_user_id], [type], [reported_progress_percent], [evaluated_status], [comment], [review_status], [reviewed_by_user_id], [submitted_at], [reviewed_at], [review_comment], [created_at], [updated_at], [deleted_at], [workflow_instance_id])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[reported_progress_percent] = 20, target.[evaluated_status] = 'STARTED', target.[review_status] = 'APPROVED', target.[reviewed_by_user_id] = source.[reviewed_by_user_id], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [action_plan_id], [submitted_by_user_id], [type], [reported_progress_percent], [evaluated_status], [comment], [review_status], [reviewed_by_user_id], [submitted_at], [reviewed_at], [review_comment], [created_at], [updated_at], [deleted_at], [workflow_instance_id]) VALUES (source.[id], source.[action_plan_id], source.[submitted_by_user_id], source.[type], source.[reported_progress_percent], source.[evaluated_status], source.[comment], source.[review_status], source.[reviewed_by_user_id], source.[submitted_at], source.[reviewed_at], source.[review_comment], source.[created_at], source.[updated_at], source.[deleted_at], source.[workflow_instance_id]);
`,
    [
      advanceEvaluationId,
      uuidv5("qa-action-plan:2", SEED_NAMESPACE),
      options.demoUserIds.executorId,
      "Avance inicial documentado para la prueba QA.",
      options.demoUserIds.auditorId,
      "Avance aprobado para continuar la ejecución.",
    ],
  );
  for (const history of [
    {
      id: uuidv5("qa-progress-history:2:sent", SEED_NAMESPACE),
      action: "SENT",
      fromStatus: null,
      toStatus: "SENT_TO_AUDIT",
      userId: options.demoUserIds.executorId,
      comment: "Enviado a Auditoría.",
    },
    {
      id: uuidv5("qa-progress-history:2:approved", SEED_NAMESPACE),
      action: "APPROVED",
      fromStatus: "SENT_TO_AUDIT",
      toStatus: "APPROVED",
      userId: options.demoUserIds.auditorId,
      comment: "Aprobado como avance inicial.",
    },
  ]) {
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[progress_review_history] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, SYSUTCDATETIME())) AS source ([id], [progress_evaluation_id], [action], [from_status], [to_status], [user_id], [comment], [created_at])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[action] = source.[action], target.[from_status] = source.[from_status], target.[to_status] = source.[to_status], target.[user_id] = source.[user_id], target.[comment] = source.[comment]
 WHEN NOT MATCHED THEN INSERT ([id], [progress_evaluation_id], [action], [from_status], [to_status], [user_id], [comment], [created_at]) VALUES (source.[id], source.[progress_evaluation_id], source.[action], source.[from_status], source.[to_status], source.[user_id], source.[comment], source.[created_at]);
`,
      [
        history.id,
        advanceEvaluationId,
        history.action,
        history.fromStatus,
        history.toStatus,
        history.userId,
        history.comment,
      ],
    );
  }

  const closureEvaluationId = uuidv5(
    "qa-progress-evaluation:3:closure",
    SEED_NAMESPACE,
  );
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[progress_evaluations] AS target
 USING (VALUES (@P1, @P2, @P3, 'FINALIZATION', 100, 'CONCLUDED', @P4, 'DRAFT', NULL, '2026-09-09 11:00:00', NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)) AS source ([id], [action_plan_id], [submitted_by_user_id], [type], [reported_progress_percent], [evaluated_status], [comment], [review_status], [reviewed_by_user_id], [submitted_at], [reviewed_at], [review_comment], [created_at], [updated_at], [deleted_at], [workflow_instance_id])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[reported_progress_percent] = 100, target.[evaluated_status] = 'CONCLUDED', target.[review_status] = 'DRAFT', target.[reviewed_by_user_id] = NULL, target.[reviewed_at] = NULL, target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [action_plan_id], [submitted_by_user_id], [type], [reported_progress_percent], [evaluated_status], [comment], [review_status], [reviewed_by_user_id], [submitted_at], [reviewed_at], [review_comment], [created_at], [updated_at], [deleted_at], [workflow_instance_id]) VALUES (source.[id], source.[action_plan_id], source.[submitted_by_user_id], source.[type], source.[reported_progress_percent], source.[evaluated_status], source.[comment], source.[review_status], source.[reviewed_by_user_id], source.[submitted_at], source.[reviewed_at], source.[review_comment], source.[created_at], source.[updated_at], source.[deleted_at], source.[workflow_instance_id]);
`,
    [
      closureEvaluationId,
      uuidv5("qa-action-plan:3", SEED_NAMESPACE),
      options.demoUserIds.executorId,
      "Evaluación final preparada para la prueba de cierre.",
    ],
  );

  const evidenceRows = [
    {
      id: uuidv5("qa-evidence:action-plan", SEED_NAMESPACE),
      observationId: observations[1]!.id,
      observationAreaId: uuidv5(
        `qa-observation-area:2:${financeAreaId}`,
        SEED_NAMESPACE,
      ),
      actionPlanId: uuidv5("qa-action-plan:2", SEED_NAMESPACE),
      progressEvaluationId: null,
      context: "ACTION_PLAN",
      originalName: "evidencia-control-accesos.txt",
      storedName: "nibol-qa-control-accesos.txt",
      relativePath: "evidences/2026/09/nibol-qa-control-accesos.txt",
      description: "Evidencia inicial editable para el flujo QA.",
    },
    {
      id: uuidv5("qa-evidence:closure", SEED_NAMESPACE),
      observationId: observations[2]!.id,
      observationAreaId: uuidv5(
        `qa-observation-area:3:${financeAreaId}`,
        SEED_NAMESPACE,
      ),
      actionPlanId: uuidv5("qa-action-plan:3", SEED_NAMESPACE),
      progressEvaluationId: closureEvaluationId,
      context: "CLOSURE",
      originalName: "evidencia-cierre-control.txt",
      storedName: "nibol-qa-cierre-control.txt",
      relativePath: "evidences/2026/09/nibol-qa-cierre-control.txt",
      description: "Evidencia final para probar la ruta de cierre.",
    },
  ] as const;
  for (const evidence of evidenceRows) {
    const contents = Buffer.from(
      `NIBOL QA evidence\n${evidence.description}\nReport: NIBOL-QA-2026-001\n`,
    );
    const absolutePath = path.join(
      process.cwd(),
      "uploads",
      evidence.relativePath,
    );
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
    await executeSqlServer(
      connection,
      `
MERGE [dbo].[evidence_files] AS target
 USING (VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, 'text/plain', @P11, @P12, @P13, 'DRAFT', NULL, NULL, NULL, NULL, NULL, SYSUTCDATETIME(), NULL)) AS source ([id], [observation_id], [observation_area_id], [context], [action_plan_id], [progress_evaluation_id], [uploaded_by_user_id], [original_name], [stored_name], [relative_path], [mime_type], [size_bytes], [checksum], [description], [review_status], [submitted_at], [reviewed_at], [reviewed_by_user_id], [review_comment], [workflow_instance_id], [created_at], [deleted_at])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[original_name] = source.[original_name], target.[stored_name] = source.[stored_name], target.[relative_path] = source.[relative_path], target.[size_bytes] = source.[size_bytes], target.[checksum] = source.[checksum], target.[description] = source.[description], target.[review_status] = 'DRAFT', target.[submitted_at] = NULL, target.[reviewed_at] = NULL, target.[reviewed_by_user_id] = NULL, target.[review_comment] = NULL, target.[workflow_instance_id] = NULL, target.[deleted_at] = NULL
 WHEN NOT MATCHED THEN INSERT ([id], [observation_id], [observation_area_id], [context], [action_plan_id], [progress_evaluation_id], [uploaded_by_user_id], [original_name], [stored_name], [relative_path], [mime_type], [size_bytes], [checksum], [description], [review_status], [submitted_at], [reviewed_at], [reviewed_by_user_id], [review_comment], [workflow_instance_id], [created_at], [deleted_at]) VALUES (source.[id], source.[observation_id], source.[observation_area_id], source.[context], source.[action_plan_id], source.[progress_evaluation_id], source.[uploaded_by_user_id], source.[original_name], source.[stored_name], source.[relative_path], source.[mime_type], source.[size_bytes], source.[checksum], source.[description], source.[review_status], source.[submitted_at], source.[reviewed_at], source.[reviewed_by_user_id], source.[review_comment], source.[workflow_instance_id], source.[created_at], source.[deleted_at]);
`,
      [
        evidence.id,
        evidence.observationId,
        evidence.observationAreaId,
        evidence.context,
        evidence.actionPlanId,
        evidence.progressEvaluationId,
        options.demoUserIds.executorId,
        evidence.originalName,
        evidence.storedName,
        evidence.relativePath,
        contents.length,
        createHash("sha256").update(contents).digest("hex"),
        evidence.description,
      ],
    );
  }

  await executeSqlServer(
    connection,
    `
MERGE [dbo].[deadline_extension_requests] AS target
 USING (VALUES (@P1, 'ACTION_PLAN', NULL, @P2, @P3, @P4, @P5, '2026-08-15', '2026-08-30', 15, '2026-08-30', @P6, 'DRAFT', NULL, NULL, NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)) AS source ([id], [target_type], [observation_id], [action_plan_id], [observation_area_id], [requested_by_user_id], [classification_id], [previous_due_date], [proposed_due_date], [max_additional_days], [max_allowed_date], [reason], [status], [manager_reviewer_id], [manager_reviewed_at], [manager_comment], [final_approved_at], [created_at], [updated_at], [deleted_at], [workflow_instance_id])
 ON target.[action_plan_id] = source.[action_plan_id]
 WHEN MATCHED THEN UPDATE SET target.[requested_by_user_id] = source.[requested_by_user_id], target.[classification_id] = source.[classification_id], target.[previous_due_date] = source.[previous_due_date], target.[proposed_due_date] = source.[proposed_due_date], target.[max_additional_days] = source.[max_additional_days], target.[max_allowed_date] = source.[max_allowed_date], target.[reason] = source.[reason], target.[status] = 'DRAFT', target.[manager_reviewer_id] = NULL, target.[manager_reviewed_at] = NULL, target.[manager_comment] = NULL, target.[final_approved_at] = NULL, target.[deleted_at] = NULL, target.[workflow_instance_id] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [target_type], [observation_id], [action_plan_id], [observation_area_id], [requested_by_user_id], [classification_id], [previous_due_date], [proposed_due_date], [max_additional_days], [max_allowed_date], [reason], [status], [manager_reviewer_id], [manager_reviewed_at], [manager_comment], [final_approved_at], [created_at], [updated_at], [deleted_at], [workflow_instance_id]) VALUES (source.[id], source.[target_type], source.[observation_id], source.[action_plan_id], source.[observation_area_id], source.[requested_by_user_id], source.[classification_id], source.[previous_due_date], source.[proposed_due_date], source.[max_additional_days], source.[max_allowed_date], source.[reason], source.[status], source.[manager_reviewer_id], source.[manager_reviewed_at], source.[manager_comment], source.[final_approved_at], source.[created_at], source.[updated_at], source.[deleted_at], source.[workflow_instance_id]);
`,
    [
      uuidv5("qa-extension:action-plan-2", SEED_NAMESPACE),
      uuidv5("qa-action-plan:2", SEED_NAMESPACE),
      uuidv5(`qa-observation-area:2:${financeAreaId}`, SEED_NAMESPACE),
      options.demoUserIds.executorId,
      uuidv5("extension-classification:EXECUTION", SEED_NAMESPACE),
      "Se requiere una ventana adicional para completar pruebas y documentar controles.",
    ],
  );
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[deadline_extension_requests] AS target
 USING (VALUES (@P1, 'ACTION_PLAN', NULL, @P2, @P3, @P4, @P5, '2026-08-01', '2026-08-16', 15, '2026-08-16', @P6, 'MANAGER_APPROVED', @P7, '2026-09-08 12:00:00', @P8, '2026-09-08 12:00:00', SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)) AS source ([id], [target_type], [observation_id], [action_plan_id], [observation_area_id], [requested_by_user_id], [classification_id], [previous_due_date], [proposed_due_date], [max_additional_days], [max_allowed_date], [reason], [status], [manager_reviewer_id], [manager_reviewed_at], [manager_comment], [final_approved_at], [created_at], [updated_at], [deleted_at], [workflow_instance_id])
 ON target.[action_plan_id] = source.[action_plan_id]
 WHEN MATCHED THEN UPDATE SET target.[requested_by_user_id] = source.[requested_by_user_id], target.[classification_id] = source.[classification_id], target.[previous_due_date] = source.[previous_due_date], target.[proposed_due_date] = source.[proposed_due_date], target.[max_additional_days] = source.[max_additional_days], target.[max_allowed_date] = source.[max_allowed_date], target.[reason] = source.[reason], target.[status] = 'MANAGER_APPROVED', target.[manager_reviewer_id] = source.[manager_reviewer_id], target.[manager_reviewed_at] = source.[manager_reviewed_at], target.[manager_comment] = source.[manager_comment], target.[final_approved_at] = source.[final_approved_at], target.[deleted_at] = NULL, target.[workflow_instance_id] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [target_type], [observation_id], [action_plan_id], [observation_area_id], [requested_by_user_id], [classification_id], [previous_due_date], [proposed_due_date], [max_additional_days], [max_allowed_date], [reason], [status], [manager_reviewer_id], [manager_reviewed_at], [manager_comment], [final_approved_at], [created_at], [updated_at], [deleted_at], [workflow_instance_id]) VALUES (source.[id], source.[target_type], source.[observation_id], source.[action_plan_id], source.[observation_area_id], source.[requested_by_user_id], source.[classification_id], source.[previous_due_date], source.[proposed_due_date], source.[max_additional_days], source.[max_allowed_date], source.[reason], source.[status], source.[manager_reviewer_id], source.[manager_reviewed_at], source.[manager_comment], source.[final_approved_at], source.[created_at], source.[updated_at], source.[deleted_at], source.[workflow_instance_id]);
`,
    [
      uuidv5("qa-extension:action-plan-4", SEED_NAMESPACE),
      uuidv5("qa-action-plan:4", SEED_NAMESPACE),
      uuidv5(`qa-observation-area:2:${financeAreaId}`, SEED_NAMESPACE),
      options.demoUserIds.executorId,
      uuidv5("extension-classification:EXECUTION", SEED_NAMESPACE),
      "Ampliación aprobada para validar el escenario reprogramado y vencido.",
      options.demoUserIds.auditorId,
      "Aprobada para probar la fecha efectiva independiente del estado de avance.",
    ],
  );
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[deadline_extension_requests] AS target
 USING (VALUES (@P1, 'ACTION_PLAN', NULL, @P2, @P3, @P4, @P5, '2026-09-01', '2026-09-15', 30, '2026-09-15', @P6, 'MANAGER_APPROVED', @P7, '2026-09-08 12:00:00', @P8, '2026-09-08 12:00:00', SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL)) AS source ([id], [target_type], [observation_id], [action_plan_id], [observation_area_id], [requested_by_user_id], [classification_id], [previous_due_date], [proposed_due_date], [max_additional_days], [max_allowed_date], [reason], [status], [manager_reviewer_id], [manager_reviewed_at], [manager_comment], [final_approved_at], [created_at], [updated_at], [deleted_at], [workflow_instance_id])
 ON target.[action_plan_id] = source.[action_plan_id]
 WHEN MATCHED THEN UPDATE SET target.[requested_by_user_id] = source.[requested_by_user_id], target.[classification_id] = source.[classification_id], target.[previous_due_date] = source.[previous_due_date], target.[proposed_due_date] = source.[proposed_due_date], target.[max_additional_days] = source.[max_additional_days], target.[max_allowed_date] = source.[max_allowed_date], target.[reason] = source.[reason], target.[status] = 'MANAGER_APPROVED', target.[manager_reviewer_id] = source.[manager_reviewer_id], target.[manager_reviewed_at] = source.[manager_reviewed_at], target.[manager_comment] = source.[manager_comment], target.[final_approved_at] = source.[final_approved_at], target.[deleted_at] = NULL, target.[workflow_instance_id] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [target_type], [observation_id], [action_plan_id], [observation_area_id], [requested_by_user_id], [classification_id], [previous_due_date], [proposed_due_date], [max_additional_days], [max_allowed_date], [reason], [status], [manager_reviewer_id], [manager_reviewed_at], [manager_comment], [final_approved_at], [created_at], [updated_at], [deleted_at], [workflow_instance_id]) VALUES (source.[id], source.[target_type], source.[observation_id], source.[action_plan_id], source.[observation_area_id], source.[requested_by_user_id], source.[classification_id], source.[previous_due_date], source.[proposed_due_date], source.[max_additional_days], source.[max_allowed_date], source.[reason], source.[status], source.[manager_reviewer_id], source.[manager_reviewed_at], source.[manager_comment], source.[final_approved_at], source.[created_at], source.[updated_at], source.[deleted_at], source.[workflow_instance_id]);
`,
    [
      uuidv5("qa-extension:action-plan-5", SEED_NAMESPACE),
      uuidv5("qa-action-plan:5", SEED_NAMESPACE),
      uuidv5(`qa-observation-area:1:${operationsAreaId}`, SEED_NAMESPACE),
      options.demoUserIds.executorId,
      uuidv5("extension-classification:EXECUTION", SEED_NAMESPACE),
      "Ampliación aprobada para validar el escenario reprogramado y vigente.",
      options.demoUserIds.auditorId,
      "Aprobada para probar una fecha efectiva futura.",
    ],
  );
  await executeSqlServer(
    connection,
    `
MERGE [dbo].[observation_comments] AS target
 USING (VALUES (@P1, @P2, NULL, @P3, NULL, @P4, 'AREA_VISIBLE', @P5, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL)) AS source ([id], [observation_id], [remediation_plan_id], [action_plan_id], [progress_evaluation_id], [author_user_id], [visibility], [body], [created_at], [updated_at], [deleted_at])
 ON target.[id] = source.[id]
 WHEN MATCHED THEN UPDATE SET target.[body] = source.[body], target.[author_user_id] = source.[author_user_id], target.[deleted_at] = NULL, target.[updated_at] = SYSUTCDATETIME()
 WHEN NOT MATCHED THEN INSERT ([id], [observation_id], [remediation_plan_id], [action_plan_id], [progress_evaluation_id], [author_user_id], [visibility], [body], [created_at], [updated_at], [deleted_at]) VALUES (source.[id], source.[observation_id], source.[remediation_plan_id], source.[action_plan_id], source.[progress_evaluation_id], source.[author_user_id], source.[visibility], source.[body], source.[created_at], source.[updated_at], source.[deleted_at]);
`,
    [
      uuidv5("qa-comment:action-plan-2", SEED_NAMESPACE),
      observations[1]!.id,
      uuidv5("qa-action-plan:2", SEED_NAMESPACE),
      options.demoUserIds.executorId,
      "Comentario de ejecución para verificar el historial colaborativo.",
    ],
  );
  return observations.length;
};

const main = async (): Promise<void> => {
  try {
    if (includeDemo && process.env.NODE_ENV === "production") {
      throw new Error("Demo data may only be seeded outside production.");
    }

    const summary = await prisma.$transaction(
      async (connection) => {
        await assertTablesExist(connection);
        await seedRoles(connection);
        await seedPermissions(connection);
        await seedRiskLevels(connection);
        await seedExtensionClassifications(connection);
        await seedObservationStatuses(connection);
        await seedSystemParameters(connection);
        await seedCatalogs(connection);

        const roleMap = await getRoleMap(connection);
        const permissionMap = await getPermissionMap(connection);
        const riskLevelMap = await getRiskLevelMap(connection);
        const statusMap = await getObservationStatusMap(connection);

        await syncRolePermissions(connection, roleMap, permissionMap);

        const seededAdmins: Array<{ email: string; userId: string }> = [];

        for (const adminSeed of adminSeeds) {
          const adminUserId = await seedAdminUser(connection, adminSeed);
          await seedAdminAccount(connection, adminUserId, adminSeed);
          await seedAdminUserRole(connection, adminUserId, roleMap);
          seededAdmins.push({
            email: adminSeed.email,
            userId: adminUserId,
          });
        }

        const primaryAdminUserId =
          seededAdmins.find((admin) => admin.email === primaryAdminSeed.email)
            ?.userId ?? seededAdmins[0]?.userId;

        if (!primaryAdminUserId) {
          throw new Error("No admin users were seeded.");
        }

        const demoUserIds = includeDemo
          ? await seedDemoUsers(connection, roleMap)
          : null;
        await seedDefaultSettings(connection);
        await seedAreas(connection, primaryAdminUserId);

        const areaMap = await getAreaMap(connection);
        const seededWorkflows = await seedCanonicalWorkflows(
          connection,
          roleMap,
          primaryAdminUserId,
        );
        const seededObservations = demoUserIds
          ? await seedSampleObservationsIfEmpty(connection, {
              adminUserId: primaryAdminUserId,
              areaMap,
              demoUserIds,
              riskLevelMap,
              statusMap,
            })
          : 0;
        const seededQaObservations = demoUserIds
          ? await seedCanonicalQaFixture(connection, {
              adminUserId: primaryAdminUserId,
              areaMap,
              demoUserIds,
              riskLevelMap,
              statusMap,
            })
          : 0;

        return {
          roles: roles.length,
          permissions: permissions.length,
          rolePermissions: permissions.length,
          adminUsers: seededAdmins.length,
          demoUsers: demoUserIds ? Object.keys(demoUserIds).length : 0,
          adminEmails: seededAdmins.map((admin) => admin.email),
          accounts: seededAdmins.length,
          userRoles: seededAdmins.length,
          settings: 1,
          riskLevels: riskLevels.length,
          observationStatuses: observationStatuses.length,
          areas: areas.length,
          systemParameters: systemParameters.length,
          catalogs: catalogs.length,
          publishedWorkflows: seededWorkflows,
          canonicalQaObservations: seededQaObservations,
          sampleAuditReports: 2,
          sampleObservations: seededObservations,
        };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    console.info("Database seed completed.");
    console.info(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  console.error("Database seed failed.");
  console.error(error);
  process.exitCode = 1;
});
