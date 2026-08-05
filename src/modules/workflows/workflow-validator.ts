import {
  WORKFLOW_ASSIGNMENT_STRATEGY_VALUES,
  WORKFLOW_GRAPH_LIMITS,
  WORKFLOW_NODE_TYPE_VALUES,
  WORKFLOW_TRANSITION_TYPE_VALUES,
} from "./workflows.constants.js";
import {
  getIncomingTransitions,
  getNodeByReference,
  getNodeReference,
  getOutgoingTransitions,
  getTransitionConditionGroup,
  getTransitionSource,
  getTransitionTarget,
  findNodesThatCanReachEnd,
  findReachableNodeReferences,
  findStronglyConnectedComponents,
  buildWorkflowGraphHash,
  enumerateGraphPaths,
  isFallbackTransition,
  isReturnTransition,
  normalizeTransitionType,
  type WorkflowGraph,
  type WorkflowGraphNode,
  type WorkflowGraphTransition,
} from "./workflow-graph.js";
import { getWorkflowRuleField } from "./workflow-rule-fields.js";
import { validateWorkflowRule } from "./workflow-rule-operators.js";
import type {
  WorkflowNodeConfiguration,
  WorkflowDesignerSaveInput,
} from "./workflows.validators.js";

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  nodeId?: string | undefined;
  nodeKey?: string | undefined;
  severity: "ERROR" | "WARNING";
  suggestedAction?: string | undefined;
  transitionId?: string | undefined;
};

export type WorkflowValidationSummary = {
  cycleCount: number;
  endNodeCount: number;
  nodeCount: number;
  reachableNodeCount: number;
  routeCountEstimate: number;
  startNodeCount: number;
  transitionCount: number;
  unreachableNodeCount: number;
};

export type WorkflowValidationResult = {
  errors: WorkflowValidationIssue[];
  graphHash?: string;
  isValid: boolean;
  publicationReady: boolean;
  summary: WorkflowValidationSummary;
  warnings: WorkflowValidationIssue[];
};

export type WorkflowValidatorReferenceData = {
  areas?: Set<string>;
  notificationTemplates?: Set<string>;
  roles?: Set<string>;
  users?: Set<string>;
};

export type WorkflowValidatorOptions = {
  definitionId?: string;
  forPublication?: boolean;
  knownConditionGroupIds?: Set<string>;
  processType: string;
  references?: WorkflowValidatorReferenceData;
  versionNumber?: number;
  versionStatus?: string;
  workflowDefinitionStatus?: string;
};

const addIssue = (
  result: WorkflowValidationResult,
  issue: {
    code: string;
    message: string;
    nodeId?: string | undefined;
    nodeKey?: string | undefined;
    severity?: WorkflowValidationIssue["severity"] | undefined;
    suggestedAction?: string | undefined;
    transitionId?: string | undefined;
  },
): void => {
  const normalized = {
    ...issue,
    severity: issue.severity ?? "ERROR",
  } satisfies WorkflowValidationIssue;
  if (normalized.severity === "WARNING") {
    result.warnings.push(normalized);
  } else {
    result.errors.push(normalized);
  }
};

const getNodeId = (node: WorkflowGraphNode): string => node.id ?? node.nodeKey;

type AssignmentNodeConfiguration = Extract<
  WorkflowNodeConfiguration,
  { nodeType: "APPROVAL" | "STAGE" }
>;

const isAssignmentNode = (node: WorkflowGraphNode): boolean =>
  node.type === "STAGE" || node.type === "APPROVAL";

const isEditableNode = (node: WorkflowGraphNode): boolean =>
  node.type === "STAGE" || node.type === "APPROVAL";

const fieldReferenceIsSupported = (reference: string): boolean => {
  return (
    getWorkflowRuleField(reference) !== null ||
    reference === "requesterUserId" ||
    reference === "responsibleUserId"
  );
};

const transitionSemanticForAction: Record<string, string> = {
  APPROVE: "APPROVE",
  COMPLETE: "COMPLETE",
  OBSERVE: "OBSERVE",
  REASSIGN: "REASSIGN",
  REJECT: "REJECT",
  REQUEST_CORRECTION: "REQUEST_CORRECTION",
};

const hasActionRoute = (
  outgoing: WorkflowGraphTransition[],
  action: string,
): boolean => {
  const desired = transitionSemanticForAction[action];
  return outgoing.some((transition) => {
    const type = normalizeTransitionType(transition.transitionType);
    return type === desired || type === "DEFAULT" || type === "FALLBACK";
  });
};

