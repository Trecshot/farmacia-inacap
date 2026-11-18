import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { requirePermission, requireRole } from "../../middlewares/authorize.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createPermissionController,
  createRoleController,
  deletePermissionController,
  deleteRoleController,
  getRoleController,
  listPermissionsController,
  listRolesController,
  updatePermissionController,
  updateRoleController,
} from "./access.controller.js";

export const accessRouter = Router();

accessRouter.use(authenticate);

accessRouter.get("/roles", requirePermission("users.read"), asyncHandler(listRolesController));
accessRouter.get("/roles/:id", requirePermission("users.read"), asyncHandler(getRoleController));
accessRouter.post("/roles", requireRole("ADMIN"), asyncHandler(createRoleController));
accessRouter.patch("/roles/:id", requireRole("ADMIN"), asyncHandler(updateRoleController));
accessRouter.delete("/roles/:id", requireRole("ADMIN"), asyncHandler(deleteRoleController));

accessRouter.get("/permissions", requirePermission("users.read"), asyncHandler(listPermissionsController));
accessRouter.post("/permissions", requireRole("ADMIN"), asyncHandler(createPermissionController));
accessRouter.patch("/permissions/:id", requireRole("ADMIN"), asyncHandler(updatePermissionController));
accessRouter.delete("/permissions/:id", requireRole("ADMIN"), asyncHandler(deletePermissionController));
