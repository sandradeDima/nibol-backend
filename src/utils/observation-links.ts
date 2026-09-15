export type ObservationLinkContext = {
  advanceId?: string;
  evidenceId?: string;
  extensionId?: string;
  planId?: string;
  tab?: "evidence" | "history" | "plans" | "summary";
};

export const buildObservationUrl = (
  observationId: string,
  context: ObservationLinkContext = {},
): string => {
  const params = new URLSearchParams();
  if (context.tab) params.set("tab", context.tab);
  if (context.planId) params.set("planId", context.planId);
  if (context.advanceId) params.set("advanceId", context.advanceId);
  if (context.extensionId) params.set("extensionId", context.extensionId);
  if (context.evidenceId) params.set("evidenceId", context.evidenceId);
  const query = params.toString();
  return `/observaciones/${encodeURIComponent(observationId)}${query ? `?${query}` : ""}`;
};
