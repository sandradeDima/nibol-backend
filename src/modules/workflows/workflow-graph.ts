import { createHash } from "node:crypto";

import type {
  WorkflowNodeConfiguration,
  WorkflowDesignerSaveInput,
} from "./workflows.validators.js";
import type { WorkflowConditionGroup } from "./workflow-rule-engine.js";

export type WorkflowGraphNode = WorkflowDesignerSaveInput["nodes"][number];
export type WorkflowGraphTransition =
  WorkflowDesignerSaveInput["transitions"][number];

export type WorkflowGraph = {
  nodes: WorkflowGraphNode[];
  transitions: WorkflowGraphTransition[];
};

export type GraphPath = {
  nodeIds: string[];
  transitionIds: string[];
};

export type GraphPathEnumeration = {
  paths: GraphPath[];
  truncated: boolean;
};

const nodeReference = (node: WorkflowGraphNode): string =>
  node.id ?? node.nodeKey;

export const transitionReference = (
  transition: WorkflowGraphTransition,
  index: number,
): string => transition.id ?? `transition-${index + 1}`;

export const normalizeTransitionType = (
  value: string | null | undefined,
): string => {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return normalized && normalized.length > 0 ? normalized : "DEFAULT";
};

export const getNodeByReference = (
  graph: WorkflowGraph,
  reference: string,
): WorkflowGraphNode | null => {
  return (
    graph.nodes.find(
      (node) => node.id === reference || node.nodeKey === reference,
    ) ?? null
  );
};

export const getOutgoingTransitions = (
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
): WorkflowGraphTransition[] => {
  return graph.transitions
    .filter((transition) => {
      const source = getNodeByReference(graph, transition.sourceNodeId);
      return source?.nodeKey === node.nodeKey || source?.id === node.id;
    })
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        transitionReference(
          left,
          graph.transitions.indexOf(left),
        ).localeCompare(
          transitionReference(right, graph.transitions.indexOf(right)),
        ),
    );
};

export const getIncomingTransitions = (
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
): WorkflowGraphTransition[] => {
  return graph.transitions.filter((transition) => {
    const target = getNodeByReference(graph, transition.targetNodeId);
    return target?.nodeKey === node.nodeKey || target?.id === node.id;
  });
};

export const getTransitionTarget = (
  graph: WorkflowGraph,
  transition: WorkflowGraphTransition,
): WorkflowGraphNode | null =>
  getNodeByReference(graph, transition.targetNodeId);

export const getTransitionSource = (
  graph: WorkflowGraph,
  transition: WorkflowGraphTransition,
): WorkflowGraphNode | null =>
  getNodeByReference(graph, transition.sourceNodeId);

export const getTransitionConditionGroup = (
  source: WorkflowGraphNode,
  transition: WorkflowGraphTransition,
): WorkflowConditionGroup | null => {
  if (
    transition.conditionGroup &&
    transition.conditionGroup.conditions.length > 0
  ) {
    return {
      conditions: transition.conditionGroup.conditions.map(
        (condition, index) => ({
          conditionId:
            "id" in condition && typeof condition.id === "string"
              ? condition.id
              : `condition-${index + 1}`,
          field: condition.field,
          operator: condition.operator,
          ...(condition.sequence !== undefined
            ? { sequence: condition.sequence }
            : {}),
          value: condition.value,
        }),
      ),
      id: transition.conditionGroup.id,
      logicOperator: transition.conditionGroup.logicOperator,
    };
  }

  if (normalizeTransitionType(transition.transitionType) !== "CONDITION") {
    return null;
  }

  const configuration = source.configurationJson;
  if (
    configuration.nodeType !== "CONDITION" ||
    configuration.rules.length === 0
  ) {
    return null;
  }

  return {
    conditions: configuration.rules.map((rule, index) => ({
      conditionId: `${source.nodeKey}-rule-${index + 1}`,
      field: rule.field,
      operator: rule.operator,
      sequence: index,
      value: rule.value,
    })),
    id: null,
    logicOperator: configuration.logicalOperator,
  };
};

