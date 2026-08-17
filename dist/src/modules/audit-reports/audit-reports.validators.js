import { z } from "zod";
const fields = {
    reportDate: z.coerce.date(),
    reportClassId: z.uuid("Seleccione una clase válida.").nullable().optional(),
    reportNumber: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9-]+$/, "El número de informe debe ser alfanumérico y puede contener guiones."),
    title: z.string().trim().min(3).max(191),
};
export const createAuditReportSchema = z.object(fields);
export const updateAuditReportSchema = z
    .object(fields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "Debe modificar al menos un campo.",
});
export const auditReportIdParamSchema = z.object({ id: z.uuid() });
export const listAuditReportsQuerySchema = z.object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().default(""),
});
const classFields = {
    active: z.boolean().default(true),
    description: z
        .union([z.string(), z.null(), z.undefined()])
        .transform((value) => value?.trim() || null)
        .refine((value) => value === null || value.length <= 500, {
        message: "La descripción no puede superar los 500 caracteres.",
    }),
    name: z
        .string()
        .trim()
        .min(2, "Ingrese un nombre de al menos 2 caracteres.")
        .max(191, "El nombre no puede superar los 191 caracteres."),
};
export const createAuditReportClassSchema = z.object(classFields);
export const updateAuditReportClassSchema = z
    .object(classFields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "Debe modificar al menos un campo.",
});
export const auditReportClassIdParamSchema = z.object({ id: z.uuid() });
export const listAuditReportClassesQuerySchema = z.object({
    active: z
        .enum(["false", "true"])
        .transform((value) => value === "true")
        .optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().default(""),
});
//# sourceMappingURL=audit-reports.validators.js.map