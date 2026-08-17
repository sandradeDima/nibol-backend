import { workflowNodeConfigurationSchema, } from "./workflows.validators.js";
import { WorkflowRuntimeError, WORKFLOW_RUNTIME_ERROR_CODES, } from "./workflow-runtime-errors.js";
const graphInclude = {
    definition: {
        select: {
            id: true,
            name: true,
            processType: true,
        },
    },
    nodes: true,
    transitions: {
        include: {
            conditionGroup: {
                include: {
                    conditions: true,
                },
            },
        },
        orderBy: [{ priority: "asc" }, { id: "asc" }],
    },
};
const parseNodeConfiguration = (node) => {
    const parsed = workflowNodeConfigurationSchema.safeParse(node.configurationJson);
    if (!parsed.success || parsed.data.nodeType !== node.type) {
        throw new WorkflowRuntimeError(WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION, `La configuración publicada del nodo ${node.nodeKey} no es válida para ejecución.`, 409, { nodeKey: node.nodeKey, nodeType: node.type });
    }
    return parsed.data;
};
const toGraphConditionGroup = (group) => ({
    conditions: group.conditions.map((condition) => ({
        description: condition.description,
        field: condition.field,
        operator: condition.operator,
        resultLabel: null,
        sequence: condition.sequence,
        value: condition.valueJson,
    })),
    description: group.description,
    id: group.id,
    logicOperator: group.logicOperator,
});
export const loadPinnedWorkflowGraph = async (db, versionId) => {
    const version = (await db.workflowVersion.findUnique({
        include: graphInclude,
        where: { id: versionId },
    }));
    if (!version) {
        throw new WorkflowRuntimeError(WORKFLOW_RUNTIME_ERROR_CODES.VERSION_NOT_PUBLISHED, "La versión fijada del workflow ya no está disponible para ejecución.", 409);
    }
    const nodes = version.nodes.map((node) => ({
        assignmentStrategy: node.assignmentStrategy,
        configurationJson: parseNodeConfiguration(node),
        description: node.description,
        id: node.id,
        name: node.name,
        nodeKey: node.nodeKey,
        positionX: node.positionX,
        positionY: node.positionY,
        type: node.type,
        updatedAt: node.updatedAt,
    }));
    const transitions = version.transitions.map((transition) => ({
        conditionGroup: transition.conditionGroup
            ? toGraphConditionGroup(transition.conditionGroup)
            : null,
        id: transition.id,
        label: transition.label,
        priority: transition.priority,
        sourceNodeId: transition.sourceNodeId,
        targetNodeId: transition.targetNodeId,
        transitionType: transition.transitionType,
    }));
    return {
        definitionId: version.definition.id,
        definitionName: version.definition.name,
        nodes,
        processType: version.definition.processType,
        transitions,
        versionId: version.id,
        versionNumber: version.versionNumber,
        versionStatus: version.status,
    };
};
export const getRuntimeStartNode = (graph) => graph.nodes.find((node) => node.type === "START") ?? null;
export const getRuntimeNode = (graph, nodeId) => graph.nodes.find((node) => node.id === nodeId) ?? null;
//# sourceMappingURL=workflow-runtime-graph.js.map