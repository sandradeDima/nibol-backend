import type { Request, Response } from "express";

import { activityLogService } from "../../services/activity-log-service.js";
import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { getRemediationActivityType } from "../../services/entity-activity-mapping.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { OBSERVATIONS_PERMISSIONS } from "../observations/observations.permissions.js";
import {
  REMEDIATION_ACTIVITY_ACTIONS,
  REMEDIATION_ENTITY_TYPES,
} from "./remediation.constants.js";
import { remediationService } from "./remediation.service.js";
import {
  commitmentIdParamSchema,
  createCommitmentSchema,
  listCommitmentsQuerySchema,
  listRemediationPlansQuerySchema,
  observationRemediationParamsSchema,
  observationRemediationQuerySchema,
  remediationPlanIdParamSchema,
  remediationPlanMutationSchema,
  remediationPlanReturnSchema,
  remediationPlanUpdateSchema,
  updateCommitmentSchema,
} from "./remediation.validators.js";

const getQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];

    if (typeof firstValue === "string") {
      return firstValue;
    }
  }

  return undefined;
};

const getRequiredAuthorizationSummary = (request: Request): AuthorizationSummary => {
  if (!request.authorizationSummary) {
    throw new AppError("Authorization required.", 401);
  }

  return request.authorizationSummary;
};

const getRequiredObservationId = (
  value: string | string[] | undefined,
): string => {
  const observationId = Array.isArray(value) ? value[0] : value;

  if (!observationId) {
    throw new AppError("Observation id is required.", 400);
  }

  return observationRemediationParamsSchema.parse({
    id: observationId,
  }).id;
};

const getRequiredPlanId = (
  value: string | string[] | undefined,
): string => {
  const planId = Array.isArray(value) ? value[0] : value;

  if (!planId) {
    throw new AppError("Remediation plan id is required.", 400);
  }

  return remediationPlanIdParamSchema.parse({
    id: planId,
  }).id;
};

const getRequiredCommitmentId = (
  value: string | string[] | undefined,
): string => {
  const commitmentId = Array.isArray(value) ? value[0] : value;

  if (!commitmentId) {
    throw new AppError("Commitment id is required.", 400);
  }

  return commitmentIdParamSchema.parse({
    id: commitmentId,
  }).id;
};

const logAction = async ({
  action,
  entityId,
  entityType,
  newValues,
  oldValues,
  request,
  summary,
}: {
  action: string;
  entityId: string;
  entityType: string;
  newValues: unknown;
  oldValues: unknown;
  request: Request;
  summary: string;
}) => {
  const actorContext = getRequestLogActorContext(request);

  await Promise.all([
    activityLogService.logUserAction({
      ...actorContext,
      action,
      entityId,
      entityType,
      metadata: {
        summary,
      },
    }),
    auditLogService.create({
      ...actorContext,
      entityId,
      entityType,
      newValues,
      oldValues,
    }),
    entityActivityService.recordEntityChange({
      action,
      activityType: getRemediationActivityType(entityType, action),
      actorUserId: actorContext.userId,
      description: summary,
      entityId,
      entityType: entityType === "remediation_plan" ? "REMEDIATION_PLAN" : "COMMITMENT",
      metadata: { summary },
      newData: newValues,
      previousData: oldValues,
      title: summary,
    }),
  ]);
};

