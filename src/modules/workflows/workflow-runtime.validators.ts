import { z } from "zod";

import { WORKFLOW_PROCESS_TYPE_VALUES } from "./workflows.constants.js";
import { WORKFLOW_TASK_PERMISSIONS } from "./workflows.permissions.js";
import { workflowSimulationContextSchema } from "./workflows.validators.js";

const runtimeContextSchema = workflowSimulationContextSchema
  .extend({
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const workflowInstanceIdParamSchema = z.object({
  instanceId: z.uuid(),
});

export const workflowTaskIdParamSchema = z.object({
  taskId: z.uuid(),
});

export const workflowTimerIdParamSchema = z.object({
  timerId: z.uuid(),
});

export const workflowTimerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
});

export const workflowInstanceStartSchema = z
  .object({
    context: runtimeContextSchema.optional(),
    entityId: z.string().trim().min(1).max(191),
    entityType: z.string().trim().min(1).max(100),
    processType: z.enum(WORKFLOW_PROCESS_TYPE_VALUES),
    workflowDefinitionId: z.uuid().optional(),
  })
  .strict();

const commentSchema = z.string().trim().max(10_000).optional();

export const workflowTaskActionSchema = z
  .object({
    comment: commentSchema,
    evidenceReferences: z
      .array(z.string().trim().min(1).max(191))
      .max(100)
      .optional(),
  })
  .strict();

export const workflowTaskReassignSchema = z
  .object({
    assignedAreaId: z.uuid().optional(),
    assignedRoleId: z.uuid().optional(),
    assignedUserId: z.uuid().optional(),
    comment: commentSchema,
  })
  .strict()
  .refine(
    (value) =>
      [value.assignedAreaId, value.assignedRoleId, value.assignedUserId].filter(
        Boolean,
      ).length === 1,
    {
      message: "Seleccione exactamente un usuario, rol o área para reasignar.",
    },
  );

export const workflowTaskListQuerySchema = z.object({
  dateFrom: z.string().trim().max(30).optional(),
  dateTo: z.string().trim().max(30).optional(),
  dueState: z
    .enum(["ALL", "ON_TIME", "DUE_SOON", "OVERDUE", "NO_SLA", "NO_DUE"])
    .default("ALL"),
  nodeId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  processType: z.enum(WORKFLOW_PROCESS_TYPE_VALUES).optional(),
  search: z.string().trim().max(191).default(""),
  sortBy: z
    .enum(["createdAt", "dueAt", "processType", "workflow"])
    .default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  workflowDefinitionId: z.uuid().optional(),
});

export const workflowTaskActionPermissions = {
  APPROVE: WORKFLOW_TASK_PERMISSIONS.approve,
  COMPLETE: WORKFLOW_TASK_PERMISSIONS.complete,
  OBSERVE: WORKFLOW_TASK_PERMISSIONS.observe,
  REJECT: WORKFLOW_TASK_PERMISSIONS.reject,
  REQUEST_CORRECTION: WORKFLOW_TASK_PERMISSIONS.requestCorrection,
} as const;

export type WorkflowInstanceStartInput = z.infer<
  typeof workflowInstanceStartSchema
>;
export type WorkflowTaskActionInput = z.infer<typeof workflowTaskActionSchema>;
export type WorkflowTaskListQuery = z.infer<typeof workflowTaskListQuerySchema>;
export type WorkflowTaskReassignInput = z.infer<
  typeof workflowTaskReassignSchema
>;
export type WorkflowTimerListQuery = z.infer<
  typeof workflowTimerListQuerySchema
>;
