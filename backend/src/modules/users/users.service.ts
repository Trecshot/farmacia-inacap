import type { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { getPagination, paginationMeta } from "../../utils/pagination.js";
import { hashPassword } from "../../utils/password.js";
import { safeUserSelect } from "../../utils/selects.js";
import type {
  createUserSchema,
  updateUserSchema,
  usersQuerySchema,
} from "./users.schemas.js";

type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type UsersQuery = z.infer<typeof usersQuerySchema>;

export const listUsers = async (query: UsersQuery) => {
  const { page, limit, search, status, roleId } = query;
  const { skip, take } = getPagination(page, limit);

  const where = {
    ...(status ? { status } : {}),
    ...(roleId ? { roleId } : {}),
    ...(search
      ? {
          OR: [
            { rut: { contains: search, mode: "insensitive" as const } },
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { username: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: safeUserSelect,
      skip,
      take,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items,
    meta: paginationMeta(page, limit, total),
  };
};

export const getUser = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: safeUserSelect,
  });

  if (!user) throw new ApiError(404, "Usuario no encontrado");
  return user;
};

export const createUser = async (
  input: CreateUserInput,
  actorRole?: string,
) => {
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role || !role.isActive) {
    throw new ApiError(400, "El rol indicado no existe o está inactivo");
  }

  if (role.code === "ADMIN" && actorRole && actorRole !== "ADMIN") {
    throw new ApiError(
      403,
      "Solo un administrador puede asignar el rol ADMIN",
    );
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      rut: input.rut,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      username: input.username,
      passwordHash,
      status: input.status,
      roleId: input.roleId,
    },
    select: safeUserSelect,
  });
};

export const updateUser = async (
  id: string,
  input: UpdateUserInput,
  actorRole?: string,
) => {
  const currentUser = await getUser(id);

  if (
    currentUser.role.code === "ADMIN" &&
    actorRole &&
    actorRole !== "ADMIN"
  ) {
    throw new ApiError(
      403,
      "Solo un administrador puede modificar una cuenta con rol ADMIN",
    );
  }

  if (input.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role || !role.isActive) {
      throw new ApiError(400, "El rol indicado no existe o está inactivo");
    }
    if (role.code === "ADMIN" && actorRole && actorRole !== "ADMIN") {
      throw new ApiError(
        403,
        "Solo un administrador puede asignar el rol ADMIN",
      );
    }
  }

  const passwordHash = input.password
    ? await hashPassword(input.password)
    : undefined;

  const shouldRevokeTokens =
    Boolean(passwordHash) ||
    (input.status !== undefined && input.status !== "ACTIVE") ||
    (input.roleId !== undefined && input.roleId !== currentUser.role.id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...(input.rut !== undefined ? { rut: input.rut } : {}),
        ...(input.firstName !== undefined
          ? { firstName: input.firstName }
          : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: safeUserSelect,
    });

    if (shouldRevokeTokens) {
      await tx.securityToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return updated;
  });
};

export const deleteUser = async (
  id: string,
  currentUserId: string,
  actorRole?: string,
) => {
  if (id === currentUserId) {
    throw new ApiError(400, "No puedes eliminar tu propio usuario");
  }

  const target = await getUser(id);

  if (target.role.code === "ADMIN" && actorRole && actorRole !== "ADMIN") {
    throw new ApiError(
      403,
      "Solo un administrador puede eliminar o desactivar una cuenta ADMIN",
    );
  }

  const references = await Promise.all([
    prisma.sale.count({ where: { sellerId: id } }),
    prisma.purchaseOrder.count({ where: { createdById: id } }),
    prisma.purchaseReceipt.count({ where: { receivedById: id } }),
    prisma.inventoryMovement.count({ where: { userId: id } }),
    prisma.dispensation.count({ where: { dispensedById: id } }),
    prisma.cashSession.count({
      where: { OR: [{ openedById: id }, { closedById: id }] },
    }),
    prisma.cashMovement.count({ where: { userId: id } }),
    prisma.controlledDrugRecord.count({ where: { userId: id } }),
  ]);

  if (references.some((count) => count > 0)) {
    const deactivated = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: "INACTIVE" },
        select: safeUserSelect,
      });

      await tx.securityToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return updated;
    });

    return {
      message:
        "El usuario registra operaciones históricas y fue desactivado para preservar la trazabilidad",
      user: deactivated,
    };
  }

  await prisma.user.delete({ where: { id } });

  return { message: "Usuario eliminado correctamente" };
};
