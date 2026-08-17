import { z } from "zod";

import {
  WORKFLOW_ASSIGNMENT_STRATEGY_VALUES,
  WORKFLOW_CONDITION_FIELD_ALIASES,
  WORKFLOW_CONDITION_FIELD_INPUT_VALUES,
  WORKFLOW_CONDITION_LOGIC_VALUES,
  WORKFLOW_CONDITION_OPERATOR_VALUES,
  WORKFLOW_DEFINITION_STATUS_VALUES,
  WORKFLOW_NODE_TYPE_VALUES,
  WORKFLOW_PROCESS_TYPE_VALUES,
  WORKFLOW_TRANSITION_TYPE_VALUES,
  WORKFLOW_VERSION_STATUS_VALUES,
} from "./workflows.constants.js";
import type { WORKFLOW_CONDITION_FIELD_VALUES } from "./workflows.constants.js";

const nullableDescriptionSchema = z
  .union([z.string().trim().max(10_000), z.null()])
  .optional()
  .transform((value) => value ?? null);

const nullableVersionNotesSchema = z
  .union([z.string().trim().max(10_000), z.null()])
  .optional()
  .transform((value) => value ?? null);

const optionalNullableDescriptionSchema = z
  .union([z.string().trim().max(10_000), z.null()])
  .optional();

const processTypeSchema = z.enum(WORKFLOW_PROCESS_TYPE_VALUES);

export const workflowIdParamSchema = z.object({
  id: z.uuid(),
});

export const workflowVersionIdParamSchema = z.object({
  versionId: z.uuid(),
});

export const createWorkflowSchema = z.object({
  description: nullableDescriptionSchema,
  name: z.string().trim().min(3).max(191),
  processType: processTypeSchema,
  versionNotes: nullableVersionNotesSchema,
});

export const updateWorkflowMetadataSchema = z
  .object({
    description: optionalNullableDescriptionSchema,
    name: z.string().trim().min(3).max(191).optional(),
    processType: processTypeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe proporcionar al menos un campo para actualizar el workflow.",
  });

export const createDraftVersionSchema = z.object({
  changeDescription: nullableVersionNotesSchema,
  sourceVersionId: z.uuid().optional(),
});

export const duplicateWorkflowSchema = z.object({
  description: optionalNullableDescriptionSchema,
  name: z.string().trim().min(3).max(191).optional(),
  sourceVersionId: z.uuid().optional(),
  versionNotes: nullableVersionNotesSchema,
});

export const archiveWorkflowSchema = z.object({}).strict();

const nullableNodeTextSchema = z
  .union([z.string().trim().max(10_000), z.null()])
  .optional()
  .transform((value) => value ?? null);

const configurationBaseSchema = z.object({
  description: nullableNodeTextSchema,
  name: z.string().trim().min(1).max(191),
  schemaVersion: z.literal(1),
});

const optionalReferenceSchema = z
  .union([z.string().trim().max(191), z.null()])
  .optional();

const slaInlineSchema = z
  .object({
    alternateTargetNodeKey: optionalReferenceSchema,
    duration: z.number().int().positive().max(100_000),
    escalationAreaId: optionalReferenceSchema,
    escalationEnabled: z.boolean(),
    escalationMode: z
      .enum(["NOTIFY_ONLY", "ADD_VISIBILITY", "REASSIGN", "ALTERNATE_ROUTE"])
      .optional(),
    escalationRoleId: optionalReferenceSchema,
    escalationStrategy: z
      .enum(["SUPERVISOR", "AREA_MANAGER", "FIXED_USER", "ROLE"])
      .optional(),
    escalationThreshold: z.number().int().positive().max(100_000).nullable(),
    escalationUserId: optionalReferenceSchema,
    reminderEnabled: z.boolean(),
    reminderThreshold: z.number().int().positive().max(100_000).nullable(),
    unit: z.enum(["MINUTES", "HOURS", "BUSINESS_DAYS", "CALENDAR_DAYS"]),
  })
  .strict();

