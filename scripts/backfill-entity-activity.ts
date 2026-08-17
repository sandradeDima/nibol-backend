import { entityActivityService } from "../src/services/entity-activity-service.js";
import { prisma } from "../src/utils/prisma.js";

const inferred = { inferred: true, source: "backfill" };

const backfill = async (): Promise<void> => {
  const observations = await prisma.observation.findMany({
    select: {
      code: true,
      id: true,
      status: { select: { name: true } },
      title: true,
    },
    where: { deletedAt: null },
  });
  for (const observation of observations) {
    await entityActivityService.create({
      action: "backfill.observation",
      activityType: "OBSERVATION_CREATED",
      actorType: "SYSTEM",
      dedupeKey: `backfill:OBSERVATION_CREATED:${observation.id}`,
      description: `Registro histórico inferido para ${observation.code}. Estado actual: ${observation.status.name}.`,
      entityId: observation.id,
      entityType: "OBSERVATION",
      metadata: {
        ...inferred,
        code: observation.code,
        currentStatus: observation.status.name,
      },
      observationId: observation.id,
      targetUrl: `/observaciones/${observation.id}`,
      title: "Observación existente incorporada al historial",
    });
  }

  const plans = await prisma.remediationPlan.findMany({
    select: { id: true, observationId: true, status: true },
    where: { deletedAt: null },
  });
  for (const plan of plans) {
    await entityActivityService.create({
      action: "backfill.plan",
      activityType: "PLAN_CREATED",
      actorType: "SYSTEM",
      dedupeKey: `backfill:PLAN_CREATED:${plan.id}`,
      description: `Registro histórico inferido del plan en estado ${plan.status}.`,
      entityId: plan.id,
      entityType: "REMEDIATION_PLAN",
      metadata: { ...inferred, currentStatus: plan.status },
      observationId: plan.observationId,
      title: "Plan existente incorporado al historial",
    });
  }

  const actionPlans = await prisma.actionPlan.findMany({
    select: { id: true, observationId: true, status: true, title: true },
    where: { deletedAt: null },
  });
  for (const actionPlan of actionPlans) {
    await entityActivityService.create({
      action: "backfill.actionPlan",
      activityType: "ACTION_PLAN_CREATED",
      actorType: "SYSTEM",
      dedupeKey: `backfill:ACTION_PLAN_CREATED:${actionPlan.id}`,
      description: `Registro histórico inferido del plan de acción “${actionPlan.title}” en estado ${actionPlan.status}.`,
      entityId: actionPlan.id,
      entityType: "ACTION_PLAN",
      metadata: { ...inferred, currentStatus: actionPlan.status },
      observationId: actionPlan.observationId,
      title: "Plan de acción existente incorporado al historial",
    });
  }

  const progressEvaluations = await prisma.progressEvaluation.findMany({
    select: {
      id: true,
      observationId: true,
      status: true,
      submittedByUserId: true,
    },
    where: { deletedAt: null },
  });
  for (const progress of progressEvaluations) {
    await entityActivityService.create({
      action: "backfill.progress",
      activityType:
        progress.status === "SENT_TO_AUDIT"
          ? "PROGRESS_SENT"
          : "PROGRESS_CREATED",
      actorType: "SYSTEM",
      actorUserId: progress.submittedByUserId,
      dedupeKey: `backfill:PROGRESS:${progress.id}`,
      description: `Registro histórico inferido del avance en estado ${progress.status}.`,
      entityId: progress.id,
      entityType: "PROGRESS_EVALUATION",
      metadata: { ...inferred, currentStatus: progress.status },
      observationId: progress.observationId,
      title: "Avance existente incorporado al historial",
    });
  }

  const extensions = await prisma.deadlineExtensionRequest.findMany({
    select: {
      id: true,
      observationId: true,
      requestedByUserId: true,
      status: true,
    },
    where: { deletedAt: null },
  });
  for (const extension of extensions) {
    await entityActivityService.create({
      action: "backfill.extension",
      activityType: "EXTENSION_CREATED",
      actorType: "SYSTEM",
      actorUserId: extension.requestedByUserId,
      dedupeKey: `backfill:EXTENSION_CREATED:${extension.id}`,
      description: `Registro histórico inferido de la ampliación en estado ${extension.status}.`,
      entityId: extension.id,
      entityType: "EXTENSION_REQUEST",
      metadata: { ...inferred, currentStatus: extension.status },
      observationId: extension.observationId,
      title: "Ampliación existente incorporada al historial",
    });
  }

  const evidences = await prisma.evidenceFile.findMany({
    select: {
      id: true,
      observationId: true,
      originalName: true,
      uploadedByUserId: true,
    },
  });
  for (const evidence of evidences) {
    await entityActivityService.create({
      action: "backfill.evidence",
      activityType: "EVIDENCE_UPLOADED",
      actorType: "SYSTEM",
      actorUserId: evidence.uploadedByUserId,
      dedupeKey: `backfill:EVIDENCE_UPLOADED:${evidence.id}`,
      description: `Registro histórico inferido del archivo ${evidence.originalName}.`,
      entityId: evidence.id,
      entityType: "EVIDENCE",
      metadata: { ...inferred, originalName: evidence.originalName },
      observationId: evidence.observationId,
      title: "Evidencia existente incorporada al historial",
    });
  }
};

backfill()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
