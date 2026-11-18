import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.js";
import { createRateLimiter } from "../../middlewares/rateLimit.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  loginController,
  logoutController,
  meController,
  refreshController,
} from "./auth.controller.js";

export const authRouter = Router();

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 25,
  message:
    "Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos.",
});

const refreshRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 60,
  message:
    "Demasiadas solicitudes de renovación de sesión. Intenta nuevamente más tarde.",
});

authRouter.post("/login", loginRateLimiter, asyncHandler(loginController));
authRouter.post("/refresh", refreshRateLimiter, asyncHandler(refreshController));
authRouter.post("/logout", asyncHandler(logoutController));
authRouter.get("/me", authenticate, asyncHandler(meController));
