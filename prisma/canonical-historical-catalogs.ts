// Application defaults shared by the seed and historical importer.
export const CANONICAL_RISK_LEVELS = [
  {
    colorToken: "high",
    maxRemediationDays: 90,
    description: "Observaciones de alta prioridad con impacto material.",
    key: "ALTO",
    name: "Alto",
    severityOrder: 1,
  },
  {
    colorToken: "medium",
    maxRemediationDays: 120,
    description: "Observaciones relevantes con seguimiento programado.",
    key: "MEDIO",
    name: "Medio",
    severityOrder: 2,
  },
  {
    colorToken: "low",
    maxRemediationDays: 180,
    description: "Observaciones de menor criticidad y ejecución gradual.",
    key: "BAJO",
    name: "Bajo",
    severityOrder: 3,
  },
] as const;

export const CANONICAL_OBSERVATION_STATUSES = [
  {
    countsAsOverdue: false,
    description: "Estado inicial para observaciones recién registradas.",
    isFinal: false,
    isInitial: true,
    key: "NO_INICIADO",
    name: "No iniciado",
    sortOrder: 10,
  },
  {
    countsAsOverdue: false,
    description: "La observación está siendo atendida por el área responsable.",
    isFinal: false,
    isInitial: false,
    key: "INICIADO",
    name: "Iniciado",
    sortOrder: 20,
  },
  {
    countsAsOverdue: false,
    description: "Uno o más planes de acción tienen avance aprobado.",
    isFinal: false,
    isInitial: false,
    key: "CON_AVANCE",
    name: "Con avance",
    sortOrder: 30,
  },
  {
    countsAsOverdue: false,
    description: "La observación fue cerrada y validada.",
    isFinal: true,
    isInitial: false,
    key: "CONCLUIDO",
    name: "Concluido",
    sortOrder: 40,
  },
] as const;
