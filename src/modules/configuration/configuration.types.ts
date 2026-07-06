import type { CatalogType, SystemParameterValueType } from "./configuration.validators.js";

export type ConfigurationUserSummary = {
  email: string;
  id: string;
  name: string;
};

export type AreaRecord = {
  active: boolean;
  code: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  managerUser: ConfigurationUserSummary | null;
  name: string;
  updatedAt: string;
};

export type RiskLevelRecord = {
  active: boolean;
  colorToken: string | null;
  createdAt: string;
  defaultDeadlineDays: number | null;
  description: string | null;
  id: string;
  key: string;
  name: string;
  severityOrder: number;
  updatedAt: string;
};

export type ObservationStatusRecord = {
  active: boolean;
  countsAsOverdue: boolean;
  createdAt: string;
  description: string | null;
  id: string;
  isFinal: boolean;
  isInitial: boolean;
  key: string;
  name: string;
  sortOrder: number;
  updatedAt: string;
};

export type SystemParameterRecord = {
  active: boolean;
  createdAt: string;
  description: string | null;
  editable: boolean;
  group: string;
  id: string;
  key: string;
  name: string;
  updatedAt: string;
  value: string;
  valueType: SystemParameterValueType;
};

export type CatalogRecord = {
  active: boolean;
  createdAt: string;
  description: string | null;
  id: string;
  key: string | null;
  name: string;
  sortOrder: number;
  type: CatalogType;
  updatedAt: string;
};

export type ConfigurationCatalogGroups = Record<CatalogType, CatalogRecord[]>;

export type ConfigurationBootstrap = {
  areas: Array<Pick<AreaRecord, "code" | "id" | "managerUser" | "name">>;
  catalogs: ConfigurationCatalogGroups;
  riskLevels: Array<
    Pick<
      RiskLevelRecord,
      "colorToken" | "defaultDeadlineDays" | "id" | "key" | "name" | "severityOrder"
    >
  >;
  statuses: Array<
    Pick<
      ObservationStatusRecord,
      | "countsAsOverdue"
      | "id"
      | "isFinal"
      | "isInitial"
      | "key"
      | "name"
      | "sortOrder"
    >
  >;
  users: ConfigurationUserSummary[];
};

export type PaginatedResult<TRecord> = {
  data: TRecord[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
};
