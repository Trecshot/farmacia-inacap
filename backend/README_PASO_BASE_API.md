import type { ErrorRequestHandler } from "express";
import { ApiError } from "../utils/ApiError.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      ok: false,
      error: {
        message: error.message,
        details: error.details ?? null,
      },
    });
    return;
  }

  console.error(error);

  res.status(500).json({
    ok: false,
    error: {
      message: "Error interno del servidor",
    },
  });
};
