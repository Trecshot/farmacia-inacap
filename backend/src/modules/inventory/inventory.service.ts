import type { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { getPagination, paginationMeta } from "../../utils/pagination.js";
import type {
  adjustmentSchema,
  alertsQuerySchema,
  batchesQuerySchema,
  fefoQuerySchema,
  scanAlertsSchema,
  stockQuerySchema,
  transferSchema,
} from "./inventory.schemas.js";

type StockQuery = z.infer<typeof stockQuerySchema>;
type BatchesQuery = z.infer<typeof batchesQuerySchema>;
type TransferInput = z.infer<typeof transferSchema>;
type AdjustmentInput = z.infer<typeof adjustmentSchema>;
type FefoQuery = z.infer<typeof fefoQuerySchema>;
type ScanAlerts = z.infer<typeof scanAlertsSchema>;
type AlertsQuery = z.infer<typeof alertsQuerySchema>;

export const listLocations = async () => {
  return prisma.inventoryLocation.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
};

export const listStock = async (query: StockQuery) => {
  const { page, limit, search, productId, locationId, expiringDays, includeExpired } = query;
  const { skip, take } = getPagination(page, limit);

  const expirationLimit = expiringDays
    ? new Date(Date.now() + expiringDays * 24 * 60 * 60 * 1000)
    : undefined;

  const now = new Date();
  const expirationFilter =
    includeExpired === "true"
      ? (expirationLimit ? { lte: expirationLimit } : undefined)
      : (expirationLimit
          ? { gt: now, lte: expirationLimit }
          : { gt: now });

  const where = {
    ...(locationId ? { locationId } : {}),
    location: {
      isActive: true,
      type: { not: "QUARANTINE" as const },
    },
    batch: {
      isBlocked: false,
      ...(productId ? { productId } : {}),
      ...(expirationFilter ? { expirationDate: expirationFilter } : {}),
      ...(search
        ? {
            OR: [
              { batchNumber: { contains: search, mode: "insensitive" as const } },
              {
                product: {
                  name: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                product: {
                  sku: { contains: search, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    },
  };

  const [items, total] = await prisma.$transaction([
    prisma.inventoryStock.findMany({
      where,
      include: {
        location: true,
        batch: {
          include: {
            product: {
              include: {
                category: true,
                laboratory: true,
              },
            },
          },
        },
      },
      skip,
      take,
      orderBy: {
        batch: {
          expirationDate: "asc",
        },
      },
    }),
    prisma.inventoryStock.count({ where }),
  ]);

  return { items, meta: paginationMeta(page, limit, total) };
};

export const listBatches = async (query: BatchesQuery) => {
  const { page, limit, search, productId, blocked } = query;
  const { skip, take } = getPagination(page, limit);

  const where = {
    ...(productId ? { productId } : {}),
    ...(blocked ? { isBlocked: blocked === "true" } : {}),
    ...(search
      ? {
          OR: [
            { batchNumber: { contains: search, mode: "insensitive" as const } },
            {
              product: {
                name: { contains: search, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.batch.findMany({
      where,
      include: {
        product: true,
        supplier: true,
        stocks: { include: { location: true } },
      },
      skip,
      take,
      orderBy: { expirationDate: "asc" },
    }),
    prisma.batch.count({ where }),
  ]);

  return { items, meta: paginationMeta(page, limit, total) };
};

export const transferStock = async (userId: string, input: TransferInput) => {
  if (input.originLocationId === input.destinationLocationId) {
    throw new ApiError(400, "Origen y destino deben ser diferentes");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      include: { product: true },
    });

    if (!batch) throw new ApiError(404, "Lote no encontrado");
    if (batch.isBlocked) throw new ApiError(409, "El lote está bloqueado");
    if (batch.expirationDate <= new Date()) {
      throw new ApiError(409, "No se puede transferir un lote vencido");
    }

    const [origin, destination, originStock] = await Promise.all([
      tx.inventoryLocation.findUnique({
        where: { id: input.originLocationId },
      }),
      tx.inventoryLocation.findUnique({
        where: { id: input.destinationLocationId },
      }),
      tx.inventoryStock.findUnique({
        where: {
          batchId_locationId: {
            batchId: input.batchId,
            locationId: input.originLocationId,
          },
        },
      }),
    ]);

    if (!origin?.isActive || !destination?.isActive) {
      throw new ApiError(400, "Ubicación de origen o destino inválida/inactiva");
    }

    const reserved = originStock?.reservedQuantity ?? 0;
    const available = (originStock?.quantity ?? 0) - reserved;
    if (available < input.quantity) {
      throw new ApiError(409, "Stock disponible insuficiente para la transferencia");
    }

    const updatedOrigin = await tx.inventoryStock.updateMany({
      where: {
        batchId: input.batchId,
        locationId: input.originLocationId,
        quantity: { gte: input.quantity + reserved },
      },
      data: { quantity: { decrement: input.quantity } },
    });

    if (updatedOrigin.count === 0) {
      throw new ApiError(409, "Stock disponible insuficiente para la transferencia");
    }

    await tx.inventoryStock.upsert({
      where: {
        batchId_locationId: {
          batchId: input.batchId,
          locationId: input.destinationLocationId,
        },
      },
      update: { quantity: { increment: input.quantity } },
      create: {
        batchId: input.batchId,
        locationId: input.destinationLocationId,
        quantity: input.quantity,
        reservedQuantity: 0,
      },
    });

    return tx.inventoryMovement.create({
      data: {
        type: "TRANSFER",
        productId: batch.productId,
        batchId: input.batchId,
        originLocationId: input.originLocationId,
        destinationLocationId: input.destinationLocationId,
        quantity: input.quantity,
        reason: input.reason ?? null,
        userId,
      },
      include: {
        product: true,
        batch: true,
        originLocation: true,
        destinationLocation: true,
      },
    });
  });
};

export const adjustStock = async (userId: string, input: AdjustmentInput) => {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
    });
    if (!batch) throw new ApiError(404, "Lote no encontrado");

    const location = await tx.inventoryLocation.findUnique({
      where: { id: input.locationId },
    });
    if (!location?.isActive) throw new ApiError(400, "Ubicación inválida o inactiva");

    const stock = await tx.inventoryStock.findUnique({
      where: {
        batchId_locationId: {
          batchId: input.batchId,
          locationId: input.locationId,
        },
      },
    });

    const current = stock?.quantity ?? 0;
    const reserved = stock?.reservedQuantity ?? 0;
    const next = current + input.quantityDelta;

    if (next < 0) {
      throw new ApiError(409, "El ajuste dejaría el stock en negativo");
    }

    if (next < reserved) {
      throw new ApiError(
        409,
        "El ajuste dejaría el stock por debajo de la cantidad reservada",
      );
    }

    if (input.quantityDelta < 0) {
      const absDelta = Math.abs(input.quantityDelta);
      const updated = await tx.inventoryStock.updateMany({
        where: {
          batchId: input.batchId,
          locationId: input.locationId,
          quantity: { gte: absDelta + reserved },
        },
        data: {
          quantity: { decrement: absDelta },
        },
      });

      if (updated.count === 0) {
        throw new ApiError(
          409,
          "Conflicto de concurrencia: stock insuficiente o reservado para aplicar el ajuste",
        );
      }
    } else {
      await tx.inventoryStock.upsert({
        where: {
          batchId_locationId: {
            batchId: input.batchId,
            locationId: input.locationId,
          },
        },
        update: { quantity: { increment: input.quantityDelta } },
        create: {
          batchId: input.batchId,
          locationId: input.locationId,
          quantity: input.quantityDelta,
          reservedQuantity: 0,
        },
      });
    }

    return tx.inventoryMovement.create({
      data: {
        type: input.quantityDelta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        productId: batch.productId,
        batchId: input.batchId,
        ...(input.quantityDelta > 0
          ? { destinationLocationId: input.locationId }
          : { originLocationId: input.locationId }),
        quantity: Math.abs(input.quantityDelta),
        reason: input.reason,
        userId,
      },
      include: {
        product: true,
        batch: true,
        originLocation: true,
        destinationLocation: true,
      },
    });
  });
};

export const getFefoAllocation = async (
  productId: string,
  query: FefoQuery,
) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) throw new ApiError(404, "Producto no encontrado");

  const stocks = await prisma.inventoryStock.findMany({
    where: {
      ...(query.locationId ? { locationId: query.locationId } : {}),
      quantity: { gt: 0 },
      batch: {
        productId,
        isBlocked: false,
        expirationDate: { gt: new Date() },
      },
      location: { isActive: true, type: { not: "QUARANTINE" } },
    },
    include: {
      batch: true,
      location: true,
    },
    orderBy: {
      batch: {
        expirationDate: "asc",
      },
    },
  });

  let remaining = query.quantity;
  const allocations: Array<{
    stockId: string;
    batchId: string;
    batchNumber: string;
    expirationDate: Date;
    locationId: string;
    locationName: string;
    quantity: number;
  }> = [];

  for (const stock of stocks) {
    if (remaining <= 0) break;

    const available = Math.max(0, stock.quantity - stock.reservedQuantity);
    if (available <= 0) continue;

    const quantity = Math.min(available, remaining);

    allocations.push({
      stockId: stock.id,
      batchId: stock.batchId,
      batchNumber: stock.batch.batchNumber,
      expirationDate: stock.batch.expirationDate,
      locationId: stock.locationId,
      locationName: stock.location.name,
      quantity,
    });

    remaining -= quantity;
  }

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
    },
    requestedQuantity: query.quantity,
    allocatedQuantity: query.quantity - remaining,
    shortageQuantity: remaining,
    sufficient: remaining === 0,
    allocations,
  };
};

type AlertTypeHandled = "LOW_STOCK" | "OUT_OF_STOCK" | "EXPIRING_SOON" | "EXPIRED";

const buildAlertLookupKey = (
  type: AlertTypeHandled,
  productId: string,
  batchId?: string,
) => `${type}:${productId}:${batchId ?? ""}`;

const upsertAlertWithMap = async (
  alertMap: Map<string, { id: string }> | null,
  type: AlertTypeHandled,
  title: string,
  message: string,
  productId: string,
  batchId?: string,
) => {
  const key = buildAlertLookupKey(type, productId, batchId);
  const existing = alertMap
    ? (alertMap.get(key) ?? null)
    : await prisma.alert.findFirst({
        where: {
          type,
          status: { in: ["PENDING", "READ"] },
          productId,
          ...(batchId ? { batchId } : { batchId: null }),
        },
      });

  if (existing) {
    return prisma.alert.update({
      where: { id: existing.id },
      data: { title, message },
    });
  }

  const created = await prisma.alert.create({
    data: {
      type,
      status: "PENDING",
      title,
      message,
      productId,
      batchId: batchId ?? null,
    },
  });

  if (alertMap && created?.id) {
    alertMap.set(key, { id: created.id });
  }

  return created;
};

export const scanAlerts = async (input: ScanAlerts) => {
  const now = new Date();
  const expirationLimit = new Date(
    Date.now() + input.expiringDays * 24 * 60 * 60 * 1000,
  );

  const canBatchPreload = typeof prisma.alert.findMany === "function";

  const [products, batches, activeAlerts] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        batches: {
          where: {
            isBlocked: false,
            expirationDate: { gt: now },
          },
          include: {
            stocks: {
              where: {
                location: {
                  isActive: true,
                  type: { not: "QUARANTINE" },
                },
              },
            },
          },
        },
      },
    }),
    prisma.batch.findMany({
      where: {
        isBlocked: false,
        expirationDate: { lte: expirationLimit },
        stocks: {
          some: {
            quantity: { gt: 0 },
            location: {
              isActive: true,
              type: { not: "QUARANTINE" },
            },
          },
        },
      },
      include: { product: true },
    }),
    canBatchPreload
      ? prisma.alert.findMany({
          where: {
            status: { in: ["PENDING", "READ"] },
            type: {
              in: ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING_SOON", "EXPIRED"],
            },
          },
          select: {
            id: true,
            type: true,
            productId: true,
            batchId: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const alertMap = activeAlerts
    ? new Map(
        activeAlerts
          .filter((a): a is typeof a & { productId: string } =>
            Boolean(a.productId),
          )
          .map((a) => [
            buildAlertLookupKey(
              a.type as AlertTypeHandled,
              a.productId,
              a.batchId ?? undefined,
            ),
            { id: a.id },
          ]),
      )
    : null;

  let createdOrUpdated = 0;
  const resolveLowStockProductIds: string[] = [];
  const resolveOutOfStockProductIds: string[] = [];
  const resolveBothStockAlertsProductIds: string[] = [];

  for (const product of products) {
    const totalStock = product.batches.reduce(
      (sum, batch) =>
        sum +
        batch.stocks.reduce(
          (batchSum, stock) =>
            batchSum + Math.max(0, stock.quantity - stock.reservedQuantity),
          0,
        ),
      0,
    );

    if (totalStock <= 0) {
      await upsertAlertWithMap(
        alertMap,
        "OUT_OF_STOCK",
        `Sin stock: ${product.name}`,
        `El producto ${product.name} no tiene stock disponible.`,
        product.id,
      );
      resolveLowStockProductIds.push(product.id);
      createdOrUpdated++;
    } else if (totalStock <= product.minimumStock) {
      await upsertAlertWithMap(
        alertMap,
        "LOW_STOCK",
        `Stock bajo: ${product.name}`,
        `Stock disponible ${totalStock}; mínimo configurado ${product.minimumStock}.`,
        product.id,
      );
      resolveOutOfStockProductIds.push(product.id);
      createdOrUpdated++;
    } else {
      resolveBothStockAlertsProductIds.push(product.id);
    }
  }

  if (resolveLowStockProductIds.length > 0) {
    await prisma.alert.updateMany({
      where: {
        productId: { in: resolveLowStockProductIds },
        type: "LOW_STOCK",
        status: { in: ["PENDING", "READ"] },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
      },
    });
  }

  if (resolveOutOfStockProductIds.length > 0) {
    await prisma.alert.updateMany({
      where: {
        productId: { in: resolveOutOfStockProductIds },
        type: "OUT_OF_STOCK",
        status: { in: ["PENDING", "READ"] },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
      },
    });
  }

  if (resolveBothStockAlertsProductIds.length > 0) {
    await prisma.alert.updateMany({
      where: {
        productId: { in: resolveBothStockAlertsProductIds },
        type: { in: ["OUT_OF_STOCK", "LOW_STOCK"] },
        status: { in: ["PENDING", "READ"] },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
      },
    });
  }

  for (const batch of batches) {
    const expired = batch.expirationDate <= now;

    await upsertAlertWithMap(
      alertMap,
      expired ? "EXPIRED" : "EXPIRING_SOON",
      expired
        ? `Lote vencido: ${batch.product.name}`
        : `Lote próximo a vencer: ${batch.product.name}`,
      `Lote ${batch.batchNumber}, vencimiento ${batch.expirationDate.toISOString().slice(0, 10)}.`,
      batch.productId,
      batch.id,
    );

    createdOrUpdated++;
  }

  return { createdOrUpdated };
};

export const listAlerts = async (query: AlertsQuery) => {
  return prisma.alert.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
    include: {
      product: true,
      batch: true,
      resolvedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
    },
    take: query.limit ?? 100,
    orderBy: { createdAt: "desc" },
  });
};

export const resolveAlert = async (id: string, userId: string) => {
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) throw new ApiError(404, "Alerta no encontrada");

  return prisma.alert.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedById: userId,
      resolvedAt: new Date(),
    },
  });
};
