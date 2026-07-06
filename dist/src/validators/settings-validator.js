import { z } from "zod";
const supportedTimezones = new Set([
    "UTC",
    ...((Intl.supportedValuesOf?.("timeZone")) ?? []),
]);
export const supportedDateFormats = [
    "YYYY-MM-DD",
    "DD/MM/YYYY",
    "MM/DD/YYYY",
    "DD MMM YYYY",
    "MMMM D, YYYY",
];
const normalizeHexColor = (value) => {
    const trimmedValue = value.trim().toLowerCase();
    if (trimmedValue.length === 4) {
        return `#${trimmedValue
            .slice(1)
            .split("")
            .map((character) => `${character}${character}`)
            .join("")}`;
    }
    return trimmedValue;
};
export const updateSettingsSchema = z.object({
    appName: z.string().trim().min(1).max(191),
    dateFormat: z.enum(supportedDateFormats),
    primaryColor: z
        .string()
        .trim()
        .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
        message: "Primary color must be a valid hex color.",
    })
        .transform(normalizeHexColor),
    senderEmail: z.email().max(191),
    senderName: z.string().trim().min(1).max(191),
    supportEmail: z.email().max(191),
    timezone: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .refine((value) => supportedTimezones.has(value), {
        message: "Timezone must be a valid IANA timezone.",
    }),
});
export const logoUploadSchema = z.object({
    mimetype: z.enum([
        "image/jpeg",
        "image/png",
        "image/svg+xml",
        "image/webp",
    ]),
    originalName: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(5 * 1024 * 1024),
});
//# sourceMappingURL=settings-validator.js.map