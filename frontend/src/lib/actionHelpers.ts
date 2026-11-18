import { getApiErrorMessage } from "./api";

export const nullable = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

export const numeric = (value: unknown, fallback = 0) => {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    typeof value === "boolean"
  ) {
    return fallback;
  }
  const text = typeof value === "string" ? value.trim() : value;
  if (text === "") {
    return fallback;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
};

export const optionalNumeric = (value: unknown): number | null => {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    typeof value === "boolean"
  ) {
    return null;
  }
  const text = typeof value === "string" ? value.trim() : value;
  if (text === "") {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

export const optionalDate = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

export const runApiAction = async (
  action: () => Promise<unknown>,
  setBusy: (value: boolean) => void,
  setError: (value: string) => void,
  onSuccess?: () => void | Promise<void>,
) => {
  setBusy(true);
  setError("");
  try {
    await action();
    await onSuccess?.();
    return true;
  } catch (error) {
    setError(getApiErrorMessage(error));
    return false;
  } finally {
    setBusy(false);
  }
};
