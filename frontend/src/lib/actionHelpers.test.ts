import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it, vi } from "vitest";
import {
  nullable,
  numeric,
  optionalDate,
  optionalNumeric,
  runApiAction,
} from "./actionHelpers";
import { getAccessToken, getApiErrorMessage, setAccessToken } from "./api";
import {
  generateOperationCode,
  getLocalIsoDate,
  normalizeText,
} from "./formatters";

describe("Action Helpers, Formatters & API Session Utilities", () => {
  it("normaliza valores de formulario con nullable, numeric, optionalNumeric y optionalDate", () => {
    expect(nullable("  Hola  ")).toBe("Hola");
    expect(nullable("   ")).toBeNull();
    expect(nullable(null)).toBeNull();

    expect(numeric("1500", 0)).toBe(1500);
    expect(numeric("invalido", 42)).toBe(42);
    expect(numeric("", 1)).toBe(1);
    expect(numeric("   ", 5)).toBe(5);
    expect(numeric(undefined, 7)).toBe(7);

    expect(optionalNumeric("")).toBeNull();
    expect(optionalNumeric(undefined)).toBeNull();
    expect(optionalNumeric(null)).toBeNull();
    expect(optionalNumeric("2500")).toBe(2500);

    expect(optionalDate(" 2026-12-31 ")).toBe("2026-12-31");
    expect(optionalDate("")).toBeNull();
  });

  it("normaliza texto sin tildes, genera fechas ISO en hora local y códigos únicos sin colisión", () => {
    expect(normalizeText("  Ácido Clavulánico 500mg ")).toBe(
      "acido clavulanico 500mg",
    );

    const localDate = getLocalIsoDate(new Date(2026, 10, 18, 23, 30, 0));
    expect(localDate).toBe("2026-11-18");

    const code1 = generateOperationCode("VTA");
    const code2 = generateOperationCode("VTA");
    expect(code1.startsWith("VTA-")).toBe(true);
    expect(code1).not.toBe(code2);
  });

  it("mantiene el accessToken únicamente en memoria volátil sin escribir en localStorage", () => {
    setAccessToken("jwt-in-memory-token");
    expect(getAccessToken()).toBe("jwt-in-memory-token");
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });

  it("normaliza errores de Axios y de red provenientes de src/lib/api.ts", () => {
    const config = {} as InternalAxiosRequestConfig;

    const structuredError = new AxiosError(
      "Request failed",
      "ERR_BAD_REQUEST",
      config,
      {},
      {
        status: 409,
        statusText: "Conflict",
        headers: {},
        config,
        data: {
          ok: false,
          error: { message: "Esta caja ya tiene una sesión abierta" },
        },
      },
    );
    expect(getApiErrorMessage(structuredError)).toBe(
      "Esta caja ya tiene una sesión abierta",
    );

    const flatAxiosError = new AxiosError(
      "Request failed",
      "ERR_BAD_REQUEST",
      config,
      {},
      {
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config,
        data: { message: "Datos de entrada inválidos" },
      },
    );
    expect(getApiErrorMessage(flatAxiosError)).toBe(
      "Datos de entrada inválidos",
    );

    expect(getApiErrorMessage(new Error("Fallo de red local"))).toBe(
      "Fallo de red local",
    );
    expect(getApiErrorMessage("error desconocido")).toBe(
      "No fue posible completar la solicitud",
    );
  });

  it("ejecuta runApiAction gestionando estados busy/error y callbacks de éxito o fallo", async () => {
    const busyStates: boolean[] = [];
    let lastError = "previo";
    const onSuccess = vi.fn();

    const ok = await runApiAction(
      async () => ({ ok: true }),
      (b) => busyStates.push(b),
      (err) => {
        lastError = err;
      },
      onSuccess,
    );

    expect(ok).toBe(true);
    expect(busyStates).toEqual([true, false]);
    expect(lastError).toBe("");
    expect(onSuccess).toHaveBeenCalledOnce();

    const failBusy: boolean[] = [];
    const failed = await runApiAction(
      async () => {
        throw new Error("Stock insuficiente");
      },
      (b) => failBusy.push(b),
      (err) => {
        lastError = err;
      },
    );

    expect(failed).toBe(false);
    expect(failBusy).toEqual([true, false]);
    expect(lastError).toBe("Stock insuficiente");
  });
});
