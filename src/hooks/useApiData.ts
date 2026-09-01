"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export function useApiData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiRequest<T>(url));
    } catch (requestError) {
      setError(requestError as Error);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const result = await apiRequest<T>(url);
        if (active) {
          setData(result);
          setError(null);
        }
      } catch (requestError) {
        if (active) setError(requestError as Error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitialData();
    return () => { active = false; };
  }, [url]);
  return { data, loading, error, refresh, setData };
}
