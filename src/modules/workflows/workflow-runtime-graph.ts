import type { Prisma } from "../../../generated/prisma/client.js";

import {
  workflowNodeConfigurationSchema,
  type WorkflowNodeConfiguration,
} from "./workflows.validators.js";
import type {
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGraphTransition,
} from "./workflow-graph.js";
import {
  WorkflowRuntimeError,
  WORKFLOW_RUNTIME_ERROR_CODES,
} from "./workflow-runtime-errors.js";

type RuntimeDatabase = Prisma.TransactionClient;

type RuntimeNode = WorkflowGraphNode & {
  configurationJson: WorkflowNodeConfiguration;
  id: string;
};

type RuntimeTransition = WorkflowGraphTransition & {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
};

export type PinnedWorkflowGraph = Omit<
  WorkflowGraph,
  "nodes" | "transitions"
> & {
  definitionId: string;
  definitionName: string;
  nodes: RuntimeNode[];
  processType: string;
  transitions: RuntimeTransition[];
  versionId: string;
  versionNumber: number;
  versionStatus: string;
};

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
} as Prisma.WorkflowVersionInclude;

type RuntimeVersionRecord = {
  definition: { id: string; name: string; processType: string };
  id: string;
  nodes: Array<{
    assignmentStrategy: string | null;
    configurationJson: Prisma.JsonValue;
    description: string | null;
    id: string;
    name: string;
    nodeKey: string;
    positionX: number;
    positionY: number;
    type: string;
    updatedAt: Date;
  }>;
  status: string;
  transitions: Array<{
    conditionGroup: {
      conditions: Array<{
        description: string | null;
        field: string;
        id: string;
        operator: string;
        sequence: number;
        valueJson: Prisma.JsonValue | null;
      }>;
      description: string | null;
      id: string;
      logicOperator: "AND" | "OR";
    } | null;
    id: string;
    label: string | null;
    priority: number;
    sourceNodeId: string;
    targetNodeId: string;
    transitionType: string | null;
  }>;
  versionNumber: number;
};

const parseNodeConfiguration = (
  node: RuntimeVersionRecord["nodes"][number],
): WorkflowNodeConfiguration => {
  const parsed = workflowNodeConfigurationSchema.safeParse(
    node.configurationJson,
  );
  if (!parsed.success || parsed.data.nodeType !== node.type) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
      `La configuración publicada del nodo ${node.nodeKey} no es válida para ejecución.`,
      409,
      { nodeKey: node.nodeKey, nodeType: node.type },
    );
  }
  return parsed.data;
};

const toGraphConditionGroup = (
  group: NonNullable<
    RuntimeVersionRecord["transitions"][number]["conditionGroup"]
  >,
): NonNullable<RuntimeTransition["conditionGroup"]> => ({
  conditions: group.conditions.map((condition) => ({
    description: condition.description,
    field: condition.field,
    operator: condition.operator,
    resultLabel: null,
    sequence: condition.sequence,
    value: condition.valueJson,
  })) as NonNullable<RuntimeTransition["conditionGroup"]>["conditions"],
  description: group.description,
  id: group.id,
  logicOperator: group.logicOperator,
});

export const loadPinnedWorkflowGraph = async (
  db: RuntimeDatabase,
  versionId: string,
): Promise<PinnedWorkflowGraph> => {
  const version = (await db.workflowVersion.findUnique({
    include: graphInclude,
    where: { id: versionId },
  })) as RuntimeVersionRecord | null;

  if (!version) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.VERSION_NOT_PUBLISHED,
      "La versión fijada del workflow ya no está disponible para ejecución.",
      409,
    );
  }

  const nodes: RuntimeNode[] = version.nodes.map((node) => ({
    assignmentStrategy:
      node.assignmentStrategy as RuntimeNode["assignmentStrategy"],
    configurationJson: parseNodeConfiguration(node),
    description: node.description,
    id: node.id,
    name: node.name,
    nodeKey: node.nodeKey,
    positionX: node.positionX,
    positionY: node.positionY,
    type: node.type as RuntimeNode["type"],
    updatedAt: node.updatedAt,
  }));

  const transitions: RuntimeTransition[] = version.transitions.map(
    (transition) => ({
      conditionGroup: transition.conditionGroup
        ? toGraphConditionGroup(transition.conditionGroup)
        : null,
      id: transition.id,
      label: transition.label,
      priority: transition.priority,
      sourceNodeId: transition.sourceNodeId,
      targetNodeId: transition.targetNodeId,
      transitionType:
        transition.transitionType as RuntimeTransition["transitionType"],
    }),
  );

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

export const getRuntimeStartNode = (
  graph: PinnedWorkflowGraph,
): RuntimeNode | null =>
  graph.nodes.find((node) => node.type === "START") ?? null;

export const getRuntimeNode = (
  graph: PinnedWorkflowGraph,
  nodeId: string,
): RuntimeNode | null => graph.nodes.find((node) => node.id === nodeId) ?? null;
