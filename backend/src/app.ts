import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { auditRequest } from "./middlewares/auditRequest.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { notFound } from "./middlewares/notFound.js";
import { apiRouter } from "./routes/index.js";
import { ApiError } from "./utils/ApiError.js";

export const app = express();

app.disable("x-powered-by");

app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new ApiError(403, `Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

if (env.NODE_ENV !== "test") {
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}

/*
 * Se instala antes del router. El listener "finish" se ejecuta después de que
 * authenticate haya agregado req.auth, por lo que las mutaciones quedan
 * trazadas sin almacenar cuerpos sensibles de las solicitudes.
 */
app.use(auditRequest);

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "Sistema de Farmacia Privada Comercial",
    api: "/api",
    health: "/api/health",
  });
});

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);
