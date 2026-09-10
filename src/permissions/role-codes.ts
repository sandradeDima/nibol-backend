export const ADMIN_ROLE_CODE = "SYSTEM_ADMIN";

export type RoleCode =
  | typeof ADMIN_ROLE_CODE
  | "AUDITOR"
  | "PROCESS_OWNER"
  | "AREA_RESPONSIBLE"
  | "EXECUTOR";
