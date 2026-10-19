import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import type { AuthorizationSummary } from "../../services/authorization-service.js";

process.env.DATABASE_URL =
  "sqlserver://localhost:1433;database=approval_tests;user=sa;password=unused;trustServerCertificate=true";
const prisma = Object.fromEntries(
  [
    "actionPlan",
    "progressEvaluation",
    "deadlineExtensionRequest",
    "workflowInstance",
    "workflowTask",
    "workflowTimer",
    "notificationDelivery",
    "progressReviewHistory",
    "user",
    "role",
    "deadlineExtensionClassification",
    "workflowDefinition",
  ].map((name) => [
    name,
    Object.fromEntries(
      [
        "findFirst",
        "findUnique",
        "findMany",
        "count",
        "updateMany",
        "update",
        "create",
      ].map((method) => [
        method,
        () => {
          throw new Error(`Unexpected database call: ${name}.${method}`);
        },
      ]),
    ),
  ]),
) as unknown as PrismaClient;
Object.assign(prisma, {
  $transaction: () => {
    throw new Error("Unexpected transaction");
  },
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
const { notificationService } =
  await import("../../services/notification-service.js");
const { extensionRequestsService: extensions } =
  await import("../extension-requests/extension-requests.service.js");
const { progressService: progress } =
  await import("../progress/progress.service.js");
const { workflowInstanceService } =
  await import("./workflow-instance.service.js");
const { workflowTaskService } = await import("./workflow-task.service.js");
const { resolveRuntimeAssignment } =
  await import("./workflow-assignment-resolver.js");
const { workflowNodeConfigurationSchema } =
  await import("./workflows.validators.js");

const { getWorkflowEntityAdapter } =
  await import("./workflow-entity-adapters.js");

type Row = Record<string, unknown>;
const row = (value: unknown) => value as Row;
// Relational test store: exercise services, integration, assignment and inbox queries together.
const matches = (value: unknown, where: unknown): boolean => {
  if (where === undefined) return true;
  if (where === null || typeof where !== "object" || where instanceof Date)
    return value instanceof Date && where instanceof Date
      ? +value === +where
      : value === where;
  return Object.entries(row(where)).every(([key, expected]) => {
    if (key === "AND")
      return (Array.isArray(expected) ? expected : [expected]).every((item) =>
        matches(value, item),
      );
    if (key === "OR")
      return (expected as unknown[]).some((item) => matches(value, item));
    if (key === "in") return (expected as unknown[]).includes(value);
    if (key === "not") return !matches(value, expected);
    if (key === "some")
      return (
        Array.isArray(value) && value.some((item) => matches(item, expected))
      );
    if (key === "gt") return Number(value) > Number(expected);
    return value != null && matches(row(value)[key], expected);
  });
};
const user = (id: string) => ({
  id,
  name: id,
  email: `${id}@example.test`,
  jobTitle: null,
});
const access = (
  userId: string,
  permissions: string[],
  dataScope: AuthorizationSummary["dataScope"] = "ASSIGNED",
): AuthorizationSummary => ({
  userId,
  permissions,
  dataScope,
  isAdmin: false,
  roleCode: null,
  roleCodes: [],
  roleName: "Custom",
  roles: ["Custom"],
});
const owner = access("executor", [
  "deadline_extensions.request",
  "action_plans.submit_to_audit",
]);
const manager = access("manager", [
  "deadline_extensions.approve",
  "deadline_extensions.reject",
]);
const auditor = access(
  "auditor",
  ["action_plans.evaluate", "action_plans.approve", "action_plans.return"],
  "AUDIT_SCOPE",
);
const other = access(
  "other",
  [...manager.permissions, ...auditor.permissions],
  "AUDIT_SCOPE",
);
const date = new Date("2030-01-01T00:00:00Z");
const configuration = (strategy: "ROLE" | "FIELD_REFERENCE") =>
  workflowNodeConfigurationSchema.parse({
    nodeType: "APPROVAL",
    schemaVersion: 1,
    name: "Review",
    description: null,
    allowedActions: ["APPROVE", "REJECT", "REQUEST_CORRECTION"],
    assignmentStrategy: strategy,
    areaId: null,
    userId: null,
    roleId: "auditor-role",
    fieldReference: "custom.areaResponsibleUserId",
    fallbackStrategy: "STOP",
    fallbackRoleId: null,
    fallbackUserId: null,
    commentRequired: false,
    evidenceRequired: false,
    electronicSignature: false,
    routeLabelOnApproval: null,
    routeLabelOnRejection: null,
    stateAfterApproval: null,
    stateAfterRejection: null,
    sla: null,
  });

function fixture(correctionLoops = false) {
  const observation = {
    id: "observation",
    deletedAt: null,
    title: "Observation",
    auditorUserId: "auditor",
    observationNumber: 1,
    auditReport: { reportNumber: "R1" },
    status: { isFinal: false, key: "OPEN" },
    riskLevel: { key: "HIGH" },
    areaAssignments: [],
  };
  const area = {
    areaId: "area",
    areaResponsibleUserId: "manager",
    processOwnerUserId: "process-owner",
    area: { id: "area", name: "Area", managerUserId: "manager" },
    areaResponsible: user("manager"),
    processOwner: user("process-owner"),
  };
  const plan = {
    id: "plan",
    deletedAt: null,
    observationId: "observation",
    observationAreaId: "observation-area",
    observation,
    observationArea: area,
    responsibleUserId: "executor",
    responsibleUser: user("executor"),
    remediationPlanId: null,
    currentDueDate: date,
    originalDueDate: date,
    progressPercent: 0,
    status: "STARTED",
    title: "Plan",
    description: "Plan",
  };
  const evaluation: Row = {
    id: "evaluation",
    deletedAt: null,
    actionPlanId: "plan",
    actionPlan: plan,
    submittedByUserId: "executor",
    submittedByUser: user("executor"),
    type: "FINALIZATION",
    reportedProgressPercent: 100,
    reviewStatus: "DRAFT",
    workflowInstanceId: null,
    evidenceFiles: [],
    reviewHistory: [],
    createdAt: date,
    updatedAt: date,
    submittedAt: date,
    reviewedAt: null,
    reviewedByUser: null,
    reviewComment: null,
    evaluatedStatus: null,
    comment: "Complete",
  };
  const tables: Record<string, Row[]> = {
    actionPlan: [plan],
    progressEvaluation: [evaluation],
    deadlineExtensionRequest: [],
    workflowInstance: [],
    workflowTask: [],
    workflowTimer: [],
    notificationDelivery: [],
    progressReviewHistory: [],
    user: ["manager", "auditor"].map((id) => ({
      ...user(id),
      isActive: true,
      deletedAt: null,
    })),
    role: [{ id: "auditor-role", deletedAt: null }],
    deadlineExtensionClassification: [
      { id: "classification", code: "C1", maxAdditionalDays: 30, active: true },
    ],
    workflowDefinition: ["DEADLINE_EXTENSION", "OBSERVATION_CLOSURE"].map(
      (processType) => ({
        id: processType,
        processType,
        activeVersionId: "version",
        activeVersion: { id: "version", publishedAt: new Date("2029-01-01") },
        archivedAt: null,
        status: "PUBLISHED",
      }),
    ),
  };
  const stub = (
    model: object,
    method: string,
    implementation: (...args: unknown[]) => unknown,
  ) => mock.method(model, method as never, implementation as never);
  for (const [name, records] of Object.entries(tables)) {
    const model = row(prisma)[name] as object;
    const selected = (args: unknown) =>
      records.filter((record) => matches(record, row(args).where));
    stub(model, "findFirst", async (args) =>
      structuredClone(selected(args)[0] ?? null),
    );
    stub(model, "findUnique", async (args) =>
      structuredClone(selected(args)[0] ?? null),
    );
    stub(model, "findMany", async (args) => structuredClone(selected(args)));
    stub(model, "count", async (args) => selected(args).length);
    stub(model, "updateMany", async (args) => {
      const rows = selected(args);
      rows.forEach((record) => Object.assign(record, row(args).data));
      return { count: rows.length };
    });
    stub(model, "update", async (args) => {
      const record = selected(args)[0];
      assert.ok(record);
      Object.assign(record, row(args).data);
      return structuredClone(record);
    });
    stub(model, "create", async (args) => {
      const data = row(row(args).data);
      const record: Row = { id: `${name}-${records.length}`, ...data };
      if (name === "deadlineExtensionRequest")
        Object.assign(record, {
          deletedAt: null,
          status: "DRAFT",
          workflowInstanceId: null,
          actionPlan: plan,
          observationArea: area,
          observation: null,
          classification: tables.deadlineExtensionClassification![0],
          requestedByUser: user(String(data.requestedByUserId)),
          attachments: [],
          createdAt: date,
          updatedAt: date,
          finalApprovedAt: null,
          managerReviewedAt: null,
          managerReviewer: null,
          managerComment: null,
        });
      records.push(record);
      return structuredClone(record);
    });
  }
  stub(prisma, "$transaction", async (callback) =>
    (callback as (db: unknown) => unknown)(prisma),
  );
  mock.method(notificationService, "create", async () => ({}) as never);
  let failStart = false;
  mock.method(
    workflowInstanceService,
    "startInstance",
    async (
      ...[input]: Parameters<typeof workflowInstanceService.startInstance>
    ) => {
      if (failStart) throw new Error("Assignment unavailable");
      const instance: Row = {
        id: `instance-${tables.workflowInstance!.length}`,
        status: "WAITING",
        entityId: input.entityId,
        entityType: input.entityType,
        processType: input.processType,
      };
      tables.workflowInstance!.push(instance);
      const config = configuration(
        input.processType === "DEADLINE_EXTENSION" ? "FIELD_REFERENCE" : "ROLE",
      );
      assert.ok(config.nodeType === "APPROVAL");
      const assignment = await resolveRuntimeAssignment({
        configuration: config,
        context: input.context as never,
        db: prisma as unknown as Prisma.TransactionClient,
      });
      tables.workflowTask!.push({
        id: `task-${tables.workflowTask!.length}`,
        status: "PENDING",
        workflowInstanceId: instance.id,
        instance,
        assignedUserId: null,
        assignedAreaId: null,
        assignedRoleId: null,
        ...assignment,
        assignedRole: assignment.assignedRoleId
          ? { userRoles: [{ userId: "auditor" }] }
          : null,
        assignedArea: null,
        node: { configurationJson: JSON.stringify(config) },
      });
      return { id: instance.id, status: "WAITING" } as never;
    },
  );
  mock.method(
    workflowTaskService,
    "actOnTask",
    async (
      ...[id, action, _input, actor]: Parameters<
        typeof workflowTaskService.actOnTask
      >
    ) => {
      const task = tables.workflowTask!.find((item) => item.id === id)!;
      assert.ok(
        matches(task, {
          OR: [
            { assignedUserId: actor.userId },
            { assignedRole: { userRoles: { some: { userId: actor.userId } } } },
          ],
        }),
      );
      assert.ok(
        actor.permissions.includes(
          action === "APPROVE"
            ? "workflow_tasks.approve"
            : "workflow_tasks.request_correction",
        ),
      );
      task.status = action === "APPROVE" ? "APPROVED" : "CORRECTION_REQUESTED";
      const instance = row(task.instance);
      const adapter = getWorkflowEntityAdapter(String(instance.processType))!;
      await adapter.applyDecision!({
        action,
        actorUserId: actor.userId,
        entityId: String(instance.entityId),
        instanceId: String(instance.id),
        taskId: id,
        node: configuration("ROLE"),
        ...(_input.comment ? { comment: _input.comment } : {}),
        db: prisma as unknown as Prisma.TransactionClient,
      });
      instance.status =
        action === "APPROVE"
          ? "COMPLETED"
          : correctionLoops
            ? "WAITING"
            : "REJECTED";
      if (
        instance.processType === "DEADLINE_EXTENSION" &&
        action === "APPROVE"
      ) {
        await adapter.applyCompletion!({
          actorUserId: actor.userId,
          entityId: String(instance.entityId),
          instanceId: String(instance.id),
          finalResult: "APPROVED",
          db: prisma as unknown as Prisma.TransactionClient,
        });
      }
      if (action !== "APPROVE" && correctionLoops) {
        tables.workflowTask!.push({
          ...task,
          id: `task-${tables.workflowTask!.length}`,
          status: "PENDING",
        });
      }
      return {} as never;
    },
  );
  return {
    tables,
    plan,
    evaluation,
    setFailStart: (value: boolean) => {
      failStart = value;
    },
  };
}
const extensionInput = {
  classificationCode: "C1",
  proposedDueDate: new Date("2030-01-20"),
  reason: "More time",
  evidenceFileIds: [],
};
const queue = { reviewQueue: true, page: 1, perPage: 100, search: "" };

test("extension: custom role, failed send, retry same draft, assigned manager inbox and approval", async () => {
  const f = fixture();
  try {
    const draft = await extensions.createForActionPlan(
      "plan",
      extensionInput,
      owner,
    );
    f.setFailStart(true);
    await assert.rejects(
      extensions.submit(draft.id, owner),
      /Assignment unavailable/,
    );
    assert.equal((await extensions.getById(draft.id, owner)).status, "DRAFT");
    assert.equal((await extensions.list(queue, manager)).data.length, 0);
    f.setFailStart(false);
    await extensions.submit(draft.id, owner);
    await extensions.submit(draft.id, owner);
    assert.equal(f.tables.workflowInstance!.length, 1);
    assert.equal(f.tables.deadlineExtensionRequest!.length, 1);
    assert.equal((await extensions.list(queue, other)).data.length, 0);
    const inbox = await extensions.list(queue, manager);
    assert.equal(inbox.data[0]?.id, draft.id);
    assert.deepEqual(inbox.data[0]?.reviewTask?.allowedActions, [
      "APPROVE",
      "REJECT",
    ]);
    await assert.rejects(
      extensions.managerReview(draft.id, true, { comment: null }, other),
    );
    await extensions.managerReview(draft.id, true, { comment: null }, manager);
    assert.equal(
      f.plan.currentDueDate.toISOString(),
      extensionInput.proposedDueDate.toISOString(),
    );
  } finally {
    mock.restoreAll();
  }
});

test("extension request permission rejects no permission and foreign plan; explicit admin exception", async () => {
  fixture();
  try {
    await assert.rejects(
      extensions.createForActionPlan("plan", extensionInput, {
        ...owner,
        permissions: [],
      }),
      /permiso/,
    );
    await assert.rejects(
      extensions.createForActionPlan("plan", extensionInput, {
        ...owner,
        userId: "other",
        dataScope: "ALL",
      }),
      /planes asignados/,
    );
    const draft = await extensions.createForActionPlan(
      "plan",
      extensionInput,
      owner,
    );
    await assert.rejects(
      extensions.submit(draft.id, {
        ...owner,
        userId: "other",
        dataScope: "ALL",
        permissions: [...owner.permissions, "deadline_extensions.view"],
      }),
      /planes asignados/,
    );
    await assert.rejects(
      extensions.submit(draft.id, { ...owner, permissions: [] }),
      /permiso/,
    );
  } finally {
    mock.restoreAll();
  }
  fixture();
  try {
    const admin = {
      ...owner,
      userId: "admin",
      isAdmin: true,
      dataScope: "ALL" as const,
    };
    const draft = await extensions.createForActionPlan(
      "plan",
      extensionInput,
      admin,
    );
    await extensions.submit(draft.id, admin);
  } finally {
    mock.restoreAll();
  }
});

test("100% finalization is visible only to assigned reviewer; terminal return and resend is reviewable", async () => {
  const f = fixture();
  try {
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    const inbox = await progress.listProgressEvaluations(queue, auditor);
    assert.equal(inbox.data[0]?.id, "evaluation");
    assert.ok(inbox.data[0]?.reviewTask?.allowedActions.includes("APPROVE"));
    assert.equal(
      (await progress.listProgressEvaluations(queue, other)).data.length,
      0,
    );
    await assert.rejects(
      progress.reviewProgressEvaluation(
        "evaluation",
        "return",
        { comment: "Fix", officialStatus: "CONCLUDED" },
        other,
      ),
    );
    await progress.reviewProgressEvaluation(
      "evaluation",
      "return",
      { comment: "Fix", officialStatus: "CONCLUDED" },
      auditor,
    );
    assert.equal(f.evaluation.reviewStatus, "RETURNED");
    const oldInstance = f.evaluation.workflowInstanceId;
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    assert.notEqual(f.evaluation.workflowInstanceId, oldInstance);
    assert.equal(
      (await progress.listProgressEvaluations(queue, auditor)).data.length,
      1,
    );
    assert.equal(
      (await progress.listProgressEvaluations(queue, other)).data.length,
      0,
    );
  } finally {
    mock.restoreAll();
  }
});

test("active correction task is reused; missing task cannot mark finalization sent", async () => {
  const f = fixture(true);
  try {
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    const originalInstance = f.evaluation.workflowInstanceId;
    await progress.reviewProgressEvaluation(
      "evaluation",
      "return",
      { comment: "Fix", officialStatus: "CONCLUDED" },
      auditor,
    );
    assert.equal(f.evaluation.workflowInstanceId, originalInstance);
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    assert.equal(f.tables.workflowInstance!.length, 1);
    f.evaluation.reviewStatus = "RETURNED";
    f.tables.workflowTask!.length = 0;
    await assert.rejects(
      progress.sendProgressEvaluationToAudit("evaluation", owner),
      /tarea de revisión activa/,
    );
    assert.equal(f.evaluation.reviewStatus, "RETURNED");
  } finally {
    mock.restoreAll();
  }
});

test("ordinary advances and historical extensions retain the direct review circuit", async () => {
  const f = fixture();
  try {
    f.evaluation.type = "ADVANCE";
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    assert.equal(
      (await progress.listProgressEvaluations(queue, auditor)).data.length,
      1,
    );
    assert.equal(f.tables.workflowInstance!.length, 0);
    const draft = await extensions.createForActionPlan(
      "plan",
      extensionInput,
      owner,
    );
    f.tables.deadlineExtensionRequest![0]!.createdAt = new Date("2028-01-01");
    await extensions.submit(draft.id, owner);
    const inbox = await extensions.list(queue, manager);
    assert.equal(inbox.data[0]?.id, draft.id);
    assert.equal(inbox.data[0]?.reviewTask?.id, null);
    await extensions.managerReview(draft.id, true, { comment: null }, manager);
    assert.equal(f.tables.workflowInstance!.length, 0);
  } finally {
    mock.restoreAll();
  }
});

test("republishing preserves pinned tasks; failed restart keeps the old link and never falls back to legacy", async () => {
  const f = fixture();
  try {
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    f.evaluation.reviewStatus = "RETURNED";
    const original = f.evaluation.workflowInstanceId;
    for (const definition of f.tables.workflowDefinition!)
      row(definition.activeVersion).publishedAt = new Date("2031-01-01");
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    assert.equal(f.evaluation.workflowInstanceId, original);
    assert.equal(f.tables.workflowInstance!.length, 1);
    await progress.reviewProgressEvaluation(
      "evaluation",
      "return",
      { comment: "Fix", officialStatus: "CONCLUDED" },
      auditor,
    );
    f.setFailStart(true);
    await assert.rejects(
      progress.sendProgressEvaluationToAudit("evaluation", owner),
      /Assignment unavailable/,
    );
    assert.equal(f.evaluation.workflowInstanceId, original);
    assert.equal(f.evaluation.reviewStatus, "RETURNED");
    f.setFailStart(false);
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    assert.notEqual(f.evaluation.workflowInstanceId, original);
    assert.equal(
      (await progress.listProgressEvaluations(queue, auditor)).data.length,
      1,
    );
  } finally {
    mock.restoreAll();
  }
});

test("a previously linked finalization needs a published workflow for restarting", async () => {
  const f = fixture();
  try {
    await progress.sendProgressEvaluationToAudit("evaluation", owner);
    await progress.reviewProgressEvaluation(
      "evaluation",
      "return",
      { comment: "Fix", officialStatus: "CONCLUDED" },
      auditor,
    );
    const original = f.evaluation.workflowInstanceId;
    f.tables.workflowDefinition!.length = 0;
    await assert.rejects(
      progress.sendProgressEvaluationToAudit("evaluation", owner),
      /versión publicada/,
    );
    assert.equal(f.evaluation.workflowInstanceId, original);
    assert.equal(f.evaluation.reviewStatus, "RETURNED");
  } finally {
    mock.restoreAll();
  }
});

test("failed workflow start without a review task leaves the request draft and retryable", async () => {
  const f = fixture();
  try {
    const draft = await extensions.createForActionPlan(
      "plan",
      extensionInput,
      owner,
    );
    mock.method(workflowInstanceService, "startInstance", async () => {
      f.tables.workflowInstance!.push({ id: "broken", status: "FAILED" });
      return { id: "broken", status: "FAILED" } as never;
    });
    await assert.rejects(
      extensions.submit(draft.id, owner),
      /tarea de revisión activa/,
    );
    assert.equal(f.tables.deadlineExtensionRequest![0]!.status, "DRAFT");
    assert.equal(
      f.tables.deadlineExtensionRequest![0]!.workflowInstanceId,
      null,
    );
    assert.equal(f.tables.workflowInstance![0]!.status, "CANCELLED");
  } finally {
    mock.restoreAll();
  }
});

test("date and classification limits, and changed plan ownership, still apply", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      extensions.createForActionPlan(
        "plan",
        { ...extensionInput, classificationCode: "unknown" },
        owner,
      ),
      /clasificación/,
    );
    await assert.rejects(
      extensions.createForActionPlan(
        "plan",
        { ...extensionInput, proposedDueDate: date },
        owner,
      ),
      /after the current/,
    );
    await assert.rejects(
      extensions.createForActionPlan(
        "plan",
        { ...extensionInput, proposedDueDate: new Date("2030-03-01") },
        owner,
      ),
      /máximo permitido/,
    );
    const draft = await extensions.createForActionPlan(
      "plan",
      extensionInput,
      owner,
    );
    f.plan.responsibleUserId = "other";
    f.plan.responsibleUser = user("other");
    await assert.rejects(
      extensions.submit(draft.id, { ...owner, dataScope: "ALL" }),
      /planes asignados/,
    );
    await assert.rejects(
      extensions.update(
        draft.id,
        { reason: "Changed" },
        { ...owner, dataScope: "ALL" },
      ),
      /planes asignados/,
    );
  } finally {
    mock.restoreAll();
  }
});
