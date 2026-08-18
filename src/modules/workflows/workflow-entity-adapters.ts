import type { Prisma } from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";
import type { WorkflowRuntimeContext } from "./workflow-runtime-context.js";
import type { WorkflowNodeConfiguration } from "./workflows.validators.js";

export type WorkflowProcessType =
  | "DEADLINE_EXTENSION"
  | "EVIDENCE_REVIEW"
  | "OBSERVATION_CLOSURE"
  | "REMEDIATION_PLAN_APPROVAL"
  | "SPECIAL_REQUEST";

export type WorkflowTaskAction =
  | "APPROVE"
  | "COMPLETE"
  | "OBSERVE"
  | "REJECT"
  | "REQUEST_CORRECTION";

export interface WorkflowEntityAdapter {
  processType: WorkflowProcessType;
  getEntity(entityId: string, db?: Prisma.TransactionClient): Promise<unknown>;
  validateStart(input: {
    entityId: string;
    actorUserId: string;
    db?: Prisma.TransactionClient;
  }): Promise<void>;
  buildRuntimeContext(input: {
    entityId: string;
    actorUserId: string;
    db?: Prisma.TransactionClient;
  }): Promise<WorkflowRuntimeContext>;
  validateTaskAction?(input: {
    entityId: string;
    node: WorkflowNodeConfiguration;
    action: WorkflowTaskAction;
    actorUserId: string;
    comment?: string;
    db?: Prisma.TransactionClient;
  }): Promise<void>;
  applyDecision?(input: {
    entityId: string;
    instanceId: string;
    taskId: string;
    node: WorkflowNodeConfiguration;
    action: WorkflowTaskAction;
    actorUserId: string;
    comment?: string;
    db: Prisma.TransactionClient;
  }): Promise<void>;
  applyCompletion?(input: {
    entityId: string;
    instanceId: string;
    finalResult: string;
    actorUserId?: string;
    db: Prisma.TransactionClient;
  }): Promise<void>;
  getEntitySummary?(
    entityId: string,
    db?: Prisma.TransactionClient,
  ): Promise<Record<string, unknown>>;
  getEntityLink?(entityId: string, context?: WorkflowRuntimeContext): string;
}

const database = (db?: Prisma.TransactionClient): Prisma.TransactionClient => {
  // Adapters are called from runtime transactions. The fallback is injected by
  // the registry only for validation/context reads in standalone callers.
  if (!db)
    throw new AppError(
      "La operación de workflow requiere una transacción.",
      500,
    );
  return db;
};

const asRuntimeDate = (date: Date): string => date.toISOString();

const daysFromNow = (date: Date, now = new Date()): number =>
  Math.floor((date.getTime() - now.getTime()) / 86_400_000);

const createContext = (input: {
  areaId: string | null;
  dueDate: Date;
  evidenceCount: number;
  observationStatus: string;
  processType: WorkflowProcessType;
  requesterUserId: string;
  responsibleUserId: string | null;
  riskLevel: string;
  custom?: Record<string, unknown>;
  hasEvidence?: boolean;
  previousDecision?: string | null;
  requestType?: string;
  requestedExtensionDays?: number | null;
}): WorkflowRuntimeContext => ({
  areaId: input.areaId,
  currentNodeKey: null,
  daysOverdue: Math.max(0, -daysFromNow(input.dueDate)),
  dueDate: asRuntimeDate(input.dueDate),
  evidenceCount: input.evidenceCount,
  hasEvidence: input.hasEvidence ?? input.evidenceCount > 0,
  observationStatus: input.observationStatus,
  previousDecision: input.previousDecision ?? null,
  processType: input.processType,
  remediationPlanStatus: null,
  requestType: input.requestType ?? null,
  requestedExtensionDays: input.requestedExtensionDays ?? null,
  requesterUserId: input.requesterUserId,
  responsibleUserId: input.responsibleUserId,
  riskLevel: input.riskLevel,
  custom: input.custom ?? {},
});