export const isFallbackTransition = (
  source: WorkflowGraphNode,
  transition: WorkflowGraphTransition,
): boolean => {
  const type = normalizeTransitionType(transition.transitionType);
  return (
    type === "DEFAULT" ||
    type === "FALLBACK" ||
    (type !== "CONDITION" &&
      (!transition.conditionGroup ||
        transition.conditionGroup.conditions.length === 0))
  );
};

export const isReturnTransition = (
  transition: WorkflowGraphTransition,
): boolean => {
  const type = normalizeTransitionType(transition.transitionType);
  return type === "RETURN" || type === "CORRECTION";
};

const stableValue = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

const stableSerialize = (value: unknown): string =>
  JSON.stringify(stableValue(value));

const stableConditionGroup = (
  source: WorkflowGraphNode,
  transition: WorkflowGraphTransition,
) => {
  const group = getTransitionConditionGroup(source, transition);
  if (!group) return null;

  return {
    conditions: [...group.conditions]
      .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
      .map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        sequence: condition.sequence ?? 0,
        value: condition.value ?? null,
      })),
    logicOperator: group.logicOperator,
  };
};

export const buildWorkflowGraphHash = ({
  definitionId,
  graph,
  processType,
  versionNumber,
}: {
  definitionId: string;
  graph: WorkflowGraph;
  processType: string;
  versionNumber: number;
}): string => {
  const nodes = [...graph.nodes]
    .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey))
    .map((node) => ({
      assignmentStrategy: node.assignmentStrategy ?? null,
      configurationJson: node.configurationJson as WorkflowNodeConfiguration,
      description: node.description ?? null,
      name: node.name,
      nodeKey: node.nodeKey,
      positionX: node.positionX,
      positionY: node.positionY,
      type: node.type,
    }));

  const transitions = graph.transitions
    .map((transition) => {
      const source = getTransitionSource(graph, transition);
      const target = getTransitionTarget(graph, transition);
      return {
        conditionGroup: source
          ? stableConditionGroup(source, transition)
          : null,
        label: transition.label ?? null,
        priority: transition.priority,
        sourceNodeKey: source?.nodeKey ?? transition.sourceNodeId,
        targetNodeKey: target?.nodeKey ?? transition.targetNodeId,
        transitionType: normalizeTransitionType(transition.transitionType),
      };
    })
    .sort((left, right) =>
      stableSerialize(left).localeCompare(stableSerialize(right)),
    );

  return createHash("sha256")
    .update(
      stableSerialize({
        definitionId,
        processType,
        versionNumber,
        nodes,
        transitions,
      }),
      "utf8",
    )
    .digest("hex");
};

export const findReachableNodeReferences = (
  graph: WorkflowGraph,
  start: WorkflowGraphNode | null,
): Set<string> => {
  const reachable = new Set<string>();
  if (!start) return reachable;

  const pending = [nodeReference(start)];
  while (pending.length > 0) {
    const currentReference = pending.pop();
    if (!currentReference || reachable.has(currentReference)) continue;
    reachable.add(currentReference);
    const current = getNodeByReference(graph, currentReference);
    if (!current) continue;
    for (const transition of getOutgoingTransitions(graph, current)) {
      const target = getTransitionTarget(graph, transition);
      if (target) pending.push(nodeReference(target));
    }
  }
  return reachable;
};

export const findNodesThatCanReachEnd = (
  graph: WorkflowGraph,
  endNodes: WorkflowGraphNode[],
): Set<string> => {
  const canReachEnd = new Set(endNodes.map(nodeReference));
  const pending = [...canReachEnd];
  while (pending.length > 0) {
    const currentReference = pending.pop();
    if (!currentReference) continue;
    const current = getNodeByReference(graph, currentReference);
    if (!current) continue;
    for (const transition of getIncomingTransitions(graph, current)) {
      const source = getTransitionSource(graph, transition);
      if (source && !canReachEnd.has(nodeReference(source))) {
        canReachEnd.add(nodeReference(source));
        pending.push(nodeReference(source));
      }
    }
  }
  return canReachEnd;
};