const assignmentConfigurationShape = {
  assignmentStrategy: z.enum(WORKFLOW_ASSIGNMENT_STRATEGY_VALUES).nullable(),
  areaId: optionalReferenceSchema,
  fallbackRoleId: optionalReferenceSchema,
  fallbackStrategy: z
    .enum(["STOP", "ROLE", "USER", "ADMINISTRATOR"])
    .nullable(),
  fallbackUserId: optionalReferenceSchema,
  fieldReference: optionalReferenceSchema,
  roleId: optionalReferenceSchema,
  userId: optionalReferenceSchema,
};

const allowedStageActionsSchema = z.enum([
  "COMPLETE",
  "OBSERVE",
  "REQUEST_CORRECTION",
  "REASSIGN",
]);

const allowedApprovalActionsSchema = z.enum([
  "APPROVE",
  "REJECT",
  "OBSERVE",
  "REQUEST_CORRECTION",
  "REASSIGN",
]);

const workflowConditionValueSchema = z
  .union([
    z.string().trim().max(1_000),
    z.number().finite(),
    z.boolean(),
    z.array(
      z.union([z.string().trim().max(1_000), z.number().finite(), z.boolean()]),
    ),
    z.null(),
  ])
  .optional();

const workflowConditionFieldSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      (WORKFLOW_CONDITION_FIELD_INPUT_VALUES as readonly string[]).includes(
        value,
      ),
    "El campo de la regla no está soportado.",
  )
  .transform((value) => {
    const alias =
      WORKFLOW_CONDITION_FIELD_ALIASES[
        value as keyof typeof WORKFLOW_CONDITION_FIELD_ALIASES
      ];
    return (alias ?? value) as (typeof WORKFLOW_CONDITION_FIELD_VALUES)[number];
  });

const workflowConditionRuleSchema = z
  .object({
    field: workflowConditionFieldSchema,
    operator: z.enum(WORKFLOW_CONDITION_OPERATOR_VALUES),
    resultLabel: z.string().trim().max(191).nullable().optional(),
    value: workflowConditionValueSchema,
  })
  .strict();

const validateConditionRuleCompatibility = (
  rule: z.infer<typeof workflowConditionRuleSchema>,
  context: z.RefinementCtx,
) => {
  const value = rule.value;
  const noValueOperator = ["IS_EMPTY", "IS_NOT_EMPTY", "IS_OVERDUE"].includes(
    rule.operator,
  );

  if (
    noValueOperator &&
    value !== undefined &&
    value !== null &&
    value !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "Este operador no admite un valor.",
      path: ["value"],
    });
  }

  if (
    !noValueOperator &&
    (value === undefined || value === null || value === "")
  ) {
    context.addIssue({
      code: "custom",
      message: "Ingrese un valor para esta regla.",
      path: ["value"],
    });
  }

  if (["IN", "NOT_IN"].includes(rule.operator) && !Array.isArray(value)) {
    context.addIssue({
      code: "custom",
      message: "Use una lista de valores para este operador.",
      path: ["value"],
    });
  }

  if (
    [
      "GREATER_THAN",
      "LESS_THAN",
      "GREATER_THAN_OR_EQUAL",
      "LESS_THAN_OR_EQUAL",
    ].includes(rule.operator) &&
    typeof value !== "number" &&
    !(
      typeof value === "string" &&
      value.trim() !== "" &&
      !Number.isNaN(Number(value))
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Este operador requiere un valor numérico.",
      path: ["value"],
    });
  }
};

const compatibleConditionRuleSchema = workflowConditionRuleSchema.superRefine(
  validateConditionRuleCompatibility,
);

const startNodeConfigurationSchema = configurationBaseSchema
  .extend({
    initialWorkflowState: z.string().trim().max(191),
    nodeType: z.literal("START"),
    processType: z.string().trim().min(1).max(100),
    triggerProcess: z.string().trim().min(1).max(100),
    activationNote: nullableNodeTextSchema,
  })
  .strict();

