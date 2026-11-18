import type { RequestHandler } from "express";

import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ACCESS_COOKIE_NAME, getCookie } from "../utils/cookies.js";
import { authSessionUserSelect } from "../utils/selects.js";
import { verifyAccessToken } from "../utils/token.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : null;
  const cookieToken = getCookie(req, ACCESS_COOKIE_NAME);
  const token = bearerToken || cookieToken;

  if (!token) {
    next(new ApiError(401, "Token de acceso requerido"));
    return;
  }

  try {
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: authSessionUserSelect,
    });

    if (!user) {
      next(new ApiError(401, "Usuario no encontrado"));
      return;
    }

    if (user.status !== "ACTIVE" || !user.role.isActive) {
      next(new ApiError(403, "Usuario o rol inactivo o bloqueado"));
      return;
    }

    req.auth = {
      sub: user.id,
      username: user.username,
      role: user.role.code,
      permissions: user.role.permissions
        .filter((item) => item.permission.isActive)
        .map((item) => item.permission.code),
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(new ApiError(401, "Token de acceso inválido o expirado"));
  }
};
