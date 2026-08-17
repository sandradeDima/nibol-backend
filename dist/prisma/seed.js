import "dotenv/config";
import bcrypt from "bcryptjs";
import { createConnection } from "mysql2/promise";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";
import { getAdminSeedIds, getPrimaryAdminSeed, resolveAdminSeedConfigs, SEED_NAMESPACE, } from "./admin-seed-config.js";
import { AUDIT_REPORT_PERMISSION_NAMES, AUDIT_WORKFLOW_PERMISSION_NAMES, ALL_PERMISSION_NAMES, REPORT_PERMISSION_NAMES, } from "../src/permissions/definitions.js";
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
const roles = [
    {
        key: "admin",
        name: "Admin",
        description: "Full access to the application.",
    },
    {
        key: "auditoria",
        name: "Auditoría",
        description: "Revisión y seguimiento de workflows y procesos de auditoría.",
    },
    {
        key: "non_admin",
        name: "Non Admin",
        description: "Limited access role for standard users.",
    },
];
const riskLevels = [
    {
        colorToken: "high",
        defaultDeadlineDays: 90,
        description: "Observaciones de alta prioridad con impacto material.",
        key: "ALTO",
        name: "Alto",
        severityOrder: 1,
    },
    {
        colorToken: "medium",
        defaultDeadlineDays: 120,
        description: "Observaciones relevantes con seguimiento programado.",
        key: "MEDIO",
        name: "Medio",
        severityOrder: 2,
    },
    {
        colorToken: "low",
        defaultDeadlineDays: 180,
        description: "Observaciones de menor criticidad y ejecución gradual.",
        key: "BAJO",
        name: "Bajo",
        severityOrder: 3,
    },
];
const observationStatuses = [
    {
        countsAsOverdue: false,
        description: "Estado inicial para observaciones recién registradas.",
        isFinal: false,
        isInitial: true,
        key: "NO_INICIADO",
        name: "No iniciado",
        sortOrder: 10,
    },
    {
        countsAsOverdue: false,
        description: "La observación está siendo atendida por el área responsable.",
        isFinal: false,
        isInitial: false,
        key: "INICIADO",
        name: "Iniciado",
        sortOrder: 20,
    },
    {
        countsAsOverdue: false,
        description: "Uno o más planes de acción tienen avance aprobado.",
        isFinal: false,
        isInitial: false,
        key: "CON_AVANCE",
        name: "Con avance",
        sortOrder: 30,
    },
    {
        countsAsOverdue: false,
        description: "La observación fue cerrada y validada.",
        isFinal: true,
        isInitial: false,
        key: "CONCLUIDO",
        name: "Concluido",
        sortOrder: 40,
    },
];
const areas = [
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
const demoUsers = [
    {
        email: "owner.finanzas@nibol.demo",
        jobTitle: "Gerente de Finanzas",
        name: "Ana Dueña Finanzas",
    },
    {
        email: "responsable.finanzas@nibol.demo",
        jobTitle: "Jefe de Tesorería",
        name: "Bruno Responsable Finanzas",
    },
    {
        email: "owner.tecnologia@nibol.demo",
        jobTitle: "Gerente de Tecnología",
        name: "Carla Dueña Tecnología",
    },
    {
        email: "responsable.tecnologia@nibol.demo",
        jobTitle: "Jefe de Seguridad",
        name: "Diego Responsable Tecnología",
    },
    {
        email: "owner.operaciones@nibol.demo",
        jobTitle: "Gerente de Operaciones",
        name: "Elena Dueña Operaciones",
    },
    {
        email: "responsable.operaciones@nibol.demo",
        jobTitle: "Jefe de Control Operativo",
        name: "Fabio Responsable Operaciones",
    },
];
const systemParameters = [
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
        description: "Registra de forma idempotente la detección de vencimientos sin alterar el estado de negocio.",
        editable: true,
        group: "notificaciones_automaticas",
        key: "overdue_activity_enabled",
        name: "Trazabilidad automática de vencimientos",
        value: "true",
        valueType: "boolean",
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
const catalogs = [
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
const permissions = ALL_PERMISSION_NAMES.map((name) => ({
    key: name.replaceAll(".", ":"),
    name,
    description: `${name} permission.`,
}));
const ids = {
    settings: uuidv5("settings:default", SEED_NAMESPACE),
};
const roleIdByKey = new Map(roles.map((role) => [role.key, uuidv5(`role:${role.key}`, SEED_NAMESPACE)]));
const permissionIdByName = new Map(permissions.map((permission) => [
    permission.name,
    uuidv5(`permission:${permission.name}`, SEED_NAMESPACE),
]));
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
    "action_plans",
    "progress_evaluations",
];
const placeholders = (length) => {
    return Array.from({ length }, () => "?").join(", ");
};
const assertTablesExist = async (connection) => {
    const [rows] = await connection.query("SHOW TABLES");
    const availableTables = new Set(rows.flatMap((row) => Object.values(row).map((value) => String(value))));
    const missingTables = requiredTables.filter((table) => !availableTables.has(table));
    if (missingTables.length > 0) {
        throw new Error(`Missing required tables: ${missingTables.join(", ")}. Run migrations before seeding.`);
    }
};
const seedRoles = async (connection) => {
    for (const role of roles) {
        await connection.execute(`
        INSERT INTO roles (id, name, description, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          description = VALUES(description),
          deleted_at = NULL,
          updated_at = NOW(3)
      `, [roleIdByKey.get(role.key), role.name, role.description]);
    }
};
const seedPermissions = async (connection) => {
    for (const permission of permissions) {
        await connection.execute(`
        INSERT INTO permissions (id, name, description, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, NOW(3), NOW(3), NULL)
        ON DUPLICATE KEY UPDATE
          description = VALUES(description),
          deleted_at = NULL,
          updated_at = NOW(3)
      `, [
            permissionIdByName.get(permission.name),
            permission.name,
            permission.description,
        ]);
    }
};
const seedRiskLevels = async (connection) => {
    for (const riskLevel of riskLevels) {
        await connection.execute(`
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
      `, [
            uuidv5(`risk-level:${riskLevel.key}`, SEED_NAMESPACE),
            riskLevel.name,
            riskLevel.key,
            riskLevel.description,
            riskLevel.colorToken,
            riskLevel.severityOrder,
            riskLevel.defaultDeadlineDays,
        ]);
    }
};
const seedObservationStatuses = async (connection) => {
    for (const status of observationStatuses) {
        await connection.execute(`
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
      `, [
            uuidv5(`observation-status:${status.key}`, SEED_NAMESPACE),
            status.name,
            status.key,
            status.description,
            status.sortOrder,
            status.isInitial,
            status.isFinal,
            status.countsAsOverdue,
        ]);
    }
};
const seedAreas = async (connection, managerUserId) => {
    for (const area of areas) {
        await connection.execute(`
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
      `, [
            uuidv5(`area:${area.key}`, SEED_NAMESPACE),
            area.name,
            area.code,
            area.description,
            managerUserId,
        ]);
    }
};
const seedSystemParameters = async (connection) => {
    for (const parameter of systemParameters) {
        await connection.execute(`
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
      `, [
            uuidv5(`system-parameter:${parameter.key}`, SEED_NAMESPACE),
            parameter.key,
            parameter.name,
            parameter.value,
            parameter.valueType,
            parameter.group,
            parameter.description,
            parameter.editable,
            parameter.active,
        ]);
    }
};
const seedCatalogs = async (connection) => {
    for (const catalog of catalogs) {
        await connection.execute(`
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
      `, [
            uuidv5(`catalog:${catalog.type}:${catalog.key ?? catalog.name}`, SEED_NAMESPACE),
            catalog.type,
            catalog.name,
            catalog.key,
            catalog.description,
            catalog.active,
            catalog.sortOrder,
        ]);
    }
};
const getRoleMap = async (connection) => {
    const [rows] = await connection.execute(`
      SELECT id, name
      FROM roles
    `);
    return new Map(rows.map((row) => [row.name, row.id]));
};
const getAreaMap = async (connection) => {
    const [rows] = await connection.execute(`
      SELECT id, name
      FROM areas
      WHERE name IN (${placeholders(areas.length)})
    `, areas.map((area) => area.name));
    const idByName = new Map(rows.map((row) => [row.name, row.id]));
    return new Map(areas.map((area) => {
        const areaId = idByName.get(area.name);
        if (!areaId) {
            throw new Error(`Area ${area.name} not found after seeding.`);
        }
        return [area.key, areaId];
    }));
};
const getRiskLevelMap = async (connection) => {
    const [rows] = await connection.execute(`
      SELECT id, name
      FROM risk_levels
      WHERE name IN (${placeholders(riskLevels.length)})
    `, riskLevels.map((riskLevel) => riskLevel.name));
    const idByName = new Map(rows.map((row) => [row.name, row.id]));
    return new Map(riskLevels.map((riskLevel) => {
        const riskLevelId = idByName.get(riskLevel.name);
        if (!riskLevelId) {
            throw new Error(`Risk level ${riskLevel.name} not found after seeding.`);
        }
        return [riskLevel.key, riskLevelId];
    }));
};
const getObservationStatusMap = async (connection) => {
    const [rows] = await connection.execute(`
      SELECT id, \`key\`
      FROM observation_statuses
      WHERE \`key\` IN (${placeholders(observationStatuses.length)})
    `, observationStatuses.map((status) => status.key));
    const idByKey = new Map(rows.map((row) => [row.key, row.id]));
    return new Map(observationStatuses.map((status) => {
        const statusId = idByKey.get(status.key);
        if (!statusId) {
            throw new Error(`Observation status ${status.key} not found after seeding.`);
        }
        return [status.key, statusId];
    }));
};
const getPermissionMap = async (connection) => {
    const [rows] = await connection.execute(`
      SELECT id, name
      FROM permissions
      WHERE name IN (${placeholders(permissions.length)})
    `, permissions.map((permission) => permission.name));
    return new Map(rows.map((row) => [row.name, row.id]));
};
const seedAdminRolePermissions = async (connection, roleMap, permissionMap) => {
    const adminRoleId = roleMap.get("Admin");
    if (!adminRoleId) {
        throw new Error("Admin role not found after role seeding.");
    }
    for (const permission of permissions) {
        const permissionId = permissionMap.get(permission.name);
        if (!permissionId) {
            throw new Error(`Permission ${permission.name} not found after seeding.`);
        }
        await connection.execute(`
        INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at)
        VALUES (?, ?, ?, NOW(3), NOW(3))
        ON DUPLICATE KEY UPDATE
          updated_at = NOW(3)
      `, [
            uuidv5(`role-permission:${adminRoleId}:${permissionId}`, SEED_NAMESPACE),
            adminRoleId,
            permissionId,
        ]);
    }
};
const normalizeRoleName = (value) => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
};
const seedAuditWorkflowPermissions = async (connection, roleMap, permissionMap) => {
    const auditRoles = [...roleMap.entries()].filter(([roleName]) => {
        const normalizedName = normalizeRoleName(roleName);
        return (normalizedName.includes("auditoria") || normalizedName.includes("audit"));
    });
    for (const [, roleId] of auditRoles) {
        for (const permissionName of [
            ...AUDIT_WORKFLOW_PERMISSION_NAMES,
            ...REPORT_PERMISSION_NAMES,
            ...AUDIT_REPORT_PERMISSION_NAMES,
        ]) {
            const permissionId = permissionMap.get(permissionName);
            if (!permissionId) {
                throw new Error(`Permission ${permissionName} not found after seeding.`);
            }
            await connection.execute(`
          INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at)
          VALUES (?, ?, ?, NOW(3), NOW(3))
          ON DUPLICATE KEY UPDATE
            updated_at = NOW(3)
        `, [
                uuidv5(`role-permission:${roleId}:${permissionId}`, SEED_NAMESPACE),
                roleId,
                permissionId,
            ]);
        }
    }
};
const seedAdminUser = async (connection, adminSeed) => {
    const passwordHash = await bcrypt.hash(adminSeed.password, 12);
    const adminIds = getAdminSeedIds(adminSeed);
    await connection.execute(`
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
    `, [adminIds.userId, adminSeed.name, adminSeed.email, passwordHash]);
    const [rows] = await connection.execute(`
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
    `, [adminSeed.email]);
    const adminUser = rows[0];
    if (!adminUser) {
        throw new Error("Admin user not found after seeding.");
    }
    return adminUser.id;
};
const seedAdminUserRole = async (connection, adminUserId, roleMap) => {
    const adminRoleId = roleMap.get("Admin");
    if (!adminRoleId) {
        throw new Error("Admin role not found before assigning user role.");
    }
    await connection.execute(`
      INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
      VALUES (?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        updated_at = NOW(3)
    `, [
        uuidv5(`user-role:${adminUserId}:${adminRoleId}`, SEED_NAMESPACE),
        adminUserId,
        adminRoleId,
    ]);
};
const seedAdminAccount = async (connection, adminUserId, adminSeed) => {
    const passwordHash = await bcrypt.hash(adminSeed.password, 12);
    const adminIds = getAdminSeedIds(adminSeed);
    await connection.execute(`
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
    `, [adminIds.accountId, adminUserId, adminUserId, passwordHash]);
};
const seedDemoUsers = async (connection, roleMap) => {
    const roleId = roleMap.get("Non Admin");
    if (!roleId)
        throw new Error("Non Admin role not found before seeding demo users.");
    const userIds = [];
    for (const user of demoUsers) {
        const userId = uuidv5(`demo-user:${user.email}`, SEED_NAMESPACE);
        userIds.push(userId);
        await connection.execute(`INSERT INTO users (
        id, name, email, password, avatar, job_title, is_active, email_verified,
        last_login_at, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, true, true, NULL, NOW(3), NOW(3), NULL)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name), job_title = VALUES(job_title), is_active = true,
        email_verified = true, deleted_at = NULL, updated_at = NOW(3)`, [userId, user.name, user.email, user.jobTitle]);
        await connection.execute(`INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
       VALUES (?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE updated_at = NOW(3)`, [uuidv5(`user-role:${userId}:${roleId}`, SEED_NAMESPACE), userId, roleId]);
    }
    return userIds;
};
const seedDefaultSettings = async (connection) => {
    await connection.execute(`
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
    `, [
        ids.settings,
        env.SEED_APP_NAME,
        env.SEED_LOGO ?? null,
        env.SEED_PRIMARY_COLOR,
        env.SEED_SUPPORT_EMAIL,
        env.SEED_TIMEZONE,
        env.SEED_DATE_FORMAT,
        env.SEED_SENDER_NAME,
        env.SEED_SENDER_EMAIL,
    ]);
};
const seedSampleObservationsIfEmpty = async (connection, options) => {
    const [countRows] = await connection.execute(`
      SELECT COUNT(*) AS total
      FROM observations
      WHERE deleted_at IS NULL
    `);
    if ((countRows[0]?.total ?? 0) > 0) {
        return 0;
    }
    if (options.demoUserIds.length < 6) {
        throw new Error("Six demo users are required for the multi-area sample.");
    }
    const auditReportId = uuidv5("audit-report:AI-2026-004", SEED_NAMESPACE);
    const secondAuditReportId = uuidv5("audit-report:AI-2026-005", SEED_NAMESPACE);
    const dictionaryId = uuidv5("observation-dictionary:control-interno", SEED_NAMESPACE);
    const riskIds = {
        access: uuidv5("risk:acceso-no-autorizado", SEED_NAMESPACE),
        continuity: uuidv5("risk:continuidad-operativa", SEED_NAMESPACE),
        financial: uuidv5("risk:informacion-financiera-incorrecta", SEED_NAMESPACE),
    };
    await connection.execute(`INSERT INTO audit_reports (id, report_number, title, report_date, created_by_user_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3), NULL)`, [
        auditReportId,
        "AI-2026-004",
        "Auditoría integral de procesos críticos",
        "2026-05-15",
        options.adminUserId,
    ]);
    await connection.execute(`INSERT INTO observation_dictionary (id, name, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, true, NOW(3), NOW(3))`, [
        dictionaryId,
        "Debilidad de control interno",
        "Diseño o ejecución insuficiente de un control clave.",
    ]);
    await connection.execute(`INSERT INTO audit_reports (id, report_number, title, report_date, created_by_user_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3), NULL)`, [
        secondAuditReportId,
        "AI-2026-005",
        "Auditoría de inventarios y continuidad",
        "2026-06-01",
        options.adminUserId,
    ]);
    for (const [key, id, name] of [
        ["access", riskIds.access, "Acceso no autorizado"],
        [
            "continuity",
            riskIds.continuity,
            "Interrupción de la continuidad operativa",
        ],
        ["financial", riskIds.financial, "Información financiera incorrecta"],
    ]) {
        await connection.execute(`INSERT INTO risks (id, name, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, true, NOW(3), NOW(3))`, [id, name, `Riesgo de referencia ${key} para datos demostrativos.`]);
    }
    const sampleObservations = [
        {
            auditReportId,
            reportNumber: "AI-2026-004",
            number: 1,
            title: "Segregación insuficiente de accesos privilegiados",
            description: "Se identificó uso compartido de credenciales administrativas sin trazabilidad individual.",
            recommendation: "Formalizar la segregación de funciones y evidenciar revisiones mensuales.",
            riskLevelKey: "ALTO",
            statusKey: "CON_AVANCE",
            originalDueDate: "2026-08-13",
            currentDueDate: "2026-08-13",
            progressPercent: 45,
            currentStage: "Ejecución de planes de acción",
            areaKeys: ["finance", "technology", "operations"],
            riskIds: [riskIds.access, riskIds.continuity],
        },
        {
            auditReportId,
            reportNumber: "AI-2026-004",
            number: 2,
            title: "Conciliaciones bancarias fuera de plazo",
            description: "Existen conciliaciones pendientes en cuentas operativas con más de treinta días de rezago.",
            recommendation: "Definir responsables y ejecutar un seguimiento semanal hasta su cierre.",
            riskLevelKey: "MEDIO",
            statusKey: "CON_AVANCE",
            originalDueDate: "2026-09-12",
            currentDueDate: "2026-09-12",
            progressPercent: 75,
            currentStage: "Evaluación de avance",
            areaKeys: ["finance"],
            riskIds: [riskIds.financial],
        },
        {
            auditReportId: secondAuditReportId,
            reportNumber: "AI-2026-005",
            number: 1,
            title: "Diferencias de inventario sin conciliación documentada",
            description: "El conteo selectivo mostró diferencias entre existencia física y sistema.",
            recommendation: "Actualizar la matriz de inventario y documentar validaciones cruzadas.",
            riskLevelKey: "BAJO",
            statusKey: "NO_INICIADO",
            originalDueDate: "2026-11-28",
            currentDueDate: "2026-11-28",
            progressPercent: 0,
            currentStage: "Asignación de responsables",
            areaKeys: ["warehouse", "technology"],
            riskIds: [riskIds.continuity],
        },
    ];
    for (const sample of sampleObservations) {
        const displayCode = `${sample.reportNumber}-${sample.number}`;
        const observationId = uuidv5(`observation:${displayCode}`, SEED_NAMESPACE);
        const riskLevelId = options.riskLevelMap.get(sample.riskLevelKey);
        const statusId = options.statusMap.get(sample.statusKey);
        if (!riskLevelId || !statusId) {
            throw new Error(`Missing catalog references while seeding ${displayCode}.`);
        }
        await connection.execute(`INSERT INTO observations (
        id, audit_report_id, observation_number, main_observation_id, title, description,
        audit_recommendation, risk_level_id, status_id, auditor_user_id,
        original_due_date, current_due_date, source, process_name, category,
        progress_percent, current_stage, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), NULL)`, [
            observationId,
            sample.auditReportId,
            sample.number,
            dictionaryId,
            sample.title,
            sample.description,
            sample.recommendation,
            riskLevelId,
            statusId,
            options.adminUserId,
            sample.originalDueDate,
            sample.currentDueDate,
            "Auditoría interna",
            "Control interno",
            "Hallazgo de auditoría",
            sample.progressPercent,
            sample.currentStage,
        ]);
        for (const riskId of sample.riskIds) {
            await connection.execute(`INSERT INTO observation_risks (id, observation_id, risk_id, created_at) VALUES (?, ?, ?, NOW(3))`, [
                uuidv5(`observation-risk:${displayCode}:${riskId}`, SEED_NAMESPACE),
                observationId,
                riskId,
            ]);
        }
        for (const [areaIndex, areaKey] of sample.areaKeys.entries()) {
            const areaId = options.areaMap.get(areaKey);
            if (!areaId)
                throw new Error(`Missing area ${areaKey} while seeding ${displayCode}.`);
            const observationAreaId = uuidv5(`observation-area:${displayCode}:${areaKey}`, SEED_NAMESPACE);
            const processOwnerUserId = options.demoUserIds[(areaIndex * 2) % options.demoUserIds.length];
            const areaResponsibleUserId = options.demoUserIds[(areaIndex * 2 + 1) % options.demoUserIds.length];
            await connection.execute(`INSERT INTO observation_areas (
          id, observation_id, area_id, process_owner_user_id, area_responsible_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))`, [
                observationAreaId,
                observationId,
                areaId,
                processOwnerUserId,
                areaResponsibleUserId,
            ]);
            if (sample.auditReportId === auditReportId && sample.number === 1) {
                const actionPlanId = uuidv5(`action-plan:${displayCode}:${areaKey}`, SEED_NAMESPACE);
                const actionOriginalDueDate = areaIndex === 0 ? "2026-08-05" : "2026-08-20";
                const actionCurrentDueDate = areaIndex === 0 ? "2026-09-15" : "2026-08-20";
                const progressPercent = [60, 25, 0][areaIndex] ?? 0;
                const planStatus = ["WITH_PROGRESS", "STARTED", "NOT_STARTED"][areaIndex];
                const planTitles = [
                    "Conciliar saldos y formalizar revisión financiera",
                    "Individualizar cuentas privilegiadas",
                    "Actualizar protocolo de contingencia operativa",
                ];
                await connection.execute(`INSERT INTO action_plans (
            id, remediation_plan_id, observation_id, observation_area_id, responsible_user_id,
            title, description, original_due_date, current_due_date, completed_at,
            progress_percent, status, sort_order, created_at, updated_at, deleted_at
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(3), NOW(3), NULL)`, [
                    actionPlanId,
                    observationId,
                    observationAreaId,
                    areaResponsibleUserId,
                    planTitles[areaIndex] ?? "Ejecutar control correctivo",
                    "Ejecutar, documentar y validar el control asignado.",
                    actionOriginalDueDate,
                    actionCurrentDueDate,
                    progressPercent,
                    planStatus,
                    areaIndex,
                ]);
                const evaluationId = uuidv5(`progress-evaluation:${actionPlanId}`, SEED_NAMESPACE);
                await connection.execute(`INSERT INTO progress_evaluations (
            id, action_plan_id, submitted_by_user_id, type, progress_percent, action_plan_status,
            comment, review_status, reviewed_by_user_id, submitted_at, reviewed_at,
            review_comment, created_at, updated_at, deleted_at, workflow_instance_id
          ) VALUES (?, ?, ?, 'ADVANCE', ?, ?, ?, 'APPROVED', ?, NOW(3), NOW(3), ?, NOW(3), NOW(3), NULL, NULL)`, [
                    evaluationId,
                    actionPlanId,
                    areaResponsibleUserId,
                    progressPercent,
                    planStatus,
                    "Avance respaldado y enviado a auditoría.",
                    options.adminUserId,
                    "Evaluación aprobada para datos demostrativos.",
                ]);
                if (areaIndex === 0) {
                    await connection.execute(`INSERT INTO deadline_extension_requests (
              id, target_type, observation_id, action_plan_id, observation_area_id, requested_by_user_id,
              previous_due_date, proposed_due_date, reason, status, manager_reviewer_id,
              manager_reviewed_at, manager_comment, audit_reviewer_id, audit_reviewed_at,
              audit_comment, final_approved_at, created_at, updated_at, deleted_at, workflow_instance_id
            ) VALUES (?, 'ACTION_PLAN', NULL, ?, ?, ?, ?, ?, ?, 'AUDIT_APPROVED', ?, NOW(3), ?, ?, NOW(3), ?, NOW(3), NOW(3), NOW(3), NULL, NULL)`, [
                        uuidv5(`extension:${actionPlanId}`, SEED_NAMESPACE),
                        actionPlanId,
                        observationAreaId,
                        areaResponsibleUserId,
                        actionOriginalDueDate,
                        actionCurrentDueDate,
                        "Se requiere una ventana adicional para concluir las pruebas de acceso.",
                        processOwnerUserId,
                        "Conforme por la jefatura.",
                        options.adminUserId,
                        "Ampliación aprobada por auditoría.",
                    ]);
                }
            }
        }
    }
    return sampleObservations.length;
};
const main = async () => {
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
        await seedAuditWorkflowPermissions(connection, roleMap, permissionMap);
        const seededAdmins = [];
        for (const adminSeed of adminSeeds) {
            const adminUserId = await seedAdminUser(connection, adminSeed);
            await seedAdminAccount(connection, adminUserId, adminSeed);
            await seedAdminUserRole(connection, adminUserId, roleMap);
            seededAdmins.push({
                email: adminSeed.email,
                userId: adminUserId,
            });
        }
        const primaryAdminUserId = seededAdmins.find((admin) => admin.email === primaryAdminSeed.email)
            ?.userId ?? seededAdmins[0]?.userId;
        if (!primaryAdminUserId) {
            throw new Error("No admin users were seeded.");
        }
        const demoUserIds = await seedDemoUsers(connection, roleMap);
        await seedDefaultSettings(connection);
        await seedAreas(connection, primaryAdminUserId);
        const areaMap = await getAreaMap(connection);
        const seededObservations = await seedSampleObservationsIfEmpty(connection, {
            adminUserId: primaryAdminUserId,
            areaMap,
            demoUserIds,
            riskLevelMap,
            statusMap,
        });
        await connection.commit();
        console.info("Database seed completed.");
        console.info(JSON.stringify({
            roles: roles.length,
            permissions: permissions.length,
            rolePermissions: permissions.length,
            adminUsers: seededAdmins.length,
            demoUsers: demoUserIds.length,
            adminEmails: seededAdmins.map((admin) => admin.email),
            accounts: seededAdmins.length,
            userRoles: seededAdmins.length,
            settings: 1,
            riskLevels: riskLevels.length,
            observationStatuses: observationStatuses.length,
            areas: areas.length,
            systemParameters: systemParameters.length,
            catalogs: catalogs.length,
            sampleAuditReports: 2,
            sampleObservations: seededObservations,
        }, null, 2));
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        await connection.end();
    }
};
void main().catch((error) => {
    console.error("Database seed failed.");
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map