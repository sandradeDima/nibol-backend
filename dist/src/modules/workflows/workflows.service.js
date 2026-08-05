import { Prisma } from "../../../generated/prisma/client.js";
import { emailTemplateNames } from "../../emails/templates/index.js";
import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { toLogJsonValue } from "../../services/logging-utils.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { WORKFLOW_ASSIGNMENT_STRATEGY_VALUES, WORKFLOW_ACTIVITY_ACTIONS, WORKFLOW_CONDITION_FIELD_VALUES, WORKFLOW_CONDITION_OPERATOR_VALUES, WORKFLOW_DEFINITION_ENTITY_TYPE, WORKFLOW_PROCESS_TYPE_CATALOG, WORKFLOW_TRANSITION_TYPE_VALUES, WORKFLOW_VERSION_ENTITY_TYPE, } from "./workflows.constants.js";
import { buildWorkflowSimulationContext } from "./workflow-context-builder.js";
import { buildWorkflowGraphHash, } from "./workflow-graph.js";
import { publishWorkflowVersionState } from "./workflow-publisher.js";
import { simulateWorkflowGraph } from "./workflow-simulator.js";
import { canonicalizeWorkflowConditionField, WORKFLOW_RULE_FIELDS, } from "./workflow-rule-fields.js";
import { validateWorkflowGraph } from "./workflow-validator.js";
import { WORKFLOW_INSTANCE_PERMISSIONS, WORKFLOW_PERMISSIONS, } from "./workflows.permissions.js";
import { workflowDesignerSaveSchema, workflowNodeConfigurationSchema, } from "./workflows.validators.js";
const workflowTransitionsOrderBy = [{ priority: "asc" }, { id: "asc" }];
const workflowDefinitionSelect = {
    _count: {
        select: {
            instances: true,
            versions: true,
        },
    },
    activeVersion: {
        select: {
            id: true,
            publishedAt: true,
            status: true,
            versionNumber: true,
        },
    },
    createdAt: true,
    createdBy: {
        select: {
            email: true,
            id: true,
            name: true,
        },
    },
    description: true,
    id: true,
    name: true,
    processType: true,
    status: true,
    updatedAt: true,
    archivedAt: true,
    versions: {
        orderBy: {
            versionNumber: "desc",
        },
        take: 1,
        where: {
            status: "DRAFT",
        },
        select: {
            changeDescription: true,
            createdAt: true,
            createdBy: {
                select: {
                    email: true,
                    id: true,
                    name: true,
                },
            },
            id: true,
            publishedAt: true,
            publishedBy: {
                select: {
                    email: true,
                    id: true,
                    name: true,
                },
            },
            status: true,
            versionNumber: true,
        },
    },
};
const mapWorkflowDefinition = (record) => {
    const { versions, ...definition } = record;
    return {
        ...definition,
        latestVersion: versions[0] ?? null,
    };
};
const workflowVersionListSelect = {
    _count: {
        select: {
            instances: true,
        },
    },
    definition: {
        select: {
            activeVersion: {
                select: {
                    id: true,
                    status: true,
                    versionNumber: true,
                },
            },
            id: true,
            name: true,
            processType: true,
            status: true,
        },
    },
    changeDescription: true,
    createdAt: true,
    createdBy: {
        select: {
            email: true,
            id: true,
            name: true,
        },
    },
    id: true,
    publishedAt: true,
    publishedBy: {
        select: {
            email: true,
            id: true,
            name: true,
        },
    },
    status: true,
    versionNumber: true,
};
const workflowVersionDetailSelect = {
    _count: {
        select: {
            conditionGroups: true,
            instances: true,
            nodes: true,
            transitions: true,
        },
    },
    conditionGroups: {
        include: {
            conditions: {
                orderBy: {
                    sequence: "asc",
                },
            },
        },
        orderBy: {
            id: "asc",
        },
    },
    createdAt: true,
    createdBy: {
        select: {
            email: true,
            id: true,
            name: true,
        },
    },
    definition: {
        select: {
            activeVersion: {
                select: {
                    id: true,
                    status: true,
                    versionNumber: true,
                },
            },
            id: true,
            name: true,
            processType: true,
            status: true,
        },
    },
    id: true,
    nodes: {
        orderBy: {
            createdAt: "asc",
        },
    },
    publishedAt: true,
    publishedBy: {
        select: {
            email: true,
            id: true,
            name: true,
        },
    },
    status: true,
    transitions: {
        include: {
            conditionGroup: {
                include: {
                    conditions: {
                        orderBy: {
                            sequence: "asc",
                        },
                    },
                },
            },
            sourceNode: {
                select: {
                    id: true,
                    nodeKey: true,
                },
            },
            targetNode: {
                select: {
                    id: true,
                    nodeKey: true,
                },
            },
        },
        orderBy: workflowTransitionsOrderBy,
    },
    versionNumber: true,
    changeDescription: true,
};
const mapWorkflowVersionDetail = (version) => ({
    ...version,
    counts: version._count,
});
const workflowCloneSelect = {
    conditionGroups: {
        include: {
            conditions: {
                orderBy: {
                    sequence: "asc",
                },
            },
        },
    },
    nodes: {
        orderBy: {
            createdAt: "asc",
        },
    },
    transitions: {
        include: {
            sourceNode: {
                select: {
                    nodeKey: true,
                },
            },
            targetNode: {
                select: {
                    nodeKey: true,
                },
            },
        },
        orderBy: workflowTransitionsOrderBy,
    },
};
const normalizeOptionalText = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const toInputJsonValue = (value) => {
    const serialized = toLogJsonValue(value);
    if (serialized === null) {
        return {};
    }
    return serialized;
};
const assertPermission = (access, permission) => {
    if (!access.permissions.includes(permission)) {
        throw new AppError(`Falta el permiso requerido: ${permission}.`, 403);
    }
};
const assertAnyPermission = (access, permissions) => {
    if (!permissions.some((permission) => access.permissions.includes(permission))) {
        throw new AppError(`Falta uno de los permisos requeridos: ${permissions.join(", ")}.`, 403);
    }
};
export const assertDraftWorkflowVersion = (status) => {
    if (status !== "DRAFT") {
        throw new AppError("Las versiones publicadas o archivadas no se pueden modificar.", 409);
    }
};
export const assertWorkflowCanStartInstance = (status) => {
    if (status !== "PUBLISHED") {
        throw new AppError("Solo se pueden iniciar instancias con workflows publicados.", 409);
    }
};
export const assertCanPublishWorkflowVersion = (access) => {
    assertPermission(access, WORKFLOW_PERMISSIONS.publish);
};
export const assertUniqueWorkflowNodeKeys = (nodeKeys) => {
    const uniqueKeys = new Set(nodeKeys);
    if (uniqueKeys.size !== nodeKeys.length) {
        throw new AppError("Los nodeKey deben ser únicos dentro de la versión.", 409);
    }
};
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const addDesignerIssue = (issues, issue) => {
    if (issue.severity === "warning") {
        issues.warnings.push(issue);
    }
    else {
        issues.errors.push(issue);
    }
};
const assertAssignmentConfiguration = (node) => {
    if (node.configurationJson.nodeType !== "STAGE" &&
        node.configurationJson.nodeType !== "APPROVAL") {
        return null;
    }
    const configuration = node.configurationJson;
    if (!configuration.assignmentStrategy) {
        return "Seleccione una estrategia de asignación.";
    }
    const referenceByStrategy = {
        AREA: "areaId",
        FIELD_REFERENCE: "fieldReference",
        FIXED_USER: "userId",
        ROLE: "roleId",
    };
    const referenceKey = referenceByStrategy[configuration.assignmentStrategy];
    if (referenceKey && !configuration[referenceKey]) {
        return "Complete la referencia requerida para la estrategia de asignación.";
    }
    return null;
};
export const validateDesignerGraph = (input, processType) => {
    const result = {
        errors: [],
        isValid: false,
        warnings: [],
    };
    const nodesByReference = new Map();
    const nodeReferences = new Map();
    for (const node of input.nodes) {
        const reference = node.id ?? node.nodeKey;
        nodesByReference.set(reference, node);
        nodesByReference.set(node.nodeKey, node);
        nodeReferences.set(node, reference);
        if (!node.name.trim()) {
            addDesignerIssue(result, {
                code: "NODE_NAME_REQUIRED",
                message: "Cada nodo debe tener un nombre.",
                nodeKey: node.nodeKey,
                severity: "error",
            });
        }
        const assignmentError = assertAssignmentConfiguration(node);
        if (assignmentError) {
            addDesignerIssue(result, {
                code: "ASSIGNMENT_INVALID",
                message: assignmentError,
                nodeKey: node.nodeKey,
                severity: "error",
            });
        }
        if (node.configurationJson.nodeType === "START" &&
            processType &&
            node.configurationJson.processType !== processType) {
            addDesignerIssue(result, {
                code: "START_PROCESS_MISMATCH",
                message: "El proceso del nodo Inicio debe coincidir con el workflow.",
                nodeKey: node.nodeKey,
                severity: "error",
            });
        }
        if (node.configurationJson.nodeType === "REJECTION" &&
            node.configurationJson.returnTargetNodeKey === node.nodeKey) {
            addDesignerIssue(result, {
                code: "REJECTION_SELF_REFERENCE",
                message: "El nodo Rechazo no puede retornar a sí mismo.",
                nodeKey: node.nodeKey,
                severity: "error",
            });
        }
    }
    const startNodes = input.nodes.filter((node) => node.type === "START");
    const endNodes = input.nodes.filter((node) => node.type === "END");
    if (startNodes.length !== 1) {
        addDesignerIssue(result, {
            code: "START_COUNT",
            message: startNodes.length === 0
                ? "Agregue un nodo Inicio."
                : "El flujo debe tener exactamente un nodo Inicio.",
            severity: "error",
        });
    }
    if (endNodes.length === 0) {
        addDesignerIssue(result, {
            code: "END_REQUIRED",
            message: "Agregue al menos un nodo Fin.",
            severity: "error",
        });
    }
    const incomingCount = new Map();
    const outgoingCount = new Map();
    const transitionKeys = new Set();
    for (const transition of input.transitions) {
        const source = nodesByReference.get(transition.sourceNodeId);
        const target = nodesByReference.get(transition.targetNodeId);
        if (!source || !target) {
            addDesignerIssue(result, {
                code: "TRANSITION_REFERENCE_MISSING",
                message: "Cada conexión debe apuntar a nodos de esta versión.",
                severity: "error",
            });
            continue;
        }
        const sourceReference = nodeReferences.get(source) ?? source.nodeKey;
        const targetReference = nodeReferences.get(target) ?? target.nodeKey;
        const transitionKey = `${sourceReference}->${targetReference}`;
        if (transitionKeys.has(transitionKey)) {
            addDesignerIssue(result, {
                code: "DUPLICATE_TRANSITION",
                message: "No puede haber dos conexiones idénticas.",
                nodeKey: source.nodeKey,
                severity: "error",
            });
        }
        transitionKeys.add(transitionKey);
        if (source === target) {
            addDesignerIssue(result, {
                code: "SELF_LOOP",
                message: "No se permiten conexiones de un nodo hacia sí mismo.",
                nodeKey: source.nodeKey,
                severity: "error",
            });
        }
        incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
        outgoingCount.set(source, (outgoingCount.get(source) ?? 0) + 1);
    }
    for (const node of startNodes) {
        if ((incomingCount.get(node) ?? 0) > 0) {
            addDesignerIssue(result, {
                code: "START_INCOMING",
                message: "El nodo Inicio no puede tener conexiones entrantes.",
                nodeKey: node.nodeKey,
                severity: "error",
            });
        }
        if ((outgoingCount.get(node) ?? 0) === 0) {
            addDesignerIssue(result, {
                code: "START_OUTGOING",
                message: "El nodo Inicio todavía no tiene una salida conectada.",
                nodeKey: node.nodeKey,
                severity: "warning",
            });
        }
    }
    for (const node of endNodes) {
        if ((outgoingCount.get(node) ?? 0) > 0) {
            addDesignerIssue(result, {
                code: "END_OUTGOING",
                message: "El nodo Fin no puede tener conexiones salientes.",
                nodeKey: node.nodeKey,
                severity: "error",
            });
        }
    }
    result.isValid = result.errors.length === 0;
    return result;
};
export const nextWorkflowVersionNumber = (versionNumbers) => {
    return Math.max(0, ...versionNumbers) + 1;
};
export const summarizeWorkflowStatuses = (rows) => {
    const counts = rows.reduce((result, row) => {
        result[row.status] = row._count._all;
        return result;
    }, {});
    return {
        archived: counts.ARCHIVED ?? 0,
        drafts: counts.DRAFT ?? 0,
        inactive: counts.INACTIVE ?? 0,
        published: counts.PUBLISHED ?? 0,
        total: rows.reduce((total, row) => total + row._count._all, 0),
    };
};
const getWorkflowDefinition = async (db, workflowId) => {
    const definition = await db.workflowDefinition.findFirst({
        select: workflowDefinitionSelect,
        where: {
            id: workflowId,
        },
    });
    if (!definition) {
        throw new AppError("El workflow solicitado no existe.", 404);
    }
    return mapWorkflowDefinition(definition);
};
const getWorkflowVersionForClone = async (db, workflowId, sourceVersionId) => {
    const version = await db.workflowVersion.findFirst({
        select: {
            ...workflowCloneSelect,
            changeDescription: true,
            id: true,
            status: true,
            versionNumber: true,
            workflowDefinitionId: true,
        },
        where: {
            workflowDefinitionId: workflowId,
            ...(sourceVersionId ? { id: sourceVersionId } : {}),
        },
        ...(sourceVersionId ? {} : { orderBy: { versionNumber: "desc" } }),
    });
    if (!version) {
        throw new AppError("La versión origen no existe dentro del workflow.", 404);
    }
    return version;
};
const getNextVersionNumber = async (db, workflowId) => {
    const latestVersion = await db.workflowVersion.findFirst({
        orderBy: {
            versionNumber: "desc",
        },
        select: {
            versionNumber: true,
        },
        where: {
            workflowDefinitionId: workflowId,
        },
    });
    return nextWorkflowVersionNumber(latestVersion ? [latestVersion.versionNumber] : []);
};
export const buildWorkflowAuditEvents = ({ access, action, entityId, entityType, newValues, oldValues, summary, }) => ({
    activity: {
        action,
        entityId,
        entityType,
        ipAddress: access.ipAddress ?? null,
        metadata: {
            summary,
        },
        userId: access.userId,
    },
    audit: {
        entityId,
        entityType,
        ipAddress: access.ipAddress ?? null,
        newValues,
        oldValues,
        userId: access.userId,
    },
});
const writeWorkflowAudit = async ({ db, ...input }) => {
    const events = buildWorkflowAuditEvents(input);
    await Promise.all([
        activityLogService.logUserAction(events.activity, { db }),
        auditLogService.create(events.audit, { db }),
    ]);
};
const cloneVersionContents = async (db, source, workflowVersionId) => {
    const nodeIdByKey = new Map();
    for (const sourceNode of source.nodes) {
        const node = await db.workflowNode.create({
            data: {
                configurationJson: toInputJsonValue(sourceNode.configurationJson),
                description: sourceNode.description,
                name: sourceNode.name,
                nodeKey: sourceNode.nodeKey,
                positionX: sourceNode.positionX,
                positionY: sourceNode.positionY,
                assignmentStrategy: sourceNode.assignmentStrategy,
                type: sourceNode.type,
                workflowVersionId,
            },
            select: {
                id: true,
                nodeKey: true,
            },
        });
        nodeIdByKey.set(node.nodeKey, node.id);
    }
    const conditionGroupIdBySourceId = new Map();
    for (const sourceGroup of source.conditionGroups) {
        const group = await db.workflowConditionGroup.create({
            data: {
                description: sourceGroup.description,
                logicOperator: sourceGroup.logicOperator,
                workflowVersionId,
                conditions: {
                    create: sourceGroup.conditions.map((condition) => ({
                        description: condition.description,
                        field: condition.field,
                        operator: condition.operator,
                        sequence: condition.sequence,
                        ...(condition.valueJson === null
                            ? {
                                valueJson: Prisma.JsonNull,
                            }
                            : {
                                valueJson: toInputJsonValue(condition.valueJson),
                            }),
                    })),
                },
            },
            select: {
                id: true,
            },
        });
        conditionGroupIdBySourceId.set(sourceGroup.id, group.id);
    }
    for (const sourceTransition of source.transitions) {
        const sourceNodeId = nodeIdByKey.get(sourceTransition.sourceNode.nodeKey);
        const targetNodeId = nodeIdByKey.get(sourceTransition.targetNode.nodeKey);
        if (!sourceNodeId || !targetNodeId) {
            throw new AppError("No se pudo duplicar una transición porque uno de sus nodos no existe.", 409);
        }
        const conditionGroupId = sourceTransition.conditionGroupId
            ? conditionGroupIdBySourceId.get(sourceTransition.conditionGroupId)
            : undefined;
        await db.workflowTransition.create({
            data: {
                label: sourceTransition.label,
                priority: sourceTransition.priority,
                sourceNodeId,
                targetNodeId,
                transitionType: sourceTransition.transitionType,
                workflowVersionId,
                ...(conditionGroupId ? { conditionGroupId } : {}),
            },
        });
    }
};
const createDraftVersionFromSource = async (db, source, workflowId, versionNumber, createdById, changeDescription) => {
    const version = await db.workflowVersion.create({
        data: {
            changeDescription,
            createdById,
            status: "DRAFT",
            versionNumber,
            workflowDefinitionId: workflowId,
        },
        select: {
            id: true,
            status: true,
            versionNumber: true,
            workflowDefinitionId: true,
        },
    });
    await cloneVersionContents(db, source, version.id);
    return version;
};
export const buildDefinitionOrderBy = (sortBy, sortDirection) => {
    switch (sortBy) {
        case "createdAt":
            return { createdAt: sortDirection };
        case "name":
            return { name: sortDirection };
        case "processType":
            return { processType: sortDirection };
        case "status":
            return { status: sortDirection };
        case "updatedAt":
            return { updatedAt: sortDirection };
    }
};
export const buildDefinitionWhere = (query) => {
    return {
        ...(query.createdById ? { createdById: query.createdById } : {}),
        ...(query.processType ? { processType: query.processType } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search.length > 0
            ? {
                OR: [
                    {
                        name: {
                            contains: query.search,
                        },
                    },
                    {
                        description: {
                            contains: query.search,
                        },
                    },
                ],
            }
            : {}),
    };
};
const CONDITION_FIELD_LABELS = {
    areaId: "Área",
    daysOverdue: "Días vencidos",
    dueDate: "Fecha límite",
    evidenceCount: "Cantidad de evidencias",
    hasEvidence: "Evidencia presente",
    observationStatus: "Estado de observación",
    previousDecision: "Decisión anterior",
    processType: "Tipo de proceso",
    remediationPlanStatus: "Estado del plan de remediación",
    requestType: "Tipo de solicitud",
    requestedExtensionDays: "Días de ampliación solicitados",
    responsibleUserId: "Usuario responsable",
    riskLevel: "Nivel de riesgo",
};
const CONDITION_OPERATOR_LABELS = {
    CONTAINS: "Contiene",
    DUE_WITHIN: "Vence dentro de",
    EQUALS: "Igual a",
    GREATER_THAN: "Mayor que",
    GREATER_THAN_OR_EQUAL: "Mayor o igual",
    IS_EMPTY: "Está vacío",
    IS_NOT_EMPTY: "No está vacío",
    IS_OVERDUE: "Está vencido",
    IN: "Está dentro de",
    LESS_THAN: "Menor que",
    LESS_THAN_OR_EQUAL: "Menor o igual",
    NOT_CONTAINS: "No contiene",
    NOT_EQUALS: "Diferente de",
    NOT_IN: "No está dentro de",
};
const ASSIGNMENT_STRATEGY_LABELS = {
    AREA: "Área",
    FIELD_REFERENCE: "Referencia por campo",
    FIXED_USER: "Usuario fijo",
    OBSERVATION_RESPONSIBLE: "Responsable de la observación",
    RECORD_OWNER: "Responsable del registro",
    REQUESTER: "Solicitante",
    ROLE: "Rol",
    SUPERVISOR: "Supervisor / gerente de área",
};
const NO_VALUE_CONDITION_OPERATORS = new Set([
    "IS_EMPTY",
    "IS_NOT_EMPTY",
    "IS_OVERDUE",
]);
const mapPersistedDesignerInput = (version) => {
    const nodes = [];
    for (const node of version.nodes) {
        const parsedConfiguration = workflowNodeConfigurationSchema.safeParse(node.configurationJson);
        if (!parsedConfiguration.success) {
            throw new AppError(`La configuración del nodo ${node.nodeKey} no es válida.`, 409);
        }
        nodes.push({
            assignmentStrategy: node.assignmentStrategy === "MANAGEMENT"
                ? null
                : node.assignmentStrategy,
            configurationJson: parsedConfiguration.data,
            description: node.description,
            id: node.id,
            name: node.name,
            nodeKey: node.nodeKey,
            positionX: node.positionX,
            positionY: node.positionY,
            type: node.type,
        });
    }
    const outgoingTransitionCount = new Map();
    for (const transition of version.transitions) {
        outgoingTransitionCount.set(transition.sourceNode.id, (outgoingTransitionCount.get(transition.sourceNode.id) ?? 0) + 1);
    }
    return {
        nodes,
        transitions: version.transitions.map((transition) => {
            const sourceNode = nodes.find((node) => node.id === transition.sourceNode.id);
            const legacySingleConditionRoute = Boolean(!transition.transitionType &&
                sourceNode?.type === "CONDITION" &&
                outgoingTransitionCount.get(transition.sourceNode.id) === 1);
            return {
                conditionGroup: transition.conditionGroup === null
                    ? legacySingleConditionRoute &&
                        sourceNode?.configurationJson.nodeType === "CONDITION"
                        ? {
                            conditions: sourceNode.configurationJson.rules.map((rule, index) => ({
                                ...rule,
                                description: null,
                                sequence: index,
                            })),
                            description: sourceNode.configurationJson.description,
                            logicOperator: sourceNode.configurationJson.logicalOperator,
                        }
                        : null
                    : {
                        conditions: transition.conditionGroup.conditions.map((condition) => ({
                            description: condition.description,
                            field: canonicalizeWorkflowConditionField(condition.field) ??
                                condition.field,
                            operator: condition.operator,
                            resultLabel: null,
                            sequence: condition.sequence,
                            value: condition.valueJson,
                        })),
                        description: transition.conditionGroup.description,
                        id: transition.conditionGroup.id,
                        logicOperator: transition.conditionGroup.logicOperator,
                    },
                conditionGroupId: transition.conditionGroupId,
                id: transition.id,
                label: transition.label,
                priority: transition.priority,
                sourceNodeId: transition.sourceNode.id,
                targetNodeId: transition.targetNode.id,
                transitionType: transition.transitionType &&
                    WORKFLOW_TRANSITION_TYPE_VALUES.includes(transition.transitionType)
                    ? transition.transitionType
                    : legacySingleConditionRoute
                        ? "CONDITION"
                        : null,
            };
        }),
    };
};
const buildDesignerResult = (version, access) => {
    if (version.definition.status === "ARCHIVED") {
        throw new AppError("No se puede abrir el diseñador de un workflow archivado.", 409);
    }
    const canEdit = version.status === "DRAFT" &&
        access.permissions.includes(WORKFLOW_PERMISSIONS.edit);
    const canValidate = version.status === "DRAFT" &&
        access.permissions.includes(WORKFLOW_PERMISSIONS.validate);
    const savedDates = [
        version.createdAt,
        ...version.nodes.map((node) => node.updatedAt),
    ];
    return {
        canEdit,
        canValidate,
        definition: version.definition,
        lastSavedAt: new Date(Math.max(...savedDates.map((date) => date.getTime()))),
        nodes: version.nodes,
        transitions: version.transitions,
        version: {
            changeDescription: version.changeDescription,
            id: version.id,
            publishedAt: version.publishedAt,
            status: version.status,
            versionNumber: version.versionNumber,
        },
    };
};
const getDesignerVersion = async (db, versionId) => {
    const version = await db.workflowVersion.findUnique({
        select: workflowVersionDetailSelect,
        where: {
            id: versionId,
        },
    });
    if (!version) {
        throw new AppError("La versión de workflow solicitada no existe.", 404);
    }
    return version;
};
const getWorkflowValidatorReferenceData = async (db) => {
    const [users, roles, areas] = await Promise.all([
        db.user.findMany({
            select: { id: true },
            where: { deletedAt: null, isActive: true },
        }),
        db.role.findMany({
            select: { id: true },
            where: { deletedAt: null },
        }),
        db.area.findMany({
            select: { id: true },
            where: { active: true, deletedAt: null },
        }),
    ]);
    return {
        areas: new Set(areas.map((area) => area.id)),
        notificationTemplates: new Set(emailTemplateNames),
        roles: new Set(roles.map((role) => role.id)),
        users: new Set(users.map((user) => user.id)),
    };
};
const assertPersistableDesignerGraph = (input, processType) => {
    const validation = validateDesignerGraph(input, processType);
    const blockingCodes = new Set([
        "ASSIGNMENT_INVALID",
        "DUPLICATE_TRANSITION",
        "END_OUTGOING",
        "REJECTION_SELF_REFERENCE",
        "SELF_LOOP",
        "START_INCOMING",
        "START_PROCESS_MISMATCH",
        "TRANSITION_REFERENCE_MISSING",
    ]);
    const blockingIssue = validation.errors.find((issue) => blockingCodes.has(issue.code));
    if (blockingIssue) {
        throw new AppError(blockingIssue.message, 400);
    }
};
const invalidWorkflowValidationResult = (message) => ({
    errors: [
        {
            code: "CONFIGURATION_INVALID",
            message,
            severity: "ERROR",
            suggestedAction: "Corrija la configuración indicada y vuelva a validar.",
        },
    ],
    isValid: false,
    publicationReady: false,
    summary: {
        cycleCount: 0,
        endNodeCount: 0,
        nodeCount: 0,
        reachableNodeCount: 0,
        routeCountEstimate: 0,
        startNodeCount: 0,
        transitionCount: 0,
        unreachableNodeCount: 0,
    },
    warnings: [],
});
const copyConditionGroupData = (conditionGroup) => ({
    description: normalizeOptionalText(conditionGroup.description),
    logicOperator: conditionGroup.logicOperator,
    conditions: {
        create: conditionGroup.conditions.map((condition, index) => ({
            description: normalizeOptionalText(condition.description),
            field: condition.field,
            operator: condition.operator,
            sequence: condition.sequence ?? index,
            valueJson: condition.value === undefined || condition.value === null
                ? Prisma.JsonNull
                : toInputJsonValue(condition.value),
        })),
    },
});
const getConditionGroupForTransition = (transition, sourceNode, outgoingTransitionCount, existingGroups) => {
    if (transition.conditionGroup) {
        return transition.conditionGroup;
    }
    if (transition.conditionGroupId) {
        const existingGroup = existingGroups.get(transition.conditionGroupId);
        if (!existingGroup) {
            throw new AppError("La conexión referencia un grupo de condiciones de otra versión.", 400);
        }
        return {
            conditions: existingGroup.conditions.map((condition) => ({
                description: condition.description,
                field: condition.field,
                operator: condition.operator,
                resultLabel: null,
                sequence: condition.sequence,
                value: condition.valueJson,
            })),
            description: existingGroup.description,
            id: existingGroup.id,
            logicOperator: existingGroup.logicOperator,
        };
    }
    if (sourceNode.configurationJson.nodeType === "CONDITION" &&
        sourceNode.configurationJson.rules.length > 0 &&
        (transition.transitionType === "CONDITION" ||
            (!transition.transitionType && outgoingTransitionCount === 1))) {
        return {
            conditions: sourceNode.configurationJson.rules.map((rule, index) => ({
                ...rule,
                sequence: index,
                description: null,
            })),
            description: sourceNode.configurationJson.description,
            logicOperator: sourceNode.configurationJson.logicalOperator,
        };
    }
    return null;
};
const persistDesignerGraph = async (db, version, input) => {
    const existingNodes = await db.workflowNode.findMany({
        select: {
            id: true,
            nodeKey: true,
            workflowVersionId: true,
        },
        where: {
            workflowVersionId: version.id,
        },
    });
    const existingNodeById = new Map(existingNodes.map((node) => [node.id, node]));
    const existingNodeByKey = new Map(existingNodes.map((node) => [node.nodeKey, node]));
    const incomingUuidIds = input.nodes
        .map((node) => node.id)
        .filter((id) => Boolean(id && isUuid(id)));
    const referencedNodesOutsideVersion = await db.workflowNode.findMany({
        select: {
            id: true,
            workflowVersionId: true,
        },
        where: {
            id: {
                in: incomingUuidIds,
            },
        },
    });
    if (referencedNodesOutsideVersion.some((node) => node.workflowVersionId !== version.id)) {
        throw new AppError("El grafo contiene nodos pertenecientes a otra versión.", 400);
    }
    const existingGroups = await db.workflowConditionGroup.findMany({
        include: {
            conditions: {
                orderBy: {
                    sequence: "asc",
                },
            },
        },
        where: {
            workflowVersionId: version.id,
        },
    });
    const existingGroupsById = new Map(existingGroups.map((group) => [group.id, group]));
    const persistedNodeIds = new Set();
    const nodeIdByReference = new Map();
    const sourceNodeByPersistedId = new Map();
    for (const node of input.nodes) {
        const existing = (node.id && isUuid(node.id)
            ? existingNodeById.get(node.id)
            : undefined) ?? existingNodeByKey.get(node.nodeKey);
        const configurationAssignmentStrategy = "assignmentStrategy" in node.configurationJson
            ? node.configurationJson.assignmentStrategy
            : null;
        const assignmentStrategy = node.assignmentStrategy ?? configurationAssignmentStrategy ?? null;
        let persistedId;
        if (existing) {
            const updated = await db.workflowNode.update({
                data: {
                    assignmentStrategy,
                    configurationJson: toInputJsonValue(node.configurationJson),
                    description: normalizeOptionalText(node.description),
                    name: node.name,
                    nodeKey: node.nodeKey,
                    positionX: node.positionX,
                    positionY: node.positionY,
                    type: node.type,
                },
                select: {
                    id: true,
                },
                where: {
                    id: existing.id,
                },
            });
            persistedId = updated.id;
        }
        else {
            const created = await db.workflowNode.create({
                data: {
                    assignmentStrategy,
                    configurationJson: toInputJsonValue(node.configurationJson),
                    description: normalizeOptionalText(node.description),
                    name: node.name,
                    nodeKey: node.nodeKey,
                    positionX: node.positionX,
                    positionY: node.positionY,
                    type: node.type,
                    workflowVersionId: version.id,
                },
                select: {
                    id: true,
                },
            });
            persistedId = created.id;
        }
        persistedNodeIds.add(persistedId);
        nodeIdByReference.set(node.nodeKey, persistedId);
        if (node.id) {
            nodeIdByReference.set(node.id, persistedId);
        }
        sourceNodeByPersistedId.set(persistedId, node);
    }
    const incomingTransitionSourceIds = input.transitions.flatMap((transition) => [transition.sourceNodeId, transition.targetNodeId]);
    for (const reference of incomingTransitionSourceIds) {
        if (!nodeIdByReference.has(reference)) {
            throw new AppError("Una conexión referencia un nodo inexistente o de otra versión.", 400);
        }
    }
    await db.workflowTransition.deleteMany({
        where: {
            workflowVersionId: version.id,
        },
    });
    await db.workflowConditionGroup.deleteMany({
        where: {
            workflowVersionId: version.id,
        },
    });
    const removedNodeIds = existingNodes
        .map((node) => node.id)
        .filter((nodeId) => !persistedNodeIds.has(nodeId));
    if (removedNodeIds.length > 0) {
        await db.workflowNode.deleteMany({
            where: {
                id: {
                    in: removedNodeIds,
                },
                workflowVersionId: version.id,
            },
        });
    }
    const transitionIds = [];
    let conditionGroupCount = 0;
    for (const transition of input.transitions) {
        const sourceNodeId = nodeIdByReference.get(transition.sourceNodeId);
        const targetNodeId = nodeIdByReference.get(transition.targetNodeId);
        if (!sourceNodeId || !targetNodeId) {
            throw new AppError("No se pudo resolver una conexión del diseñador.", 400);
        }
        const sourceNode = sourceNodeByPersistedId.get(sourceNodeId);
        if (!sourceNode) {
            throw new AppError("No se pudo resolver el nodo origen de una conexión.", 400);
        }
        const conditionGroup = getConditionGroupForTransition(transition, sourceNode, input.transitions.filter((candidate) => candidate.sourceNodeId === transition.sourceNodeId).length, existingGroupsById);
        let conditionGroupId;
        if (conditionGroup) {
            const createdGroup = await db.workflowConditionGroup.create({
                data: {
                    ...copyConditionGroupData(conditionGroup),
                    workflowVersionId: version.id,
                },
                select: {
                    id: true,
                },
            });
            conditionGroupId = createdGroup.id;
            conditionGroupCount += 1;
        }
        const createdTransition = await db.workflowTransition.create({
            data: {
                conditionGroupId: conditionGroupId ?? null,
                label: normalizeOptionalText(transition.label),
                priority: transition.priority,
                sourceNodeId,
                targetNodeId,
                transitionType: normalizeOptionalText(transition.transitionType),
                workflowVersionId: version.id,
            },
            select: {
                id: true,
            },
        });
        transitionIds.push(createdTransition.id);
    }
    return {
        conditionGroupCount,
        nodeIds: [...persistedNodeIds],
        transitionIds,
    };
};
export const workflowService = {
    async listWorkflowDefinitions(query, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.view);
        const where = buildDefinitionWhere(query);
        const [total, data] = await prisma.$transaction([
            prisma.workflowDefinition.count({ where }),
            prisma.workflowDefinition.findMany({
                orderBy: [
                    buildDefinitionOrderBy(query.sortBy, query.sortDirection),
                    { id: "asc" },
                ],
                select: workflowDefinitionSelect,
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data: data.map(mapWorkflowDefinition),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async getWorkflowSummary(access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.view);
        const rows = await prisma.workflowDefinition.groupBy({
            _count: {
                _all: true,
            },
            by: ["status"],
        });
        return summarizeWorkflowStatuses(rows);
    },
    async getWorkflowOptions(access) {
        assertAnyPermission(access, [
            WORKFLOW_PERMISSIONS.create,
            WORKFLOW_PERMISSIONS.view,
        ]);
        const [processes, creators] = await prisma.$transaction([
            prisma.catalog.findMany({
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                select: {
                    description: true,
                    key: true,
                    name: true,
                },
                where: {
                    active: true,
                    deletedAt: null,
                    type: WORKFLOW_PROCESS_TYPE_CATALOG,
                },
            }),
            prisma.user.findMany({
                orderBy: [{ name: "asc" }, { email: "asc" }],
                select: {
                    email: true,
                    id: true,
                    name: true,
                },
                where: {
                    createdWorkflowDefinitions: {
                        some: {},
                    },
                    deletedAt: null,
                },
            }),
        ]);
        return {
            creators,
            processes: processes.filter((process) => process.key !== null),
        };
    },
    async getWorkflowDesignerOptions(access) {
        assertAnyPermission(access, [
            WORKFLOW_PERMISSIONS.edit,
            WORKFLOW_PERMISSIONS.simulate,
            WORKFLOW_PERMISSIONS.validate,
            WORKFLOW_PERMISSIONS.viewVersions,
        ]);
        const [users, roles, areas, riskLevels, observationStatuses] = await prisma.$transaction([
            prisma.user.findMany({
                orderBy: [{ name: "asc" }, { email: "asc" }],
                select: {
                    email: true,
                    id: true,
                    name: true,
                },
                where: {
                    deletedAt: null,
                    isActive: true,
                },
            }),
            prisma.role.findMany({
                orderBy: {
                    name: "asc",
                },
                select: {
                    description: true,
                    id: true,
                    name: true,
                },
                where: {
                    deletedAt: null,
                },
            }),
            prisma.area.findMany({
                orderBy: {
                    name: "asc",
                },
                select: {
                    id: true,
                    managerUser: {
                        select: {
                            email: true,
                            id: true,
                            name: true,
                        },
                    },
                    name: true,
                },
                where: {
                    active: true,
                    deletedAt: null,
                },
            }),
            prisma.riskLevel.findMany({
                orderBy: [{ severityOrder: "asc" }, { name: "asc" }],
                select: {
                    key: true,
                    name: true,
                },
                where: {
                    active: true,
                    deletedAt: null,
                },
            }),
            prisma.observationStatus.findMany({
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                select: {
                    key: true,
                    name: true,
                },
                where: {
                    active: true,
                    deletedAt: null,
                },
            }),
        ]);
        return {
            areas,
            assignmentStrategies: WORKFLOW_ASSIGNMENT_STRATEGY_VALUES.map((key) => ({
                key,
                label: ASSIGNMENT_STRATEGY_LABELS[key] ?? key,
            })),
            catalogs: {
                observationStatuses,
                riskLevels,
            },
            conditionFields: WORKFLOW_CONDITION_FIELD_VALUES.map((key) => ({
                key,
                label: WORKFLOW_RULE_FIELDS[key]?.label ??
                    CONDITION_FIELD_LABELS[key] ??
                    key,
            })),
            conditionOperators: WORKFLOW_CONDITION_OPERATOR_VALUES.map((key) => ({
                key,
                label: CONDITION_OPERATOR_LABELS[key] ?? key,
                requiresValue: !NO_VALUE_CONDITION_OPERATORS.has(key),
            })),
            notificationTemplates: emailTemplateNames.map((key) => ({
                key,
                name: key
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/^./, (character) => character.toUpperCase()),
            })),
            roles,
            users,
        };
    },
    async getWorkflowDefinition(workflowId, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.view);
        return getWorkflowDefinition(prisma, workflowId);
    },
    async createWorkflow(input, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.create);
        const created = await prisma.$transaction(async (db) => {
            const definition = await db.workflowDefinition.create({
                data: {
                    createdById: access.userId,
                    description: normalizeOptionalText(input.description),
                    name: input.name,
                    processType: input.processType,
                    status: "DRAFT",
                },
                select: {
                    id: true,
                },
            });
            const version = await db.workflowVersion.create({
                data: {
                    changeDescription: normalizeOptionalText(input.versionNotes),
                    createdById: access.userId,
                    status: "DRAFT",
                    versionNumber: 1,
                    workflowDefinitionId: definition.id,
                },
                select: {
                    id: true,
                    status: true,
                    versionNumber: true,
                    workflowDefinitionId: true,
                },
            });
            const result = await getWorkflowDefinition(db, definition.id);
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.create,
                db,
                entityId: result.id,
                entityType: WORKFLOW_DEFINITION_ENTITY_TYPE,
                newValues: result,
                oldValues: null,
                summary: `Se creó el workflow ${result.name}.`,
            });
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.createVersion,
                db,
                entityId: version.id,
                entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                newValues: version,
                oldValues: null,
                summary: `Se creó la versión ${version.versionNumber} del workflow.`,
            });
            return result;
        });
        return created;
    },
    async updateWorkflowMetadata(workflowId, input, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.edit);
        return prisma.$transaction(async (db) => {
            const previous = await getWorkflowDefinition(db, workflowId);
            if (previous.status === "ARCHIVED") {
                throw new AppError("Un workflow archivado no se puede modificar.", 409);
            }
            if (input.processType !== undefined &&
                input.processType !== previous.processType) {
                const publishedVersionCount = await db.workflowVersion.count({
                    where: {
                        status: "PUBLISHED",
                        workflowDefinitionId: workflowId,
                    },
                });
                if (previous._count.instances > 0 || publishedVersionCount > 0) {
                    throw new AppError("No se puede cambiar el proceso de un workflow publicado o con instancias.", 409);
                }
            }
            const current = await db.workflowDefinition.update({
                data: {
                    ...(input.description !== undefined
                        ? { description: normalizeOptionalText(input.description) }
                        : {}),
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.processType !== undefined
                        ? { processType: input.processType }
                        : {}),
                },
                select: {
                    id: true,
                },
                where: {
                    id: workflowId,
                },
            });
            const result = await getWorkflowDefinition(db, current.id);
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.update,
                db,
                entityId: result.id,
                entityType: WORKFLOW_DEFINITION_ENTITY_TYPE,
                newValues: result,
                oldValues: previous,
                summary: `Se actualizó el workflow ${result.name}.`,
            });
            return result;
        });
    },
    async archiveWorkflow(workflowId, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.archive);
        return prisma.$transaction(async (db) => {
            const previous = await getWorkflowDefinition(db, workflowId);
            if (previous.status === "ARCHIVED") {
                return previous;
            }
            const archived = await db.workflowDefinition.update({
                data: {
                    archivedAt: new Date(),
                    status: "ARCHIVED",
                },
                select: {
                    id: true,
                },
                where: {
                    id: workflowId,
                },
            });
            const result = await getWorkflowDefinition(db, archived.id);
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.archive,
                db,
                entityId: result.id,
                entityType: WORKFLOW_DEFINITION_ENTITY_TYPE,
                newValues: result,
                oldValues: previous,
                summary: `Se archivó el workflow ${result.name}.`,
            });
            return result;
        });
    },
    async duplicateWorkflow(workflowId, input, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.create);
        return prisma.$transaction(async (db) => {
            const source = await getWorkflowDefinition(db, workflowId);
            const sourceVersion = await getWorkflowVersionForClone(db, workflowId, input.sourceVersionId);
            const duplicateName = input.name ?? `Copia de ${source.name}`.slice(0, 191);
            const duplicate = await db.workflowDefinition.create({
                data: {
                    createdById: access.userId,
                    description: input.description !== undefined
                        ? normalizeOptionalText(input.description)
                        : source.description,
                    name: duplicateName,
                    processType: source.processType,
                    status: "DRAFT",
                },
                select: {
                    id: true,
                },
            });
            const version = await createDraftVersionFromSource(db, sourceVersion, duplicate.id, 1, access.userId, normalizeOptionalText(input.versionNotes) ??
                `Copia de la versión ${sourceVersion.versionNumber}.`);
            const result = await getWorkflowDefinition(db, duplicate.id);
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.duplicate,
                db,
                entityId: result.id,
                entityType: WORKFLOW_DEFINITION_ENTITY_TYPE,
                newValues: result,
                oldValues: source,
                summary: `Se duplicó el workflow ${source.name} como ${result.name}.`,
            });
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.createVersion,
                db,
                entityId: version.id,
                entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                newValues: version,
                oldValues: null,
                summary: `Se creó la versión ${version.versionNumber} del workflow duplicado.`,
            });
            return result;
        });
    },
    async createDraftVersion(workflowId, input, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.edit);
        return prisma.$transaction(async (db) => {
            const definition = await getWorkflowDefinition(db, workflowId);
            if (definition.status === "ARCHIVED") {
                throw new AppError("No se pueden crear versiones en un workflow archivado.", 409);
            }
            const source = await getWorkflowVersionForClone(db, workflowId, input.sourceVersionId);
            const versionNumber = await getNextVersionNumber(db, workflowId);
            const version = await createDraftVersionFromSource(db, source, workflowId, versionNumber, access.userId, normalizeOptionalText(input.changeDescription));
            const result = await db.workflowVersion.findUnique({
                select: workflowVersionDetailSelect,
                where: {
                    id: version.id,
                },
            });
            if (!result) {
                throw new AppError("No se pudo cargar la versión recién creada.", 500);
            }
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.createVersion,
                db,
                entityId: result.id,
                entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                newValues: result,
                oldValues: null,
                summary: `Se creó la versión ${result.versionNumber} del workflow.`,
            });
            return mapWorkflowVersionDetail(result);
        });
    },
    async listWorkflowVersions(workflowId, query, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.viewVersions);
        await getWorkflowDefinition(prisma, workflowId);
        const where = {
            workflowDefinitionId: workflowId,
            ...(query.status ? { status: query.status } : {}),
        };
        const [total, data] = await prisma.$transaction([
            prisma.workflowVersion.count({ where }),
            prisma.workflowVersion.findMany({
                orderBy: [{ versionNumber: "desc" }, { id: "asc" }],
                select: workflowVersionListSelect,
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data,
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async getWorkflowVersion(versionId, access) {
        assertAnyPermission(access, [
            WORKFLOW_PERMISSIONS.simulate,
            WORKFLOW_PERMISSIONS.viewVersions,
        ]);
        const version = await prisma.workflowVersion.findUnique({
            select: workflowVersionDetailSelect,
            where: {
                id: versionId,
            },
        });
        if (!version) {
            throw new AppError("La versión de workflow solicitada no existe.", 404);
        }
        return mapWorkflowVersionDetail(version);
    },
    async getWorkflowDesigner(versionId, access) {
        assertAnyPermission(access, [
            WORKFLOW_PERMISSIONS.edit,
            WORKFLOW_PERMISSIONS.simulate,
            WORKFLOW_PERMISSIONS.validate,
            WORKFLOW_PERMISSIONS.viewVersions,
        ]);
        return buildDesignerResult(await getDesignerVersion(prisma, versionId), access);
    },
    async saveWorkflowDesigner(versionId, input, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.edit);
        const parsedInput = workflowDesignerSaveSchema.parse(input);
        return prisma.$transaction(async (db) => {
            const version = await getDesignerVersion(db, versionId);
            if (version.definition.status === "ARCHIVED") {
                throw new AppError("No se puede guardar el diseñador de un workflow archivado.", 409);
            }
            assertDraftWorkflowVersion(version.status);
            assertPersistableDesignerGraph(parsedInput, version.definition.processType);
            const previousCounts = {
                conditionGroups: version._count.conditionGroups,
                nodes: version._count.nodes,
                transitions: version._count.transitions,
            };
            const persisted = await persistDesignerGraph(db, version, parsedInput);
            const savedVersion = await getDesignerVersion(db, versionId);
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.designerSaved,
                db,
                entityId: versionId,
                entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                newValues: {
                    conditionGroupIds: persisted.conditionGroupCount,
                    nodeIds: persisted.nodeIds,
                    transitionIds: persisted.transitionIds,
                },
                oldValues: previousCounts,
                summary: `Se guardó el diseñador de la versión ${version.versionNumber}.`,
            });
            return buildDesignerResult(savedVersion, access);
        });
    },
    async validateWorkflowDesigner(versionId, input, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.validate);
        return prisma.$transaction(async (db) => {
            const version = await getDesignerVersion(db, versionId);
            if (version.definition.status === "ARCHIVED") {
                throw new AppError("No se puede validar el diseñador de un workflow archivado.", 409);
            }
            assertDraftWorkflowVersion(version.status);
            let validation;
            try {
                const parsed = workflowDesignerSaveSchema.safeParse(input.graph ?? mapPersistedDesignerInput(version));
                if (!parsed.success) {
                    validation = invalidWorkflowValidationResult("Una o más configuraciones de nodo no son válidas.");
                }
                else {
                    validation = validateWorkflowGraph(parsed.data, {
                        definitionId: version.definition.id,
                        forPublication: true,
                        knownConditionGroupIds: new Set(version.conditionGroups.map((group) => group.id)),
                        processType: version.definition.processType,
                        references: await getWorkflowValidatorReferenceData(db),
                        versionNumber: version.versionNumber,
                        versionStatus: version.status,
                        workflowDefinitionStatus: version.definition.status,
                    });
                }
            }
            catch (error) {
                validation = invalidWorkflowValidationResult(error instanceof AppError
                    ? error.message
                    : "Una o más configuraciones de nodo no son válidas.");
            }
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.validationExecuted,
                db,
                entityId: versionId,
                entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                newValues: {
                    errorCount: validation.errors.length,
                    graphHash: validation.graphHash ?? null,
                    publicationReady: validation.publicationReady,
                    warningCount: validation.warnings.length,
                },
                oldValues: null,
                summary: `Se validó el diseñador de la versión ${version.versionNumber}.`,
            });
            return validation;
        });
    },
    async simulateWorkflowVersion(versionId, input, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.simulate);
        return prisma.$transaction(async (db) => {
            const version = await getDesignerVersion(db, versionId);
            if (version.definition.status === "ARCHIVED" ||
                version.status === "ARCHIVED") {
                throw new AppError("Las versiones archivadas no pueden simularse.", 409);
            }
            const mappedGraph = mapPersistedDesignerInput(version);
            const parsedGraph = workflowDesignerSaveSchema.safeParse(mappedGraph);
            const validation = parsedGraph.success
                ? validateWorkflowGraph(parsedGraph.data, {
                    definitionId: version.definition.id,
                    forPublication: false,
                    knownConditionGroupIds: new Set(version.conditionGroups.map((group) => group.id)),
                    processType: version.definition.processType,
                    references: await getWorkflowValidatorReferenceData(db),
                    versionNumber: version.versionNumber,
                    versionStatus: version.status,
                    workflowDefinitionStatus: version.definition.status,
                })
                : invalidWorkflowValidationResult("Una o más configuraciones de nodo no son válidas.");
            const now = new Date();
            const simulationContext = buildWorkflowSimulationContext({
                ...input.context,
                processType: input.context.processType ?? version.definition.processType,
            });
            const areaRows = await db.area.findMany({
                select: { id: true, managerUserId: true },
                where: { active: true, deletedAt: null },
            });
            const result = simulateWorkflowGraph({
                graph: parsedGraph.success
                    ? parsedGraph.data
                    : { nodes: [], transitions: [] },
                request: {
                    assignmentLookup: {
                        areaManagerUserIds: Object.fromEntries(areaRows.map((area) => [area.id, area.managerUserId])),
                    },
                    context: simulationContext,
                    nodeDecisions: input.nodeDecisions,
                    now,
                    ...(input.scenarioName ? { scenarioName: input.scenarioName } : {}),
                    startedAt: now,
                },
                validation,
                versionId,
            });
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.simulationExecuted,
                db,
                entityId: versionId,
                entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                newValues: {
                    errorCount: result.errors.length,
                    finalNodeId: result.finalNodeId ?? null,
                    scenarioName: result.scenarioName ?? null,
                    visitedNodes: result.summary.visitedNodes,
                    warningCount: result.warnings.length,
                },
                oldValues: null,
                summary: `Se ejecutó una simulación de la versión ${version.versionNumber}.`,
            });
            return result;
        });
    },
    async publishWorkflowVersion(versionId, input, access) {
        assertCanPublishWorkflowVersion(access);
        return prisma.$transaction(async (db) => {
            const version = await getDesignerVersion(db, versionId);
            if (version.definition.status === "ARCHIVED") {
                throw new AppError("No se puede publicar un workflow archivado.", 409);
            }
            assertDraftWorkflowVersion(version.status);
            const graph = mapPersistedDesignerInput(version);
            const parsedGraph = workflowDesignerSaveSchema.safeParse(graph);
            if (!parsedGraph.success) {
                throw new AppError("El grafo contiene configuraciones inválidas y no puede publicarse.", 409);
            }
            const validation = validateWorkflowGraph(parsedGraph.data, {
                definitionId: version.definition.id,
                forPublication: true,
                knownConditionGroupIds: new Set(version.conditionGroups.map((group) => group.id)),
                processType: version.definition.processType,
                references: await getWorkflowValidatorReferenceData(db),
                versionNumber: version.versionNumber,
                versionStatus: version.status,
                workflowDefinitionStatus: version.definition.status,
            });
            if (!validation.isValid) {
                throw new AppError(`No se puede publicar el flujo: ${validation.errors.length} error(es) de validación.`, 409, {
                    errors: validation.errors,
                    graphHash: validation.graphHash ?? null,
                    warnings: validation.warnings,
                });
            }
            const graphHash = validation.graphHash ??
                buildWorkflowGraphHash({
                    definitionId: version.definition.id,
                    graph: parsedGraph.data,
                    processType: version.definition.processType,
                    versionNumber: version.versionNumber,
                });
            if (input.graphHash !== graphHash) {
                throw new AppError("El grafo cambió después de la última validación. Vuelva a validar antes de publicar.", 409, { currentGraphHash: graphHash, validatedGraphHash: input.graphHash });
            }
            const publishedAt = new Date();
            const publication = await publishWorkflowVersionState(db, {
                definitionId: version.definition.id,
                publishedAt,
                publishedById: access.userId,
                versionId,
            });
            await writeWorkflowAudit({
                access,
                action: WORKFLOW_ACTIVITY_ACTIONS.published,
                db,
                entityId: versionId,
                entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                newValues: {
                    errorCount: 0,
                    graphHash,
                    newActiveVersion: version.versionNumber,
                    previousActiveVersion: publication.previousVersion?.versionNumber ?? null,
                    publishedAt,
                    warningCount: validation.warnings.length,
                },
                oldValues: { status: "DRAFT" },
                summary: `Se publicó la versión ${version.versionNumber} del workflow.`,
            });
            if (publication.previousVersion) {
                await writeWorkflowAudit({
                    access,
                    action: WORKFLOW_ACTIVITY_ACTIONS.previousDeactivated,
                    db,
                    entityId: publication.previousVersion.id,
                    entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                    newValues: {
                        deactivatedBy: access.userId,
                        newActiveVersion: version.versionNumber,
                        previousVersion: publication.previousVersion.versionNumber,
                    },
                    oldValues: { status: "PUBLISHED" },
                    summary: `Se desactivó la versión anterior ${publication.previousVersion.versionNumber}.`,
                });
            }
            const definition = await getWorkflowDefinition(db, version.definition.id);
            return {
                definition,
                graphHash,
                previousActiveVersion: publication.previousVersion,
                validation,
                version: publication.version,
            };
        });
    },
    async listWorkflowActivity(workflowId, query, access) {
        assertPermission(access, WORKFLOW_PERMISSIONS.view);
        await getWorkflowDefinition(prisma, workflowId);
        const versionRows = await prisma.workflowVersion.findMany({
            select: {
                id: true,
            },
            where: {
                workflowDefinitionId: workflowId,
            },
        });
        const versionIds = versionRows.map((version) => version.id);
        const where = {
            OR: [
                {
                    entityId: workflowId,
                    entityType: WORKFLOW_DEFINITION_ENTITY_TYPE,
                },
                ...(versionIds.length > 0
                    ? [
                        {
                            entityId: {
                                in: versionIds,
                            },
                            entityType: WORKFLOW_VERSION_ENTITY_TYPE,
                        },
                    ]
                    : []),
            ],
        };
        const [total, data] = await prisma.$transaction([
            prisma.activityLog.count({ where }),
            prisma.activityLog.findMany({
                orderBy: {
                    createdAt: "desc",
                },
                select: {
                    action: true,
                    createdAt: true,
                    entityId: true,
                    entityType: true,
                    id: true,
                    metadata: true,
                    user: {
                        select: {
                            email: true,
                            id: true,
                            name: true,
                        },
                    },
                },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data,
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    assertCanCancelInstance(access) {
        assertPermission(access, WORKFLOW_INSTANCE_PERMISSIONS.cancel);
    },
    assertCanRetryInstance(access) {
        assertPermission(access, WORKFLOW_INSTANCE_PERMISSIONS.retry);
    },
    assertCanPublishVersion(access) {
        assertCanPublishWorkflowVersion(access);
    },
};
//# sourceMappingURL=workflows.service.js.map