export const findStronglyConnectedComponents = (
  graph: WorkflowGraph,
): Array<{
  nodeReferences: string[];
  transitions: WorkflowGraphTransition[];
}> => {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: Array<{
    nodeReferences: string[];
    transitions: WorkflowGraphTransition[];
  }> = [];
  let index = 0;

  const visit = (reference: string): void => {
    indexByNode.set(reference, index);
    lowLinkByNode.set(reference, index);
    index += 1;
    stack.push(reference);
    onStack.add(reference);

    const node = getNodeByReference(graph, reference);
    if (!node) return;
    for (const transition of getOutgoingTransitions(graph, node)) {
      const target = getTransitionTarget(graph, transition);
      if (!target) continue;
      const targetReference = nodeReference(target);
      if (!indexByNode.has(targetReference)) {
        visit(targetReference);
        lowLinkByNode.set(
          reference,
          Math.min(
            lowLinkByNode.get(reference) ?? Number.POSITIVE_INFINITY,
            lowLinkByNode.get(targetReference) ?? Number.POSITIVE_INFINITY,
          ),
        );
      } else if (onStack.has(targetReference)) {
        lowLinkByNode.set(
          reference,
          Math.min(
            lowLinkByNode.get(reference) ?? Number.POSITIVE_INFINITY,
            indexByNode.get(targetReference) ?? Number.POSITIVE_INFINITY,
          ),
        );
      }
    }

    if (lowLinkByNode.get(reference) !== indexByNode.get(reference)) return;

    const component: string[] = [];
    let popped: string | undefined;
    do {
      popped = stack.pop();
      if (popped) {
        onStack.delete(popped);
        component.push(popped);
      }
    } while (popped && popped !== reference);

    const componentSet = new Set(component);
    const transitions = graph.transitions.filter((transition) => {
      const source = getTransitionSource(graph, transition);
      const target = getTransitionTarget(graph, transition);
      return (
        source &&
        target &&
        componentSet.has(nodeReference(source)) &&
        componentSet.has(nodeReference(target))
      );
    });
    components.push({ nodeReferences: component, transitions });
  };

  for (const node of graph.nodes) {
    const reference = nodeReference(node);
    if (!indexByNode.has(reference)) visit(reference);
  }

  return components;
};

export const enumerateGraphPaths = (
  graph: WorkflowGraph,
  start: WorkflowGraphNode | null,
  endReferences: Set<string>,
  maxDepth: number,
  maxPaths: number,
): GraphPathEnumeration => {
  if (!start) return { paths: [], truncated: false };
  const paths: GraphPath[] = [];
  let truncated = false;
  const stack: Array<{
    nodeReference: string;
    nodeIds: string[];
    transitionIds: string[];
    visited: Set<string>;
  }> = [
    {
      nodeReference: nodeReference(start),
      nodeIds: [nodeReference(start)],
      transitionIds: [],
      visited: new Set([nodeReference(start)]),
    },
  ];

  while (stack.length > 0 && paths.length < maxPaths) {
    const current = stack.pop();
    if (!current) break;
    if (endReferences.has(current.nodeReference)) {
      paths.push({
        nodeIds: current.nodeIds,
        transitionIds: current.transitionIds,
      });
      continue;
    }
    if (current.transitionIds.length >= maxDepth) {
      truncated = true;
      continue;
    }

    const node = getNodeByReference(graph, current.nodeReference);
    if (!node) continue;
    for (const [index, transition] of getOutgoingTransitions(
      graph,
      node,
    ).entries()) {
      const target = getTransitionTarget(graph, transition);
      if (!target) continue;
      const targetReference = nodeReference(target);
      if (current.visited.has(targetReference)) {
        continue;
      }
      stack.push({
        nodeReference: targetReference,
        nodeIds: [...current.nodeIds, targetReference],
        transitionIds: [
          ...current.transitionIds,
          transitionReference(transition, index),
        ],
        visited: new Set([...current.visited, targetReference]),
      });
    }
  }

  if (stack.length > 0) truncated = true;
  return { paths, truncated };
};

export const getNodeReference = nodeReference;
