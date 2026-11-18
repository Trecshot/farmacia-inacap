import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

type RateBucket = {
  count: number;
  resetAt: number;
};

export const createRateLimiter = (options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}): RequestHandler => {
  const buckets = new Map<string, RateBucket>();

  return (req, res, next) => {
    if (env.NODE_ENV === "test") {
      next();
      return;
    }

    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
          buckets.delete(key);
        }
      }
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    existing.count += 1;

    if (existing.count > options.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      next(
        new ApiError(
          429,
          options.message ??
            "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
        ),
      );
      return;
    }

    next();
  };
};