const conditionSignature = (
  conditions: Array<{
    field: string;
    operator: string;
    value?: unknown;
  }>,
  logicOperator: string,
): string =>
  JSON.stringify({
    conditions: conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.value ?? null,
    })),
    logicOperator,
  });

const validateReference = (
  result: WorkflowValidationResult,
  id: string | null | undefined,
  source: Set<string> | undefined,
  message: string,
  node: WorkflowGraphNode,
): void => {
  if (!id) return;
  if (source && !source.has(id)) {
    addIssue(result, {
      code: "REFERENCE_NOT_FOUND",
      message,
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
      suggestedAction: "Seleccione un valor vigente del catálogo.",
    });
  }
};

const validateAssignmentNode = (
  result: WorkflowValidationResult,
  node: WorkflowGraphNode,
  outgoing: WorkflowGraphTransition[],
  references?: WorkflowValidatorReferenceData,
): void => {
  if (!isAssignmentNode(node)) return;
  const configuration = node.configurationJson as AssignmentNodeConfiguration;

  const strategy = configuration.assignmentStrategy;
  if ((node.assignmentStrategy as string | null) === "MANAGEMENT") {
    addIssue(result, {
      code: "ASSIGNMENT_MANAGEMENT_UNAVAILABLE",
      message: "La estrategia MANAGEMENT no está disponible en esta fase.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }
  if (!strategy) {
    addIssue(result, {
      code: "ASSIGNMENT_STRATEGY_REQUIRED",
      message: "La etapa requiere una estrategia de asignación.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
      suggestedAction:
        "Seleccione un usuario, rol, área o estrategia dinámica.",
    });
  } else if (!WORKFLOW_ASSIGNMENT_STRATEGY_VALUES.includes(strategy as never)) {
    addIssue(result, {
      code: "ASSIGNMENT_STRATEGY_UNSUPPORTED",
      message: "La estrategia MANAGEMENT no está disponible en esta fase.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }

  switch (strategy) {
    case "FIXED_USER":
      if (!configuration.userId) {
        addIssue(result, {
          code: "ASSIGNMENT_USER_REQUIRED",
          message: "La estrategia de usuario fijo requiere un usuario.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      validateReference(
        result,
        configuration.userId,
        references?.users,
        "El usuario asignado ya no existe o está inactivo.",
        node,
      );
      break;
    case "ROLE":
      if (!configuration.roleId) {
        addIssue(result, {
          code: "ASSIGNMENT_ROLE_REQUIRED",
          message: "La estrategia de rol requiere un rol.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      validateReference(
        result,
        configuration.roleId,
        references?.roles,
        "El rol asignado ya no existe o está inactivo.",
        node,
      );
      break;
    case "AREA":
      if (!configuration.areaId) {
        addIssue(result, {
          code: "ASSIGNMENT_AREA_REQUIRED",
          message: "La estrategia de área requiere un área.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      validateReference(
        result,
        configuration.areaId,
        references?.areas,
        "El área asignada ya no existe o está inactiva.",
        node,
      );
      break;
    case "FIELD_REFERENCE":
      if (!configuration.fieldReference) {
        addIssue(result, {
          code: "ASSIGNMENT_FIELD_REQUIRED",
          message: "La estrategia por referencia requiere un campo controlado.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      } else if (!fieldReferenceIsSupported(configuration.fieldReference)) {
        addIssue(result, {
          code: "ASSIGNMENT_FIELD_UNSUPPORTED",
          message:
            "La referencia de asignación no pertenece al contexto controlado.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      break;
    default:
      break;
  }

  if (!configuration.fallbackStrategy) {
    addIssue(result, {
      code: "ASSIGNMENT_FALLBACK_REQUIRED",
      message: "Defina qué debe ocurrir si no se resuelve el responsable.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  } else if (configuration.fallbackStrategy === "ROLE") {
    if (!configuration.fallbackRoleId) {
      addIssue(result, {
        code: "FALLBACK_ROLE_REQUIRED",
        message: "El fallback por rol requiere un rol de respaldo.",
        nodeId: getNodeId(node),
        nodeKey: node.nodeKey,
      });
    }
    validateReference(
      result,
      configuration.fallbackRoleId,
      references?.roles,
      "El rol de respaldo ya no existe o está inactivo.",
      node,
    );
  } else if (configuration.fallbackStrategy === "USER") {
    if (!configuration.fallbackUserId) {
      addIssue(result, {
        code: "FALLBACK_USER_REQUIRED",
        message: "El fallback por usuario requiere un usuario de respaldo.",
        nodeId: getNodeId(node),
        nodeKey: node.nodeKey,
      });
    }
    validateReference(
      result,
      configuration.fallbackUserId,
      references?.users,
      "El usuario de respaldo ya no existe o está inactivo.",
      node,
    );
  }

  if (configuration.allowedActions.length === 0) {
    addIssue(result, {
      code: "ALLOWED_ACTION_REQUIRED",
      message: "La etapa debe tener al menos una acción permitida.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }

  if (outgoing.length === 0) {
    addIssue(result, {
      code: "NODE_OUTGOING_REQUIRED",
      message: "La etapa debe tener al menos una ruta de salida.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  } else if (
    outgoing.length > 1 &&
    !outgoing.some((transition) => isFallbackTransition(node, transition))
  ) {
    for (const action of configuration.allowedActions) {
      if (!hasActionRoute(outgoing, action)) {
        addIssue(result, {
          code: "ACTION_ROUTE_MISSING",
          message: `No existe una ruta controlada para la acción ${action}.`,
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
          suggestedAction:
            "Defina la ruta de la acción o agregue una salida por defecto.",
        });
      }
    }
  }
};

const validateSla = (
  result: WorkflowValidationResult,
  node: WorkflowGraphNode,
  configuration: {
    actionOnBreach?: string;
    duration: number;
    escalationThreshold: number | null;
    reminderThreshold: number | null;
    unit: string;
  },
  outgoing: WorkflowGraphTransition[],
): void => {
  if (
    !Number.isInteger(configuration.duration) ||
    configuration.duration <= 0
  ) {
    addIssue(result, {
      code: "SLA_DURATION_INVALID",
      message: "La duración del SLA debe ser un número positivo.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }
  if (
    !["MINUTES", "HOURS", "BUSINESS_DAYS", "CALENDAR_DAYS"].includes(
      configuration.unit,
    )
  ) {
    addIssue(result, {
      code: "SLA_UNIT_INVALID",
      message: "La unidad del SLA no está soportada.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }
  if (
    configuration.reminderThreshold !== null &&
    configuration.reminderThreshold >= configuration.duration
  ) {
    addIssue(result, {
      code: "SLA_REMINDER_INVALID",
      message: "El umbral del recordatorio debe ser menor que la duración.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }
  if (
    configuration.escalationThreshold !== null &&
    configuration.escalationThreshold >= configuration.duration
  ) {
    addIssue(result, {
      code: "SLA_ESCALATION_INVALID",
      message: "El umbral de escalamiento debe ser menor que la duración.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }
  if (
    configuration.actionOnBreach === "ALTERNATE_ROUTE" &&
    !outgoing.some(
      (transition) =>
        normalizeTransitionType(transition.transitionType) ===
        "ALTERNATE_ROUTE",
    )
  ) {
    addIssue(result, {
      code: "SLA_ALTERNATE_ROUTE_MISSING",
      message: "El SLA requiere una ruta alternativa para el vencimiento.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }
};

const validateNodeConfiguration = (
  result: WorkflowValidationResult,
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  processType: string,
  references?: WorkflowValidatorReferenceData,
): void => {
  if (!WORKFLOW_NODE_TYPE_VALUES.includes(node.type as never)) {
    addIssue(result, {
      code: "NODE_TYPE_UNSUPPORTED",
      message: "El tipo de nodo no está soportado.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
    return;
  }

  if (node.configurationJson.nodeType !== node.type) {
    addIssue(result, {
      code: "CONFIGURATION_TYPE_MISMATCH",
      message: "La configuración no coincide con el tipo del nodo.",
      nodeId: getNodeId(node),
      nodeKey: node.nodeKey,
    });
  }

  const outgoing = getOutgoingTransitions(graph, node);
  const incoming = getIncomingTransitions(graph, node);
  const configuration = node.configurationJson;

  switch (configuration.nodeType) {
    case "START":
      if (
        configuration.processType !== processType ||
        configuration.triggerProcess !== processType
      ) {
        addIssue(result, {
          code: "START_PROCESS_MISMATCH",
          message: "El proceso del nodo Inicio debe coincidir con el workflow.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (incoming.length > 0) {
        addIssue(result, {
          code: "START_INCOMING",
          message: "El nodo Inicio no puede tener conexiones entrantes.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (outgoing.length === 0) {
        addIssue(result, {
          code: "START_OUTGOING",
          message: "El nodo Inicio debe tener al menos una salida.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      break;
    case "END":
      if (incoming.length === 0) {
        addIssue(result, {
          code: "END_INCOMING",
          message: "El nodo Fin debe tener al menos una entrada.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (outgoing.length > 0) {
        addIssue(result, {
          code: "END_OUTGOING",
          message: "El nodo Fin no puede tener conexiones salientes.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (!configuration.finalResult || !configuration.finalWorkflowStatus) {
        addIssue(result, {
          code: "END_RESULT_INVALID",
          message:
            "El nodo Fin debe tener un resultado y estado final válidos.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      break;
    case "STAGE":
    case "APPROVAL":
      validateAssignmentNode(result, node, outgoing, references);
      if (configuration.sla) {
        validateSla(result, node, configuration.sla, outgoing);
      }
      break;
    case "CONDITION": {
      const conditionTransitions = outgoing.filter(
        (transition) =>
          !isFallbackTransition(node, transition) &&
          Boolean(getTransitionConditionGroup(node, transition)),
      );
      const fallbackTransitions = outgoing.filter((transition) =>
        isFallbackTransition(node, transition),
      );
      const ruleSignatures = new Set<string>();
      const conditionGroupSignatures = new Set<string>();
      for (const rule of configuration.rules) {
        const validationError = validateWorkflowRule(rule);
        if (validationError) {
          addIssue(result, {
            code: "CONDITION_INVALID",
            message: validationError,
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
          });
        }
        const signature = conditionSignature(
          [rule],
          configuration.logicalOperator,
        );
        if (ruleSignatures.has(signature)) {
          addIssue(result, {
            code: "CONDITION_DUPLICATE_RULE",
            message: "El nodo contiene reglas equivalentes duplicadas.",
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
          });
        }
        ruleSignatures.add(signature);
        const field = getWorkflowRuleField(rule.field);
        if (field?.required && ["IS_EMPTY"].includes(rule.operator)) {
          addIssue(result, {
            code: "CONDITION_NEVER_MATCH",
            message: `La regla ${field.label} no puede estar vacía en este contexto.`,
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
            severity: "WARNING",
          });
        }
        if (
          (rule.operator === "IN" || rule.operator === "NOT_IN") &&
          Array.isArray(rule.value) &&
          rule.value.length === 0
        ) {
          addIssue(result, {
            code:
              rule.operator === "IN"
                ? "CONDITION_NEVER_MATCH"
                : "CONDITION_ALWAYS_MATCH",
            message:
              rule.operator === "IN"
                ? "Una lista IN vacía nunca puede coincidir."
                : "Una lista NOT_IN vacía siempre coincide; revise si es intencional.",
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
            severity: rule.operator === "IN" ? "ERROR" : "WARNING",
          });
        }
      }
      for (const transition of conditionTransitions) {
        const conditionGroup = getTransitionConditionGroup(node, transition);
        if (!conditionGroup) continue;
        const priorityMatches = conditionTransitions.filter(
          (candidate) => candidate.priority === transition.priority,
        );
        if (priorityMatches.length > 1) {
          addIssue(result, {
            code: "CONDITION_PRIORITY_DUPLICATE",
            message: "Las rutas de condición deben tener prioridades únicas.",
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
            transitionId: transition.id,
          });
        }
        const signature = conditionSignature(
          conditionGroup.conditions,
          conditionGroup.logicOperator,
        );
        if (conditionGroupSignatures.has(signature)) {
          addIssue(result, {
            code: "CONDITION_DUPLICATE_RULE",
            message:
              "Existen reglas de condición equivalentes en más de una ruta.",
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
            transitionId: transition.id,
          });
        }
        conditionGroupSignatures.add(signature);
      }
      if (
        configuration.rules.length === 0 &&
        conditionTransitions.length === 0
      ) {
        addIssue(result, {
          code: "CONDITION_RULE_REQUIRED",
          message:
            "El nodo Condición debe tener al menos una regla o ruta condicionada.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (configuration.rules.length > 0 && conditionTransitions.length === 0) {
        addIssue(result, {
          code: "CONDITION_ROUTE_REQUIRED",
          message:
            "Las reglas del nodo Condición deben estar conectadas a una salida CONDITION.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
          suggestedAction:
            "Marque una salida como CONDITION y conserve una salida DEFAULT como fallback.",
        });
      }
      if (outgoing.length === 0) {
        addIssue(result, {
          code: "CONDITION_OUTGOING_REQUIRED",
          message: "El nodo Condición debe tener al menos una salida.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (fallbackTransitions.length > 1) {
        addIssue(result, {
          code: "CONDITION_FALLBACK_DUPLICATE",
          message: "Un nodo Condición solo puede tener una ruta fallback.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (conditionTransitions.length > 0 && fallbackTransitions.length === 0) {
        addIssue(result, {
          code: "CONDITION_FALLBACK_REQUIRED",
          message:
            "Agregue una ruta fallback porque las reglas no son exhaustivas.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
          suggestedAction: "Marque una salida como DEFAULT o FALLBACK.",
        });
      }
      break;
    }
    case "REJECTION": {
      if (configuration.behavior === "RETURN_TO_STAGE") {
        const target = configuration.returnTargetNodeKey
          ? graph.nodes.find(
              (candidate) =>
                candidate.nodeKey === configuration.returnTargetNodeKey,
            )
          : null;
        if (!target) {
          addIssue(result, {
            code: "REJECTION_RETURN_TARGET_MISSING",
            message:
              "La ruta de retorno debe apuntar a un nodo de esta versión.",
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
          });
        } else if (target.nodeKey === node.nodeKey || !isEditableNode(target)) {
          addIssue(result, {
            code: "REJECTION_RETURN_TARGET_INVALID",
            message: "El retorno debe apuntar a una etapa editable distinta.",
            nodeId: getNodeId(node),
            nodeKey: node.nodeKey,
          });
        }
      }
      if (outgoing.length === 0) {
        addIssue(result, {
          code: "REJECTION_OUTGOING_REQUIRED",
          message: "El nodo Rechazo debe tener una ruta final o de retorno.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      break;
    }
    case "SLA":
      validateSla(result, node, configuration, outgoing);
      if (outgoing.length === 0) {
        addIssue(result, {
          code: "SLA_OUTGOING_REQUIRED",
          message: "El nodo SLA debe tener una salida.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      break;
    case "ESCALATION":
      if (
        configuration.escalationStrategy === "FIXED_USER" &&
        !configuration.targetUserId
      ) {
        addIssue(result, {
          code: "ESCALATION_TARGET_REQUIRED",
          message: "El escalamiento por usuario requiere un usuario destino.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (
        configuration.escalationStrategy === "ROLE" &&
        !configuration.targetRoleId
      ) {
        addIssue(result, {
          code: "ESCALATION_TARGET_REQUIRED",
          message: "El escalamiento por rol requiere un rol destino.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (
        configuration.escalationStrategy === "AREA_MANAGER" &&
        !configuration.areaId
      ) {
        addIssue(result, {
          code: "ESCALATION_AREA_REQUIRED",
          message: "El escalamiento al gerente de área requiere un área.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      validateReference(
        result,
        configuration.targetUserId,
        references?.users,
        "El usuario de escalamiento no existe o está inactivo.",
        node,
      );
      validateReference(
        result,
        configuration.targetRoleId,
        references?.roles,
        "El rol de escalamiento no existe o está inactivo.",
        node,
      );
      validateReference(
        result,
        configuration.areaId,
        references?.areas,
        "El área de escalamiento no existe o está inactiva.",
        node,
      );
      if (outgoing.length === 0) {
        addIssue(result, {
          code: "ESCALATION_OUTGOING_REQUIRED",
          message: "El nodo Escalar debe tener una ruta de continuación.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      break;
    case "NOTIFICATION":
      if (
        configuration.recipientStrategy === "FIXED_USER" &&
        !configuration.recipientUserId
      ) {
        addIssue(result, {
          code: "NOTIFICATION_RECIPIENT_REQUIRED",
          message: "La notificación requiere un usuario destinatario.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (
        configuration.recipientStrategy === "ROLE" &&
        !configuration.recipientRoleId
      ) {
        addIssue(result, {
          code: "NOTIFICATION_RECIPIENT_REQUIRED",
          message: "La notificación requiere un rol destinatario.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (
        configuration.recipientStrategy === "AREA_MANAGER" &&
        !configuration.recipientAreaId
      ) {
        addIssue(result, {
          code: "NOTIFICATION_RECIPIENT_REQUIRED",
          message: "La notificación requiere un área destinataria.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      validateReference(
        result,
        configuration.recipientUserId,
        references?.users,
        "El usuario destinatario no existe o está inactivo.",
        node,
      );
      validateReference(
        result,
        configuration.recipientRoleId,
        references?.roles,
        "El rol destinatario no existe o está inactivo.",
        node,
      );
      validateReference(
        result,
        configuration.recipientAreaId,
        references?.areas,
        "El área destinataria no existe o está inactiva.",
        node,
      );
      if (
        references?.notificationTemplates &&
        !references.notificationTemplates.has(configuration.template)
      ) {
        addIssue(result, {
          code: "NOTIFICATION_TEMPLATE_INVALID",
          message: "La plantilla de notificación no está disponible.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      if (outgoing.length === 0) {
        addIssue(result, {
          code: "NOTIFICATION_OUTGOING_REQUIRED",
          message: "La notificación debe tener una salida de continuación.",
          nodeId: getNodeId(node),
          nodeKey: node.nodeKey,
        });
      }
      break;
  }
};

const validateTransitions = (
  result: WorkflowValidationResult,
  graph: WorkflowGraph,
  options: WorkflowValidatorOptions,
): void => {
  const signatures = new Set<string>();
  for (const [index, transition] of graph.transitions.entries()) {
    const source = getTransitionSource(graph, transition);
    const target = getTransitionTarget(graph, transition);
    const transitionId = transition.id ?? `transition-${index + 1}`;
    if (!source || !target) {
      addIssue(result, {
        code: "TRANSITION_REFERENCE_MISSING",
        message: "La conexión debe apuntar a nodos de esta versión.",
        transitionId,
        suggestedAction: "Elimine la conexión inválida y vuelva a conectarla.",
      });
      continue;
    }
    if (source.nodeKey === target.nodeKey) {
      addIssue(result, {
        code: "SELF_LOOP",
        message: "No se permiten conexiones de un nodo hacia sí mismo.",
        nodeId: getNodeId(source),
        nodeKey: source.nodeKey,
        transitionId,
      });
    }
    const type = normalizeTransitionType(transition.transitionType);
    if (
      !(WORKFLOW_TRANSITION_TYPE_VALUES as readonly string[]).includes(type)
    ) {
      addIssue(result, {
        code: "TRANSITION_TYPE_UNSUPPORTED",
        message: "La semántica de la transición no está soportada.",
        nodeId: getNodeId(source),
        nodeKey: source.nodeKey,
        transitionId,
      });
    }
    const group = transition.conditionGroup;
    if (group && source.type !== "CONDITION") {
      addIssue(result, {
        code: "CONDITION_ON_NON_CONDITION_NODE",
        message: "Solo un nodo Condición puede tener rutas condicionadas.",
        nodeId: getNodeId(source),
        nodeKey: source.nodeKey,
        transitionId,
      });
    }
    if (
      transition.conditionGroupId &&
      !group &&
      options.knownConditionGroupIds &&
      !options.knownConditionGroupIds.has(transition.conditionGroupId)
    ) {
      addIssue(result, {
        code: "CROSS_VERSION_CONDITION",
        message:
          "La conexión referencia un grupo de condiciones de otra versión.",
        nodeId: getNodeId(source),
        nodeKey: source.nodeKey,
        transitionId,
      });
    }
    const signature = JSON.stringify({
      condition: group
        ? conditionSignature(group.conditions, group.logicOperator)
        : null,
      label: transition.label ?? null,
      priority: transition.priority,
      source: source.nodeKey,
      target: target.nodeKey,
      type,
    });
    if (signatures.has(signature)) {
      addIssue(result, {
        code: "DUPLICATE_TRANSITION",
        message: "No puede haber dos conexiones idénticas.",
        nodeId: getNodeId(source),
        nodeKey: source.nodeKey,
        transitionId,
      });
    }
    signatures.add(signature);
    if (group) {
      for (const condition of group.conditions) {
        const validationError = validateWorkflowRule(condition);
        if (validationError) {
          addIssue(result, {
            code: "CONDITION_INVALID",
            message: validationError,
            nodeId: getNodeId(source),
            nodeKey: source.nodeKey,
            transitionId,
          });
        }
      }
    }
  }
};

const validateCycles = (
  result: WorkflowValidationResult,
  graph: WorkflowGraph,
  canReachEnd: Set<string>,
): number => {
  let cycleCount = 0;
  for (const component of findStronglyConnectedComponents(graph)) {
    const hasSelfLoop = component.transitions.some((transition) => {
      const source = getTransitionSource(graph, transition);
      const target = getTransitionTarget(graph, transition);
      return source?.nodeKey === target?.nodeKey;
    });
    if (component.nodeReferences.length < 2 && !hasSelfLoop) continue;
    cycleCount += 1;
    const nodes = component.nodeReferences
      .map((reference) => getNodeByReference(graph, reference))
      .filter((node): node is WorkflowGraphNode => Boolean(node));
    const hasExplicitReturn = component.transitions.some((transition) => {
      const source = getTransitionSource(graph, transition);
      return isReturnTransition(transition) && source?.type === "REJECTION";
    });
    const allCanReachEnd = component.nodeReferences.every((reference) =>
      canReachEnd.has(reference),
    );
    if (
      hasExplicitReturn &&
      allCanReachEnd &&
      nodes.some((node) => node.type === "REJECTION")
    ) {
      addIssue(result, {
        code: "CONTROLLED_RETURN_CYCLE",
        message: `Se detectó un ciclo controlado de corrección: ${nodes.map((node) => node.nodeKey).join(", ")}.`,
        nodeId: nodes[0] ? getNodeId(nodes[0]) : undefined,
        nodeKey: nodes[0]?.nodeKey,
        severity: "WARNING",
        suggestedAction:
          "Confirme que la etapa de corrección pueda completar el flujo.",
      });
    } else {
      addIssue(result, {
        code: allCanReachEnd ? "INVALID_CYCLE" : "INFINITE_CYCLE",
        message: allCanReachEnd
          ? `El ciclo ${nodes.map((node) => node.nodeKey).join(", ")} no tiene una semántica explícita de retorno/corrección.`
          : `El ciclo ${nodes.map((node) => node.nodeKey).join(", ")} no puede alcanzar un nodo Fin.`,
        nodeId: nodes[0] ? getNodeId(nodes[0]) : undefined,
        nodeKey: nodes[0]?.nodeKey,
        suggestedAction:
          "Agregue una ruta de salida explícita o marque la corrección con RETURN/CORRECTION.",
      });
    }
  }
  return cycleCount;
};

export const validateWorkflowGraph = (
  graph: WorkflowDesignerSaveInput,
  options: WorkflowValidatorOptions,
): WorkflowValidationResult => {
  const typedGraph: WorkflowGraph = graph;
  const startNodes = typedGraph.nodes.filter((node) => node.type === "START");
  const endNodes = typedGraph.nodes.filter((node) => node.type === "END");
  const result: WorkflowValidationResult = {
    errors: [],
    isValid: false,
    publicationReady: false,
    summary: {
      cycleCount: 0,
      endNodeCount: endNodes.length,
      nodeCount: typedGraph.nodes.length,
      reachableNodeCount: 0,
      routeCountEstimate: 0,
      startNodeCount: startNodes.length,
      transitionCount: typedGraph.transitions.length,
      unreachableNodeCount: typedGraph.nodes.length,
    },
    warnings: [],
  };

  if (typedGraph.nodes.length > WORKFLOW_GRAPH_LIMITS.maxNodes) {
    addIssue(result, {
      code: "GRAPH_NODE_LIMIT",
      message: `El flujo no puede superar ${WORKFLOW_GRAPH_LIMITS.maxNodes} nodos.`,
    });
  }
  if (typedGraph.transitions.length > WORKFLOW_GRAPH_LIMITS.maxTransitions) {
    addIssue(result, {
      code: "GRAPH_TRANSITION_LIMIT",
      message: `El flujo no puede superar ${WORKFLOW_GRAPH_LIMITS.maxTransitions} conexiones.`,
    });
  }
  const nodeKeys = new Set<string>();
  const nodeIds = new Set<string>();
  for (const node of typedGraph.nodes) {
    const id = getNodeId(node);
    if (nodeKeys.has(node.nodeKey)) {
      addIssue(result, {
        code: "DUPLICATE_NODE_KEY",
        message: "Los nodeKey deben ser únicos dentro de la versión.",
        nodeId: id,
        nodeKey: node.nodeKey,
      });
    }
    if (nodeIds.has(id)) {
      addIssue(result, {
        code: "DUPLICATE_NODE_ID",
        message: "Los identificadores de nodo deben ser únicos.",
        nodeId: id,
        nodeKey: node.nodeKey,
      });
    }
    nodeKeys.add(node.nodeKey);
    nodeIds.add(id);
    validateNodeConfiguration(
      result,
      typedGraph,
      node,
      options.processType,
      options.references,
    );
  }
  if (startNodes.length !== 1) {
    addIssue(result, {
      code: "START_COUNT",
      message:
        startNodes.length === 0
          ? "Agregue un nodo Inicio."
          : "El flujo debe tener exactamente un nodo Inicio.",
    });
  }
  if (endNodes.length === 0) {
    addIssue(result, {
      code: "END_REQUIRED",
      message: "Agregue al menos un nodo Fin.",
    });
  }
  validateTransitions(result, typedGraph, options);

  if (options.workflowDefinitionStatus === "ARCHIVED") {
    addIssue(result, {
      code: "WORKFLOW_ARCHIVED",
      message:
        "Los workflows archivados no pueden prepararse para publicación.",
    });
  }
  if (
    options.forPublication !== false &&
    options.versionStatus &&
    options.versionStatus !== "DRAFT"
  ) {
    addIssue(result, {
      code: "VERSION_NOT_DRAFT",
      message:
        "Solo las versiones en borrador pueden prepararse para publicación.",
    });
  }

  const start = startNodes[0] ?? null;
  const reachable = findReachableNodeReferences(typedGraph, start);
  const canReachEnd = findNodesThatCanReachEnd(typedGraph, endNodes);
  result.summary.reachableNodeCount = reachable.size;
  result.summary.unreachableNodeCount = Math.max(
    0,
    typedGraph.nodes.length - reachable.size,
  );
  for (const node of typedGraph.nodes) {
    const reference = getNodeReference(node);
    if (!reachable.has(reference)) {
      addIssue(result, {
        code: "UNREACHABLE_NODE",
        message: "El nodo no es alcanzable desde Inicio.",
        nodeId: getNodeId(node),
        nodeKey: node.nodeKey,
        suggestedAction: "Conecte el nodo al recorrido principal o elimínelo.",
      });
    } else if (node.type !== "END" && !canReachEnd.has(reference)) {
      addIssue(result, {
        code: "DEAD_END",
        message: "El nodo alcanzable no tiene un camino hacia Fin.",
        nodeId: getNodeId(node),
        nodeKey: node.nodeKey,
        suggestedAction:
          "Agregue una salida que finalmente llegue a un nodo Fin.",
      });
    }
  }
  for (const transition of typedGraph.transitions) {
    const source = getTransitionSource(typedGraph, transition);
    if (source && !reachable.has(getNodeReference(source))) {
      addIssue(result, {
        code: "UNUSED_TRANSITION",
        message:
          "La conexión pertenece a un componente desconectado y no se utilizará.",
        nodeId: getNodeId(source),
        nodeKey: source.nodeKey,
        transitionId: transition.id,
        severity: "WARNING",
      });
    }
  }

  result.summary.cycleCount = validateCycles(result, typedGraph, canReachEnd);
  const pathEnumeration = enumerateGraphPaths(
    typedGraph,
    start,
    new Set(endNodes.map(getNodeReference)),
    WORKFLOW_GRAPH_LIMITS.maxSimulationSteps,
    WORKFLOW_GRAPH_LIMITS.maxPaths,
  );
  result.summary.routeCountEstimate = pathEnumeration.paths.length;
  if (pathEnumeration.truncated) {
    addIssue(result, {
      code: "GRAPH_ANALYSIS_LIMIT",
      message: "El análisis de rutas alcanzó el límite seguro de complejidad.",
      suggestedAction:
        "Reduzca la cantidad de bifurcaciones o divida el flujo.",
    });
  }

  if (options.definitionId && options.versionNumber !== undefined) {
    result.graphHash = buildWorkflowGraphHash({
      definitionId: options.definitionId,
      graph: typedGraph,
      processType: options.processType,
      versionNumber: options.versionNumber,
    });
  }
  result.isValid = result.errors.length === 0;
  result.publicationReady =
    result.isValid &&
    options.workflowDefinitionStatus !== "ARCHIVED" &&
    (!options.versionStatus || options.versionStatus === "DRAFT");
  return result;
};

export const getValidationNodeReferences = (
  result: WorkflowValidationResult,
): Set<string> => {
  return new Set(
    [...result.errors, ...result.warnings].flatMap((issue) =>
      [issue.nodeId, issue.nodeKey].filter((value): value is string =>
        Boolean(value),
      ),
    ),
  );
};
