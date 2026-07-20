export const getDeadlineState = (input) => {
    if (input.finalStatus)
        return "NOT_ACTIONABLE";
    const effectiveDueDate = input.approvedExtensionDueDate ?? input.dueDate;
    if (effectiveDueDate.getTime() < input.now.getTime())
        return "OVERDUE";
    const reminderWindowEnd = input.now.getTime() + input.reminderDaysBeforeDue * 86_400_000;
    return effectiveDueDate.getTime() <= reminderWindowEnd ? "DUE_SOON" : "NOT_ACTIONABLE";
};
export const buildNotificationDedupeKey = (input) => `${input.eventType}:${input.entityId}:${input.recipientUserId}:${input.cycle}:${input.channel}`;
//# sourceMappingURL=deadline-monitor.policy.js.map