import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { buildDateRangeFilter } from "../../services/logging-utils.js";
import { notificationService } from "../../services/notification-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import {
  OBSERVATION_OVERDUE_STATUS_KEY,
  OBSERVATION_TERMINAL_STATUS_KEYS,
} from "../observations/observations.constants.js";
import {
  AUDIT_ROLE_MARKERS,
  PLAN_EDITABLE_STATUSES,
  PLAN_PROGRESS_UPDATE_STATUSES,
  SYSTEM_WIDE_ROLE_NAMES,
} from "./remediation.constants.js";
import type {
  CommitmentDetail,
  CommitmentListItem,
  CommitmentStatusValue,
  CreateCommitmentInput,
  ListCommitmentsQuery,
  ListRemediationPlansQuery,
  ObservationRemediationQuery,
  ObservationRemediationWorkspace,
  RemediationPlanDetail,
  RemediationPlanListItem,
  RemediationPlanMutationInput,
  RemediationPlanReturnInput,
  RemediationPlanStatusValue,
  RemediationPlanSummary,
  RemediationUserSummary,
  UpdateCommitmentInput,
  RemediationPlanUpdateInput,
} from "./remediation.types.js";

const terminalObservationStatuses = new Set<string>(OBSERVATION_TERMINAL_STATUS_KEYS);
const remediationPrisma = prisma as typeof prisma & {
  commitment: any;
  observation: any;
  remediationPlan: any;
};

const userSummarySelect = {
  email: true,
  id: true,
  name: true,
} as const;

const areaSummarySelect = {
  id: true,
  name: true,
} as const;

const areaWithManagerSelect = {
  id: true,
  managerUser: {
    select: userSummarySelect,
  },
  name: true,
} as const;

const observationRiskLevelSelect = {
  colorToken: true,
  id: true,
  key: true,
  name: true,
} as const;

const observationStatusSelect = {
  key: true,
  name: true,
} as const;

const observationContextSelect = {
  area: {
    select: areaWithManagerSelect,
  },
  areaId: true,
  areaAssignments: {
    orderBy: {
      area: {
        name: "asc",
      },
    },
    select: {
      area: {
        select: areaWithManagerSelect,
      },
      areaId: true,
      responsibleUser: {
        select: userSummarySelect,
      },
      roleInFinding: true,
    },
  },
  auditorUser: {
    select: userSummarySelect,
  },
  code: true,
  dueDate: true,
  id: true,
  responsibleUser: {
    select: userSummarySelect,
  },
  riskLevel: {
    select: observationRiskLevelSelect,
  },
  status: {
    select: observationStatusSelect,
  },
  title: true,
} as const;

const commitmentMetricSelect = {
  completedAt: true,
  dueDate: true,
  progressPercent: true,
  status: true,
} as const;

const planDetailSelect = {
  additionalComments: true,
  approvedAt: true,
  approvedByUser: {
    select: userSummarySelect,
  },
  area: {
    select: areaSummarySelect,
  },
  areaId: true,
  commitments: {
    orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    select: commitmentMetricSelect,
    where: {
      deletedAt: null,
    },
  },
  createdAt: true,
  createdByUser: {
    select: userSummarySelect,
  },
  id: true,
  mitigationText: true,
  observation: {
    select: observationContextSelect,
  },
  observationId: true,
  ownerUser: {
    select: userSummarySelect,
  },
  returnReason: true,
  returnedAt: true,
  returnedByUser: {
    select: userSummarySelect,
  },
  sentToAuditAt: true,
  status: true,
  strategyText: true,
  updatedAt: true,
} as const;

const planSummarySelect = {
  areaId: true,
  commitments: {
    orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    select: commitmentMetricSelect,
    where: {
      deletedAt: null,
    },
  },
  id: true,
  status: true,
  updatedAt: true,
} as const;

const commitmentDetailSelect = {
  completedAt: true,
  createdAt: true,
  description: true,
  dueDate: true,
  id: true,
  observationId: true,
  progressPercent: true,
  remediationPlan: {
    select: {
      areaId: true,
      id: true,
      observation: {
        select: observationContextSelect,
      },
      status: true,
    },
  },
  remediationPlanId: true,
  responsibleUser: {
    select: userSummarySelect,
  },
  responsibleUserId: true,
  sortOrder: true,
  status: true,
  title: true,
  updatedAt: true,
} as const;

const planListSelect = {
  area: {
    select: areaSummarySelect,
  },
  areaId: true,
  commitments: {
    orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    select: commitmentMetricSelect,
    where: {
      deletedAt: null,
    },
  },
  id: true,
  observation: {
    select: {
      areaId: true,
      areaAssignments: {
        select: {
          areaId: true,
          responsibleUser: {
            select: userSummarySelect,
          },
        },
      },
      code: true,
      id: true,
      responsibleUser: {
        select: userSummarySelect,
      },
      riskLevel: {
        select: observationRiskLevelSelect,
      },
      title: true,
    },
  },
  ownerUser: {
    select: userSummarySelect,
  },
  status: true,
  updatedAt: true,
} as const;

const commitmentListSelect = {
  completedAt: true,
  dueDate: true,
  id: true,
  progressPercent: true,
  remediationPlan: {
    select: {
      area: {
        select: areaSummarySelect,
      },
      id: true,
      status: true,
      observation: {
        select: {
          code: true,
          id: true,
          title: true,
        },
      },
    },
  },
  responsibleUser: {
    select: userSummarySelect,
  },
  status: true,
  title: true,
  updatedAt: true,
} as const;

type UserSummaryRow = {
  email: string;
  id: string;
  name: string;
};

type AreaSummaryRow = {
  id: string;
  name: string;
};

type AreaWithManagerRow = {
  id: string;
  managerUser: UserSummaryRow | null;
  name: string;
};

type ObservationContextRow = {
  area: AreaWithManagerRow;
  areaId: string;
  areaAssignments: Array<{
    area: AreaWithManagerRow;
    areaId: string;
    responsibleUser: UserSummaryRow | null;
    roleInFinding: string | null;
  }>;
  auditorUser: UserSummaryRow;
  code: string;
  dueDate: Date;
  id: string;
  responsibleUser: UserSummaryRow | null;
  riskLevel: {
    colorToken: string | null;
    id: string;
    key: string;
    name: string;
  };
  status: {
    key: string;
    name: string;
  };
  title: string;
};

type CommitmentMetricRow = {
  completedAt: Date | null;
  dueDate: Date;
  progressPercent: number;
  status: CommitmentStatusValue;
};

type PlanDetailRow = {
  additionalComments: string | null;
  approvedAt: Date | null;
  approvedByUser: UserSummaryRow | null;
  area: AreaSummaryRow;
  areaId: string;
  commitments: CommitmentMetricRow[];
  createdAt: Date;
  createdByUser: UserSummaryRow;
  id: string;
  mitigationText: string | null;
  observation: ObservationContextRow;
  observationId: string;
  ownerUser: UserSummaryRow | null;
  returnReason: string | null;
  returnedAt: Date | null;
  returnedByUser: UserSummaryRow | null;
  sentToAuditAt: Date | null;
  status: RemediationPlanStatusValue;
  strategyText: string;
  updatedAt: Date;
};