const stageNodeConfigurationSchema = configurationBaseSchema
  .extend({
    ...assignmentConfigurationShape,
    allowedActions: z.array(allowedStageActionsSchema).max(4),
    nodeType: z.literal("STAGE"),
    requiredComment: z.boolean(),
    requiredEvidence: z.boolean(),
    resultingState: optionalReferenceSchema,
    sla: slaInlineSchema.nullable().optional(),
  })
  .strict();

const approvalNodeConfigurationSchema = configurationBaseSchema
  .extend({
    ...assignmentConfigurationShape,
    allowedActions: z.array(allowedApprovalActionsSchema).max(5),
    commentRequired: z.boolean(),
    evidenceRequired: z.boolean(),
    electronicSignature: z.boolean(),
    nodeType: z.literal("APPROVAL"),
    stateAfterApproval: optionalReferenceSchema,
    stateAfterRejection: optionalReferenceSchema,
    routeLabelOnApproval: optionalReferenceSchema,
    routeLabelOnRejection: optionalReferenceSchema,
    sla: slaInlineSchema.nullable().optional(),
  })
  .strict();

const rejectionNodeConfigurationSchema = configurationBaseSchema
  .extend({
    behavior: z.enum([
      "FINAL",
      "RETURN_TO_STAGE",
      "REQUEST_CORRECTION",
      "KEEP_STATE",
    ]),
    finalResult: z.enum(["REJECTED", "CORRECTION_REQUESTED", "CURRENT_STATE"]),
    nodeType: z.literal("REJECTION"),
    notifyRequester: z.boolean(),
    preserveOriginalDeadline: z.boolean(),
    requireComment: z.boolean(),
    resultingState: optionalReferenceSchema,
    returnTargetNodeKey: optionalReferenceSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.behavior !== "RETURN_TO_STAGE" ||
      Boolean(value.returnTargetNodeKey),
    {
      message: "Seleccione la etapa de retorno.",
      path: ["returnTargetNodeKey"],
    },
  );

const conditionNodeConfigurationSchema = configurationBaseSchema
  .extend({
    defaultRouteLabel: optionalReferenceSchema,
    logicalOperator: z.enum(WORKFLOW_CONDITION_LOGIC_VALUES),
    nodeType: z.literal("CONDITION"),
    rules: z.array(compatibleConditionRuleSchema).max(50),
  })
  .strict();

const slaNodeConfigurationSchema = configurationBaseSchema
  .extend({
    actionOnBreach: z.enum([
      "NOTIFY",
      "ESCALATE",
      "REASSIGN",
      "MARK_OVERDUE",
      "ALTERNATE_ROUTE",
    ]),
    duration: z.number().int().positive().max(100_000),
    escalationThreshold: z.number().int().positive().nullable(),
    nodeType: z.literal("SLA"),
    reminderThreshold: z.number().int().positive().nullable(),
    unit: z.enum(["MINUTES", "HOURS", "BUSINESS_DAYS", "CALENDAR_DAYS"]),
  })
  .strict();

const escalationNodeConfigurationSchema = configurationBaseSchema
  .extend({
    escalationStrategy: z.enum([
      "ROLE",
      "FIXED_USER",
      "AREA_MANAGER",
      "SUPERVISOR",
    ]),
    nodeType: z.literal("ESCALATION"),
    targetRoleId: optionalReferenceSchema,
    targetUserId: optionalReferenceSchema,
    areaId: optionalReferenceSchema,
    fallbackUserId: optionalReferenceSchema,
    alternateTargetNodeKey: optionalReferenceSchema,
    reassignCurrentTask: z.boolean(),
    notifyPreviousAssignee: z.boolean(),
    notifyNewAssignee: z.boolean(),
  })
  .strict();

const notificationNodeConfigurationSchema = configurationBaseSchema
  .extend({
    channel: z.enum(["INTERNAL", "EMAIL"]),
    nodeType: z.literal("NOTIFICATION"),
    recipientStrategy: z.enum([
      "CURRENT_ASSIGNEE",
      "REQUESTER",
      "PREVIOUS_APPROVER",
      "FIXED_USER",
      "ROLE",
      "AREA_MANAGER",
      "OBSERVATION_RESPONSIBLE",
    ]),
    template: z.string().trim().min(1).max(100),
    subjectOverride: optionalReferenceSchema,
    includeWorkflowContext: z.boolean(),
    includeRelatedRecordLink: z.boolean(),
    recipientUserId: optionalReferenceSchema,
    recipientRoleId: optionalReferenceSchema,
    recipientAreaId: optionalReferenceSchema,
  })
  .strict();

const endNodeConfigurationSchema = configurationBaseSchema
  .extend({
    nodeType: z.literal("END"),
    finalResult: z.enum([
      "APPROVED",
      "REJECTED",
      "CLOSED",
      "RETURNED",
      "CANCELLED",
      "EXPIRED",
    ]),
    finalWorkflowStatus: z.string().trim().min(1).max(191),
    relatedRecordTargetState: optionalReferenceSchema,
    completionMessage: nullableNodeTextSchema,
    notifyParticipants: z.boolean(),
  })
  .strict();

export const workflowNodeConfigurationSchema = z.discriminatedUnion(
  "nodeType",
  [
    startNodeConfigurationSchema,
    stageNodeConfigurationSchema,
    approvalNodeConfigurationSchema,
    rejectionNodeConfigurationSchema,
    conditionNodeConfigurationSchema,
    slaNodeConfigurationSchema,
    escalationNodeConfigurationSchema,
    notificationNodeConfigurationSchema,
    endNodeConfigurationSchema,
  ],
);

export const workflowNodeTypeSchema = z.enum(WORKFLOW_NODE_TYPE_VALUES);

export const workflowNodeSaveSchema = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    nodeKey: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(1).max(191),
    description: nullableNodeTextSchema,
    type: workflowNodeTypeSchema,
    assignmentStrategy: z
      .enum(WORKFLOW_ASSIGNMENT_STRATEGY_VALUES)
      .nullable()
      .optional(),
    positionX: z.number().finite(),
    positionY: z.number().finite(),
    configurationJson: workflowNodeConfigurationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.configurationJson.nodeType !== value.type) {
      context.addIssue({
        code: "custom",
        message: "La configuración no coincide con el tipo del nodo.",
        path: ["configurationJson", "nodeType"],
      });
    }

    if (
      value.assignmentStrategy &&
      "assignmentStrategy" in value.configurationJson &&
      value.configurationJson.assignmentStrategy &&
      value.assignmentStrategy !== value.configurationJson.assignmentStrategy
    ) {
      context.addIssue({
        code: "custom",
        message:
          "La estrategia de asignación debe coincidir con la configuración.",
        path: ["assignmentStrategy"],
      });
    }
  });

