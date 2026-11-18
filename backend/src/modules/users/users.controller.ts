import type { Request, Response } from "express";
import { getRouteParam } from "../../utils/routeParam.js";
import {
  createUserSchema,
  updateUserSchema,
  usersQuerySchema,
} from "./users.schemas.js";
import * as service from "./users.service.js";

export const listUsersController = async (req: Request, res: Response) => {
  const query = usersQuerySchema.parse(req.query);

  res.json({
    ok: true,
    ...(await service.listUsers(query)),
  });
};

export const getUserController = async (req: Request, res: Response) => {
  const id = getRouteParam(req, "id");

  res.json({
    ok: true,
    user: await service.getUser(id),
  });
};

export const createUserController = async (req: Request, res: Response) => {
  const input = createUserSchema.parse(req.body);

  res.status(201).json({
    ok: true,
    user: await service.createUser(input, req.auth?.role),
  });
};

export const updateUserController = async (req: Request, res: Response) => {
  const id = getRouteParam(req, "id");
  const input = updateUserSchema.parse(req.body);

  res.json({
    ok: true,
    user: await service.updateUser(id, input, req.auth?.role),
  });
};

export const deleteUserController = async (req: Request, res: Response) => {
  const id = getRouteParam(req, "id");

  res.json({
    ok: true,
    ...(await service.deleteUser(id, req.auth!.sub, req.auth?.role)),
  });
};