export const remediationController = {
  async approvePlan(request: Request, response: Response) {
    const plan = await remediationService.approvePlan(
      getRequiredPlanId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.approvePlan,
      entityId: plan.id,
      entityType: REMEDIATION_ENTITY_TYPES.remediationPlan,
      newValues: plan,
      oldValues: {
        id: plan.id,
        status: "SENT_TO_AUDIT",
      },
      request,
      summary: `El plan de remediacion ${plan.id} fue aprobado por Auditoria.`,
    });

    sendSuccess(response, plan);
  },

  async createCommitment(request: Request, response: Response) {
    const commitment = await remediationService.createCommitment(
      getRequiredPlanId(request.params.id),
      createCommitmentSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.createCommitment,
      entityId: commitment.id,
      entityType: REMEDIATION_ENTITY_TYPES.commitment,
      newValues: commitment,
      oldValues: null,
      request,
      summary: `Se registro el compromiso "${commitment.title}".`,
    });

    sendSuccess(response, commitment, 201);
  },

  async deleteCommitment(request: Request, response: Response) {
    const commitment = await remediationService.deleteCommitment(
      getRequiredCommitmentId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.deleteCommitment,
      entityId: commitment.id,
      entityType: REMEDIATION_ENTITY_TYPES.commitment,
      newValues: null,
      oldValues: commitment,
      request,
      summary: `El compromiso "${commitment.title}" fue eliminado logicamente.`,
    });

    sendSuccess(response, {
      deleted: true,
      id: commitment.id,
    });
  },

  async getObservationWorkspace(request: Request, response: Response) {
    const workspace = await remediationService.getObservationRemediationWorkspace(
      getRequiredObservationId(request.params.id),
      observationRemediationQuerySchema.parse({
        areaId: getQueryValue(request.query.areaId),
      }),
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, workspace);
  },

  async listCommitments(request: Request, response: Response) {
    const result = await remediationService.listCommitments(
      listCommitmentsQuerySchema.parse({
        areaId: getQueryValue(request.query["filter.areaId"]),
        dueDateFrom: getQueryValue(request.query["filter.dueDateFrom"]),
        dueDateTo: getQueryValue(request.query["filter.dueDateTo"]),
        overdue: getQueryValue(request.query["filter.overdue"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        responsibleUserId: getQueryValue(request.query["filter.responsibleUserId"]),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
        status: getQueryValue(request.query["filter.status"]),
      }),
      getRequiredAuthorizationSummary(request),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async listPlanCommitments(request: Request, response: Response) {
    const commitments = await remediationService.listPlanCommitments(
      getRequiredPlanId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, commitments);
  },

  async listPlans(request: Request, response: Response) {
    const result = await remediationService.listRemediationPlans(
      listRemediationPlansQuerySchema.parse({
        areaId: getQueryValue(request.query["filter.areaId"]),
        overdue: getQueryValue(request.query["filter.overdue"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        responsibleUserId: getQueryValue(request.query["filter.responsibleUserId"]),
        riskLevelId: getQueryValue(request.query["filter.riskLevelId"]),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
        status: getQueryValue(request.query["filter.status"]),
      }),
      getRequiredAuthorizationSummary(request),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async markCommitmentComplete(request: Request, response: Response) {
    const commitment = await remediationService.markCommitmentComplete(
      getRequiredCommitmentId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.markCommitmentComplete,
      entityId: commitment.id,
      entityType: REMEDIATION_ENTITY_TYPES.commitment,
      newValues: commitment,
      oldValues: {
        id: commitment.id,
        status: commitment.status,
      },
      request,
      summary: `El compromiso "${commitment.title}" fue marcado como completado.`,
    });

    sendSuccess(response, commitment);
  },

  async returnPlan(request: Request, response: Response) {
    const plan = await remediationService.returnPlan(
      getRequiredPlanId(request.params.id),
      remediationPlanReturnSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.returnPlan,
      entityId: plan.id,
      entityType: REMEDIATION_ENTITY_TYPES.remediationPlan,
      newValues: plan,
      oldValues: {
        id: plan.id,
        status: "SENT_TO_AUDIT",
      },
      request,
      summary: `El plan de remediacion ${plan.id} fue devuelto al area responsable.`,
    });

    sendSuccess(response, plan);
  },

  async saveObservationPlan(request: Request, response: Response) {
    const plan = await remediationService.createOrUpdateObservationPlan(
      getRequiredObservationId(request.params.id),
      remediationPlanMutationSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.createPlan,
      entityId: plan.id,
      entityType: REMEDIATION_ENTITY_TYPES.remediationPlan,
      newValues: plan,
      oldValues: {
        id: plan.id,
      },
      request,
      summary: `Se guardo el plan de remediacion ${plan.id} en borrador.`,
    });

    sendSuccess(response, plan, 201);
  },

  async sendCommitmentToAudit(request: Request, response: Response) {
    const commitment = await remediationService.sendCommitmentToAudit(
      getRequiredCommitmentId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.sendCommitmentToAudit,
      entityId: commitment.id,
      entityType: REMEDIATION_ENTITY_TYPES.commitment,
      newValues: commitment,
      oldValues: {
        id: commitment.id,
      },
      request,
      summary: `El compromiso "${commitment.title}" fue enviado a Auditoria.`,
    });

    sendSuccess(response, commitment);
  },

  async sendPlanToAudit(request: Request, response: Response) {
    const plan = await remediationService.sendPlanToAudit(
      getRequiredPlanId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.sendPlanToAudit,
      entityId: plan.id,
      entityType: REMEDIATION_ENTITY_TYPES.remediationPlan,
      newValues: plan,
      oldValues: {
        id: plan.id,
        status: "DRAFT",
      },
      request,
      summary: `El plan de remediacion ${plan.id} fue enviado a Auditoria para revision.`,
    });

    sendSuccess(response, plan);
  },

  async updateCommitment(request: Request, response: Response) {
    const commitment = await remediationService.updateCommitment(
      getRequiredCommitmentId(request.params.id),
      updateCommitmentSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.updateCommitment,
      entityId: commitment.id,
      entityType: REMEDIATION_ENTITY_TYPES.commitment,
      newValues: commitment,
      oldValues: {
        id: commitment.id,
      },
      request,
      summary: `El compromiso "${commitment.title}" fue actualizado.`,
    });

    sendSuccess(response, commitment);
  },

  async updatePlan(request: Request, response: Response) {
    const plan = await remediationService.updatePlan(
      getRequiredPlanId(request.params.id),
      remediationPlanUpdateSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: REMEDIATION_ACTIVITY_ACTIONS.updatePlan,
      entityId: plan.id,
      entityType: REMEDIATION_ENTITY_TYPES.remediationPlan,
      newValues: plan,
      oldValues: {
        id: plan.id,
      },
      request,
      summary: `El plan de remediacion ${plan.id} fue actualizado.`,
    });

    sendSuccess(response, plan);
  },
};
