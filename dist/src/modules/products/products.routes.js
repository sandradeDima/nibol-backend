import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { productsController } from "./products.controller.js";
import { PRODUCTS_PERMISSIONS } from "./products.permissions.js";
export const productsRouter = Router();
productsRouter.get("/products", requirePermission(PRODUCTS_PERMISSIONS.view), asyncHandler(productsController.list));
productsRouter.get("/products/:id", requirePermission(PRODUCTS_PERMISSIONS.view), asyncHandler(productsController.getById));
productsRouter.post("/products", requirePermission(PRODUCTS_PERMISSIONS.create), asyncHandler(productsController.create));
productsRouter.put("/products/:id", requirePermission(PRODUCTS_PERMISSIONS.edit), asyncHandler(productsController.update));
productsRouter.delete("/products/:id", requirePermission(PRODUCTS_PERMISSIONS.delete), asyncHandler(productsController.remove));
//# sourceMappingURL=products.routes.js.map