type PlanSummaryRow = {
  areaId: string;
  commitments: CommitmentMetricRow[];
  id: string;
  status: RemediationPlanStatusValue;
  updatedAt: Date;
};

type PlanListRow = {
  area: AreaSummaryRow;
  areaId: string;
  commitments: CommitmentMetricRow[];
  id: string;
  observation: {
    areaAssignments: Array<{
      areaId: string;
      responsibleUser: UserSummaryRow | null;
    }>;
    areaId: string;
    code: string;
    id: string;
    responsibleUser: UserSummaryRow | null;
    riskLevel: {
      colorToken: string | null;
      id: string;
      key: string;
      name: string;
    };
    title: string;
  };
  ownerUser: UserSummaryRow | null;
  status: RemediationPlanStatusValue;
  updatedAt: Date;
};

type CommitmentDetailRow = {
  completedAt: Date | null;
  createdAt: Date;
  description: string | null;
  dueDate: Date;
  id: string;
  observationId: string;
  progressPercent: number;
  remediationPlan: {
    areaId: string;
    id: string;
    observation: ObservationContextRow;
    status: RemediationPlanStatusValue;
  };
  remediationPlanId: string;
  responsibleUser: UserSummaryRow | null;
  responsibleUserId: string | null;
  sortOrder: number;
  status: CommitmentStatusValue;
  title: string;
  updatedAt: Date;
};

type CommitmentListRow = {
  completedAt: Date | null;
  dueDate: Date;
  id: string;
  progressPercent: number;
  remediationPlan: {
    area: AreaSummaryRow;
    id: string;
    observation: {
      code: string;
      id: string;
      title: string;
    };
    status: RemediationPlanStatusValue;
  };
  responsibleUser: UserSummaryRow | null;
  status: CommitmentStatusValue;
  title: string;
  updatedAt: Date;
};

type PlanResponsibleObservationRow = {
  areaId: string;
  areaAssignments: Array<{
    areaId: string;
    responsibleUser: UserSummaryRow | null;
  }>;
  responsibleUser: UserSummaryRow | null;
};

type AreaContext = {
  area: AreaWithManagerRow;
  canManagePlan: boolean;
  isPrimary: boolean;
  responsibleUser: UserSummaryRow | null;
  roleInFinding: string | null;
};

type PlanContext = {
  areaContext: AreaContext;
  canReview: boolean;
  plan: PlanDetailRow;
};

type CommitmentContext = {
  areaContext: AreaContext;
  canReview: boolean;
  commitment: CommitmentDetailRow;
  isResponsibleExecutor: boolean;
};

const normalizeRoleName = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
};

const isSystemWideAccess = (access: AuthorizationSummary): boolean => {
  if (access.isAdmin) {
    return true;
  }

  return access.roles.some((role) => SYSTEM_WIDE_ROLE_NAMES.has(normalizeRoleName(role)));
};

const hasAuditReviewRole = (access: AuthorizationSummary): boolean => {
  return access.roles.some((role) => {
    const normalizedRole = normalizeRoleName(role);
    return AUDIT_ROLE_MARKERS.some((marker) => normalizedRole.includes(marker));
  });
};

const canReviewObservation = (
  observation: ObservationContextRow,
  access: AuthorizationSummary,
): boolean => {
  return (
    isSystemWideAccess(access) ||
    observation.auditorUser.id === access.userId ||
    hasAuditReviewRole(access)
  );
};

const mapUserSummary = (
  user: UserSummaryRow | null | undefined,
): RemediationUserSummary | null => {
  if (!user) {
    return null;
  }

  return {
    email: user.email,
    id: user.id,
    name: user.name,
  };
};

const isObservationOverdue = (dueDate: Date, statusKey: string): boolean => {
  if (statusKey === OBSERVATION_OVERDUE_STATUS_KEY) {
    return true;
  }

  if (terminalObservationStatuses.has(statusKey)) {
    return false;
  }

  return dueDate.getTime() < Date.now();
};

const buildObservationEffectiveStatus = (observation: ObservationContextRow) => {
  if (isObservationOverdue(observation.dueDate, observation.status.key)) {
    return {
      key: OBSERVATION_OVERDUE_STATUS_KEY,
      name: "Vencida",
    };
  }

  return {
    key: observation.status.key,
    name: observation.status.name,
  };
};

const buildAssignedAreas = (
  observation: ObservationContextRow,
  access: AuthorizationSummary,
): AreaContext[] => {
  const areas: AreaContext[] = [
    {
      area: observation.area,
      canManagePlan: false,
      isPrimary: true,
      responsibleUser: observation.responsibleUser,
      roleInFinding: "Area principal",
    },
    ...observation.areaAssignments.map((assignment) => ({
      area: assignment.area,
      canManagePlan: false,
      isPrimary: false,
      responsibleUser: assignment.responsibleUser,
      roleInFinding: assignment.roleInFinding,
    })),
  ];

  return areas.map((areaContext) => ({
    ...areaContext,
    canManagePlan:
      isSystemWideAccess(access) ||
      areaContext.area.managerUser?.id === access.userId ||
      areaContext.responsibleUser?.id === access.userId,
  }));
};

const isCommitmentCompleted = (commitment: CommitmentMetricRow): boolean => {
  return (
    commitment.status === "COMPLETED" ||
    commitment.completedAt !== null ||
    commitment.progressPercent >= 100
  );
};

const isCommitmentOverdue = (commitment: CommitmentMetricRow): boolean => {
  return !isCommitmentCompleted(commitment) && commitment.dueDate.getTime() < Date.now();
};

const getCommitmentStatusLabel = (status: CommitmentStatusValue): string => {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "IN_PROGRESS":
      return "En progreso";
    case "SENT_TO_AUDIT":
      return "Enviado a Auditoria";
    case "APPROVED":
      return "Aprobado";
    case "RETURNED":
      return "Devuelto";
    case "COMPLETED":
      return "Completado";
    case "OVERDUE":
      return "Vencido";
  }
};

const buildCommitmentEffectiveStatus = (commitment: CommitmentMetricRow) => {
  if (isCommitmentCompleted(commitment)) {
    return {
      key: "COMPLETED",
      name: getCommitmentStatusLabel("COMPLETED"),
    };
  }

  if (isCommitmentOverdue(commitment)) {
    return {
      key: "OVERDUE",
      name: getCommitmentStatusLabel("OVERDUE"),
    };
  }

  return {
    key: commitment.status,
    name: getCommitmentStatusLabel(commitment.status),
  };
};