const workflowConditionGroupSaveSchema = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    description: nullableNodeTextSchema,
    logicOperator: z.enum(WORKFLOW_CONDITION_LOGIC_VALUES),
    conditions: z
      .array(
        compatibleConditionRuleSchema.extend({
          sequence: z.number().int().min(0).optional(),
          description: nullableNodeTextSchema,
        }),
      )
      .max(50),
  })
  .strict();

export const workflowTransitionSaveSchema = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    sourceNodeId: z.string().trim().min(1).max(100),
    targetNodeId: z.string().trim().min(1).max(100),
    label: z.string().trim().max(191).nullable().optional(),
    priority: z.number().int().min(0).max(10_000).default(0),
    transitionType: z
      .enum(WORKFLOW_TRANSITION_TYPE_VALUES)
      .nullable()
      .optional(),
    conditionGroupId: z.string().trim().min(1).max(100).nullable().optional(),
    conditionGroup: workflowConditionGroupSaveSchema.nullable().optional(),
  })
  .strict();

export const workflowDesignerSaveSchema = z
  .object({
    nodes: z.array(workflowNodeSaveSchema).max(200),
    transitions: z.array(workflowTransitionSaveSchema).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const nodeKeys = value.nodes.map((node) => node.nodeKey);
    if (new Set(nodeKeys).size !== nodeKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Los nodeKey deben ser únicos dentro de la versión.",
        path: ["nodes"],
      });
    }

    const clientIds = value.nodes.map((node) => node.id).filter(Boolean);
    if (new Set(clientIds).size !== clientIds.length) {
      context.addIssue({
        code: "custom",
        message: "Los identificadores de nodo deben ser únicos.",
        path: ["nodes"],
      });
    }
  });