const getObservationStatusId = async (
  db: Prisma.TransactionClient,
  key: string,
): Promise<string | null> =>
  (
    await db.observationStatus.findFirst({
      select: { id: true },
      where: { active: true, deletedAt: null, key },
    })
  )?.id ?? null;

const deadlineExtensionAdapter: WorkflowEntityAdapter = {
  processType: "DEADLINE_EXTENSION",

  async getEntity(entityId, db) {
    const request = await database(db).deadlineExtensionRequest.findFirst({
      include: {
        attachments: { include: { evidenceFile: { select: { id: true } } } },
        actionPlan: {
          select: {
            currentDueDate: true,
            id: true,
            responsibleUserId: true,
            observation: {
              select: {
                id: true,
                riskLevel: { select: { key: true } },
                status: { select: { key: true } },
              },
            },
          },
        },
        observation: {
          select: {
            id: true,
            riskLevel: { select: { key: true } },
            status: { select: { key: true } },
          },
        },
        observationArea: {
          select: {
            areaId: true,
            areaResponsibleUserId: true,
            processOwnerUserId: true,
          },
        },
      },
      where: { deletedAt: null, id: entityId },
    });
    if (!request)
      throw new AppError("No se encontró la solicitud de ampliación.", 404);
    return request;
  },

  async validateStart({ entityId, db }) {
    const request = (await this.getEntity(entityId, db)) as {
      actionPlan: { observation: { status: { key: string } } } | null;
      observation: { status: { key: string } } | null;
      proposedDueDate: Date;
      status: string;
    };
    if (
      !["DRAFT", "MANAGER_REJECTED", "AUDIT_REJECTED"].includes(request.status)
    ) {
      throw new AppError(
        "La solicitud de ampliación no está disponible para envío.",
        409,
      );
    }
    const observation = request.observation ?? request.actionPlan?.observation;
    if (!observation)
      throw new AppError(
        "La solicitud no tiene una observación asociada.",
        409,
      );
    if (observation.status.key === "CONCLUIDO") {
      throw new AppError(
        "No se puede iniciar un flujo para una observación terminal.",
        409,
      );
    }
    if (request.proposedDueDate.getTime() <= Date.now()) {
      throw new AppError("La fecha solicitada debe ser posterior a hoy.", 400);
    }
  },

  async buildRuntimeContext({ entityId, db, actorUserId }) {
    const request = (await this.getEntity(entityId, db)) as {
      attachments: Array<{ evidenceFile: { id: string } }>;
      actionPlan: {
        currentDueDate: Date;
        id: string;
        observation: {
          id: string;
          riskLevel: { key: string };
          status: { key: string };
        };
        responsibleUserId: string;
      } | null;
      observation: {
        id: string;
        riskLevel: { key: string };
        status: { key: string };
      } | null;
      observationArea: {
        areaId: string;
        areaResponsibleUserId: string;
        processOwnerUserId: string;
      } | null;
      previousDueDate: Date;
      proposedDueDate: Date;
      requestedByUserId: string;
    };
    const observation = request.observation ?? request.actionPlan?.observation;
    if (!observation)
      throw new AppError(
        "La solicitud no tiene una observación asociada.",
        409,
      );
    const responsibleUserId =
      request.actionPlan?.responsibleUserId ??
      request.observationArea?.areaResponsibleUserId ??
      null;
    return createContext({
      areaId: request.observationArea?.areaId ?? null,
      custom: {
        actionPlanId: request.actionPlan?.id ?? null,
        observationId: observation.id,
        recordOwnerUserId: responsibleUserId ?? actorUserId,
      },
      dueDate: request.previousDueDate,
      evidenceCount: request.attachments.length,
      observationStatus: observation.status.key,
      processType: "DEADLINE_EXTENSION",
      requesterUserId: request.requestedByUserId,
      requestedExtensionDays: Math.max(
        0,
        Math.round(
          (request.proposedDueDate.getTime() -
            request.previousDueDate.getTime()) /
            86_400_000,
        ),
      ),
      responsibleUserId,
      riskLevel: observation.riskLevel.key,
    });
  },

  async applyDecision({ action, actorUserId, comment, db, entityId }) {
    const request = await database(db).deadlineExtensionRequest.findFirst({
      select: { managerReviewerId: true, status: true },
      where: { deletedAt: null, id: entityId },
    });
    if (!request)
      throw new AppError("No se encontró la solicitud de ampliación.", 404);
    const isManagerReview = request.status === "SENT_TO_MANAGER";
    const now = new Date();
    if (action === "REQUEST_CORRECTION" || action === "OBSERVE") {
      if (!isManagerReview && request.status !== "SENT_TO_AUDIT") return;
      await db.deadlineExtensionRequest.update({
        data: isManagerReview
          ? {
              managerComment: comment?.trim() || null,
              managerReviewedAt: now,
              managerReviewerId: actorUserId,
              status: "DRAFT",
            }
          : {
              auditComment: comment?.trim() || null,
              auditReviewedAt: now,
              auditReviewerId: actorUserId,
              status: "DRAFT",
            },
        where: { id: entityId },
      });
      return;
    }
    if (!isManagerReview && request.status !== "SENT_TO_AUDIT") return;
    await db.deadlineExtensionRequest.update({
      data: isManagerReview
        ? {
            managerComment: comment?.trim() || null,
            managerReviewedAt: now,
            managerReviewerId: actorUserId,
            status: action === "REJECT" ? "MANAGER_REJECTED" : "SENT_TO_AUDIT",
          }
        : {
            auditComment: comment?.trim() || null,
            auditReviewedAt: now,
            auditReviewerId: actorUserId,
            status: action === "REJECT" ? "AUDIT_REJECTED" : "SENT_TO_AUDIT",
          },
      where: { id: entityId },
    });
  },

  async applyCompletion({ actorUserId, db, entityId, finalResult }) {
    const request = await db.deadlineExtensionRequest.findFirst({
      select: {
        auditReviewerId: true,
        actionPlanId: true,
        finalApprovedAt: true,
        observationId: true,
        previousDueDate: true,
        proposedDueDate: true,
        status: true,
      },
      where: { deletedAt: null, id: entityId },
    });
    if (!request)
      throw new AppError("No se encontró la solicitud de ampliación.", 404);

    if (["APPROVED", "CLOSED"].includes(finalResult)) {
      if (request.status === "AUDIT_APPROVED" && request.finalApprovedAt)
        return;
      const current = request.actionPlanId
        ? (
            await db.actionPlan.findUnique({
              select: { currentDueDate: true },
              where: { id: request.actionPlanId },
            })
          )?.currentDueDate
        : (
            await db.observation.findUnique({
              select: { currentDueDate: true },
              where: { id: request.observationId! },
            })
          )?.currentDueDate;
      if (!current || current.getTime() !== request.previousDueDate.getTime()) {
        throw new AppError(
          "La fecha límite cambió mientras el flujo estaba activo.",
          409,
        );
      }
      if (request.proposedDueDate.getTime() <= current.getTime()) {
        throw new AppError(
          "La fecha solicitada ya no es posterior a la fecha actual.",
          409,
        );
      }
      if (request.actionPlanId) {
        await db.actionPlan.update({
          data: { currentDueDate: request.proposedDueDate },
          where: { id: request.actionPlanId },
        });
      } else {
        await db.observation.update({
          data: { currentDueDate: request.proposedDueDate },
          where: { id: request.observationId! },
        });
      }
      await db.deadlineExtensionRequest.update({
        data: {
          auditReviewerId: request.auditReviewerId ?? actorUserId ?? null,
          auditReviewedAt: new Date(),
          finalApprovedAt: new Date(),
          status: "AUDIT_APPROVED",
        },
        where: { id: entityId },
      });
      return;
    }

    if (["REJECTED", "EXPIRED"].includes(finalResult)) {
      if (request.status === "AUDIT_REJECTED") return;
      await db.deadlineExtensionRequest.update({
        data: { finalApprovedAt: null, status: "AUDIT_REJECTED" },
        where: { id: entityId },
      });
    }
  },

  getEntityLink: (entityId) => `/ampliaciones-plazo/${entityId}`,
};

