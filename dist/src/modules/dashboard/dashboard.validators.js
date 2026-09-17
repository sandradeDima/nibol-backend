import { z } from "zod";
const csvUuidArray = z.preprocess((value) => typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : value, z.array(z.uuid()).min(1).optional());
export const roleDashboardQuerySchema = z.object({
    areaId: z.uuid().optional(),
    areaResponsibleUserId: csvUuidArray,
    executorId: csvUuidArray,
    observationState: z.enum(["PENDING", "CONCLUDED"]).optional(),
    search: z.string().trim().max(191).default(""),
});
//# sourceMappingURL=dashboard.validators.js.map