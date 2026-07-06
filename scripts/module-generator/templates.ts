import type { ModuleNames } from "./casing.js";

const toTitleCase = (value: string): string => {
  return value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const buildDescriptions = (names: ModuleNames) => {
  const moduleLabelPlural = toTitleCase(names.routeSegment);
  const moduleLabelSingular = toTitleCase(names.entityNameSingular);

  return {
    createDescription: `Create a ${moduleLabelSingular.toLowerCase()} record with shared validation, logging, and permission-aware workflows.`,
    editDescription: `Update ${moduleLabelPlural.toLowerCase()} details using the same schema contract and RBAC safeguards as the create flow.`,
    listDescription: `Manage ${moduleLabelPlural.toLowerCase()} with the shared DataTable foundation, including search, filters, pagination, and row actions.`,
    viewDescription: `Review ${moduleLabelSingular.toLowerCase()} metadata from the shared module scaffold without leaving the permission-aware admin workspace.`,
  };
};

export const renderBackendConstantsTemplate = (names: ModuleNames): string => {
  return `export const ${names.constantPrefix}_MODULE_KEY = "${names.routeSegment}";
export const ${names.constantPrefix}_PERMISSION_RESOURCE = "${names.permissionResource}";
export const ${names.constantPrefix}_API_PATH = "/${names.routeSegment}";
export const ${names.constantPrefix}_ENTITY_TYPE = "${names.permissionResource}";
export const ${names.constantPrefix}_ENTITY_LABEL = "${names.entityLabelSingular}";
export const ${names.constantPrefix}_ENTITY_LABEL_PLURAL = "${names.entityLabelPlural}";
`;
};

export const renderBackendPermissionsTemplate = (names: ModuleNames): string => {
  return `import { ${names.constantPrefix}_PERMISSION_RESOURCE } from "./${names.fileStem}.constants.js";

export const ${names.constantPrefix}_PERMISSIONS = {
  create: \`\${${names.constantPrefix}_PERMISSION_RESOURCE}.create\`,
  delete: \`\${${names.constantPrefix}_PERMISSION_RESOURCE}.delete\`,
  edit: \`\${${names.constantPrefix}_PERMISSION_RESOURCE}.edit\`,
  view: \`\${${names.constantPrefix}_PERMISSION_RESOURCE}.view\`,
} as const;

export const ${names.constantPrefix}_PERMISSION_NAMES = Object.values(
  ${names.constantPrefix}_PERMISSIONS,
);
`;
};

export const renderBackendSchemaTemplate = (names: ModuleNames): string => {
  return `import { z } from "zod";

export const ${names.entityNameSingular}RecordSchema = z.object({
  createdAt: z.string().min(1),
  description: z.string().nullable(),
  id: z.uuid(),
  isActive: z.boolean(),
  name: z.string().trim().min(1),
  updatedAt: z.string().min(1),
});

export const ${names.entityNameSingular}MutationSchema = z.object({
  description: z.string().trim().max(500).nullable(),
  isActive: z.boolean().default(true),
  name: z.string().trim().min(2).max(191),
});
`;
};

export const renderBackendValidatorsTemplate = (names: ModuleNames): string => {
  return `import { z } from "zod";

import { ${names.entityNameSingular}MutationSchema } from "./${names.fileStem}.schema.js";

const booleanFilterSchema = z
  .enum(["false", "true"])
  .transform((value) => value === "true")
  .optional();

export const ${names.entityNameSingular}IdParamSchema = z.object({
  id: z.uuid(),
});

export const list${names.entityLabelPlural}QuerySchema = z.object({
  isActive: booleanFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().default(""),
  sortBy: z.enum(["createdAt", "name", "updatedAt"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const create${names.entityLabelSingular}Schema = ${names.entityNameSingular}MutationSchema;

export const update${names.entityLabelSingular}Schema = ${names.entityNameSingular}MutationSchema;
`;
};

export const renderBackendTypesTemplate = (names: ModuleNames): string => {
  return `import type { z } from "zod";

import { ${names.entityNameSingular}RecordSchema } from "./${names.fileStem}.schema.js";
import {
  create${names.entityLabelSingular}Schema,
  list${names.entityLabelPlural}QuerySchema,
  update${names.entityLabelSingular}Schema,
} from "./${names.fileStem}.validators.js";

export type ${names.entityLabelSingular}Record = z.infer<
  typeof ${names.entityNameSingular}RecordSchema
>;

export type Create${names.entityLabelSingular}Input = z.infer<
  typeof create${names.entityLabelSingular}Schema
>;

export type Update${names.entityLabelSingular}Input = z.infer<
  typeof update${names.entityLabelSingular}Schema
>;

export type List${names.entityLabelPlural}Query = z.infer<
  typeof list${names.entityLabelPlural}QuerySchema
>;
`;
};

export const renderBackendServiceTemplate = (names: ModuleNames): string => {
  return `import type { Prisma } from "../../../generated/prisma/client.js";

import type {
  Create${names.entityLabelSingular}Input,
  ${names.entityLabelSingular}Record,
  List${names.entityLabelPlural}Query,
  Update${names.entityLabelSingular}Input,
} from "./${names.fileStem}.types.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { ${names.constantPrefix}_MODULE_KEY } from "./${names.fileStem}.constants.js";

type ModuleRecordEntity = Awaited<ReturnType<typeof prisma.moduleRecord.findFirst>>;

const mapRecord = (record: NonNullable<ModuleRecordEntity>): ${names.entityLabelSingular}Record => {
  return {
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    isActive: record.isActive,
    name: record.name,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const buildOrderBy = (
  sortBy: List${names.entityLabelPlural}Query["sortBy"],
  sortDirection: List${names.entityLabelPlural}Query["sortDirection"],
): Prisma.ModuleRecordOrderByWithRelationInput => {
  switch (sortBy) {
    case "createdAt":
      return {
        createdAt: sortDirection,
      };
    case "name":
      return {
        name: sortDirection,
      };
    case "updatedAt":
      return {
        updatedAt: sortDirection,
      };
  }
};

const buildWhereClause = (
  query: List${names.entityLabelPlural}Query,
): Prisma.ModuleRecordWhereInput => {
  return {
    deletedAt: null,
    moduleKey: ${names.constantPrefix}_MODULE_KEY,
    ...(query.isActive !== undefined
      ? {
          isActive: query.isActive,
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              name: {
                contains: query.search,
              },
            },
            {
              description: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
};

const findRecordOrThrow = async (id: string) => {
  const record = await prisma.moduleRecord.findFirst({
    where: {
      deletedAt: null,
      id,
      moduleKey: ${names.constantPrefix}_MODULE_KEY,
    },
  });

  if (!record) {
    throw new AppError("${names.entityLabelSingular} not found.", 404);
  }

  return record;
};

export const ${names.entityNamePlural}Service = {
  async list${names.entityLabelPlural}(query: List${names.entityLabelPlural}Query) {
    const where = buildWhereClause(query);
    const [total, records] = await prisma.$transaction([
      prisma.moduleRecord.count({
        where,
      }),
      prisma.moduleRecord.findMany({
        orderBy: buildOrderBy(query.sortBy, query.sortDirection),
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: records.map((record) => mapRecord(record)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async get${names.entityLabelSingular}ById(id: string): Promise<${names.entityLabelSingular}Record> {
    const record = await findRecordOrThrow(id);
    return mapRecord(record);
  },

  async create${names.entityLabelSingular}(
    input: Create${names.entityLabelSingular}Input,
  ): Promise<${names.entityLabelSingular}Record> {
    const record = await prisma.moduleRecord.create({
      data: {
        description: input.description,
        isActive: input.isActive,
        moduleKey: ${names.constantPrefix}_MODULE_KEY,
        name: input.name,
      },
    });

    return mapRecord(record);
  },

  async update${names.entityLabelSingular}(
    id: string,
    input: Update${names.entityLabelSingular}Input,
  ): Promise<{
    current: ${names.entityLabelSingular}Record;
    previous: ${names.entityLabelSingular}Record;
  }> {
    const existingRecord = await findRecordOrThrow(id);

    const updatedRecord = await prisma.moduleRecord.update({
      data: {
        description: input.description,
        isActive: input.isActive,
        name: input.name,
      },
      where: {
        id: existingRecord.id,
      },
    });

    return {
      current: mapRecord(updatedRecord),
      previous: mapRecord(existingRecord),
    };
  },

  async delete${names.entityLabelSingular}(id: string): Promise<${names.entityLabelSingular}Record> {
    const existingRecord = await findRecordOrThrow(id);

    await prisma.moduleRecord.update({
      data: {
        deletedAt: new Date(),
      },
      where: {
        id: existingRecord.id,
      },
    });

    return mapRecord(existingRecord);
  },
};
`;
};

export const renderBackendControllerTemplate = (names: ModuleNames): string => {
  return `import type { Request, Response } from "express";

import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { ${names.entityNamePlural}Service } from "./${names.fileStem}.service.js";
import { ${names.constantPrefix}_ENTITY_TYPE } from "./${names.fileStem}.constants.js";
import { ${names.constantPrefix}_PERMISSIONS } from "./${names.fileStem}.permissions.js";
import {
  create${names.entityLabelSingular}Schema,
  ${names.entityNameSingular}IdParamSchema,
  list${names.entityLabelPlural}QuerySchema,
  update${names.entityLabelSingular}Schema,
} from "./${names.fileStem}.validators.js";

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

const getRequired${names.entityLabelSingular}Id = (
  value: string | string[] | undefined,
): string => {
  const ${names.pageParam} = Array.isArray(value) ? value[0] : value;

  if (!${names.pageParam}) {
    throw new AppError("${names.entityLabelSingular} id is required.", 400);
  }

  return ${names.entityNameSingular}IdParamSchema.parse({
    id: ${names.pageParam},
  }).id;
};

export const ${names.entityNamePlural}Controller = {
  async list(request: Request, response: Response) {
    const query = list${names.entityLabelPlural}QuerySchema.parse({
      isActive: getQueryValue(request.query["filter.isActive"]),
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
      search: getQueryValue(request.query.search),
      sortBy: getQueryValue(request.query.sortBy),
      sortDirection: getQueryValue(request.query.sortDirection),
    });

    const result = await ${names.entityNamePlural}Service.list${names.entityLabelPlural}(query);

    sendPaginated(response, result.data, result.pagination);
  },

  async getById(request: Request, response: Response) {
    const record = await ${names.entityNamePlural}Service.get${names.entityLabelSingular}ById(
      getRequired${names.entityLabelSingular}Id(request.params.id),
    );

    sendSuccess(response, record);
  },

  async create(request: Request, response: Response) {
    const payload = create${names.entityLabelSingular}Schema.parse(request.body);
    const actorContext = getRequestLogActorContext(request);
    const record = await ${names.entityNamePlural}Service.create${names.entityLabelSingular}(payload);

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: ${names.constantPrefix}_PERMISSIONS.create,
        entityId: record.id,
        entityType: ${names.constantPrefix}_ENTITY_TYPE,
        metadata: {
          name: record.name,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: record.id,
        entityType: ${names.constantPrefix}_ENTITY_TYPE,
        newValues: record,
        oldValues: null,
      }),
    ]);

    sendSuccess(response, record, 201);
  },

  async update(request: Request, response: Response) {
    const payload = update${names.entityLabelSingular}Schema.parse(request.body);
    const actorContext = getRequestLogActorContext(request);
    const result = await ${names.entityNamePlural}Service.update${names.entityLabelSingular}(
      getRequired${names.entityLabelSingular}Id(request.params.id),
      payload,
    );

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: ${names.constantPrefix}_PERMISSIONS.edit,
        entityId: result.current.id,
        entityType: ${names.constantPrefix}_ENTITY_TYPE,
        metadata: {
          name: result.current.name,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: result.current.id,
        entityType: ${names.constantPrefix}_ENTITY_TYPE,
        newValues: result.current,
        oldValues: result.previous,
      }),
    ]);

    sendSuccess(response, result.current);
  },

  async remove(request: Request, response: Response) {
    const actorContext = getRequestLogActorContext(request);
    const record = await ${names.entityNamePlural}Service.delete${names.entityLabelSingular}(
      getRequired${names.entityLabelSingular}Id(request.params.id),
    );

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: ${names.constantPrefix}_PERMISSIONS.delete,
        entityId: record.id,
        entityType: ${names.constantPrefix}_ENTITY_TYPE,
        metadata: {
          name: record.name,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: record.id,
        entityType: ${names.constantPrefix}_ENTITY_TYPE,
        newValues: null,
        oldValues: record,
      }),
    ]);

    sendSuccess(response, {
      deleted: true,
      id: record.id,
    });
  },
};
`;
};

export const renderBackendRoutesTemplate = (names: ModuleNames): string => {
  return `import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { ${names.entityNamePlural}Controller } from "./${names.fileStem}.controller.js";
import { ${names.constantPrefix}_PERMISSIONS } from "./${names.fileStem}.permissions.js";

export const ${names.entityNamePlural}Router = Router();

${names.entityNamePlural}Router.get(
  "/${names.routeSegment}",
  requirePermission(${names.constantPrefix}_PERMISSIONS.view),
  asyncHandler(${names.entityNamePlural}Controller.list),
);

${names.entityNamePlural}Router.get(
  "/${names.routeSegment}/:id",
  requirePermission(${names.constantPrefix}_PERMISSIONS.view),
  asyncHandler(${names.entityNamePlural}Controller.getById),
);

${names.entityNamePlural}Router.post(
  "/${names.routeSegment}",
  requirePermission(${names.constantPrefix}_PERMISSIONS.create),
  asyncHandler(${names.entityNamePlural}Controller.create),
);

${names.entityNamePlural}Router.put(
  "/${names.routeSegment}/:id",
  requirePermission(${names.constantPrefix}_PERMISSIONS.edit),
  asyncHandler(${names.entityNamePlural}Controller.update),
);

${names.entityNamePlural}Router.delete(
  "/${names.routeSegment}/:id",
  requirePermission(${names.constantPrefix}_PERMISSIONS.delete),
  asyncHandler(${names.entityNamePlural}Controller.remove),
);
`;
};

export const renderFrontendConstantsTemplate = (names: ModuleNames): string => {
  return `export const ${names.constantPrefix}_API_ENDPOINT = "/${names.routeSegment}";

export const ${names.constantPrefix}_PERMISSIONS = {
  create: "${names.permissionResource}.create",
  delete: "${names.permissionResource}.delete",
  edit: "${names.permissionResource}.edit",
  view: "${names.permissionResource}.view",
} as const;

export const ${names.constantPrefix}_QUERY_KEYS = {
  all: ["${names.routeSegment}"] as const,
  detail: (${names.pageParam}: string) => ["${names.routeSegment}", "detail", ${names.pageParam}] as const,
  table: ["${names.routeSegment}", "table"] as const,
} as const;

export const ${names.constantPrefix}_ROUTES = {
  create: "/${names.routeSegment}/new",
  edit: (${names.pageParam}: string) => \`/${names.routeSegment}/\${${names.pageParam}}/edit\`,
  list: "/${names.routeSegment}",
  view: (${names.pageParam}: string) => \`/${names.routeSegment}/\${${names.pageParam}}\`,
} as const;
`;
};

export const renderFrontendTypesTemplate = (names: ModuleNames): string => {
  return `export type ${names.entityLabelSingular}Record = {
  createdAt: string;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  updatedAt: string;
};
`;
};

export const renderFrontendHookTemplate = (names: ModuleNames): string => {
  return `"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/services/api-client";
import type { ApiSuccessResponse } from "@/types";

import type { ${names.entityLabelSingular}Record } from "../types";
import {
  ${names.constantPrefix}_API_ENDPOINT,
  ${names.constantPrefix}_QUERY_KEYS,
} from "../constants";

export const ${names.entityNameSingular}FormSchema = z.object({
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(191),
});

export type ${names.entityLabelSingular}FormValues = z.infer<typeof ${names.entityNameSingular}FormSchema>;

const toPayload = (values: ${names.entityLabelSingular}FormValues) => {
  return {
    description: values.description?.trim() ? values.description.trim() : null,
    isActive: values.isActive,
    name: values.name.trim(),
  };
};

const get${names.entityLabelSingular}ById = async (
  ${names.pageParam}: string,
): Promise<${names.entityLabelSingular}Record> => {
  const response = await apiClient.get<ApiSuccessResponse<${names.entityLabelSingular}Record>>(
    \`\${${names.constantPrefix}_API_ENDPOINT}/\${${names.pageParam}}\`,
  );

  return response.data.data;
};

export const ${names.hookName} = () => {
  const queryClient = useQueryClient();

  const use${names.entityLabelSingular} = (${names.pageParam}: string) =>
    useQuery({
      enabled: Boolean(${names.pageParam}),
      queryFn: () => get${names.entityLabelSingular}ById(${names.pageParam}),
      queryKey: ${names.constantPrefix}_QUERY_KEYS.detail(${names.pageParam}),
    });

  const useCreate${names.entityLabelSingular} = () =>
    useMutation({
      mutationFn: async (values: ${names.entityLabelSingular}FormValues) => {
        const response = await apiClient.post<ApiSuccessResponse<${names.entityLabelSingular}Record>>(
          ${names.constantPrefix}_API_ENDPOINT,
          toPayload(values),
        );

        return response.data.data;
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ${names.constantPrefix}_QUERY_KEYS.all,
        });
      },
    });

  const useUpdate${names.entityLabelSingular} = () =>
    useMutation({
      mutationFn: async ({
        ${names.pageParam},
        values,
      }: {
        ${names.pageParam}: string;
        values: ${names.entityLabelSingular}FormValues;
      }) => {
        const response = await apiClient.put<ApiSuccessResponse<${names.entityLabelSingular}Record>>(
          \`\${${names.constantPrefix}_API_ENDPOINT}/\${${names.pageParam}}\`,
          toPayload(values),
        );

        return response.data.data;
      },
      onSuccess: async (_record, variables) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ${names.constantPrefix}_QUERY_KEYS.all,
          }),
          queryClient.invalidateQueries({
            queryKey: ${names.constantPrefix}_QUERY_KEYS.detail(variables.${names.pageParam}),
          }),
        ]);
      },
    });

  const useDelete${names.entityLabelSingular} = () =>
    useMutation({
      mutationFn: async (${names.pageParam}: string) => {
        await apiClient.delete(\`\${${names.constantPrefix}_API_ENDPOINT}/\${${names.pageParam}}\`);
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ${names.constantPrefix}_QUERY_KEYS.all,
        });
      },
    });

  return {
    use${names.entityLabelSingular},
    useCreate${names.entityLabelSingular},
    useDelete${names.entityLabelSingular},
    useUpdate${names.entityLabelSingular},
  };
};
`;
};

export const renderFrontendFormTemplate = (names: ModuleNames): string => {
  return `"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, PackagePlus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";

import { ErrorState } from "@/components/ui/error-state";
import { getApiErrorMessage } from "@/utils";

import {
  ${names.constantPrefix}_ROUTES,
} from "../constants";
import {
  ${names.entityNameSingular}FormSchema,
  type ${names.entityLabelSingular}FormValues,
  ${names.hookName},
} from "../hooks/use${names.entityLabelPlural}";

type ${names.entityLabelSingular}FormProps =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      ${names.pageParam}: string;
    };

const sectionClassName =
  "rounded-[2rem] border border-stone-300/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,239,228,0.95))] p-6 shadow-[0_20px_50px_rgba(80,58,29,0.08)]";

export function ${names.entityLabelSingular}Form(props: ${names.entityLabelSingular}FormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const { use${names.entityLabelSingular}, useCreate${names.entityLabelSingular}, useUpdate${names.entityLabelSingular} } = ${names.hookName}();
  const editingId = props.mode === "edit" ? props.${names.pageParam} : "";
  const ${names.entityNameSingular}Query = use${names.entityLabelSingular}(editingId);
  const createMutation = useCreate${names.entityLabelSingular}();
  const updateMutation = useUpdate${names.entityLabelSingular}();

  const form = useForm<${names.entityLabelSingular}FormValues>({
    defaultValues: {
      description: "",
      isActive: true,
      name: "",
    },
    resolver: zodResolver(${names.entityNameSingular}FormSchema) as Resolver<${names.entityLabelSingular}FormValues>,
  });

  useEffect(() => {
    if (props.mode !== "edit" || !${names.entityNameSingular}Query.data) {
      return;
    }

    form.reset({
      description: ${names.entityNameSingular}Query.data.description ?? "",
      isActive: ${names.entityNameSingular}Query.data.isActive,
      name: ${names.entityNameSingular}Query.data.name,
    });
  }, [form, props.mode, ${names.entityNameSingular}Query.data]);

  if (props.mode === "edit" && ${names.entityNameSingular}Query.isError) {
    return (
      <ErrorState
        action={
          <button
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            onClick={() => {
              void ${names.entityNameSingular}Query.refetch();
            }}
            type="button"
          >
            Retry
          </button>
        }
        description={${names.entityNameSingular}Query.error.message}
        title="${names.entityLabelSingular} details could not be loaded"
      />
    );
  }

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    ${names.entityNameSingular}Query.isLoading;

  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          const record =
            props.mode === "create"
              ? await createMutation.mutateAsync(values)
              : await updateMutation.mutateAsync({
                  ${names.pageParam}: props.${names.pageParam},
                  values,
                });

          setSubmitError(null);
          setSubmitMessage(
            props.mode === "create"
              ? "${names.entityLabelSingular} created successfully."
              : "${names.entityLabelSingular} updated successfully.",
          );

          router.push(${names.constantPrefix}_ROUTES.view(record.id));
          router.refresh();
        } catch (error) {
          setSubmitMessage(null);
          setSubmitError(getApiErrorMessage(error));
        }
      })}
    >
      <section className={sectionClassName}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              {props.mode === "create" ? "Create ${names.entityLabelSingular}" : "Edit ${names.entityLabelSingular}"}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
              {props.mode === "create"
                ? "Add a ${names.entityNameSingular}"
                : \`Update \${${names.entityNameSingular}Query.data?.name ?? "${names.entityNameSingular}"}\`}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-stone-700">
              Keep future modules consistent by reusing the same validation, logging, and
              permission-aware form foundation.
            </p>
          </div>

          <Link
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            href={props.mode === "create" ? ${names.constantPrefix}_ROUTES.list : ${names.constantPrefix}_ROUTES.view(props.${names.pageParam})}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
      </section>

      <section className={sectionClassName}>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-stone-700">Name</span>
            <input
              className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isBusy}
              placeholder="Enter the ${names.entityNameSingular} name"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <span className="text-sm text-rose-700">
                {form.formState.errors.name.message}
              </span>
            ) : null}
          </label>

          <label className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-stone-200/90 bg-white/85 px-4 py-4">
            <span className="space-y-1">
              <span className="block text-sm font-medium text-stone-700">Active status</span>
              <span className="block text-xs text-stone-500">
                Keep this ${names.entityNameSingular} visible in active table results.
              </span>
            </span>
            <input
              className="h-5 w-5 rounded border-stone-300 text-amber-700 focus:ring-amber-300"
              disabled={isBusy}
              type="checkbox"
              {...form.register("isActive")}
            />
          </label>
        </div>

        <label className="mt-6 block space-y-2">
          <span className="text-sm font-medium text-stone-700">Description</span>
          <textarea
            className="min-h-40 w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isBusy}
            placeholder="Describe how this ${names.entityNameSingular} should be used"
            {...form.register("description")}
          />
          {form.formState.errors.description ? (
            <span className="text-sm text-rose-700">
              {form.formState.errors.description.message}
            </span>
          ) : null}
        </label>
      </section>

      {submitError ? (
        <div className="rounded-[1.5rem] border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </div>
      ) : null}

      {submitMessage ? (
        <div className="rounded-[1.5rem] border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {submitMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          type="submit"
        >
          {props.mode === "create" ? <PackagePlus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {isBusy
            ? props.mode === "create"
              ? "Creating ${names.entityNameSingular}..."
              : "Saving changes..."
            : props.mode === "create"
              ? "Create ${names.entityLabelSingular}"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}
`;
};

export const renderFrontendTableTemplate = (names: ModuleNames): string => {
  return `"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Eye, Pencil, Trash2 } from "lucide-react";

import { DataTable, type DataTableConfig } from "@/components/data-table";

import {
  ${names.constantPrefix}_API_ENDPOINT,
  ${names.constantPrefix}_QUERY_KEYS,
  ${names.constantPrefix}_ROUTES,
} from "../constants";
import { ${names.hookName} } from "../hooks/use${names.entityLabelPlural}";
import type { ${names.entityLabelSingular}Record } from "../types";

const formatDate = (value: string): string => {
  return format(new Date(value), "MMM d, yyyy");
};

const ${names.entityNameSingular}Columns: ColumnDef<${names.entityLabelSingular}Record>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="min-w-[14rem] space-y-1">
        <p className="font-semibold text-stone-950">{row.original.name}</p>
        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
          {row.original.isActive ? "Active record" : "Inactive record"}
        </p>
      </div>
    ),
    header: "Name",
  },
  {
    accessorKey: "description",
    cell: ({ row }) => (
      <span className="text-sm text-stone-700">
        {row.original.description || "No description provided."}
      </span>
    ),
    enableSorting: false,
    header: "Description",
  },
  {
    accessorKey: "isActive",
    cell: ({ row }) => (
      <span
        className={\`inline-flex rounded-full px-3 py-1 text-xs font-semibold \${
          row.original.isActive
            ? "bg-emerald-100 text-emerald-800"
            : "bg-stone-200 text-stone-700"
        }\`}
      >
        {row.original.isActive ? "Active" : "Inactive"}
      </span>
    ),
    header: "Status",
  },
  {
    accessorKey: "updatedAt",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-stone-700">
        {formatDate(row.original.updatedAt)}
      </span>
    ),
    header: "Updated",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-stone-700">
        {formatDate(row.original.createdAt)}
      </span>
    ),
    header: "Created",
  },
];

export function ${names.entityLabelSingular}Table() {
  const { useDelete${names.entityLabelSingular} } = ${names.hookName}();
  const deleteMutation = useDelete${names.entityLabelSingular}();

  const tableConfig: DataTableConfig<${names.entityLabelSingular}Record> = {
    columns: ${names.entityNameSingular}Columns,
    csv: {
      columns: [
        {
          header: "Name",
          key: "name",
          value: (row) => row.name,
        },
        {
          header: "Description",
          key: "description",
          value: (row) => row.description ?? "",
        },
        {
          header: "Status",
          key: "status",
          value: (row) => (row.isActive ? "Active" : "Inactive"),
        },
        {
          header: "Updated At",
          key: "updatedAt",
          value: (row) => row.updatedAt,
        },
      ],
      fileName: "${names.routeSegment}.csv",
    },
    defaultSort: {
      desc: true,
      id: "createdAt",
    },
    emptyState: {
      description:
        "Try broadening the search, clearing filters, or creating the first record for this scaffolded module.",
      title: "No records matched the current table view",
    },
    filters: [
      {
        id: "isActive",
        label: "Status",
        options: [
          {
            label: "Active",
            value: "true",
          },
          {
            label: "Inactive",
            value: "false",
          },
        ],
        placeholder: "All statuses",
        type: "select",
      },
    ],
    getRowId: (row) => row.id,
    queryKey: ${names.constantPrefix}_QUERY_KEYS.table,
    rowActions: [
      {
        href: (row) => ${names.constantPrefix}_ROUTES.view(row.id),
        icon: Eye,
        id: "view",
        label: "View",
        variant: "view",
      },
      {
        href: (row) => ${names.constantPrefix}_ROUTES.edit(row.id),
        icon: Pencil,
        id: "edit",
        label: "Edit",
        variant: "edit",
      },
      {
        confirmation: {
          confirmLabel: "Delete record",
          description: (rows) =>
            \`Delete \${rows[0]?.name ?? "this record"} from active views? This preserves the audit trail through a soft delete.\`,
          title: "Delete record?",
          tone: "danger",
        },
        icon: Trash2,
        id: "delete",
        invalidateAfterSuccess: true,
        label: "Delete",
        onClick: async (row) => {
          await deleteMutation.mutateAsync(row.id);
        },
        tone: "danger",
        variant: "delete",
      },
    ],
    searchPlaceholder: "Search by name or description",
  };

  return <DataTable config={tableConfig} endpoint={${names.constantPrefix}_API_ENDPOINT} />;
}
`;
};

export const renderFrontendListPageTemplate = (names: ModuleNames): string => {
  const descriptions = buildDescriptions(names);

  return `import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";

import {
  ${names.constantPrefix}_ROUTES,
} from "../constants";
import { ${names.entityLabelSingular}Table } from "../components/${names.entityLabelSingular}Table";

type ${names.entityLabelPlural}ListPageProps = {
  canCreate: boolean;
};

export default function ${names.entityLabelPlural}ListPage({
  canCreate,
}: ${names.entityLabelPlural}ListPageProps) {
  return (
    <main className="space-y-6">
      <PageHeader
        actions={
          canCreate ? (
            <Link
              className="inline-flex items-center rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-stone-800"
              href={${names.constantPrefix}_ROUTES.create}
            >
              Create ${names.entityNameSingular}
            </Link>
          ) : null
        }
        description="${descriptions.listDescription}"
        eyebrow="Directory"
        title="${names.entityLabelPlural}"
      />

      <${names.entityLabelSingular}Table />
    </main>
  );
}
`;
};

export const renderFrontendCreatePageTemplate = (names: ModuleNames): string => {
  const descriptions = buildDescriptions(names);

  return `import { PageHeader } from "@/components/ui/page-header";

import { ${names.entityLabelSingular}Form } from "../components/${names.entityLabelSingular}Form";

export default function Create${names.entityLabelSingular}Page() {
  return (
    <main className="space-y-6">
      <PageHeader
        description="${descriptions.createDescription}"
        eyebrow="Create ${names.entityLabelSingular}"
        title="New ${names.entityLabelSingular}"
      />

      <${names.entityLabelSingular}Form mode="create" />
    </main>
  );
}
`;
};

export const renderFrontendEditPageTemplate = (names: ModuleNames): string => {
  const descriptions = buildDescriptions(names);

  return `import { PageHeader } from "@/components/ui/page-header";

import { ${names.entityLabelSingular}Form } from "../components/${names.entityLabelSingular}Form";

type Edit${names.entityLabelSingular}PageProps = {
  ${names.pageParam}: string;
};

export default function Edit${names.entityLabelSingular}Page({
  ${names.pageParam},
}: Edit${names.entityLabelSingular}PageProps) {
  return (
    <main className="space-y-6">
      <PageHeader
        description="${descriptions.editDescription}"
        eyebrow="Edit ${names.entityLabelSingular}"
        title="Edit ${names.entityLabelSingular}"
      />

      <${names.entityLabelSingular}Form mode="edit" ${names.pageParam}={${names.pageParam}} />
    </main>
  );
}
`;
};

export const renderFrontendViewPageTemplate = (names: ModuleNames): string => {
  const descriptions = buildDescriptions(names);

  return `"use client";

import Link from "next/link";

import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";

import {
  ${names.constantPrefix}_ROUTES,
} from "../constants";
import { ${names.hookName} } from "../hooks/use${names.entityLabelPlural}";

type ${names.entityLabelSingular}ViewPageProps = {
  ${names.pageParam}: string;
};

const sectionClassName =
  "rounded-[2rem] border border-stone-300/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,239,228,0.95))] p-6 shadow-[0_20px_50px_rgba(80,58,29,0.08)]";

export default function ${names.entityLabelSingular}ViewPage({
  ${names.pageParam},
}: ${names.entityLabelSingular}ViewPageProps) {
  const { use${names.entityLabelSingular} } = ${names.hookName}();
  const ${names.entityNameSingular}Query = use${names.entityLabelSingular}(${names.pageParam});

  if (${names.entityNameSingular}Query.isError) {
    return (
      <ErrorState
        action={
          <button
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            onClick={() => {
              void ${names.entityNameSingular}Query.refetch();
            }}
            type="button"
          >
            Retry
          </button>
        }
        description={${names.entityNameSingular}Query.error.message}
        title="${names.entityLabelSingular} details could not be loaded"
      />
    );
  }

  if (${names.entityNameSingular}Query.isLoading || !${names.entityNameSingular}Query.data) {
    return (
      <section className={sectionClassName}>
        <p className="text-sm text-stone-500">Loading ${names.entityNameSingular} details...</p>
      </section>
    );
  }

  const record = ${names.entityNameSingular}Query.data;

  return (
    <main className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex items-center rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-stone-800"
            href={${names.constantPrefix}_ROUTES.edit(record.id)}
          >
            Edit ${names.entityNameSingular}
          </Link>
        }
        description="${descriptions.viewDescription}"
        eyebrow="${names.entityLabelSingular} Record"
        title="${names.entityLabelSingular} Details"
      />

      <section className={sectionClassName}>
        <dl className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Name
            </dt>
            <dd className="text-lg font-semibold text-stone-950">{record.name}</dd>
          </div>
          <div className="space-y-2">
            <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Status
            </dt>
            <dd className="text-sm text-stone-700">
              {record.isActive ? "Active" : "Inactive"}
            </dd>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Description
            </dt>
            <dd className="text-sm leading-7 text-stone-700">
              {record.description || "No description provided."}
            </dd>
          </div>
          <div className="space-y-2">
            <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Created
            </dt>
            <dd className="text-sm text-stone-700">{record.createdAt}</dd>
          </div>
          <div className="space-y-2">
            <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Updated
            </dt>
            <dd className="text-sm text-stone-700">{record.updatedAt}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
`;
};

export const renderFrontendAppListPageTemplate = (names: ModuleNames): string => {
  return `import { requirePermission } from "@/lib/server-auth";
import ${names.entityLabelPlural}ListPage from "@/modules/${names.routeSegment}/pages/list";
import { ${names.constantPrefix}_PERMISSIONS } from "@/modules/${names.routeSegment}/constants";

export default async function ${names.entityLabelPlural}RoutePage() {
  const authorization = await requirePermission(${names.constantPrefix}_PERMISSIONS.view);

  return (
    <${names.entityLabelPlural}ListPage
      canCreate={authorization.permissions.includes(${names.constantPrefix}_PERMISSIONS.create)}
    />
  );
}
`;
};

export const renderFrontendAppCreatePageTemplate = (names: ModuleNames): string => {
  return `import { requirePermission } from "@/lib/server-auth";
import Create${names.entityLabelSingular}Page from "@/modules/${names.routeSegment}/pages/create";
import { ${names.constantPrefix}_PERMISSIONS } from "@/modules/${names.routeSegment}/constants";

export default async function New${names.entityLabelSingular}RoutePage() {
  await requirePermission(${names.constantPrefix}_PERMISSIONS.create);

  return <Create${names.entityLabelSingular}Page />;
}
`;
};

export const renderFrontendAppEditPageTemplate = (names: ModuleNames): string => {
  return `import { requirePermission } from "@/lib/server-auth";
import Edit${names.entityLabelSingular}Page from "@/modules/${names.routeSegment}/pages/edit";
import { ${names.constantPrefix}_PERMISSIONS } from "@/modules/${names.routeSegment}/constants";

type Edit${names.entityLabelSingular}RoutePageProps = {
  params: Promise<{
    ${names.pageParam}: string;
  }>;
};

export default async function Edit${names.entityLabelSingular}RoutePage({
  params,
}: Edit${names.entityLabelSingular}RoutePageProps) {
  await requirePermission(${names.constantPrefix}_PERMISSIONS.edit);

  const { ${names.pageParam} } = await params;

  return <Edit${names.entityLabelSingular}Page ${names.pageParam}={${names.pageParam}} />;
}
`;
};

export const renderFrontendAppViewPageTemplate = (names: ModuleNames): string => {
  return `import { requirePermission } from "@/lib/server-auth";
import ${names.entityLabelSingular}ViewPage from "@/modules/${names.routeSegment}/pages/view";
import { ${names.constantPrefix}_PERMISSIONS } from "@/modules/${names.routeSegment}/constants";

type ${names.entityLabelSingular}RoutePageProps = {
  params: Promise<{
    ${names.pageParam}: string;
  }>;
};

export default async function ${names.entityLabelSingular}RoutePage({
  params,
}: ${names.entityLabelSingular}RoutePageProps) {
  await requirePermission(${names.constantPrefix}_PERMISSIONS.view);

  const { ${names.pageParam} } = await params;

  return <${names.entityLabelSingular}ViewPage ${names.pageParam}={${names.pageParam}} />;
}
`;
};
