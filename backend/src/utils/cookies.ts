import type { Request, Response } from "express";
import { env } from "../config/env.js";

export const ACCESS_COOKIE_NAME = "farmacia_access_token";
export const REFRESH_COOKIE_NAME = "farmacia_refresh_token";

export const getCookie = (req: Request, name: string): string | null => {
  const rawHeader = req.headers.cookie;
  if (!rawHeader) return null;

  for (const part of rawHeader.split(";")) {
    const [rawKey, ...rawVal] = part.trim().split("=");
    if (rawKey === name) {
      const value = rawVal.join("=");
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return null;
};

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  const isProd = env.NODE_ENV === "production";

  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api",
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
};

export const clearAuthCookies = (res: Response) => {
  const isProd = env.NODE_ENV === "production";

  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api",
  });

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/auth",
  });
};