const observationClosureAdapter: WorkflowEntityAdapter = {
  processType: "OBSERVATION_CLOSURE",

  async getEntity(entityId, db) {
    const update = await database(db).progressEvaluation.findFirst({
      include: {
        evidenceFiles: { select: { id: true }, where: { deletedAt: null } },
        actionPlan: {
          select: {
            currentDueDate: true,
            id: true,
            responsibleUserId: true,
            observationArea: { select: { areaId: true } },
            observation: {
              select: {
                id: true,
                riskLevel: { select: { key: true } },
                status: { select: { isFinal: true, key: true } },
              },
            },
          },
        },
      },
      where: { deletedAt: null, id: entityId, type: "FINALIZATION" },
    });
    if (!update)
      throw new AppError("No se encontró la solicitud de cierre.", 404);
    return update;
  },

  async validateStart({ entityId, db }) {
    const update = (await this.getEntity(entityId, db)) as {
      evidenceFiles: Array<{ id: string }>;
      actionPlan: {
        id: string;
        observation: { id: string; status: { isFinal: boolean } };
      };
      actionPlanStatus: string;
      progressPercent: number | null;
      reviewStatus: string;
    };
    if (update.actionPlan.observation.status.isFinal)
      throw new AppError("La observación ya está cerrada.", 409);
    if (update.progressPercent !== 100)
      throw new AppError("El cierre requiere 100% de avance.", 400);
    if (update.actionPlanStatus !== "CONCLUDED")
      throw new AppError(
        "La evaluación final debe proponer el plan como concluido.",
        400,
      );
    if (update.evidenceFiles.length === 0)
      throw new AppError("El cierre requiere evidencia.", 400);
    if (!["DRAFT", "RETURNED"].includes(update.reviewStatus))
      throw new AppError("El cierre no está disponible para envío.", 409);
    const otherOpenPlans = await database(db).actionPlan.count({
      where: {
        deletedAt: null,
        id: { not: update.actionPlan.id },
        observationId: update.actionPlan.observation.id,
        status: { not: "CONCLUDED" },
      },
    });
    if (otherOpenPlans > 0)
      throw new AppError(
        "Todos los demás planes de acción deben estar concluidos antes del cierre.",
        409,
      );
  },

  async buildRuntimeContext({ entityId, db, actorUserId }) {
    const update = (await this.getEntity(entityId, db)) as {
      evidenceFiles: Array<{ id: string }>;
      actionPlan: {
        currentDueDate: Date;
        id: string;
        responsibleUserId: string;
        observationArea: { areaId: string };
        observation: {
          id: string;
          riskLevel: { key: string };
          status: { key: string };
        };
      };
      progressPercent: number | null;
      submittedByUserId: string;
    };
    return createContext({
      areaId: update.actionPlan.observationArea.areaId,
      custom: {
        actionPlanId: update.actionPlan.id,
        observationId: update.actionPlan.observation.id,
      },
      dueDate: update.actionPlan.currentDueDate,
      evidenceCount: update.evidenceFiles.length,
      observationStatus: update.actionPlan.observation.status.key,
      processType: "OBSERVATION_CLOSURE",
      requesterUserId: update.submittedByUserId || actorUserId,
      responsibleUserId: update.actionPlan.responsibleUserId,
      riskLevel: update.actionPlan.observation.riskLevel.key,
    });
  },

  async validateTaskAction({ action, db, entityId }) {
    if (!["APPROVE", "COMPLETE"].includes(action)) return;
    const update = (await this.getEntity(entityId, db)) as {
      evidenceFiles: Array<{ id: string }>;
    };
    if (update.evidenceFiles.length === 0)
      throw new AppError("El cierre requiere evidencia.", 400);
  },

  async applyDecision({ action, actorUserId, comment, db, entityId }) {
    const update = await db.progressEvaluation.findUnique({
      select: { reviewStatus: true },
      where: { id: entityId },
    });
    if (!update)
      throw new AppError("No se encontró la solicitud de cierre.", 404);
    if (action === "REQUEST_CORRECTION" || action === "OBSERVE") {
      await db.progressEvaluation.update({
        data: {
          reviewComment: comment?.trim() || null,
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          reviewStatus: "RETURNED",
        },
        where: { id: entityId },
      });
      await db.progressReviewHistory.create({
        data: {
          action: "RETURNED",
          comment: comment?.trim() || null,
          fromStatus: update.reviewStatus,
          progressEvaluationId: entityId,
          toStatus: "RETURNED",
          userId: actorUserId,
        },
      });
    } else if (action === "REJECT") {
      await db.progressEvaluation.update({
        data: {
          reviewComment: comment?.trim() || null,
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          reviewStatus: "REJECTED",
        },
        where: { id: entityId },
      });
      await db.progressReviewHistory.create({
        data: {
          action: "REJECTED",
          comment: comment?.trim() || null,
          fromStatus: update.reviewStatus,
          progressEvaluationId: entityId,
          toStatus: "REJECTED",
          userId: actorUserId,
        },
      });
    } else if (
      ["APPROVE", "COMPLETE"].includes(action) &&
      update.reviewStatus !== "APPROVED"
    ) {
      await db.progressEvaluation.update({
        data: {
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          reviewStatus: "APPROVED",
        },
        where: { id: entityId },
      });
      await db.progressReviewHistory.create({
        data: {
          action: "APPROVED",
          fromStatus: update.reviewStatus,
          progressEvaluationId: entityId,
          toStatus: "APPROVED",
          userId: actorUserId,
        },
      });
    }
  },

  async applyCompletion({ db, entityId, finalResult }) {
    const update = await db.progressEvaluation.findUnique({
      select: {
        actionPlan: { select: { id: true, observationId: true } },
        actionPlanStatus: true,
        progressPercent: true,
        reviewStatus: true,
      },
      where: { id: entityId },
    });
    if (!update)
      throw new AppError("No se encontró la solicitud de cierre.", 404);
    if (["APPROVED", "CLOSED"].includes(finalResult)) {
      await db.actionPlan.update({
        data: {
          completedAt: new Date(),
          progressPercent: update.progressPercent,
          status: update.actionPlanStatus,
        },
        where: { id: update.actionPlan.id },
      });
      const openPlans = await db.actionPlan.count({
        where: {
          deletedAt: null,
          observationId: update.actionPlan.observationId,
          status: { not: "CONCLUDED" },
        },
      });
      if (openPlans > 0)
        throw new AppError(
          "No se puede cerrar la observación mientras existan planes de acción abiertos.",
          409,
        );
      const closedStatusId = await getObservationStatusId(db, "CONCLUIDO");
      if (!closedStatusId)
        throw new AppError("El catálogo no contiene el estado CONCLUIDO.", 500);
      await db.observation.update({
        data: { statusId: closedStatusId, progressPercent: 100 },
        where: { id: update.actionPlan.observationId },
      });
      if (update.reviewStatus !== "APPROVED")
        await db.progressEvaluation.update({
          data: { reviewStatus: "APPROVED" },
          where: { id: entityId },
        });
    } else if (
      ["REJECTED", "EXPIRED"].includes(finalResult) &&
      update.reviewStatus !== "REJECTED"
    ) {
      await db.progressEvaluation.update({
        data: { reviewStatus: "REJECTED" },
        where: { id: entityId },
      });
    }
  },

  getEntityLink: (_entityId, context) =>
    context?.custom.observationId
      ? `/observaciones/${context.custom.observationId}`
      : "/observaciones",
};

