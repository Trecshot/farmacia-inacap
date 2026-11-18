import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(80),
  password: z.string().min(8).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32),
});

export const optionalRefreshSchema = z
  .object({
    refreshToken: z.string().min(32).optional(),
  })
  .optional();

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
