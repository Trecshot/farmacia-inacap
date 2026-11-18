import type { Request, Response } from "express";

import { ApiError } from "../../utils/ApiError.js";
import {
  clearAuthCookies,
  getCookie,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
} from "../../utils/cookies.js";
import {
  loginSchema,
  optionalRefreshSchema,
  refreshSchema,
} from "./auth.schemas.js";
import * as authService from "./auth.service.js";

const extractRefreshToken = (req: Request, required: boolean): string | null => {
  const cookieToken = getCookie(req, REFRESH_COOKIE_NAME);
  const parsedBody = optionalRefreshSchema.safeParse(req.body);
  const bodyToken = parsedBody.success
    ? (parsedBody.data?.refreshToken ?? null)
    : null;

  const candidate = bodyToken || cookieToken;
  if (!candidate) {
    if (required) {
      throw new ApiError(401, "Refresh token requerido");
    }
    return null;
  }

  return refreshSchema.parse({ refreshToken: candidate }).refreshToken;
};

export const loginController = async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);

  setAuthCookies(res, result.accessToken, result.refreshToken);

  return res.status(200).json({
    ok: true,
    ...result,
  });
};

export const refreshController = async (req: Request, res: Response) => {
  const refreshToken = extractRefreshToken(req, true)!;
  const result = await authService.refresh(refreshToken);

  setAuthCookies(res, result.accessToken, result.refreshToken);

  return res.status(200).json({
    ok: true,
    ...result,
  });
};

export const logoutController = async (req: Request, res: Response) => {
  const refreshToken = extractRefreshToken(req, false);
  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  clearAuthCookies(res);

  return res.status(200).json({
    ok: true,
    message: "Sesión cerrada correctamente",
  });
};

export const meController = async (req: Request, res: Response) => {
  const user = await authService.getMe(req.auth!.sub);

  return res.status(200).json({
    ok: true,
    user,
  });
};
