import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiErrorMessage } from "../lib/api";

type UseResourceOptions = {
  enabled?: boolean;
};

export const useResource = <T, R = unknown>(
  endpoint: string,
  selector: (data: R) => T,
  options?: UseResourceOptions,
) => {
  const enabled = options?.enabled ?? true;
  const selectorRef = useRef(selector);

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  useEffect(() => {
    selectorRef.current = selector;
  }, [selector]);

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.get<R>(endpoint);
      setData(selectorRef.current(response.data));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    api
      .get<R>(endpoint, { signal: controller.signal })
      .then((response) => {
        if (!active) return;
        setError("");
        setData(selectorRef.current(response.data));
      })
      .catch((requestError: unknown) => {
        if (!active || axios.isCancel(requestError)) return;
        setError(getApiErrorMessage(requestError));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [endpoint, enabled]);

  return {
    data,
    loading: enabled ? loading : false,
    error: enabled ? error : "",
    reload: load,
  };
};