const remediationPlanAdapter: WorkflowEntityAdapter = {
  processType: "REMEDIATION_PLAN_APPROVAL",

  async getEntity(entityId, db) {
    const plan = await database(db).remediationPlan.findFirst({
      include: {
        actionPlans: { select: { id: true }, where: { deletedAt: null } },
        observation: {
          select: {
            currentDueDate: true,
            riskLevel: { select: { key: true } },
            status: { select: { key: true } },
          },
        },
      },
      where: { deletedAt: null, id: entityId },
    });
    if (!plan)
      throw new AppError("No se encontró el plan de remediación.", 404);
    return plan;
  },

  async validateStart({ entityId, db }) {
    const plan = (await this.getEntity(entityId, db)) as { status: string };
    if (!["DRAFT", "RETURNED"].includes(plan.status))
      throw new AppError("El plan no está disponible para envío.", 409);
  },

  async buildRuntimeContext({ entityId, db, actorUserId }) {
    const plan = (await this.getEntity(entityId, db)) as {
      areaId: string;
      actionPlans: Array<{ id: string }>;
      observationId: string;
      observation: {
        currentDueDate: Date;
        riskLevel: { key: string };
        status: { key: string };
      };
      ownerUserId: string | null;
      status: string;
      createdByUserId: string;
    };
    return {
      ...createContext({
        areaId: plan.areaId,
        custom: {
          observationId: plan.observationId,
          recordOwnerUserId: plan.ownerUserId,
        },
        dueDate: plan.observation.currentDueDate,
        evidenceCount: plan.actionPlans.length,
        observationStatus: plan.observation.status.key,
        processType: "REMEDIATION_PLAN_APPROVAL",
        requesterUserId: plan.createdByUserId || actorUserId,
        responsibleUserId: plan.ownerUserId,
        riskLevel: plan.observation.riskLevel.key,
      }),
      remediationPlanStatus: plan.status,
    };
  },

  async applyDecision({ action, actorUserId, comment, db, entityId }) {
    const plan = await db.remediationPlan.findUnique({
      select: { status: true },
      where: { id: entityId },
    });
    if (!plan)
      throw new AppError("No se encontró el plan de remediación.", 404);
    if (action === "REQUEST_CORRECTION" || action === "OBSERVE") {
      await db.remediationPlan.update({
        data: {
          returnReason: comment?.trim() || null,
          returnedAt: new Date(),
          returnedByUserId: actorUserId,
          status: "RETURNED",
        },
        where: { id: entityId },
      });
    } else if (action === "REJECT") {
      await db.remediationPlan.update({
        data: {
          returnReason: comment?.trim() || null,
          returnedAt: new Date(),
          returnedByUserId: actorUserId,
          status: "RETURNED",
        },
        where: { id: entityId },
      });
    } else if (
      ["APPROVE", "COMPLETE"].includes(action) &&
      plan.status !== "APPROVED"
    ) {
      await db.remediationPlan.update({
        data: {
          approvedAt: new Date(),
          approvedByUserId: actorUserId,
          status: "APPROVED",
        },
        where: { id: entityId },
      });
    }
  },

  async applyCompletion({ actorUserId, db, entityId, finalResult }) {
    const plan = await db.remediationPlan.findUnique({
      select: { approvedAt: true, status: true },
      where: { id: entityId },
    });
    if (!plan)
      throw new AppError("No se encontró el plan de remediación.", 404);
    if (["APPROVED", "CLOSED"].includes(finalResult)) {
      if (plan.status === "APPROVED" && plan.approvedAt) return;
      await db.remediationPlan.update({
        data: {
          approvedAt: new Date(),
          ...(actorUserId ? { approvedByUserId: actorUserId } : {}),
          returnReason: null,
          returnedAt: null,
          returnedByUserId: null,
          status: "APPROVED",
        },
        where: { id: entityId },
      });
    } else if (
      ["REJECTED", "EXPIRED"].includes(finalResult) &&
      plan.status !== "RETURNED"
    ) {
      await db.remediationPlan.update({
        data: { status: "RETURNED" },
        where: { id: entityId },
      });
    }
  },

  getEntityLink: (_entityId, context) =>
    context?.custom.observationId
      ? `/observaciones/${context.custom.observationId}`
      : "/observaciones",
};

