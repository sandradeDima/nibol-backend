export const ADMIN_ROLE_CODE = "SYSTEM_ADMIN";

export type RoleCode =
  | typeof ADMIN_ROLE_CODE
  | "AUDITOR"
  | "AUDIT_CHIEF"
  | "PROCESS_OWNER"
  | "AREA_RESPONSIBLE"
  | "EXECUTOR";
