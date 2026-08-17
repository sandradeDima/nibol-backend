import { z } from "zod";
const nullableText = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
});
const uniqueIds = (values) => new Set(values).size === values.length;
export const observationAreaInputSchema = z.object({
    areaId: z.uuid(),
    areaResponsibleUserId: z.uuid(),
    processOwnerUserId: z.uuid(),
});
export const observationActionPlanInputSchema = z.object({
    areaId: z.uuid("Seleccione un área válida para el plan de acción."),
    description: z
        .string()
        .trim()
        .min(1, "Ingrese la descripción del plan de acción.")
        .max(10_000),
    dueDate: z.coerce.date({ error: "Ingrese una fecha límite válida." }),
    responsibleUserId: z.uuid("Seleccione un ejecutor válido."),
    title: z
        .string()
        .trim()
        .min(2, "Ingrese el título del plan de acción.")
        .max(191),
});
const mutationFields = {
    areaAssignments: z
        .array(observationAreaInputSchema)
        .min(1, "Agregue al menos un área involucrada.")
        .max(30)
        .refine((rows) => uniqueIds(rows.map((row) => row.areaId)), {
        message: "Cada área puede asignarse una sola vez.",
    }),
    auditRecommendation: z.string().trim().min(1).max(5_000),
    auditReportId: z.uuid(),
    auditorUserId: z.uuid(),
    category: nullableText,
    currentStage: nullableText,
    description: z.string().trim().min(1).max(10_000),
    mainObservationId: z.uuid(),
    observationNumber: z.coerce.number().int().positive().max(999_999),
    process: nullableText,
    riskIds: z
        .array(z.uuid())
        .min(1, "Seleccione al menos un riesgo asociado.")
        .max(30)
        .refine(uniqueIds, {
        message: "Cada riesgo puede seleccionarse una sola vez.",
    }),
    riskLevelId: z.uuid(),
    source: nullableText,
    title: z.string().trim().min(3).max(191),
};
export const createObservationSchema = z
    .object({
    ...mutationFields,
    actionPlans: z.array(observationActionPlanInputSchema).max(100).default([]),
})
    .superRefine((value, context) => {
    const areaIds = new Set(value.areaAssignments.map((row) => row.areaId));
    value.actionPlans.forEach((plan, index) => {
        if (!areaIds.has(plan.areaId))
            context.addIssue({
                code: "custom",
                message: "El plan de acción debe pertenecer a un área involucrada en la observación.",
                path: ["actionPlans", index, "areaId"],
            });
    });
});
export const updateObservationSchema = z
    .object(mutationFields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "Debe modificar al menos un campo.",
});
export const observationIdParamSchema = z.object({ id: z.uuid() });
export const listObservationsQuerySchema = z.object({
    actionPlanResponsibleUserId: z.uuid().optional(),
    areaId: z.uuid().optional(),
    areaResponsibleUserId: z.uuid().optional(),
    auditReportId: z.uuid().optional(),
    currentDueDateFrom: z.coerce.date().optional(),
    currentDueDateTo: z.coerce.date().optional(),
    mainObservationId: z.uuid().optional(),
    observationStatus: z
        .enum(["NO_INICIADO", "INICIADO", "CON_AVANCE", "CONCLUIDO"])
        .optional(),
    overdue: z
        .enum(["false", "true"])
        .transform((value) => value === "true")
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
    processOwnerUserId: z.uuid().optional(),
    riskId: z.uuid().optional(),
    riskLevelId: z.uuid().optional(),
    search: z.string().trim().default(""),
    sortBy: z
        .enum([
        "currentDueDate",
        "observationNumber",
        "reportDate",
        "title",
        "updatedAt",
    ])
        .default("updatedAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
});
//# sourceMappingURL=observations.validators.js.map