import type { Prisma } from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";

export type WorkflowPublicationRecord = {
  definition: {
    activeVersionId: string | null;
    id: string;
    name: string;
    processType: string;
    status: string;
  };
  previousVersion: {
    id: string;
    status: string;
    versionNumber: number;
  } | null;
  version: {
    id: string;
    publishedAt: Date;
    publishedById: string;
    status: string;
    versionNumber: number;
  };
};

export const assertWorkflowPublicationPreconditions = ({
  definitionStatus,
  versionStatus,
}: {
  definitionStatus: string;
  versionStatus: string;
}): void => {
  if (definitionStatus === "ARCHIVED") {
    throw new AppError("No se puede publicar un workflow archivado.", 409);
  }
  if (versionStatus !== "DRAFT") {
    throw new AppError(
      "Solo las versiones en borrador pueden publicarse.",
      409,
    );
  }
};

export const publishWorkflowVersionState = async (
  db: Prisma.TransactionClient,
  {
    definitionId,
    publishedAt,
    publishedById,
    versionId,
  }: {
    definitionId: string;
    publishedAt: Date;
    publishedById: string;
    versionId: string;
  },
): Promise<WorkflowPublicationRecord> => {
  const definition = await db.workflowDefinition.findUnique({
    select: {
      activeVersionId: true,
      id: true,
      name: true,
      processType: true,
      status: true,
    },
    where: { id: definitionId },
  });
  if (!definition) {
    throw new AppError("La definición del workflow no existe.", 404);
  }

  const version = await db.workflowVersion.findUnique({
    select: {
      id: true,
      status: true,
      versionNumber: true,
    },
    where: { id: versionId },
  });
  if (!version) {
    throw new AppError("La versión del workflow no existe.", 404);
  }

  assertWorkflowPublicationPreconditions({
    definitionStatus: definition.status,
    versionStatus: version.status,
  });

  const previousVersion = definition.activeVersionId
    ? await db.workflowVersion.findUnique({
        select: {
          id: true,
          status: true,
          versionNumber: true,
        },
        where: { id: definition.activeVersionId },
      })
    : null;

  if (previousVersion && previousVersion.id !== versionId) {
    await db.workflowVersion.update({
      data: { status: "INACTIVE" },
      where: { id: previousVersion.id },
    });
  }

  const publishedVersion = await db.workflowVersion.update({
    data: {
      publishedAt,
      publishedById,
      status: "PUBLISHED",
    },
    select: {
      id: true,
      publishedAt: true,
      publishedById: true,
      status: true,
      versionNumber: true,
    },
    where: { id: versionId },
  });

  const publishedDefinition = await db.workflowDefinition.update({
    data: {
      activeVersionId: versionId,
      status: "PUBLISHED",
    },
    select: {
      activeVersionId: true,
      id: true,
      name: true,
      processType: true,
      status: true,
    },
    where: { id: definitionId },
  });

  return {
    definition: publishedDefinition,
    previousVersion:
      previousVersion && previousVersion.id !== versionId
        ? previousVersion
        : null,
    version: {
      ...publishedVersion,
      publishedAt: publishedVersion.publishedAt ?? publishedAt,
      publishedById: publishedVersion.publishedById ?? publishedById,
    },
  };
};
