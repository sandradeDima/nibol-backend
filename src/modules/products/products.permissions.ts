import { PRODUCTS_PERMISSION_RESOURCE } from "./products.constants.js";

export const PRODUCTS_PERMISSIONS = {
  create: `${PRODUCTS_PERMISSION_RESOURCE}.create`,
  delete: `${PRODUCTS_PERMISSION_RESOURCE}.delete`,
  edit: `${PRODUCTS_PERMISSION_RESOURCE}.edit`,
  view: `${PRODUCTS_PERMISSION_RESOURCE}.view`,
} as const;

export const PRODUCTS_PERMISSION_NAMES = Object.values(
  PRODUCTS_PERMISSIONS,
);
