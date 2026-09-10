import { normalizeWorkflowSimulationContext, } from "./workflow-rule-fields.js";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const getCustom = (value) => {
    if (!isRecord(value))
        return {};
    return { ...value };
};
const cleanCustomText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
export const getSpecialRequestRuntimeSummary = (context) => {
    if (context.processType !== "SPECIAL_REQUEST")
        return null;
    const title = cleanCustomText(context.custom.title, 191);
    if (!title)
        return null;
    return {
        description: cleanCustomText(context.custom.description, 10_000),
        reference: cleanCustomText(context.custom.reference, 100),
        title,
    };
};
export const getEvidenceReviewRuntimeSummary = (context) => {
    if (context.processType !== "EVIDENCE_REVIEW")
        return null;
    const originalName = cleanCustomText(context.custom.evidenceName, 255);
    if (!originalName)
        return null;
    return {
        context: cleanCustomText(context.custom.evidenceContext, 100),
        originalName,
    };
};
export const buildWorkflowRuntimeContext = ({ actorUserId, context, processType, }) => {
    const normalized = normalizeWorkflowSimulationContext({
        ...(context ?? {}),
        processType,
        requesterUserId: context?.requesterUserId ?? actorUserId,
    });
    return {
        ...normalized,
        custom: getCustom(context?.custom),
    };
};
export const restoreWorkflowRuntimeContext = (processType, value) => {
    const raw = isRecord(value) ? value : {};
    const normalized = normalizeWorkflowSimulationContext({
        ...raw,
        processType,
    });
    return {
        ...normalized,
        custom: getCustom(raw.custom),
    };
};
export const getAllowlistedRuntimeReference = (context, reference) => {
    if (typeof reference !== "string")
        return null;
    const normalized = reference.trim();
    if (!normalized)
        return null;
    const directReferences = {
        areaId: context.areaId,
        requesterUserId: context.requesterUserId,
        responsibleUserId: context.responsibleUserId,
    };
    const directValue = directReferences[normalized];
    if (typeof directValue === "string" && directValue.trim()) {
        return directValue.trim();
    }
    const customKey = normalized.startsWith("custom.")
        ? normalized.slice("custom.".length)
        : normalized;
    if ([
        "areaResponsibleUserId",
        "recordOwnerUserId",
        "observationResponsibleUserId",
    ].includes(customKey)) {
        const customValue = context.custom[customKey];
        return typeof customValue === "string" && customValue.trim()
            ? customValue.trim()
            : null;
    }
    return null;
};
export const getSafeRuntimeContextSummary = (context) => ({
    areaId: context.areaId ?? null,
    allPlansValidated: context.allPlansValidated ?? null,
    areaPlanRequired: context.areaPlanRequired ?? null,
    currentNodeKey: context.currentNodeKey ?? null,
    daysOverdue: context.daysOverdue ?? null,
    dueDate: context.dueDate ?? null,
    evidenceCount: context.evidenceCount ?? null,
    hasEvidence: context.hasEvidence ?? null,
    observationStatus: context.observationStatus ?? null,
    previousDecision: context.previousDecision ?? null,
    processType: context.processType,
    remediationPlanStatus: context.remediationPlanStatus ?? null,
    requestType: context.requestType ?? null,
    requestedExtensionDays: context.requestedExtensionDays ?? null,
    requesterUserId: context.requesterUserId ?? null,
    responsibleUserId: context.responsibleUserId ?? null,
    riskLevel: context.riskLevel ?? null,
});
//# sourceMappingURL=workflow-runtime-context.js.map