const calculatePlanMetrics = (commitments: CommitmentMetricRow[]) => {
  const activeCommitments = commitments;
  const commitmentCount = activeCommitments.length;
  const progressPercent =
    commitmentCount === 0
      ? 0
      : Math.round(
          activeCommitments.reduce((total, commitment) => {
            return total + commitment.progressPercent;
          }, 0) / commitmentCount,
        );
  const overdueCommitmentCount = activeCommitments.filter((commitment) =>
    isCommitmentOverdue(commitment),
  ).length;
  const pendingByDate = [...activeCommitments]
    .filter((commitment) => !isCommitmentCompleted(commitment))
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
  const allByDate = [...activeCommitments].sort(
    (left, right) => left.dueDate.getTime() - right.dueDate.getTime(),
  );
  const nextDueDate = (pendingByDate[0] ?? allByDate[0])?.dueDate ?? null;

  return {
    commitmentCount,
    nextDueDate,
    overdueCommitmentCount,
    progressPercent,
  };
};

const buildPlanSummary = (
  plan: Pick<PlanSummaryRow, "commitments" | "id" | "status" | "updatedAt">,
): RemediationPlanSummary => {
  const metrics = calculatePlanMetrics(plan.commitments);

  return {
    commitmentCount: metrics.commitmentCount,
    id: plan.id,
    nextDueDate: metrics.nextDueDate?.toISOString() ?? null,
    overdueCommitmentCount: metrics.overdueCommitmentCount,
    progressPercent: metrics.progressPercent,
    status: plan.status,
    updatedAt: plan.updatedAt.toISOString(),
  };
};

const buildPlanResponsibleUser = (
  observation: PlanResponsibleObservationRow,
  areaId: string,
  ownerUser: UserSummaryRow | null,
): RemediationUserSummary | null => {
  if (ownerUser) {
    return mapUserSummary(ownerUser);
  }

  if (observation.areaId === areaId) {
    return mapUserSummary(observation.responsibleUser);
  }

  const assignment = observation.areaAssignments.find((item) => item.areaId === areaId);
  return mapUserSummary(assignment?.responsibleUser ?? null);
};

const isPlanEditableStatus = (status: RemediationPlanStatusValue): boolean => {
  return PLAN_EDITABLE_STATUSES.has(status as "DRAFT" | "RETURNED");
};

const isPlanProgressUpdateStatus = (
  status: RemediationPlanStatusValue,
): boolean => {
  return PLAN_PROGRESS_UPDATE_STATUSES.has(status as "APPROVED");
};

const mapObservationSummary = (
  observation: ObservationContextRow,
) => {
  return {
    area: {
      id: observation.area.id,
      name: observation.area.name,
    },
    auditorUser: mapUserSummary(observation.auditorUser)!,
    code: observation.code,
    dueDate: observation.dueDate.toISOString(),
    effectiveStatus: buildObservationEffectiveStatus(observation),
    id: observation.id,
    responsibleUser: mapUserSummary(observation.responsibleUser),
    riskLevel: {
      colorToken: observation.riskLevel.colorToken,
      id: observation.riskLevel.id,
      key: observation.riskLevel.key,
      name: observation.riskLevel.name,
    },
    title: observation.title,
  };
};

const mapPlanDetail = (
  plan: PlanDetailRow,
  areaContext: AreaContext,
  access: AuthorizationSummary,
): RemediationPlanDetail => {
  const summary = buildPlanSummary(plan);
  const canReview = canReviewObservation(plan.observation, access);
  const canEdit = isSystemWideAccess(access)
    ? true
    : areaContext.canManagePlan && isPlanEditableStatus(plan.status);
  const canSendToAudit = isSystemWideAccess(access)
    ? plan.status !== "CLOSED"
    : areaContext.canManagePlan && isPlanEditableStatus(plan.status);

  return {
    ...summary,
    additionalComments: plan.additionalComments,
    approvedAt: plan.approvedAt?.toISOString() ?? null,
    approvedByUser: mapUserSummary(plan.approvedByUser),
    area: {
      id: plan.area.id,
      name: plan.area.name,
    },
    canApprove: canReview && plan.status === "SENT_TO_AUDIT",
    canEdit,
    canReturn: canReview && plan.status === "SENT_TO_AUDIT",
    canSendToAudit,
    createdAt: plan.createdAt.toISOString(),
    createdByUser: mapUserSummary(plan.createdByUser)!,
    mitigationText: plan.mitigationText,
    observationId: plan.observationId,
    ownerUser: mapUserSummary(plan.ownerUser),
    responsibleUser: buildPlanResponsibleUser(
      plan.observation,
      plan.areaId,
      plan.ownerUser,
    ),
    returnReason: plan.returnReason,
    returnedAt: plan.returnedAt?.toISOString() ?? null,
    returnedByUser: mapUserSummary(plan.returnedByUser),
    sentToAuditAt: plan.sentToAuditAt?.toISOString() ?? null,
    status: plan.status,
    strategyText: plan.strategyText,
  };
};

const mapCommitmentDetail = (
  commitment: CommitmentDetailRow,
  context: CommitmentContext,
  access: AuthorizationSummary,
): CommitmentDetail => {
  const canEditStructure = isSystemWideAccess(access)
    ? true
    : context.areaContext.canManagePlan &&
      isPlanEditableStatus(commitment.remediationPlan.status);
  const canUpdateProgress =
    canEditStructure ||
    context.isResponsibleExecutor &&
      (isPlanProgressUpdateStatus(commitment.remediationPlan.status) ||
        isPlanEditableStatus(commitment.remediationPlan.status));
  const isCompleted = isCommitmentCompleted(commitment);

  return {
    canDelete: canEditStructure,
    canEditStructure,
    canMarkComplete: canUpdateProgress && !isCompleted,
    canReview: context.canReview,
    canSendToAudit: !isCompleted && (canEditStructure || canUpdateProgress),
    canUpdateProgress,
    completedAt: commitment.completedAt?.toISOString() ?? null,
    createdAt: commitment.createdAt.toISOString(),
    description: commitment.description,
    dueDate: commitment.dueDate.toISOString(),
    effectiveStatus: buildCommitmentEffectiveStatus(commitment),
    id: commitment.id,
    isOverdue: isCommitmentOverdue(commitment),
    observationId: commitment.observationId,
    progressPercent: commitment.progressPercent,
    remediationPlanId: commitment.remediationPlanId,
    responsibleUser: mapUserSummary(commitment.responsibleUser),
    sortOrder: commitment.sortOrder,
    status: commitment.status,
    title: commitment.title,
    updatedAt: commitment.updatedAt.toISOString(),
  };
};

const buildObservationVisibilityCondition = (
  access: AuthorizationSummary,
): any => {
  if (isSystemWideAccess(access) || hasAuditReviewRole(access)) {
    return undefined;
  }

  return {
    OR: [
      {
        responsibleUserId: access.userId,
      },
      {
        auditorUserId: access.userId,
      },
      {
        area: {
          active: true,
          deletedAt: null,
          managerUserId: access.userId,
        },
      },
      {
        areaAssignments: {
          some: {
            OR: [
              {
                responsibleUserId: access.userId,
              },
              {
                area: {
                  active: true,
                  deletedAt: null,
                  managerUserId: access.userId,
                },
              },
            ],
          },
        },
      },
      {
        commitments: {
          some: {
            deletedAt: null,
            responsibleUserId: access.userId,
          },
        },
      },
      {
        remediationPlans: {
          some: {
            deletedAt: null,
            ownerUserId: access.userId,
          },
        },
      },
    ],
  };
};