const evidenceReviewAdapter: WorkflowEntityAdapter = {
  processType: "EVIDENCE_REVIEW",

  async getEntity(entityId, db) {
    const evidence = await database(db).evidenceFile.findFirst({
      include: {
        actionPlan: {
          select: {
            currentDueDate: true,
            responsibleUserId: true,
            observationArea: { select: { areaId: true } },
          },
        },
        observation: {
          select: {
            auditorUserId: true,
            currentDueDate: true,
            id: true,
            riskLevel: { select: { key: true } },
            status: { select: { key: true } },
          },
        },
      },
      where: { deletedAt: null, id: entityId },
    });
    if (!evidence) throw new AppError("No se encontró la evidencia.", 404);
    return evidence;
  },

  async validateStart({ entityId, db }) {
    const evidence = (await this.getEntity(entityId, db)) as {
      reviewStatus: string;
    };
    if (!["DRAFT", "RETURNED"].includes(evidence.reviewStatus)) {
      throw new AppError("La evidencia no está disponible para revisión.", 409);
    }
  },

  async buildRuntimeContext({ entityId, db, actorUserId }) {
    const evidence = (await this.getEntity(entityId, db)) as {
      actionPlan: {
        currentDueDate: Date;
        responsibleUserId: string;
        observationArea: { areaId: string };
      } | null;
      context: string;
      observation: {
        auditorUserId: string;
        currentDueDate: Date;
        id: string;
        riskLevel: { key: string };
        status: { key: string };
      };
      originalName: string;
      uploadedByUserId: string;
    };
    const responsibleUserId =
      evidence.actionPlan?.responsibleUserId ??
      evidence.observation.auditorUserId;
    return createContext({
      areaId: evidence.actionPlan?.observationArea.areaId ?? null,
      custom: {
        evidenceId: entityId,
        evidenceContext: evidence.context,
        evidenceName: evidence.originalName,
        observationId: evidence.observation.id,
        recordOwnerUserId: responsibleUserId,
      },
      dueDate:
        evidence.actionPlan?.currentDueDate ??
        evidence.observation.currentDueDate,
      evidenceCount: 1,
      observationStatus: evidence.observation.status.key,
      processType: "EVIDENCE_REVIEW",
      requesterUserId: evidence.uploadedByUserId || actorUserId,
      requestType: evidence.context,
      responsibleUserId,
      riskLevel: evidence.observation.riskLevel.key,
    });
  },

  async applyDecision({ action, actorUserId, comment, db, entityId }) {
    if (!["OBSERVE", "REQUEST_CORRECTION", "REJECT"].includes(action)) return;
    await db.evidenceFile.update({
      data: {
        reviewComment: comment?.trim() || null,
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
        reviewStatus: action === "REJECT" ? "REJECTED" : "RETURNED",
      },
      where: { id: entityId },
    });
  },

  async applyCompletion({ actorUserId, db, entityId, finalResult }) {
    if (["APPROVED", "CLOSED"].includes(finalResult)) {
      await db.evidenceFile.update({
        data: {
          reviewComment: null,
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId ?? null,
          reviewStatus: "APPROVED",
        },
        where: { id: entityId },
      });
    } else if (["REJECTED", "EXPIRED"].includes(finalResult)) {
      await db.evidenceFile.update({
        data: {
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId ?? null,
          reviewStatus: "REJECTED",
        },
        where: { id: entityId },
      });
    }
  },

  getEntityLink: (_entityId, context) =>
    context?.custom.observationId
      ? `/observaciones/${context.custom.observationId}#colaboracion`
      : "/observaciones",
};

const adapters = new Map<WorkflowProcessType, WorkflowEntityAdapter>([
  [deadlineExtensionAdapter.processType, deadlineExtensionAdapter],
  [evidenceReviewAdapter.processType, evidenceReviewAdapter],
  [observationClosureAdapter.processType, observationClosureAdapter],
  [remediationPlanAdapter.processType, remediationPlanAdapter],
]);

export const workflowEntityAdapterRegistry = {
  get(processType: string): WorkflowEntityAdapter | null {
    return adapters.get(processType as WorkflowProcessType) ?? null;
  },
};

export const getWorkflowEntityAdapter = (
  processType: string,
): WorkflowEntityAdapter | null =>
  workflowEntityAdapterRegistry.get(processType);
