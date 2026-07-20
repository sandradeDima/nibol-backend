export type DeadlineState = "DUE_SOON" | "OVERDUE" | "NOT_ACTIONABLE";

export const getDeadlineState = (input: {
  dueDate: Date;
  finalStatus: boolean;
  now: Date;
  reminderDaysBeforeDue: number;
  approvedExtensionDueDate?: Date | null;
}): DeadlineState => {
  if (input.finalStatus) return "NOT_ACTIONABLE";
  const effectiveDueDate = input.approvedExtensionDueDate ?? input.dueDate;
  if (effectiveDueDate.getTime() < input.now.getTime()) return "OVERDUE";
  const reminderWindowEnd = input.now.getTime() + input.reminderDaysBeforeDue * 86_400_000;
  return effectiveDueDate.getTime() <= reminderWindowEnd ? "DUE_SOON" : "NOT_ACTIONABLE";
};

export const buildNotificationDedupeKey = (input: {
  channel: "EMAIL" | "IN_APP";
  cycle: string;
  entityId: string;
  eventType: string;
  recipientUserId: string;
}): string =>
  `${input.eventType}:${input.entityId}:${input.recipientUserId}:${input.cycle}:${input.channel}`;
