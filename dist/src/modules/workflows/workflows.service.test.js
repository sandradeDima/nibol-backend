import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../utils/app-error.js";
import { AUDIT_WORKFLOW_PERMISSION_NAMES, ALL_PERMISSION_NAMES, WORKFLOW_PERMISSION_NAMES, } from "../../permissions/definitions.js";
import { createWorkflowSchema, duplicateWorkflowSchema, listWorkflowsQuerySchema, workflowActivityQuerySchema, workflowDesignerSaveSchema, } from "./workflows.validators.js";
import { assertCanPublishWorkflowVersion, assertDraftWorkflowVersion, assertUniqueWorkflowNodeKeys, buildDefinitionOrderBy, buildDefinitionWhere, assertWorkflowCanStartInstance, buildWorkflowAuditEvents, nextWorkflowVersionNumber, summarizeWorkflowStatuses, validateDesignerGraph, workflowService, } from "./workflows.service.js";
const unauthorizedAccess = {
    isAdmin: false,
    permissions: [],
    roles: ["Usuario"],
    userId: "4f7c2f4c-9f1d-42af-8b55-fd54c88e2cc2",
};
test("crear un workflow parte en la versión 1 en borrador", () => {
    const input = createWorkflowSchema.parse({
        name: "Aprobación de evidencia",
        processType: "EVIDENCE_REVIEW",
        versionNotes: "Versión inicial",
    });
    assert.equal(nextWorkflowVersionNumber([]), 1);
    assert.equal(input.processType, "EVIDENCE_REVIEW");
    assert.equal(input.versionNotes, "Versión inicial");
});
test("los números de versión incrementan secuencialmente", () => {
    assert.equal(nextWorkflowVersionNumber([1]), 2);
    assert.equal(nextWorkflowVersionNumber([1, 2, 5]), 6);
});
test("una versión publicada no puede modificarse", () => {
    assert.throws(() => assertDraftWorkflowVersion("PUBLISHED"), (error) => error instanceof AppError && error.statusCode === 409);
    assert.doesNotThrow(() => assertDraftWorkflowVersion("DRAFT"));
});
test("un workflow archivado no puede iniciar una instancia", () => {
    assert.throws(() => assertWorkflowCanStartInstance("ARCHIVED"), (error) => error instanceof AppError && error.statusCode === 409);
    assert.doesNotThrow(() => assertWorkflowCanStartInstance("PUBLISHED"));
});
test("la duplicación permite una definición independiente con nombre propio", () => {
    const input = duplicateWorkflowSchema.parse({
        name: "Copia de aprobación",
        sourceVersionId: "6e2f5443-c05c-4b0b-a6ef-f0d8b64d3d16",
        versionNotes: "Borrador derivado",
    });
    assert.equal(input.name, "Copia de aprobación");
    assert.equal(input.sourceVersionId, "6e2f5443-c05c-4b0b-a6ef-f0d8b64d3d16");
    assert.notEqual(input.name, "Aprobación original");
});
test("el resumen de workflows agrupa estados sin perder el total", () => {
    assert.deepEqual(summarizeWorkflowStatuses([
        { _count: { _all: 3 }, status: "DRAFT" },
        { _count: { _all: 2 }, status: "PUBLISHED" },
        { _count: { _all: 1 }, status: "ARCHIVED" },
    ]), {
        archived: 1,
        drafts: 3,
        inactive: 0,
        published: 2,
        total: 6,
    });
});
test("la lista valida filtros, orden controlado y paginación", () => {
    const query = listWorkflowsQuerySchema.parse({
        createdById: "4f7c2f4c-9f1d-42af-8b55-fd54c88e2cc2",
        page: "2",
        perPage: "20",
        processType: "EVIDENCE_REVIEW",
        search: "  evidencia  ",
        sortBy: "name",
        sortDirection: "asc",
        status: "ARCHIVED",
    });
    assert.equal(query.page, 2);
    assert.equal(query.perPage, 20);
    assert.deepEqual(buildDefinitionOrderBy(query.sortBy, query.sortDirection), {
        name: "asc",
    });
    assert.deepEqual(buildDefinitionWhere(query), {
        createdById: "4f7c2f4c-9f1d-42af-8b55-fd54c88e2cc2",
        OR: [
            { name: { contains: "evidencia" } },
            { description: { contains: "evidencia" } },
        ],
        processType: "EVIDENCE_REVIEW",
        status: "ARCHIVED",
    });
});
test("la consulta de actividad aplica límites seguros", () => {
    assert.deepEqual(workflowActivityQuerySchema.parse({}), {
        page: 1,
        perPage: 10,
    });
    assert.throws(() => workflowActivityQuerySchema.parse({ perPage: 51 }));
});
test("usuarios no autorizados no pueden crear workflows", async () => {
    await assert.rejects(workflowService.createWorkflow({
        description: null,
        name: "Workflow sin permiso",
        processType: "SPECIAL_REQUEST",
        versionNotes: null,
    }, unauthorizedAccess), (error) => error instanceof AppError && error.statusCode === 403);
});
test("usuarios no autorizados no pueden publicar workflows", () => {
    assert.throws(() => assertCanPublishWorkflowVersion(unauthorizedAccess), (error) => error instanceof AppError && error.statusCode === 403);
});
test("los nodeKey son únicos dentro de una versión", () => {
    assert.doesNotThrow(() => assertUniqueWorkflowNodeKeys(["start", "review"]));
    assert.throws(() => assertUniqueWorkflowNodeKeys(["start", "review", "start"]), (error) => error instanceof AppError && error.statusCode === 409);
});
test("el esquema permite guardar un grafo vacío y la validación lo marca incompleto", () => {
    const graph = workflowDesignerSaveSchema.parse({
        nodes: [],
        transitions: [],
    });
    const validation = validateDesignerGraph(graph, "SPECIAL_REQUEST");
    assert.deepEqual(graph, { nodes: [], transitions: [] });
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some((issue) => issue.code === "START_COUNT"));
    assert.ok(validation.errors.some((issue) => issue.code === "END_REQUIRED"));
});
test("la validación resuelve referencias de nodos temporales", () => {
    const graph = workflowDesignerSaveSchema.parse({
        nodes: [
            {
                configurationJson: {
                    activationNote: null,
                    description: null,
                    initialWorkflowState: "DRAFT",
                    name: "Inicio",
                    nodeType: "START",
                    processType: "SPECIAL_REQUEST",
                    schemaVersion: 1,
                    triggerProcess: "SPECIAL_REQUEST",
                },
                description: null,
                id: "client_start",
                name: "Inicio",
                nodeKey: "start_1",
                positionX: 0,
                positionY: 0,
                type: "START",
            },
            {
                configurationJson: {
                    completionMessage: null,
                    description: null,
                    finalResult: "APPROVED",
                    finalWorkflowStatus: "COMPLETED",
                    name: "Fin",
                    nodeType: "END",
                    notifyParticipants: true,
                    relatedRecordTargetState: null,
                    schemaVersion: 1,
                },
                description: null,
                id: "client_end",
                name: "Fin",
                nodeKey: "end_1",
                positionX: 320,
                positionY: 0,
                type: "END",
            },
        ],
        transitions: [
            {
                label: "Continuar",
                priority: 0,
                sourceNodeId: "client_start",
                targetNodeId: "client_end",
                transitionType: "DEFAULT",
            },
        ],
    });
    const validation = validateDesignerGraph(graph, "SPECIAL_REQUEST");
    assert.equal(validation.isValid, true);
    assert.equal(validation.errors.length, 0);
});
test("la configuración de condición rechaza operadores incompatibles", () => {
    const result = workflowDesignerSaveSchema.safeParse({
        nodes: [
            {
                configurationJson: {
                    defaultRouteLabel: null,
                    description: null,
                    logicalOperator: "AND",
                    name: "Condición",
                    nodeType: "CONDITION",
                    rules: [
                        {
                            field: "riskLevel",
                            operator: "IS_EMPTY",
                            resultLabel: null,
                            value: "HIGH",
                        },
                    ],
                    schemaVersion: 1,
                },
                description: null,
                id: "client_condition",
                name: "Condición",
                nodeKey: "condition_1",
                positionX: 0,
                positionY: 0,
                type: "CONDITION",
            },
        ],
        transitions: [],
    });
    assert.equal(result.success, false);
});
test("la validación marca una asignación de etapa incompleta", () => {
    const graph = workflowDesignerSaveSchema.parse({
        nodes: [
            {
                configurationJson: {
                    allowedActions: ["COMPLETE"],
                    areaId: null,
                    assignmentStrategy: null,
                    description: null,
                    fallbackRoleId: null,
                    fallbackStrategy: "STOP",
                    fallbackUserId: null,
                    fieldReference: null,
                    name: "Revisión",
                    nodeType: "STAGE",
                    requiredComment: false,
                    requiredEvidence: false,
                    resultingState: null,
                    roleId: null,
                    schemaVersion: 1,
                    sla: null,
                    userId: null,
                },
                description: null,
                id: "client_stage",
                name: "Revisión",
                nodeKey: "stage_1",
                positionX: 0,
                positionY: 0,
                type: "STAGE",
            },
        ],
        transitions: [],
    });
    const validation = validateDesignerGraph(graph, "SPECIAL_REQUEST");
    assert.ok(validation.errors.some((issue) => issue.code === "ASSIGNMENT_INVALID"));
});
test("las mutaciones de workflow generan eventos de actividad y auditoría", () => {
    const events = buildWorkflowAuditEvents({
        access: {
            ipAddress: "127.0.0.1",
            isAdmin: true,
            permissions: ["workflows.create"],
            roles: ["Admin"],
            userId: unauthorizedAccess.userId,
        },
        action: "workflows.create",
        entityId: "6e2f5443-c05c-4b0b-a6ef-f0d8b64d3d16",
        entityType: "workflow_definition",
        newValues: { status: "DRAFT" },
        oldValues: null,
        summary: "Se creó el workflow.",
    });
    assert.equal(events.activity.action, "workflows.create");
    assert.equal(events.audit.entityType, "workflow_definition");
    assert.equal(events.audit.oldValues, null);
});
test("los permisos workflow se pueden sembrar de forma idempotente", () => {
    assert.equal(new Set(ALL_PERMISSION_NAMES).size, ALL_PERMISSION_NAMES.length);
    assert.equal(new Set(WORKFLOW_PERMISSION_NAMES).size, WORKFLOW_PERMISSION_NAMES.length);
    assert.ok(AUDIT_WORKFLOW_PERMISSION_NAMES.every((permission) => WORKFLOW_PERMISSION_NAMES.includes(permission)));
});
//# sourceMappingURL=workflows.service.test.js.map