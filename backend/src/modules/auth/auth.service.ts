import { prisma } from "../../config/prisma.js";
import type { JwtUserPayload } from "../../types/auth.js";
import { ApiError } from "../../utils/ApiError.js";
import { verifyPassword } from "../../utils/password.js";
import {
  authRoleWithPermissionsSelect,
  authSessionUserSelect,
} from "../../utils/selects.js";
import {
  generateRefreshToken,
  getRefreshExpiration,
  hashToken,
  signAccessToken,
} from "../../utils/token.js";
import type { LoginInput } from "./auth.schemas.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REVOKED_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;

const getUserForAuth = async (username: string) => {
  return prisma.user.findUnique({
    where: { username },
    select: {
      ...authSessionUserSelect,
      passwordHash: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });
};

const extractPermissionCodes = (
  role: {
    permissions: Array<{
      permission: {
        code: string;
        isActive: boolean;
      };
    }>;
  },
) =>
  role.permissions
    .filter((item) => item.permission.isActive)
    .map((item) => item.permission.code);

const buildAuthPayload = (user: {
  id: string;
  username: string;
  role: {
    code: string;
    permissions: Array<{
      permission: {
        code: string;
        isActive: boolean;
      };
    }>;
  };
}): JwtUserPayload => ({
  sub: user.id,
  username: user.username,
  role: user.role.code,
  permissions: extractPermissionCodes(user.role),
});

export const login = async (input: LoginInput) => {
  const user = await getUserForAuth(input.username);

  if (!user) {
    throw new ApiError(401, "Credenciales inválidas");
  }

  if (user.status !== "ACTIVE" || !user.role.isActive) {
    throw new ApiError(403, "Usuario o rol inactivo o bloqueado");
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new ApiError(423, "Usuario bloqueado temporalmente");
  }

  const validPassword = await verifyPassword(input.password, user.passwordHash);

  if (!validPassword) {
    const incremented = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: { increment: 1 },
      },
      select: { failedLoginAttempts: true },
    });

    if (incremented.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
        },
      });
    }

    throw new ApiError(401, "Credenciales inválidas");
  }

  const payload = buildAuthPayload(user);
  const accessToken = signAccessToken(payload);

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    }),
    prisma.securityToken.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lte: now } },
          {
            revokedAt: {
              lte: new Date(now.getTime() - REVOKED_TOKEN_RETENTION_MS),
            },
          },
        ],
      },
    }),
    prisma.securityToken.create({
      data: {
        userId: user.id,
        type: "REFRESH",
        tokenHash: refreshTokenHash,
        expiresAt: getRefreshExpiration(),
      },
    }),
  ]);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      rut: user.rut,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      role: user.role.code,
      permissions: payload.permissions,
    },
  };
};

export const refresh = async (refreshToken: string) => {
  const tokenHash = hashToken(refreshToken);
  const now = new Date();

  const storedToken = await prisma.securityToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      type: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          status: true,
          role: {
            select: authRoleWithPermissionsSelect,
          },
        },
      },
    },
  });

  if (
    !storedToken ||
    storedToken.type !== "REFRESH" ||
    storedToken.revokedAt ||
    storedToken.expiresAt <= now
  ) {
    throw new ApiError(401, "Refresh token inválido o expirado");
  }

  if (storedToken.user.status !== "ACTIVE" || !storedToken.user.role.isActive) {
    throw new ApiError(403, "Usuario o rol inactivo o bloqueado");
  }

  const payload = buildAuthPayload(storedToken.user);
  const nextRefreshToken = generateRefreshToken();

  await prisma.$transaction(async (tx) => {
    const revoked = await tx.securityToken.updateMany({
      where: {
        id: storedToken.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });

    if (revoked.count === 0) {
      throw new ApiError(401, "Refresh token ya utilizado o revocado");
    }

    await tx.securityToken.create({
      data: {
        userId: storedToken.user.id,
        type: "REFRESH",
        tokenHash: hashToken(nextRefreshToken),
        expiresAt: getRefreshExpiration(),
      },
    });
  });

  return {
    accessToken: signAccessToken(payload),
    refreshToken: nextRefreshToken,
  };
};

export const logout = async (refreshToken: string) => {
  const tokenHash = hashToken(refreshToken);

  await prisma.securityToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: authSessionUserSelect,
  });

  if (!user) {
    throw new ApiError(404, "Usuario no encontrado");
  }

  if (user.status !== "ACTIVE" || !user.role.isActive) {
    throw new ApiError(403, "Usuario o rol inactivo o bloqueado");
  }

  return {
    id: user.id,
    rut: user.rut,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    username: user.username,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    role: user.role.code,
    permissions: extractPermissionCodes(user.role),
  };
};