const buildPlanVisibilityCondition = (
  access: AuthorizationSummary,
): any => {
  if (isSystemWideAccess(access) || hasAuditReviewRole(access)) {
    return undefined;
  }

  return {
    OR: [
      {
        ownerUserId: access.userId,
      },
      {
        area: {
          active: true,
          deletedAt: null,
          managerUserId: access.userId,
        },
      },
      {
        commitments: {
          some: {
            deletedAt: null,
            responsibleUserId: access.userId,
          },
        },
      },
      {
        observation: buildObservationVisibilityCondition(access) ?? {},
      },
    ],
  };
};

const buildCommitmentVisibilityCondition = (
  access: AuthorizationSummary,
): any => {
  if (isSystemWideAccess(access) || hasAuditReviewRole(access)) {
    return undefined;
  }

  return {
    OR: [
      {
        responsibleUserId: access.userId,
      },
      {
        remediationPlan: {
          ownerUserId: access.userId,
        },
      },
      {
        remediationPlan: {
          area: {
            active: true,
            deletedAt: null,
            managerUserId: access.userId,
          },
        },
      },
      {
        remediationPlan: {
          observation: buildObservationVisibilityCondition(access) ?? {},
        },
      },
    ],
  };
};

const getAreaContextForPlan = (
  observation: ObservationContextRow,
  areaId: string,
  access: AuthorizationSummary,
): AreaContext => {
  const areaContext = buildAssignedAreas(observation, access).find(
    (item) => item.area.id === areaId,
  );

  if (!areaContext) {
    throw new AppError("The selected remediation area is not assigned to this observation.", 400);
  }

  return areaContext;
};

const resolveSelectedAreaId = (
  areas: AreaContext[],
  plansByAreaId: Map<string, PlanSummaryRow>,
  requestedAreaId: string | undefined,
): string => {
  if (requestedAreaId) {
    const existingArea = areas.find((area) => area.area.id === requestedAreaId);

    if (!existingArea) {
      throw new AppError("The selected area is not available for this observation.", 400);
    }

    return requestedAreaId;
  }

  return (
    areas.find((area) => area.canManagePlan)?.area.id ??
    areas.find((area) => plansByAreaId.has(area.area.id))?.area.id ??
    areas[0]?.area.id ??
    ""
  );
};

const findObservationForWorkspace = async (
  observationId: string,
  access: AuthorizationSummary,
): Promise<ObservationContextRow> => {
  const visibilityCondition = buildObservationVisibilityCondition(access);

  const observation = await prisma.observation.findFirst({
    select: observationContextSelect,
    where: {
      AND: [
        {
          deletedAt: null,
          id: observationId,
        },
        visibilityCondition ?? {},
      ],
    },
  });

  if (!observation) {
    throw new AppError("Observation not found.", 404);
  }

  return observation;
};

const findPlanContextById = async (
  planId: string,
  access: AuthorizationSummary,
): Promise<PlanContext> => {
  const visibilityCondition = buildPlanVisibilityCondition(access);

  const plan = await remediationPrisma.remediationPlan.findFirst({
    select: planDetailSelect,
    where: {
      AND: [
        {
          deletedAt: null,
          id: planId,
        },
        visibilityCondition ?? {},
      ],
    },
  });

  if (!plan) {
    throw new AppError("Remediation plan not found.", 404);
  }

  return {
    areaContext: getAreaContextForPlan(plan.observation, plan.areaId, access),
    canReview: canReviewObservation(plan.observation, access),
    plan,
  };
};

const findCommitmentContextById = async (
  commitmentId: string,
  access: AuthorizationSummary,
): Promise<CommitmentContext> => {
  const visibilityCondition = buildCommitmentVisibilityCondition(access);

  const commitment = await remediationPrisma.commitment.findFirst({
    select: commitmentDetailSelect,
    where: {
      AND: [
        {
          deletedAt: null,
          id: commitmentId,
        },
        visibilityCondition ?? {},
      ],
    },
  });

  if (!commitment) {
    throw new AppError("Commitment not found.", 404);
  }

  return {
    areaContext: getAreaContextForPlan(
      commitment.remediationPlan.observation,
      commitment.remediationPlan.areaId,
      access,
    ),
    canReview: canReviewObservation(commitment.remediationPlan.observation, access),
    commitment,
    isResponsibleExecutor: commitment.responsibleUserId === access.userId,
  };
};

const assertActiveUserExists = async (userId: string | null): Promise<void> => {
  if (!userId) {
    return;
  }

  const count = await prisma.user.count({
    where: {
      deletedAt: null,
      id: userId,
      isActive: true,
    },
  });

  if (count !== 1) {
    throw new AppError("The selected user is not available.", 400);
  }
};

const recalculateObservationProgress = async (
  observationId: string,
  db: {
    commitment: any;
    observation: any;
  } = remediationPrisma,
): Promise<void> => {
  const commitments: Array<{
    progressPercent: number;
  }> = await db.commitment.findMany({
    select: {
      progressPercent: true,
    },
    where: {
      deletedAt: null,
      observationId,
      remediationPlan: {
        deletedAt: null,
      },
    },
  });

  const progressPercent =
    commitments.length === 0
      ? 0
      : Math.round(
          commitments.reduce((total, commitment) => total + commitment.progressPercent, 0) /
            commitments.length,
        );

  await db.observation.update({
    data: {
      progressPercent,
    },
    where: {
      id: observationId,
    },
  });
};

const assertPlanEditable = (
  status: RemediationPlanStatusValue,
  access: AuthorizationSummary,
): void => {
  if (isSystemWideAccess(access)) {
    return;
  }

  if (!isPlanEditableStatus(status)) {
    throw new AppError(
      "The remediation plan can only be edited while it is in draft or returned.",
      409,
    );
  }
};

const assertAllowedCommitmentStatus = (
  status: CommitmentStatusValue | undefined,
  mode: "editor" | "reviewer",
): void => {
  if (!status) {
    return;
  }

  if (status === "OVERDUE") {
    throw new AppError("Overdue status is derived automatically from the due date.", 400);
  }

  const allowedStatuses =
    mode === "reviewer"
      ? new Set<CommitmentStatusValue>(["APPROVED", "RETURNED", "SENT_TO_AUDIT"])
      : new Set<CommitmentStatusValue>([
          "PENDING",
          "IN_PROGRESS",
          "SENT_TO_AUDIT",
          "COMPLETED",
        ]);

  if (!allowedStatuses.has(status)) {
    throw new AppError("The selected commitment status is not allowed for this action.", 400);
  }
};

