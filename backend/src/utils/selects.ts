export const safeUserSelect = {
  id: true,
  rut: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  username: true,
  status: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  roleId: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
} as const;

export const authRoleWithPermissionsSelect = {
  code: true,
  name: true,
  isActive: true,
  permissions: {
    where: {
      permission: {
        isActive: true,
      },
    },
    select: {
      permission: {
        select: {
          code: true,
          name: true,
          module: true,
          action: true,
          isActive: true,
        },
      },
    },
  },
} as const;

export const authSessionUserSelect = {
  id: true,
  rut: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  username: true,
  status: true,
  lastLoginAt: true,
  role: {
    select: authRoleWithPermissionsSelect,
  },
} as const;
