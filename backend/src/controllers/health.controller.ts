import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";

export const healthCheck = async (_req: Request, res: Response) => {
  try {
    const databaseResult = await prisma.$queryRaw<
      Array<{
        server_time: Date;
      }>
    >`
      SELECT NOW() AS server_time
    `;

    const database = databaseResult[0];

    return res.status(200).json({
      ok: true,
      service: "farmacia-inacap-api",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        serverTime: database?.server_time ?? null,
      },
    });
  } catch {
    return res.status(503).json({
      ok: false,
      service: "farmacia-inacap-api",
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: "No fue posible conectar con la base de datos",
      },
    });
  }
};