const buildCommitmentUpdateMode = (
  context: CommitmentContext,
  access: AuthorizationSummary,
): {
  canEditStructure: boolean;
  canReview: boolean;
  canUpdateProgress: boolean;
} => {
  const canEditStructure = isSystemWideAccess(access)
    ? true
    : context.areaContext.canManagePlan &&
      isPlanEditableStatus(context.commitment.remediationPlan.status);
  const canUpdateProgress =
    canEditStructure ||
    context.isResponsibleExecutor &&
      (isPlanProgressUpdateStatus(context.commitment.remediationPlan.status) ||
        isPlanEditableStatus(context.commitment.remediationPlan.status));

  return {
    canEditStructure,
    canReview: context.canReview,
    canUpdateProgress,
  };
};

const assertOnlyAllowedFields = (
  input: Record<string, unknown>,
  allowedKeys: string[],
): void => {
  const allowedSet = new Set(allowedKeys);

  const invalidField = Object.keys(input).find((key) => !allowedSet.has(key));

  if (invalidField) {
    throw new AppError(`Field "${invalidField}" cannot be updated in this context.`, 403);
  }
};

const resolveCommitmentStatus = (
  currentStatus: CommitmentStatusValue,
  progressPercent: number,
  nextStatus?: CommitmentStatusValue,
): {
  completedAt: Date | null;
  status: CommitmentStatusValue;
} => {
  if (progressPercent >= 100 || nextStatus === "COMPLETED") {
    return {
      completedAt: new Date(),
      status: "COMPLETED",
    };
  }

  if (nextStatus) {
    return {
      completedAt: null,
      status: nextStatus,
    };
  }

  if (progressPercent > 0 && (currentStatus === "PENDING" || currentStatus === "RETURNED")) {
    return {
      completedAt: null,
      status: "IN_PROGRESS",
    };
  }

  if (currentStatus === "COMPLETED" && progressPercent < 100) {
    return {
      completedAt: null,
      status: "IN_PROGRESS",
    };
  }

  return {
    completedAt: null,
    status: currentStatus,
  };
};

const notifyPlanSentToAudit = async (plan: PlanContext): Promise<void> => {
  if (plan.plan.observation.auditorUser.id === plan.plan.createdByUser.id) {
    return;
  }

  await notificationService.create({
    message: `La observacion ${plan.plan.observation.code} fue enviada a Auditoria para revision.`,
    title: "Plan enviado a Auditoria",
    type: "info",
    userId: plan.plan.observation.auditorUser.id,
  });
};

