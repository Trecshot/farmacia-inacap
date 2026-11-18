import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { hasUserPermission } from "../lib/access";
import {
  api,
  setAccessToken,
  setUnauthorizedHandler,
} from "../lib/api";
import type {
  AuthUser,
  LoginResponse,
} from "../types/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

const AuthContext =
  createContext<AuthContextValue | undefined>(undefined);

const LEGACY_ACCESS_KEY = "farmacia_access_token";
const LEGACY_REFRESH_KEY = "farmacia_refresh_token";
const USER_CACHE_KEY = "farmacia_user";

const purgeLegacyTokensFromStorage = () => {
  try {
    localStorage.removeItem(LEGACY_ACCESS_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  } catch {
    // Ignore storage access errors in restricted environments
  }
};

const getCachedUser = (): AuthUser | null => {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

const setCachedUser = (user: AuthUser | null) => {
  try {
    if (user) {
      sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(USER_CACHE_KEY);
    }
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // Ignore storage quota/availability errors
  }
};

export const AuthProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    purgeLegacyTokensFromStorage();
    return getCachedUser();
  });

  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    purgeLegacyTokensFromStorage();
    setAccessToken(null);
    setCachedUser(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [clearSession]);

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await api.get<{ user: AuthUser }>("/auth/me");
      const profile = data.user;
      setUser(profile);
      setCachedUser(profile);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    let active = true;

    api
      .get<{ user: AuthUser }>("/auth/me")
      .then(({ data }) => {
        if (!active) return;
        setUser(data.user);
        setCachedUser(data.user);
      })
      .catch(() => {
        if (!active) return;
        clearSession();
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [clearSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        username,
        password,
      });

      purgeLegacyTokensFromStorage();
      setAccessToken(data.accessToken);
      setCachedUser(data.user);
      setUser(data.user);

      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
    } catch {
      // El cierre local igualmente se realiza.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission: string) => {
      return hasUserPermission(user, permission);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authenticated: Boolean(user),
      login,
      logout,
      refreshProfile,
      hasPermission,
    }),
    [
      user,
      loading,
      login,
      logout,
      refreshProfile,
      hasPermission,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider",
    );
  }

  return context;
};