export const workflowDesignerValidateSchema = z
  .object({
    graph: workflowDesignerSaveSchema.optional(),
  })
  .strict();

const nullableSimulationTextSchema = z
  .string()
  .trim()
  .max(191)
  .nullable()
  .optional();

const simulationDateSchema = z
  .string()
  .trim()
  .max(100)
  .refine((value) => {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value);
    return !Number.isNaN(parsed.getTime());
  }, "La fecha de simulación no es válida.")
  .nullable()
  .optional();

export const workflowSimulationContextSchema = z
  .object({
    areaId: nullableSimulationTextSchema,
    currentNodeKey: nullableSimulationTextSchema,
    daysOverdue: z.number().finite().nullable().optional(),
    dueDate: simulationDateSchema,
    evidenceCount: z.number().int().min(0).nullable().optional(),
    hasEvidence: z.boolean().nullable().optional(),
    observationStatus: nullableSimulationTextSchema,
    previousDecision: nullableSimulationTextSchema,
    processType: z.string().trim().max(100).optional(),
    remediationPlanStatus: nullableSimulationTextSchema,
    requestType: nullableSimulationTextSchema,
    requestedExtensionDays: z.number().finite().nullable().optional(),
    requesterUserId: nullableSimulationTextSchema,
    responsibleUserId: nullableSimulationTextSchema,
    riskLevel: nullableSimulationTextSchema,
  })
  .strict();

export const workflowSimulationSchema = z
  .object({
    context: workflowSimulationContextSchema,
    nodeDecisions: z
      .record(
        z.string().trim().min(1).max(100),
        z.string().trim().min(1).max(100),
      )
      .default({}),
    scenarioName: z.string().trim().min(1).max(191).optional(),
  })
  .strict();

export const workflowPublishSchema = z
  .object({
    graphHash: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export const listWorkflowsQuerySchema = z.object({
  createdById: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  processType: processTypeSchema.optional(),
  search: z.string().trim().max(191).default(""),
  sortBy: z
    .enum(["createdAt", "name", "processType", "status", "updatedAt"])
    .default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(WORKFLOW_DEFINITION_STATUS_VALUES).optional(),
});

export const workflowVersionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(WORKFLOW_VERSION_STATUS_VALUES).optional(),
});

export const workflowActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateDraftVersionInput = z.infer<typeof createDraftVersionSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type DuplicateWorkflowInput = z.infer<typeof duplicateWorkflowSchema>;
export type ListWorkflowsQuery = z.infer<typeof listWorkflowsQuerySchema>;
export type UpdateWorkflowMetadataInput = z.infer<
  typeof updateWorkflowMetadataSchema
>;
export type WorkflowVersionListQuery = z.infer<
  typeof workflowVersionListQuerySchema
>;
export type WorkflowActivityQuery = z.infer<typeof workflowActivityQuerySchema>;
export type WorkflowDesignerSaveInput = z.infer<
  typeof workflowDesignerSaveSchema
>;
export type WorkflowDesignerValidateInput = z.infer<
  typeof workflowDesignerValidateSchema
>;
export type WorkflowSimulationInput = z.infer<typeof workflowSimulationSchema>;
export type WorkflowPublishInput = z.infer<typeof workflowPublishSchema>;
export type WorkflowNodeSaveInput = z.infer<typeof workflowNodeSaveSchema>;
export type WorkflowTransitionSaveInput = z.infer<
  typeof workflowTransitionSaveSchema
>;
export type WorkflowNodeConfiguration = z.infer<
  typeof workflowNodeConfigurationSchema
>;
export type WorkflowConditionRule = z.infer<typeof workflowConditionRuleSchema>;
