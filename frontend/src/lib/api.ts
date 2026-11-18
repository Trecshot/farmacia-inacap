import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_URL =
  configuredApiUrl ||
  (import.meta.env.PROD
    ? "/api"
    : "http://localhost:3000/api");

let inMemoryAccessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const getAccessToken = (): string | null => inMemoryAccessToken;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

const applyAuthHeader = (
  config: InternalAxiosRequestConfig,
  token: string,
) => {
  if (config.headers instanceof AxiosHeaders) {
    config.headers.set("Authorization", `Bearer ${token}`);
  } else {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set("Authorization", `Bearer ${token}`);
  }
};

api.interceptors.request.use((config) => {
  if (inMemoryAccessToken) {
    applyAuthHeader(config, inMemoryAccessToken);
  }

  return config;
});

const executeSingleFlightRefresh = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{
        accessToken: string;
      }>(
        `${API_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 15000,
        },
      )
      .then(({ data }) => {
        const nextAccessToken = data.accessToken ?? null;
        setAccessToken(nextAccessToken);
        return nextAccessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const requestUrl = String(original?.url ?? "");
    const isAuthMutation =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/logout");

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthMutation
    ) {
      original._retry = true;

      try {
        const accessToken = await executeSingleFlightRefresh();
        if (accessToken) {
          applyAuthHeader(original, accessToken);
        }
        return api(original);
      } catch {
        setAccessToken(null);
        unauthorizedHandler?.();
      }
    }

    return Promise.reject(error);
  },
);

export const getApiErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      "No fue posible completar la solicitud"
    );
  }

  return error instanceof Error
    ? error.message
    : "No fue posible completar la solicitud";
};
