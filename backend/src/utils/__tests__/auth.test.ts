import type { Request } from "express";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";
import type { JwtUserPayload } from "../../types/auth.js";

let hashPassword: typeof import("../password.js").hashPassword;
let verifyPassword: typeof import("../password.js").verifyPassword;
let signAccessToken: typeof import("../token.js").signAccessToken;
let verifyAccessToken: typeof import("../token.js").verifyAccessToken;
let generateRefreshToken: typeof import("../token.js").generateRefreshToken;
let hashToken: typeof import("../token.js").hashToken;
let getRefreshExpiration: typeof import("../token.js").getRefreshExpiration;
let getCookie: typeof import("../cookies.js").getCookie;
let REFRESH_COOKIE_NAME: typeof import("../cookies.js").REFRESH_COOKIE_NAME;

beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    "postgresql://farmacia_user:farmacia_password@localhost:5432/farmacia_db";
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ??
    "clave_secreta_de_pruebas_unitarias_con_mas_de_32_caracteres";
  process.env.JWT_ACCESS_EXPIRES_IN = "15m";
  process.env.REFRESH_TOKEN_DAYS = "7";

  const pwdMod = await import("../password.js");
  const tokenMod = await import("../token.js");
  const cookieMod = await import("../cookies.js");

  hashPassword = pwdMod.hashPassword;
  verifyPassword = pwdMod.verifyPassword;
  signAccessToken = tokenMod.signAccessToken;
  verifyAccessToken = tokenMod.verifyAccessToken;
  generateRefreshToken = tokenMod.generateRefreshToken;
  hashToken = tokenMod.hashToken;
  getRefreshExpiration = tokenMod.getRefreshExpiration;
  getCookie = cookieMod.getCookie;
  REFRESH_COOKIE_NAME = cookieMod.REFRESH_COOKIE_NAME;
});

describe("Auth Utilities (password.ts, token.ts & cookies.ts)", () => {
  it("genera hash criptográfico bcrypt y verifica contraseñas válidas e inválidas", async () => {
    const plain = "FarmaciaSegura2026!";
    const hashed = await hashPassword(plain);

    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(plain);
    expect(hashed.startsWith("$2")).toBe(true);

    const isValid = await verifyPassword(plain, hashed);
    const isInvalid = await verifyPassword("ClaveIncorrecta123", hashed);

    expect(isValid).toBe(true);
    expect(isInvalid).toBe(false);
  });

  it("firma y verifica un JWT con el payload de usuario y permisos", () => {
    const payload: JwtUserPayload = {
      sub: "user-123",
      username: "qf_admin",
      role: "ADMIN",
      permissions: ["sales.create", "inventory.read"],
    };

    const token = signAccessToken(payload);
    expect(typeof token).toBe("string");

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.username).toBe(payload.username);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.permissions).toEqual(payload.permissions);
  });

  it("rechaza tokens JWT expirados o con firma alterada", () => {
    const expiredToken = jwt.sign(
      {
        sub: "user-expired",
        username: "expired",
        role: "CASHIER",
        permissions: [],
      },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: -10 },
    );

    expect(() => verifyAccessToken(expiredToken)).toThrow();
    expect(() => verifyAccessToken(`${expiredToken}tampered`)).toThrow();
  });

  it("genera refresh tokens aleatorios, su hash SHA-256 determinista y fecha de expiración futura", () => {
    const rt = generateRefreshToken();
    expect(rt.length).toBeGreaterThan(32);

    const hashed1 = hashToken(rt);
    const hashed2 = hashToken(rt);
    expect(hashed1).toBe(hashed2);
    expect(hashed1).toHaveLength(64);

    const exp = getRefreshExpiration();
    expect(exp.getTime()).toBeGreaterThan(Date.now());
  });

  it("extrae cookies HttpOnly del encabezado Cookie de forma segura", () => {
    const mockReq = {
      headers: {
        cookie: `theme=light; ${REFRESH_COOKIE_NAME}=token_seguro_123%3D; other=1`,
      },
    } as unknown as Request;

    expect(getCookie(mockReq, REFRESH_COOKIE_NAME)).toBe("token_seguro_123=");
    expect(getCookie(mockReq, "non_existent")).toBeNull();
  });
});
