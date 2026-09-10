export const DEADLINE_REMINDER_JOB_NAME = "deadline-reminder";
export const DEADLINE_REMINDER_LOCK_NAME = "deadline-reminder";
export const DEADLINE_REMINDER_EVENT_TYPE = "DEADLINE_REMINDER_DIGEST";
export const DEADLINE_REMINDER_ROLES = [
    "AREA_RESPONSIBLE",
    "EXECUTOR",
    "PROCESS_OWNER",
];
export const DEADLINE_REMINDER_POLICY_DEFAULTS = {
    AREA_RESPONSIBLE: {
        cadenceMonths: 1,
        cutoffDay: 15,
        enabled: true,
        upcomingWindowDays: 30,
    },
    EXECUTOR: {
        cadenceMonths: 1,
        cutoffDay: 15,
        enabled: true,
        upcomingWindowDays: 30,
    },
    PROCESS_OWNER: {
        cadenceMonths: 2,
        cutoffDay: 15,
        enabled: true,
        upcomingWindowDays: 60,
    },
};
export const DEADLINE_REMINDER_ROLE_LABELS = {
    AREA_RESPONSIBLE: "Responsable de área",
    EXECUTOR: "Ejecutor",
    PROCESS_OWNER: "Dueño del proceso",
};
export const DEADLINE_REMINDER_PARAMETER_DEFAULTS = Object.fromEntries(DEADLINE_REMINDER_ROLES.flatMap((role) => {
    const defaults = DEADLINE_REMINDER_POLICY_DEFAULTS[role];
    const label = DEADLINE_REMINDER_ROLE_LABELS[role];
    return [
        [
            `deadline_reminder_${role.toLowerCase()}_enabled`,
            {
                description: `Activa los recordatorios de plazos para ${label}.`,
                name: `${label} · Recordatorios activos`,
                value: String(defaults.enabled),
                valueType: "boolean",
            },
        ],
        [
            `deadline_reminder_${role.toLowerCase()}_cutoff_day`,
            {
                description: `Día calendario de corte para los recordatorios de ${label.toLowerCase()}.`,
                name: `${label} · Día de corte`,
                value: String(defaults.cutoffDay),
                valueType: "number",
            },
        ],
        [
            `deadline_reminder_${role.toLowerCase()}_cadence_months`,
            {
                description: `Frecuencia calendarizada en meses para los recordatorios de ${label.toLowerCase()}.`,
                name: `${label} · Frecuencia en meses`,
                value: String(defaults.cadenceMonths),
                valueType: "number",
            },
        ],
        [
            `deadline_reminder_${role.toLowerCase()}_upcoming_window_days`,
            {
                description: `Ventana de próximos vencimientos para ${label.toLowerCase()}.`,
                name: `${label} · Ventana de próximos vencimientos`,
                value: String(defaults.upcomingWindowDays),
                valueType: "number",
            },
        ],
    ];
}));
export const isDeadlineReminderParameterKey = (key) => key in DEADLINE_REMINDER_PARAMETER_DEFAULTS;
export const getDeadlineReminderParameterKey = (role, field) => `deadline_reminder_${role.toLowerCase()}_${field === "cutoffDay"
    ? "cutoff_day"
    : field === "cadenceMonths"
        ? "cadence_months"
        : field === "upcomingWindowDays"
            ? "upcoming_window_days"
            : field}`;
//# sourceMappingURL=deadline-reminder.constants.js.map