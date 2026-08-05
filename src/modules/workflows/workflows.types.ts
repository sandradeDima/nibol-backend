import type { AuthorizationSummary } from "../../services/authorization-service.js";
import type { LogActorContext } from "../../services/logging-utils.js";
import type {
  CreateDraftVersionInput,
  CreateWorkflowInput,
  DuplicateWorkflowInput,
  ListWorkflowsQuery,
  UpdateWorkflowMetadataInput,
  WorkflowActivityQuery,
  WorkflowDesignerSaveInput,
  WorkflowNodeConfiguration,
  WorkflowPublishInput,
  WorkflowSimulationInput,
  WorkflowVersionListQuery,
} from "./workflows.validators.js";
import type { WorkflowSimulationResult } from "./workflow-simulator.js";
import type {
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from "./workflow-validator.js";

export type WorkflowActorContext = AuthorizationSummary & LogActorContext;

export type WorkflowVersionListItem = {
  changeDescription: string | null;
  createdAt: Date;
  createdBy: {
    email: string;
    id: string;
    name: string;
  };
  definition: {
    activeVersion: {
      id: string;
      status: string;
      versionNumber: number;
    } | null;
    id: string;
    name: string;
    processType: string;
    status: string;
  };
  id: string;
  publishedAt: Date | null;
  publishedBy: {
    email: string;
    id: string;
    name: string;
  } | null;
  status: string;
  versionNumber: number;
  _count: {
    instances: number;
  };
};

export type WorkflowDefinitionListItem = {
  activeVersion: {
    id: string;
    publishedAt: Date | null;
    status: string;
    versionNumber: number;
  } | null;
  archivedAt: Date | null;
  createdAt: Date;
  createdBy: {
    email: string;
    id: string;
    name: string;
  };
  description: string | null;
  id: string;
  name: string;
  processType: string;
  status: string;
  updatedAt: Date;
  latestVersion: Omit<WorkflowVersionListItem, "definition" | "_count"> | null;
  _count: {
    instances: number;
    versions: number;
  };
};

export type {
  CreateDraftVersionInput,
  CreateWorkflowInput,
  DuplicateWorkflowInput,
  ListWorkflowsQuery,
  UpdateWorkflowMetadataInput,
  WorkflowActivityQuery,
  WorkflowPublishInput,
  WorkflowSimulationInput,
  WorkflowVersionListQuery,
};

export type WorkflowDesignerOptions = {
  areas: Array<{
    id: string;
    name: string;
    managerUser: {
      email: string;
      id: string;
      name: string;
    } | null;
  }>;
  assignmentStrategies: Array<{
    key: string;
    label: string;
  }>;
  catalogs: {
    observationStatuses: Array<{ key: string; name: string }>;
    riskLevels: Array<{ key: string; name: string }>;
  };
  conditionFields: Array<{ key: string; label: string }>;
  conditionOperators: Array<{
    key: string;
    label: string;
    requiresValue: boolean;
  }>;
  notificationTemplates: Array<{ key: string; name: string }>;
  roles: Array<{ description: string | null; id: string; name: string }>;
  users: Array<{ email: string; id: string; name: string }>;
};

export type WorkflowDesignerResult = {
  canEdit: boolean;
  canValidate: boolean;
  definition: {
    id: string;
    name: string;
    processType: string;
    status: string;
  };
  lastSavedAt: Date | null;
  nodes: Array<{
    assignmentStrategy: string | null;
    configurationJson: WorkflowNodeConfiguration;
    createdAt: Date;
    description: string | null;
    id: string;
    name: string;
    nodeKey: string;
    positionX: number;
    positionY: number;
    type: string;
    updatedAt: Date;
  }>;
  transitions: Array<{
    conditionGroup: unknown | null;
    id: string;
    label: string | null;
    priority: number;
    sourceNode: { id: string; nodeKey: string };
    targetNode: { id: string; nodeKey: string };
    transitionType: string | null;
  }>;
  version: {
    changeDescription: string | null;
    id: string;
    publishedAt: Date | null;
    status: string;
    versionNumber: number;
  };
};

export type WorkflowDesignerValidationIssue = {
  code: string;
  message: string;
  nodeId?: string;
  nodeKey?: string;
  severity: "error" | "warning";
};

export type WorkflowDesignerValidationResult = {
  errors: WorkflowDesignerValidationIssue[];
  isValid: boolean;
  warnings: WorkflowDesignerValidationIssue[];
};

export type {
  WorkflowSimulationResult,
  WorkflowValidationIssue,
  WorkflowValidationResult,
};

export type { WorkflowDesignerSaveInput };
