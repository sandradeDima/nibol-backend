import "dotenv/config";

import bcrypt from "bcryptjs";
import { createConnection, type RowDataPacket } from "mysql2/promise";
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
  buildPermissionName,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from "../src/permissions/definitions.js";

const permissionResources = [...PERMISSION_RESOURCES];
const permissionActions = [...PERMISSION_ACTIONS];

const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SEED_APP_NAME: z.string().min(1).default("SaaS Base Project"),
  SEED_SUPPORT_EMAIL: z.email().default("support@example.com"),
  SEED_TIMEZONE: z.string().min(1).default("UTC"),
  SEED_DATE_FORMAT: z.string().min(1).default("YYYY-MM-DD"),
  SEED_SENDER_NAME: z.string().min(1).default("SaaS Base Project"),
  SEED_SENDER_EMAIL: z.email().default("no-reply@example.com"),
  SEED_PRIMARY_COLOR: z.string().min(1).default("#1f2937"),
  SEED_LOGO: z.string().optional(),
});

const env = seedEnvSchema.parse(process.env);
const adminSeeds = resolveAdminSeedConfigs(process.env);
const primaryAdminSeed = getPrimaryAdminSeed(adminSeeds);

type SeedRole = {
  key: "admin" | "non_admin";
  name: "Admin" | "Non Admin";
  description: string;
};

type SeedPermission = {
  key: string;
  name: string;
  description: string;
};

type SeedRiskLevelKey = "CRITICO" | "ALTO" | "MEDIO" | "BAJO";
type SeedObservationStatusKey =
  | "PENDIENTE"
  | "EN_PROCESO"
  | "EN_REVISION"
  | "CERRADA"
  | "VENCIDA"
  | "RECHAZADA";
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
  | "categoria_hallazgo";