const buildPlanStakeholderIds = (plan: PlanContext): string[] => {
  return Array.from(
    new Set(
      [
        plan.plan.ownerUser?.id ?? null,
        plan.areaContext.area.managerUser?.id ?? null,
        plan.areaContext.responsibleUser?.id ?? null,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
};

const notifyPlanDecision = async (
  plan: PlanContext,
  decision: "approved" | "returned",
): Promise<void> => {
  const stakeholderIds = buildPlanStakeholderIds(plan);

  if (stakeholderIds.length === 0) {
    return;
  }

  await notificationService.createMany({
    message:
      decision === "approved"
        ? `Auditoria aprobo el plan de remediacion para ${plan.plan.observation.code}.`
        : `Auditoria devolvio el plan de remediacion para ${plan.plan.observation.code}. Revise las observaciones y ajuste la respuesta del area.`,
    title:
      decision === "approved"
        ? "Plan de remediacion aprobado"
        : "Plan de remediacion devuelto",
    type: decision === "approved" ? "success" : "warning",
    userIds: stakeholderIds,
  });
};

const notifyCommitmentAssignment = async (
  commitment: {
    title: string;
  },
  observationCode: string,
  responsibleUserId: string | null,
): Promise<void> => {
  if (!responsibleUserId) {
    return;
  }

  await notificationService.create({
    message: `Se le asigno el compromiso "${commitment.title}" de la observacion ${observationCode}.`,
    title: "Nuevo compromiso asignado",
    type: "info",
    userId: responsibleUserId,
  });
};

const buildPlanOrderBy = (
  sortBy: ListRemediationPlansQuery["sortBy"],
  sortDirection: ListRemediationPlansQuery["sortDirection"],
): any => {
  switch (sortBy) {
    case "areaName":
      return {
        area: {
          name: sortDirection,
        },
      };
    case "observationCode":
      return {
        observation: {
          code: sortDirection,
        },
      };
    case "status":
      return {
        status: sortDirection,
      };
    case "updatedAt":
      return {
        updatedAt: sortDirection,
      };
  }
};

const buildCommitmentOrderBy = (
  sortBy: ListCommitmentsQuery["sortBy"],
  sortDirection: ListCommitmentsQuery["sortDirection"],
): any => {
  switch (sortBy) {
    case "dueDate":
      return {
        dueDate: sortDirection,
      };
    case "progressPercent":
      return {
        progressPercent: sortDirection,
      };
    case "title":
      return {
        title: sortDirection,
      };
    case "updatedAt":
      return {
        updatedAt: sortDirection,
      };
  }
};

const buildPlanWhereClause = (
  query: ListRemediationPlansQuery,
  access: AuthorizationSummary,
): any => {
  const conditions: any[] = [
    {
      deletedAt: null,
    },
  ];

  const visibilityCondition = buildPlanVisibilityCondition(access);

  if (visibilityCondition) {
    conditions.push(visibilityCondition);
  }

  if (query.search.length > 0) {
    conditions.push({
      OR: [
        {
          area: {
            name: {
              contains: query.search,
            },
          },
        },
        {
          observation: {
            code: {
              contains: query.search,
            },
          },
        },
        {
          observation: {
            title: {
              contains: query.search,
            },
          },
        },
        {
          ownerUser: {
            name: {
              contains: query.search,
            },
          },
        },
      ],
    });
  }

  if (query.status) {
    conditions.push({
      status: query.status,
    });
  }

  if (query.areaId) {
    conditions.push({
      areaId: query.areaId,
    });
  }

  if (query.responsibleUserId) {
    conditions.push({
      ownerUserId: query.responsibleUserId,
    });
  }

  if (query.riskLevelId) {
    conditions.push({
      observation: {
        riskLevelId: query.riskLevelId,
      },
    });
  }

  if (query.overdue) {
    conditions.push({
      commitments: {
        some: {
          completedAt: null,
          deletedAt: null,
          dueDate: {
            lt: new Date(),
          },
        },
      },
    });
  }

  return {
    AND: conditions,
  };
};

const buildCommitmentWhereClause = (
  query: ListCommitmentsQuery,
  access: AuthorizationSummary,
): any => {
  const conditions: any[] = [
    {
      deletedAt: null,
    },
  ];

  const visibilityCondition = buildCommitmentVisibilityCondition(access);

  if (visibilityCondition) {
    conditions.push(visibilityCondition);
  }

  if (query.search.length > 0) {
    conditions.push({
      OR: [
        {
          title: {
            contains: query.search,
          },
        },
        {
          remediationPlan: {
            observation: {
              code: {
                contains: query.search,
              },
            },
          },
        },
        {
          remediationPlan: {
            observation: {
              title: {
                contains: query.search,
              },
            },
          },
        },
      ],
    });
  }

  if (query.areaId) {
    conditions.push({
      remediationPlan: {
        areaId: query.areaId,
      },
    });
  }

  if (query.responsibleUserId) {
    conditions.push({
      responsibleUserId: query.responsibleUserId,
    });
  }

  const dueDateFilter = buildDateRangeFilter(query.dueDateFrom, query.dueDateTo);

  if (dueDateFilter) {
    conditions.push({
      dueDate: dueDateFilter,
    });
  }

  if (query.status && query.status !== "OVERDUE") {
    conditions.push({
      status: query.status,
    });
  }

  if (query.status === "OVERDUE" || query.overdue) {
    conditions.push({
      completedAt: null,
      dueDate: {
        lt: new Date(),
      },
    });
  }

  return {
    AND: conditions,
  };
};

export const remediationService = {
  async getObservationRemediationWorkspace(
    observationId: string,
    query: ObservationRemediationQuery,
    access: AuthorizationSummary,
  ): Promise<ObservationRemediationWorkspace> {
    const observation = await findObservationForWorkspace(observationId, access);
    const areaContexts = buildAssignedAreas(observation, access);

    const planRows: PlanSummaryRow[] = await remediationPrisma.remediationPlan.findMany({
      orderBy: {
        createdAt: "asc",
      },
      select: planSummarySelect,
      where: {
        deletedAt: null,
        observationId,
      },
    });

    const plansByAreaId = new Map<string, PlanSummaryRow>(
      planRows.map((plan: PlanSummaryRow) => [plan.areaId, plan]),
    );
    const selectedAreaId = resolveSelectedAreaId(areaContexts, plansByAreaId, query.areaId);
    const selectedPlanSummary = plansByAreaId.get(selectedAreaId) ?? null;
    const selectedAreaContext = areaContexts.find((area) => area.area.id === selectedAreaId);

    if (!selectedAreaContext) {
      throw new AppError("No remediation area is available for this observation.", 404);
    }

    const selectedPlan: PlanDetailRow | null =
      selectedPlanSummary !== null
        ? await remediationPrisma.remediationPlan.findFirst({
            select: planDetailSelect,
            where: {
              deletedAt: null,
              id: selectedPlanSummary.id,
            },
          })
        : null;

    return {
      areas: areaContexts.map((areaContext) => ({
        area: {
          id: areaContext.area.id,
          name: areaContext.area.name,
        },
        canManagePlan: areaContext.canManagePlan,
        isPrimary: areaContext.isPrimary,
        managerUser: mapUserSummary(areaContext.area.managerUser),
        plan: plansByAreaId.has(areaContext.area.id)
          ? buildPlanSummary(plansByAreaId.get(areaContext.area.id)!)
          : null,
        responsibleUser: mapUserSummary(areaContext.responsibleUser),
        roleInFinding: areaContext.roleInFinding,
      })),
      canManageSelectedArea: selectedAreaContext.canManagePlan,
      canReview: canReviewObservation(observation, access),
      observation: mapObservationSummary(observation),
      plan:
        selectedPlan !== null
          ? mapPlanDetail(selectedPlan, selectedAreaContext, access)
          : null,
      selectedAreaId,
    };
  },

  async createOrUpdateObservationPlan(
    observationId: string,
    input: RemediationPlanMutationInput,
    access: AuthorizationSummary,
  ): Promise<RemediationPlanDetail> {
    const observation = await findObservationForWorkspace(observationId, access);
    const areaContext = getAreaContextForPlan(observation, input.areaId, access);

    if (!areaContext.canManagePlan && !isSystemWideAccess(access)) {
      throw new AppError("You cannot create or edit a plan for this assigned area.", 403);
    }

    await assertActiveUserExists(input.ownerUserId);

    const existingPlan = await remediationPrisma.remediationPlan.findFirst({
      select: {
        id: true,
        status: true,
      },
      where: {
        areaId: input.areaId,
        deletedAt: null,
        observationId,
      },
    });

    if (existingPlan) {
      assertPlanEditable(existingPlan.status, access);
    }

    const planId = await prisma.$transaction(async (transaction) => {
      const ownerUserId =
        input.ownerUserId ??
        areaContext.responsibleUser?.id ??
        observation.responsibleUser?.id ??
        null;

      const plan = existingPlan
        ? await transaction.remediationPlan.update({
            data: {
              additionalComments: input.additionalComments,
              approvedAt: null,
              approvedByUserId: null,
              mitigationText: input.mitigationText,
              ownerUserId,
              returnReason: null,
              returnedAt: null,
              returnedByUserId: null,
              sentToAuditAt: null,
              status: "DRAFT",
              strategyText: input.strategyText,
            },
            where: {
              id: existingPlan.id,
            },
          })
        : await transaction.remediationPlan.create({
            data: {
              additionalComments: input.additionalComments,
              areaId: input.areaId,
              createdByUserId: access.userId,
              mitigationText: input.mitigationText,
              observationId,
              ownerUserId,
              status: "DRAFT",
              strategyText: input.strategyText,
            },
          });

      await recalculateObservationProgress(observationId, transaction);

      return plan.id;
    });

    const planContext = await findPlanContextById(planId, access);
    return mapPlanDetail(planContext.plan, planContext.areaContext, access);
  },

  async updatePlan(
    planId: string,
    input: RemediationPlanUpdateInput,
    access: AuthorizationSummary,
  ): Promise<RemediationPlanDetail> {
    const planContext = await findPlanContextById(planId, access);

    if (!planContext.areaContext.canManagePlan && !isSystemWideAccess(access)) {
      throw new AppError("You cannot edit this remediation plan.", 403);
    }

    assertPlanEditable(planContext.plan.status, access);

    await assertActiveUserExists(input.ownerUserId ?? null);

    await remediationPrisma.remediationPlan.update({
      data: {
        ...(input.additionalComments !== undefined
          ? {
              additionalComments: input.additionalComments,
            }
          : {}),
        ...(input.mitigationText !== undefined
          ? {
              mitigationText: input.mitigationText,
            }
          : {}),
        ...(input.ownerUserId !== undefined
          ? {
              ownerUserId: input.ownerUserId,
            }
          : {}),
        ...(input.strategyText !== undefined
          ? {
              strategyText: input.strategyText,
            }
          : {}),
        approvedAt: null,
        approvedByUserId: null,
        returnReason: null,
        returnedAt: null,
        returnedByUserId: null,
        sentToAuditAt: null,
        status: "DRAFT",
      },
      where: {
        id: planId,
      },
    });

    const updatedPlanContext = await findPlanContextById(planId, access);
    return mapPlanDetail(
      updatedPlanContext.plan,
      updatedPlanContext.areaContext,
      access,
    );
  },

  async sendPlanToAudit(
    planId: string,
    access: AuthorizationSummary,
  ): Promise<RemediationPlanDetail> {
    const planContext = await findPlanContextById(planId, access);

    if (!planContext.areaContext.canManagePlan && !isSystemWideAccess(access)) {
      throw new AppError("You cannot send this plan to audit.", 403);
    }

    assertPlanEditable(planContext.plan.status, access);

    await remediationPrisma.remediationPlan.update({
      data: {
        sentToAuditAt: new Date(),
        status: "SENT_TO_AUDIT",
      },
      where: {
        id: planId,
      },
    });

    const updatedPlanContext = await findPlanContextById(planId, access);
    await notifyPlanSentToAudit(updatedPlanContext);

    return mapPlanDetail(
      updatedPlanContext.plan,
      updatedPlanContext.areaContext,
      access,
    );
  },

  async returnPlan(
    planId: string,
    input: RemediationPlanReturnInput,
    access: AuthorizationSummary,
  ): Promise<RemediationPlanDetail> {
    const planContext = await findPlanContextById(planId, access);

    if (!planContext.canReview && !isSystemWideAccess(access)) {
      throw new AppError("You cannot return this remediation plan.", 403);
    }

    if (planContext.plan.status !== "SENT_TO_AUDIT") {
      throw new AppError("Only plans sent to audit can be returned.", 409);
    }

    await remediationPrisma.remediationPlan.update({
      data: {
        approvedAt: null,
        approvedByUserId: null,
        returnReason: input.reason,
        returnedAt: new Date(),
        returnedByUserId: access.userId,
        status: "RETURNED",
      },
      where: {
        id: planId,
      },
    });

    const updatedPlanContext = await findPlanContextById(planId, access);
    await notifyPlanDecision(updatedPlanContext, "returned");

    return mapPlanDetail(
      updatedPlanContext.plan,
      updatedPlanContext.areaContext,
      access,
    );
  },

  async approvePlan(
    planId: string,
    access: AuthorizationSummary,
  ): Promise<RemediationPlanDetail> {
    const planContext = await findPlanContextById(planId, access);

    if (!planContext.canReview && !isSystemWideAccess(access)) {
      throw new AppError("You cannot approve this remediation plan.", 403);
    }

    if (planContext.plan.status !== "SENT_TO_AUDIT") {
      throw new AppError("Only plans sent to audit can be approved.", 409);
    }

    await remediationPrisma.remediationPlan.update({
      data: {
        approvedAt: new Date(),
        approvedByUserId: access.userId,
        returnReason: null,
        returnedAt: null,
        returnedByUserId: null,
        status: "APPROVED",
      },
      where: {
        id: planId,
      },
    });

    const updatedPlanContext = await findPlanContextById(planId, access);
    await notifyPlanDecision(updatedPlanContext, "approved");

    return mapPlanDetail(
      updatedPlanContext.plan,
      updatedPlanContext.areaContext,
      access,
    );
  },

  async listPlanCommitments(
    planId: string,
    access: AuthorizationSummary,
  ): Promise<CommitmentDetail[]> {
    const planContext = await findPlanContextById(planId, access);

    const commitments: CommitmentDetailRow[] = await remediationPrisma.commitment.findMany({
      orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
      select: commitmentDetailSelect,
      where: {
        deletedAt: null,
        remediationPlanId: planId,
      },
    });

    return commitments.map((commitment: CommitmentDetailRow) =>
      mapCommitmentDetail(
        commitment,
        {
          areaContext: planContext.areaContext,
          canReview: planContext.canReview,
          commitment: {
            ...commitment,
            remediationPlan: {
              ...commitment.remediationPlan,
              observation: planContext.plan.observation,
            },
          },
          isResponsibleExecutor: commitment.responsibleUserId === access.userId,
        },
        access,
      ),
    );
  },

  async createCommitment(
    planId: string,
    input: CreateCommitmentInput,
    access: AuthorizationSummary,
  ): Promise<CommitmentDetail> {
    const planContext = await findPlanContextById(planId, access);

    if (!planContext.areaContext.canManagePlan && !isSystemWideAccess(access)) {
      throw new AppError("You cannot create commitments for this plan.", 403);
    }

    assertPlanEditable(planContext.plan.status, access);
    assertAllowedCommitmentStatus(input.status, "editor");
    await assertActiveUserExists(input.responsibleUserId);

    const createdCommitment = await prisma.$transaction(async (transaction) => {
      const maxSortOrder = await transaction.commitment.aggregate({
        _max: {
          sortOrder: true,
        },
        where: {
          deletedAt: null,
          remediationPlanId: planId,
        },
      });

      const commitmentState = resolveCommitmentStatus(
        "PENDING",
        input.progressPercent,
        input.status,
      );

      const commitment = await transaction.commitment.create({
        data: {
          completedAt: commitmentState.completedAt,
          description: input.description,
          dueDate: input.dueDate,
          observationId: planContext.plan.observationId,
          progressPercent: input.progressPercent,
          remediationPlanId: planId,
          responsibleUserId: input.responsibleUserId,
          sortOrder: input.sortOrder ?? (maxSortOrder._max.sortOrder ?? -10) + 10,
          status: commitmentState.status,
          title: input.title,
        },
        select: commitmentDetailSelect,
      });

      await recalculateObservationProgress(planContext.plan.observationId, transaction);
      return commitment;
    });

    await notifyCommitmentAssignment(
      createdCommitment,
      planContext.plan.observation.code,
      createdCommitment.responsibleUserId,
    );

    return mapCommitmentDetail(
      createdCommitment,
      {
        areaContext: planContext.areaContext,
        canReview: planContext.canReview,
        commitment: createdCommitment,
        isResponsibleExecutor: createdCommitment.responsibleUserId === access.userId,
      },
      access,
    );
  },

  async updateCommitment(
    commitmentId: string,
    input: UpdateCommitmentInput,
    access: AuthorizationSummary,
  ): Promise<CommitmentDetail> {
    const commitmentContext = await findCommitmentContextById(commitmentId, access);
    const mode = buildCommitmentUpdateMode(commitmentContext, access);

    if (!mode.canEditStructure && !mode.canReview && !mode.canUpdateProgress) {
      throw new AppError("You cannot update this commitment.", 403);
    }

    if (mode.canEditStructure) {
      assertAllowedCommitmentStatus(input.status, "editor");
    } else if (mode.canReview) {
      assertOnlyAllowedFields(input, ["status"]);
      assertAllowedCommitmentStatus(input.status, "reviewer");
    } else {
      assertOnlyAllowedFields(input, ["progressPercent"]);
    }

    await assertActiveUserExists(input.responsibleUserId ?? null);

    const current = commitmentContext.commitment;
    const nextProgressPercent = input.progressPercent ?? current.progressPercent;
    const nextStatus = mode.canReview ? input.status : mode.canEditStructure ? input.status : undefined;
    const commitmentState = resolveCommitmentStatus(current.status, nextProgressPercent, nextStatus);
    const previousResponsibleUserId = current.responsibleUserId;

    const updatedCommitment = await prisma.$transaction(async (transaction) => {
      const commitment = await transaction.commitment.update({
        data: {
          ...(mode.canEditStructure && input.description !== undefined
            ? {
                description: input.description,
              }
            : {}),
          ...(mode.canEditStructure && input.dueDate !== undefined
            ? {
                dueDate: input.dueDate,
              }
            : {}),
          ...(mode.canEditStructure && input.responsibleUserId !== undefined
            ? {
                responsibleUserId: input.responsibleUserId,
              }
            : {}),
          ...(mode.canEditStructure && input.sortOrder !== undefined
            ? {
                sortOrder: input.sortOrder,
              }
            : {}),
          ...(mode.canEditStructure && input.title !== undefined
            ? {
                title: input.title,
              }
            : {}),
          completedAt: commitmentState.completedAt,
          progressPercent: nextProgressPercent,
          status: commitmentState.status,
        },
        select: commitmentDetailSelect,
        where: {
          id: commitmentId,
        },
      });

      await recalculateObservationProgress(current.observationId, transaction);
      return commitment;
    });

    if (
      updatedCommitment.responsibleUserId &&
      updatedCommitment.responsibleUserId !== previousResponsibleUserId
    ) {
      await notifyCommitmentAssignment(
        updatedCommitment,
        commitmentContext.commitment.remediationPlan.observation.code,
        updatedCommitment.responsibleUserId,
      );
    }

    return mapCommitmentDetail(
      updatedCommitment,
      {
        areaContext: commitmentContext.areaContext,
        canReview: commitmentContext.canReview,
        commitment: updatedCommitment,
        isResponsibleExecutor: updatedCommitment.responsibleUserId === access.userId,
      },
      access,
    );
  },

  async deleteCommitment(
    commitmentId: string,
    access: AuthorizationSummary,
  ): Promise<CommitmentDetail> {
    const commitmentContext = await findCommitmentContextById(commitmentId, access);

    if (!commitmentContext.areaContext.canManagePlan && !isSystemWideAccess(access)) {
      throw new AppError("You cannot delete this commitment.", 403);
    }

    assertPlanEditable(commitmentContext.commitment.remediationPlan.status, access);

    await prisma.$transaction(async (transaction) => {
      await transaction.commitment.update({
        data: {
          deletedAt: new Date(),
        },
        where: {
          id: commitmentId,
        },
      });

      await recalculateObservationProgress(commitmentContext.commitment.observationId, transaction);
    });

    return mapCommitmentDetail(commitmentContext.commitment, commitmentContext, access);
  },

  async markCommitmentComplete(
    commitmentId: string,
    access: AuthorizationSummary,
  ): Promise<CommitmentDetail> {
    return this.updateCommitment(
      commitmentId,
      {
        progressPercent: 100,
      },
      access,
    );
  },

  async sendCommitmentToAudit(
    commitmentId: string,
    access: AuthorizationSummary,
  ): Promise<CommitmentDetail> {
    const commitmentContext = await findCommitmentContextById(commitmentId, access);
    const mode = buildCommitmentUpdateMode(commitmentContext, access);

    if (!mode.canEditStructure && !mode.canUpdateProgress && !isSystemWideAccess(access)) {
      throw new AppError("You cannot send this commitment to audit.", 403);
    }

    return this.updateCommitment(
      commitmentId,
      {
        status: "SENT_TO_AUDIT",
      },
      access,
    );
  },

  async listRemediationPlans(
    query: ListRemediationPlansQuery,
    access: AuthorizationSummary,
  ): Promise<{
    data: RemediationPlanListItem[];
    pagination: {
      page: number;
      perPage: number;
      total: number;
    };
  }> {
    const where = buildPlanWhereClause(query, access);
    const [total, plans] = await prisma.$transaction([
      remediationPrisma.remediationPlan.count({
        where,
      }),
      remediationPrisma.remediationPlan.findMany({
        orderBy: buildPlanOrderBy(query.sortBy, query.sortDirection),
        select: planListSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: plans.map((plan: PlanListRow) => {
        const summary = buildPlanSummary(plan);
        const canReview =
          isSystemWideAccess(access) ||
          hasAuditReviewRole(access) ||
          plan.observation.responsibleUser?.id === access.userId;

        return {
          area: {
            id: plan.area.id,
            name: plan.area.name,
          },
          canEdit:
            isSystemWideAccess(access) ||
            (isPlanEditableStatus(plan.status) &&
              buildPlanResponsibleUser(plan.observation, plan.areaId, plan.ownerUser)
                ?.id === access.userId),
          canReview,
          canSendToAudit:
            isSystemWideAccess(access) ||
            isPlanEditableStatus(plan.status),
          commitmentCount: summary.commitmentCount,
          id: plan.id,
          nextDueDate: summary.nextDueDate,
          observation: {
            code: plan.observation.code,
            id: plan.observation.id,
            title: plan.observation.title,
          },
          overdueCommitmentCount: summary.overdueCommitmentCount,
          progressPercent: summary.progressPercent,
          responsibleUser: buildPlanResponsibleUser(
            plan.observation,
            plan.areaId,
            plan.ownerUser,
          ),
          riskLevel: {
            colorToken: plan.observation.riskLevel.colorToken,
            id: plan.observation.riskLevel.id,
            key: plan.observation.riskLevel.key,
            name: plan.observation.riskLevel.name,
          },
          status: plan.status,
          updatedAt: plan.updatedAt.toISOString(),
        };
      }),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async listCommitments(
    query: ListCommitmentsQuery,
    access: AuthorizationSummary,
  ): Promise<{
    data: CommitmentListItem[];
    pagination: {
      page: number;
      perPage: number;
      total: number;
    };
  }> {
    const where = buildCommitmentWhereClause(query, access);
    const [total, commitments] = await prisma.$transaction([
      remediationPrisma.commitment.count({
        where,
      }),
      remediationPrisma.commitment.findMany({
        orderBy: buildCommitmentOrderBy(query.sortBy, query.sortDirection),
        select: commitmentListSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: commitments.map((commitment: CommitmentListRow) => ({
        area: {
          id: commitment.remediationPlan.area.id,
          name: commitment.remediationPlan.area.name,
        },
        canMarkComplete:
          commitment.responsibleUser?.id === access.userId &&
          !isCommitmentCompleted(commitment),
        canSendToAudit:
          commitment.responsibleUser?.id === access.userId &&
          !isCommitmentCompleted(commitment),
        completedAt: commitment.completedAt?.toISOString() ?? null,
        dueDate: commitment.dueDate.toISOString(),
        effectiveStatus: buildCommitmentEffectiveStatus(commitment),
        id: commitment.id,
        isOverdue: isCommitmentOverdue(commitment),
        observation: {
          code: commitment.remediationPlan.observation.code,
          id: commitment.remediationPlan.observation.id,
          title: commitment.remediationPlan.observation.title,
        },
        planStatus: commitment.remediationPlan.status,
        progressPercent: commitment.progressPercent,
        responsibleUser: mapUserSummary(commitment.responsibleUser),
        status: commitment.status,
        title: commitment.title,
        updatedAt: commitment.updatedAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },
};
