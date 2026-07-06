import { z } from "zod";

const userSummarySchema = z.object({
  email: z.email(),
  id: z.uuid(),
  name: z.string().trim().min(1),
});

const areaSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
});

const observationAreaOptionSchema = areaSummarySchema.extend({
  code: z.string().trim().min(1).nullable(),
  managerUser: userSummarySchema.nullable(),
});

const riskLevelSchema = z.object({
  colorToken: z.string().trim().min(1).nullable(),
  defaultDeadlineDays: z.number().int().nullable(),
  id: z.uuid(),
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  severityOrder: z.number().int(),
});

const observationStatusSchema = z.object({
  countsAsOverdue: z.boolean(),
  id: z.uuid(),
  isFinal: z.boolean(),
  isInitial: z.boolean(),
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sortOrder: z.number().int(),
});

const catalogSchema = z.object({
  active: z.boolean(),
  createdAt: z.string().min(1),
  description: z.string().trim().min(1).nullable(),
  id: z.uuid(),
  key: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1),
  sortOrder: z.number().int(),
  type: z.enum([
    "proceso_auditado",
    "tipo_observacion",
    "fuente_hallazgo",
    "categoria_hallazgo",
  ]),
  updatedAt: z.string().min(1),
});

const effectiveStatusSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const observationAreaAssignmentSchema = z.object({
  area: areaSummarySchema,
  id: z.uuid(),
  responsibleUser: userSummarySchema.nullable(),
  roleInFinding: z.string().trim().min(1).nullable(),
});

export const observationListItemSchema = z.object({
  area: areaSummarySchema,
  code: z.string().trim().min(1),
  createdAt: z.string().min(1),
  currentStage: z.string().trim().min(1).nullable(),
  detectedAt: z.string().min(1),
  dueDate: z.string().min(1),
  effectiveStatus: effectiveStatusSchema,
  id: z.uuid(),
  isOverdue: z.boolean(),
  progressPercent: z.number().int().min(0).max(100),
  responsibleUser: userSummarySchema.nullable(),
  riskLevel: riskLevelSchema,
  status: observationStatusSchema,
  title: z.string().trim().min(1),
  updatedAt: z.string().min(1),
});

export const observationDetailSchema = observationListItemSchema.extend({
  additionalAreas: z.array(observationAreaAssignmentSchema),
  auditRecommendation: z.string().trim().min(1),
  auditorUser: userSummarySchema,
  category: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1),
  observationType: z.string().trim().min(1).nullable(),
  process: z.string().trim().min(1).nullable(),
  source: z.string().trim().min(1).nullable(),
});

export const observationFormOptionsSchema = z.object({
  areas: z.array(observationAreaOptionSchema),
  catalogs: z.object({
    categoria_hallazgo: z.array(catalogSchema),
    fuente_hallazgo: z.array(catalogSchema),
    proceso_auditado: z.array(catalogSchema),
    tipo_observacion: z.array(catalogSchema),
  }),
  riskLevels: z.array(riskLevelSchema),
  statuses: z.array(observationStatusSchema),
  users: z.array(userSummarySchema),
});