type SeedRiskLevel = {
  colorToken: string | null;
  defaultDeadlineDays: number | null;
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
  code: string | null;
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

const roles: SeedRole[] = [
  {
    key: "admin",
    name: "Admin",
    description: "Full access to the application.",
  },
  {
    key: "non_admin",
    name: "Non Admin",
    description: "Limited access role for standard users.",
  },
];

const riskLevels: SeedRiskLevel[] = [
  {
    colorToken: "critical",
    defaultDeadlineDays: 15,
    description: "Observaciones con impacto severo y atención inmediata.",
    key: "CRITICO",
    name: "Crítico",
    severityOrder: 1,
  },
  {
    colorToken: "high",
    defaultDeadlineDays: 30,
    description: "Observaciones de alta prioridad con impacto material.",
    key: "ALTO",
    name: "Alto",
    severityOrder: 2,
  },
  {
    colorToken: "medium",
    defaultDeadlineDays: 60,
    description: "Observaciones relevantes con seguimiento programado.",
    key: "MEDIO",
    name: "Medio",
    severityOrder: 3,
  },
  {
    colorToken: "low",
    defaultDeadlineDays: 90,
    description: "Observaciones de menor criticidad y ejecución gradual.",
    key: "BAJO",
    name: "Bajo",
    severityOrder: 4,
  },
];

const observationStatuses: SeedObservationStatus[] = [
  {
    countsAsOverdue: false,
    description: "Estado inicial para observaciones recién registradas.",
    isFinal: false,
    isInitial: true,
    key: "PENDIENTE",
    name: "Pendiente",
    sortOrder: 10,
  },
  {
    countsAsOverdue: false,
    description: "La observación está siendo atendida por el área responsable.",
    isFinal: false,
    isInitial: false,
    key: "EN_PROCESO",
    name: "En proceso",
    sortOrder: 20,
  },
  {
    countsAsOverdue: false,
    description: "La observación cuenta con evidencia en revisión.",
    isFinal: false,
    isInitial: false,
    key: "EN_REVISION",
    name: "En revisión",
    sortOrder: 30,
  },
  {
    countsAsOverdue: false,
    description: "La observación fue cerrada y validada.",
    isFinal: true,
    isInitial: false,
    key: "CERRADA",
    name: "Cerrada",
    sortOrder: 40,
  },
  {
    countsAsOverdue: true,
    description: "La observación excedió la fecha límite comprometida.",
    isFinal: false,
    isInitial: false,
    key: "VENCIDA",
    name: "Vencida",
    sortOrder: 50,
  },
  {
    countsAsOverdue: false,
    description: "La remediación fue rechazada y requiere ajustes.",
    isFinal: true,
    isInitial: false,
    key: "RECHAZADA",
    name: "Rechazada",
    sortOrder: 60,
  },
];

const areas: SeedArea[] = [
  {
    code: "TI",
    description: "Gobierno y operación de plataformas, accesos e infraestructura.",
    key: "technology",
    name: "Tecnología de la Información",
  },
  {
    code: "OPER",
    description: "Ejecución operativa, control diario y continuidad del servicio.",
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

const systemParameters: SeedSystemParameter[] = [
  {
    active: true,
    description: "Días de anticipación para enviar recordatorios antes del vencimiento.",
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
    description: "Repite los recordatorios de vencimiento cada cierta cantidad de días.",
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
    description: "Horas de antigüedad para recordar avances enviados a Auditoría.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "pending_review_reminder_hours",
    name: "Horas para revisión pendiente",
    value: "48",
    valueType: "number",
  },
  {
    active: true,
    description: "Horas de antigüedad para recordar aprobaciones de ampliación.",
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
    description: "Permite actualizar automáticamente el estado a vencido cuando el catálogo lo soporta.",
    editable: true,
    group: "notificaciones_automaticas",
    key: "overdue_status_auto_update_enabled",
    name: "Actualización automática de estado vencido",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description: "Prefijo base para la numeración operativa de observaciones.",
    editable: true,
    group: "observaciones",
    key: "default_observation_prefix",
    name: "Prefijo por defecto de observaciones",
    value: "OBS",
    valueType: "string",
  },
  {
    active: true,
    description: "Tamaño máximo permitido para archivos de evidencia en megabytes.",
    editable: true,
    group: "evidencias",
    key: "evidence_max_file_size_mb",
    name: "Tamaño máximo de evidencia",
    value: "10",
    valueType: "number",
  },
  {
    active: true,
    description: "Permite solicitar prórrogas sobre la fecha límite de la observación.",
    editable: true,
    group: "seguimiento",
    key: "allow_deadline_extension",
    name: "Permitir ampliación de plazo",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description: "Requiere aprobación de gerencia para ampliar una fecha límite.",
    editable: true,
    group: "seguimiento",
    key: "extension_requires_manager_approval",
    name: "Ampliación requiere aprobación de gerencia",
    value: "true",
    valueType: "boolean",
  },
  {
    active: true,
    description: "Requiere aprobación de auditoría para ampliar una fecha límite.",
    editable: true,
    group: "seguimiento",
    key: "extension_requires_audit_approval",
    name: "Ampliación requiere aprobación de auditoría",
    value: "true",
    valueType: "boolean",
  },
];

const catalogs: SeedCatalog[] = [
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

const permissions: SeedPermission[] = permissionResources.flatMap((resource) =>
  permissionActions.map((action) => ({
    key: `${resource}:${action}`,
    name: buildPermissionName(resource, action),
    description: `${resource} ${action} permission.`,
  })),
);

const ids = {
  settings: uuidv5("settings:default", SEED_NAMESPACE),
};

const roleIdByKey = new Map(
  roles.map((role) => [role.key, uuidv5(`role:${role.key}`, SEED_NAMESPACE)]),
);

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
  "observation_area_assignments",
] as const;

type NamedIdRow = RowDataPacket & {
  id: string;
  name: string;
};

type AreaRow = RowDataPacket & {
  id: string;
  name: string;
};

type CountRow = RowDataPacket & {
  total: number;
};

type RiskLevelRow = RowDataPacket & {
  id: string;
  name: string;
};

type ObservationStatusRow = RowDataPacket & {
  id: string;
  key: string;
};

type UserRow = RowDataPacket & {
  id: string;
};

const placeholders = (length: number): string => {
  return Array.from({ length }, () => "?").join(", ");
};

const toMysqlDateTime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO datetime value provided to seed: ${value}`);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const assertTablesExist = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  const [rows] = await connection.query<RowDataPacket[]>("SHOW TABLES");
  const availableTables = new Set(
    rows.flatMap((row) => Object.values(row).map((value) => String(value))),
  );

  const missingTables = requiredTables.filter((table) => !availableTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(
      `Missing required tables: ${missingTables.join(", ")}. Run migrations before seeding.`,
    );
  }
};

const seedRoles = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  for (const role of roles) {
    await connection.execute(
      `
        INSERT INTO roles (id, name, description, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          description = VALUES(description),
          deleted_at = NULL,
          updated_at = NOW(3)
      `,
      [roleIdByKey.get(role.key), role.name, role.description],
    );
  }
};

const seedPermissions = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  for (const permission of permissions) {
    await connection.execute(
      `
        INSERT INTO permissions (id, name, description, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          description = VALUES(description),
          deleted_at = NULL,
          updated_at = NOW(3)
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
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  for (const riskLevel of riskLevels) {
    await connection.execute(
      `
        INSERT INTO risk_levels (
          id,
          name,
          \`key\`,
          description,
          color_token,
          severity_order,
          default_deadline_days,
          active,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          \`key\` = VALUES(\`key\`),
          description = VALUES(description),
          color_token = VALUES(color_token),
          severity_order = VALUES(severity_order),
          default_deadline_days = VALUES(default_deadline_days),
          active = VALUES(active),
          deleted_at = NULL,
          updated_at = NOW(3)
      `,
      [
        uuidv5(`risk-level:${riskLevel.key}`, SEED_NAMESPACE),
        riskLevel.name,
        riskLevel.key,
        riskLevel.description,
        riskLevel.colorToken,
        riskLevel.severityOrder,
        riskLevel.defaultDeadlineDays,
      ],
    );
  }
};

const seedObservationStatuses = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  for (const status of observationStatuses) {
    await connection.execute(
      `
        INSERT INTO observation_statuses (
          id,
          name,
          \`key\`,
          description,
          sort_order,
          is_initial,
          is_final,
          counts_as_overdue,
          active,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          \`key\` = VALUES(\`key\`),
          description = VALUES(description),
          sort_order = VALUES(sort_order),
          is_initial = VALUES(is_initial),
          is_final = VALUES(is_final),
          counts_as_overdue = VALUES(counts_as_overdue),
          active = VALUES(active),
          deleted_at = NULL,
          updated_at = NOW(3)
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
  connection: Awaited<ReturnType<typeof createConnection>>,
  managerUserId: string,
): Promise<void> => {
  for (const area of areas) {
    await connection.execute(
      `
        INSERT INTO areas (
          id,
          name,
          code,
          description,
          manager_user_id,
          active,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, true, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          code = VALUES(code),
          description = VALUES(description),
          manager_user_id = VALUES(manager_user_id),
          active = VALUES(active),
          deleted_at = NULL,
          updated_at = NOW(3)
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
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  for (const parameter of systemParameters) {
    await connection.execute(
      `
        INSERT INTO system_parameters (
          id,
          \`key\`,
          name,
          value,
          value_type,
          group_name,
          description,
          editable,
          active,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          value = VALUES(value),
          value_type = VALUES(value_type),
          group_name = VALUES(group_name),
          description = VALUES(description),
          editable = VALUES(editable),
          active = VALUES(active),
          deleted_at = NULL,
          updated_at = NOW(3)
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
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  for (const catalog of catalogs) {
    await connection.execute(
      `
        INSERT INTO catalogs (
          id,
          type,
          name,
          \`key\`,
          description,
          active,
          sort_order,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          active = VALUES(active),
          sort_order = VALUES(sort_order),
          deleted_at = NULL,
          updated_at = NOW(3)
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
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<Map<string, string>> => {
  const [rows] = await connection.execute<NamedIdRow[]>(
    `
      SELECT id, name
      FROM roles
      WHERE name IN (${placeholders(roles.length)})
    `,
    roles.map((role) => role.name),
  );

  return new Map(rows.map((row) => [row.name, row.id]));
};

const getAreaMap = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<Map<SeedAreaKey, string>> => {
  const [rows] = await connection.execute<AreaRow[]>(
    `
      SELECT id, name
      FROM areas
      WHERE name IN (${placeholders(areas.length)})
    `,
    areas.map((area) => area.name),
  );

  const idByName = new Map(rows.map((row) => [row.name, row.id]));

  return new Map(
    areas.map((area) => {
      const areaId = idByName.get(area.name);

      if (!areaId) {
        throw new Error(`Area ${area.name} not found after seeding.`);
      }

      return [area.key, areaId];
    }),
  );
};

const getRiskLevelMap = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<Map<SeedRiskLevelKey, string>> => {
  const [rows] = await connection.execute<RiskLevelRow[]>(
    `
      SELECT id, name
      FROM risk_levels
      WHERE name IN (${placeholders(riskLevels.length)})
    `,
    riskLevels.map((riskLevel) => riskLevel.name),
  );

  const idByName = new Map(rows.map((row) => [row.name, row.id]));

  return new Map(
    riskLevels.map((riskLevel) => {
      const riskLevelId = idByName.get(riskLevel.name);

      if (!riskLevelId) {
        throw new Error(`Risk level ${riskLevel.name} not found after seeding.`);
      }

      return [riskLevel.key, riskLevelId];
    }),
  );
};

const getObservationStatusMap = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<Map<SeedObservationStatusKey, string>> => {
  const [rows] = await connection.execute<ObservationStatusRow[]>(
    `
      SELECT id, \`key\`
      FROM observation_statuses
      WHERE \`key\` IN (${placeholders(observationStatuses.length)})
    `,
    observationStatuses.map((status) => status.key),
  );

  const idByKey = new Map(rows.map((row) => [row.key, row.id]));

  return new Map(
    observationStatuses.map((status) => {
      const statusId = idByKey.get(status.key);

      if (!statusId) {
        throw new Error(`Observation status ${status.key} not found after seeding.`);
      }

      return [status.key, statusId];
    }),
  );
};

const getPermissionMap = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<Map<string, string>> => {
  const [rows] = await connection.execute<NamedIdRow[]>(
    `
      SELECT id, name
      FROM permissions
      WHERE name IN (${placeholders(permissions.length)})
    `,
    permissions.map((permission) => permission.name),
  );

  return new Map(rows.map((row) => [row.name, row.id]));
};

const seedAdminRolePermissions = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
  roleMap: Map<string, string>,
  permissionMap: Map<string, string>,
): Promise<void> => {
  const adminRoleId = roleMap.get("Admin");

  if (!adminRoleId) {
    throw new Error("Admin role not found after role seeding.");
  }

  for (const permission of permissions) {
    const permissionId = permissionMap.get(permission.name);

    if (!permissionId) {
      throw new Error(`Permission ${permission.name} not found after seeding.`);
    }

    await connection.execute(
      `
        INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at)
        VALUES (?, ?, ?, NOW(3), NOW(3))
        ON DUPLICATE KEY UPDATE
          updated_at = NOW(3)
      `,
      [uuidv5(`role-permission:${adminRoleId}:${permissionId}`, SEED_NAMESPACE), adminRoleId, permissionId],
    );
  }
};

const seedAdminUser = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
  adminSeed: AdminSeedConfig,
): Promise<string> => {
  const passwordHash = await bcrypt.hash(adminSeed.password, 12);
  const adminIds = getAdminSeedIds(adminSeed);

  await connection.execute(
    `
      INSERT INTO users (
        id,
        name,
        email,
        password,
        avatar,
        is_active,
        email_verified,
        last_login_at,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (?, ?, ?, ?, NULL, true, true, NULL, NOW(3), NOW(3), NULL)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        email = VALUES(email),
        password = VALUES(password),
        avatar = VALUES(avatar),
        is_active = VALUES(is_active),
        email_verified = VALUES(email_verified),
        deleted_at = NULL,
        updated_at = NOW(3)
    `,
    [adminIds.userId, adminSeed.name, adminSeed.email, passwordHash],
  );

  const [rows] = await connection.execute<UserRow[]>(
    `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
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
  connection: Awaited<ReturnType<typeof createConnection>>,
  adminUserId: string,
  roleMap: Map<string, string>,
): Promise<void> => {
  const adminRoleId = roleMap.get("Admin");

  if (!adminRoleId) {
    throw new Error("Admin role not found before assigning user role.");
  }

  await connection.execute(
    `
      INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
      VALUES (?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        updated_at = NOW(3)
    `,
    [uuidv5(`user-role:${adminUserId}:${adminRoleId}`, SEED_NAMESPACE), adminUserId, adminRoleId],
  );
};

const seedAdminAccount = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
  adminUserId: string,
  adminSeed: AdminSeedConfig,
): Promise<void> => {
  const passwordHash = await bcrypt.hash(adminSeed.password, 12);
  const adminIds = getAdminSeedIds(adminSeed);

  await connection.execute(
    `
      INSERT INTO accounts (
        id,
        account_id,
        provider_id,
        user_id,
        access_token,
        refresh_token,
        id_token,
        access_token_expires_at,
        refresh_token_expires_at,
        scope,
        password,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'credential', ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        password = VALUES(password),
        updated_at = NOW(3)
    `,
    [adminIds.accountId, adminUserId, adminUserId, passwordHash],
  );
};

const seedDefaultSettings = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<void> => {
  await connection.execute(
    `
      INSERT INTO settings (
        id,
        app_name,
        logo,
        primary_color,
        support_email,
        timezone,
        date_format,
        sender_name,
        sender_email,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), NULL)
      ON DUPLICATE KEY UPDATE
        app_name = VALUES(app_name),
        logo = VALUES(logo),
        primary_color = VALUES(primary_color),
        support_email = VALUES(support_email),
        timezone = VALUES(timezone),
        date_format = VALUES(date_format),
        sender_name = VALUES(sender_name),
        sender_email = VALUES(sender_email),
        deleted_at = NULL,
        updated_at = NOW(3)
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
  connection: Awaited<ReturnType<typeof createConnection>>,
  options: {
    adminUserId: string;
    areaMap: Map<SeedAreaKey, string>;
    riskLevelMap: Map<SeedRiskLevelKey, string>;
    statusMap: Map<SeedObservationStatusKey, string>;
  },
): Promise<number> => {
  const [countRows] = await connection.execute<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM observations
      WHERE deleted_at IS NULL
    `,
  );

  if ((countRows[0]?.total ?? 0) > 0) {
    return 0;
  }

  const sampleObservations = [
    {
      additionalAreaKeys: ["operations"] as const,
      auditRecommendation:
        "Formalizar la segregación de funciones privilegiadas y evidenciar revisiones mensuales de accesos.",
      category: "Controles de TI",
      code: "OBS-2026-001",
      currentStage: "Registro inicial",
      description:
        "Se identificó uso compartido de credenciales administrativas en servidores críticos sin trazabilidad individual.",
      detectedAt: "2026-06-10T09:00:00.000Z",
      dueDate: "2026-07-15T23:59:59.000Z",
      observationType: "Hallazgo",
      primaryAreaKey: "technology" as const,
      process: "Gestión de accesos",
      progressPercent: 10,
      responsibleUserId: options.adminUserId,
      riskLevelKey: "CRITICO" as const,
      roleInFinding: "Área de apoyo",
      source: "Auditoría interna",
      statusKey: "PENDIENTE" as const,
      title: "Segregación insuficiente de accesos privilegiados",
    },
    {
      additionalAreaKeys: ["commercial"] as const,
      auditRecommendation:
        "Diseñar un calendario de conciliaciones con responsables definidos y seguimiento semanal hasta su cierre.",
      category: "Control financiero",
      code: "OBS-2026-002",
      currentStage: "Plan de acción aprobado",
      description:
        "Se observaron conciliaciones bancarias pendientes en dos cuentas operativas con más de 30 días de rezago.",
      detectedAt: "2026-05-22T10:30:00.000Z",
      dueDate: "2026-07-28T23:59:59.000Z",
      observationType: "Hallazgo",
      primaryAreaKey: "finance" as const,
      process: "Tesorería",
      progressPercent: 45,
      responsibleUserId: options.adminUserId,
      riskLevelKey: "ALTO" as const,
      roleInFinding: "Área impactada",
      source: "Revisión corporativa",
      statusKey: "EN_PROCESO" as const,
      title: "Conciliaciones bancarias fuera de plazo",
    },
    {
      additionalAreaKeys: ["technology"] as const,
      auditRecommendation:
        "Actualizar la matriz de inventario y establecer validaciones cruzadas entre almacenes y sistema transaccional.",
      category: "Inventarios",
      code: "OBS-2026-003",
      currentStage: "Validación de evidencia",
      description:
        "El conteo selectivo de inventarios mostró diferencias entre existencia física y sistema en materiales de alta rotación.",
      detectedAt: "2026-05-30T08:15:00.000Z",
      dueDate: "2026-07-08T23:59:59.000Z",
      observationType: "Hallazgo",
      primaryAreaKey: "warehouse" as const,
      process: "Control de inventarios",
      progressPercent: 70,
      responsibleUserId: null,
      riskLevelKey: "MEDIO" as const,
      roleInFinding: "Área de soporte sistémico",
      source: "Auditoría de procesos",
      statusKey: "EN_REVISION" as const,
      title: "Diferencias de inventario sin conciliación documentada",
    },
    {
      additionalAreaKeys: ["finance"] as const,
      auditRecommendation:
        "Mantener la política documentada y anexar evidencia periódica de aprobación para preservar el control.",
      category: "Gobierno comercial",
      code: "OBS-2026-004",
      currentStage: "Cierre validado",
      description:
        "Se encontró falta de respaldo formal en descuentos extraordinarios aplicados durante campañas comerciales del trimestre anterior.",
      detectedAt: "2026-04-11T14:00:00.000Z",
      dueDate: "2026-06-20T23:59:59.000Z",
      observationType: "Hallazgo",
      primaryAreaKey: "commercial" as const,
      process: "Aprobación de descuentos",
      progressPercent: 100,
      responsibleUserId: options.adminUserId,
      riskLevelKey: "BAJO" as const,
      roleInFinding: "Área revisora",
      source: "Seguimiento de cierre",
      statusKey: "CERRADA" as const,
      title: "Respaldo incompleto de descuentos excepcionales",
    },
    {
      additionalAreaKeys: ["finance", "operations"] as const,
      auditRecommendation:
        "Reformular el plan de remediación con hitos semanales y escalar el incumplimiento al comité de control interno.",
      category: "Cumplimiento operativo",
      code: "OBS-2026-005",
      currentStage: "Compromiso vencido",
      description:
        "Persisten debilidades en la documentación de cierres operativos diarios y no se completó el plan comprometido.",
      detectedAt: "2026-05-05T11:20:00.000Z",
      dueDate: "2026-06-15T23:59:59.000Z",
      observationType: "Hallazgo",
      primaryAreaKey: "operations" as const,
      process: "Cierre operativo diario",
      progressPercent: 45,
      responsibleUserId: options.adminUserId,
      riskLevelKey: "ALTO" as const,
      roleInFinding: "Área co-responsable",
      source: "Comité de riesgos",
      statusKey: "VENCIDA" as const,
      title: "Plan de remediación operativo vencido sin cierre",
    },
  ];

  for (const sample of sampleObservations) {
    const observationId = uuidv5(`observation:${sample.code}`, SEED_NAMESPACE);
    const riskLevelId = options.riskLevelMap.get(sample.riskLevelKey);
    const statusId = options.statusMap.get(sample.statusKey);
    const primaryAreaId = options.areaMap.get(sample.primaryAreaKey);

    if (!riskLevelId || !statusId || !primaryAreaId) {
      throw new Error(`Missing catalog references while seeding ${sample.code}.`);
    }

    await connection.execute(
      `
        INSERT INTO observations (
          id,
          code,
          title,
          description,
          audit_recommendation,
          risk_level_id,
          status_id,
          area_id,
          responsible_user_id,
          auditor_user_id,
          due_date,
          detected_at,
          observation_type,
          source,
          process_name,
          category,
          progress_percent,
          current_stage,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), NULL)
      `,
      [
        observationId,
        sample.code,
        sample.title,
        sample.description,
        sample.auditRecommendation,
        riskLevelId,
        statusId,
        primaryAreaId,
        sample.responsibleUserId,
        options.adminUserId,
        toMysqlDateTime(sample.dueDate),
        toMysqlDateTime(sample.detectedAt),
        sample.observationType,
        sample.source,
        sample.process,
        sample.category,
        sample.progressPercent,
        sample.currentStage,
      ],
    );

    for (const areaKey of sample.additionalAreaKeys) {
      const areaId = options.areaMap.get(areaKey);

      if (!areaId || areaId === primaryAreaId) {
        continue;
      }

      await connection.execute(
        `
          INSERT INTO observation_area_assignments (
            id,
            observation_id,
            area_id,
            responsible_user_id,
            role_in_finding,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
        `,
        [
          uuidv5(`observation-area:${sample.code}:${areaKey}`, SEED_NAMESPACE),
          observationId,
          areaId,
          sample.responsibleUserId,
          sample.roleInFinding,
        ],
      );
    }
  }

  return sampleObservations.length;
};

const main = async (): Promise<void> => {
  const connection = await createConnection(env.DATABASE_URL);

  try {
    await assertTablesExist(connection);
    await connection.beginTransaction();

    await seedRoles(connection);
    await seedPermissions(connection);
    await seedRiskLevels(connection);
    await seedObservationStatuses(connection);
    await seedSystemParameters(connection);
    await seedCatalogs(connection);

    const roleMap = await getRoleMap(connection);
    const permissionMap = await getPermissionMap(connection);
    const riskLevelMap = await getRiskLevelMap(connection);
    const statusMap = await getObservationStatusMap(connection);

    await seedAdminRolePermissions(connection, roleMap, permissionMap);

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
      seededAdmins.find((admin) => admin.email === primaryAdminSeed.email)?.userId ??
      seededAdmins[0]?.userId;

    if (!primaryAdminUserId) {
      throw new Error("No admin users were seeded.");
    }

    await seedDefaultSettings(connection);
    await seedAreas(connection, primaryAdminUserId);

    const areaMap = await getAreaMap(connection);
    const seededObservations = await seedSampleObservationsIfEmpty(connection, {
      adminUserId: primaryAdminUserId,
      areaMap,
      riskLevelMap,
      statusMap,
    });

    await connection.commit();

    console.info("Database seed completed.");
    console.info(
      JSON.stringify(
        {
          roles: roles.length,
          permissions: permissions.length,
          rolePermissions: permissions.length,
          adminUsers: seededAdmins.length,
          adminEmails: seededAdmins.map((admin) => admin.email),
          accounts: seededAdmins.length,
          userRoles: seededAdmins.length,
          settings: 1,
          riskLevels: riskLevels.length,
          observationStatuses: observationStatuses.length,
          areas: areas.length,
          systemParameters: systemParameters.length,
          catalogs: catalogs.length,
          sampleObservations: seededObservations,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
};

void main().catch((error: unknown) => {
  console.error("Database seed failed.");
  console.error(error);
  process.exit(1);
});
