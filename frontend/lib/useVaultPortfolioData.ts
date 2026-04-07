"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  createEmptyPortfolioPayload,
  type PortfolioPayload,
} from "@/lib/portfolio";
import { PORTFOLIO_REFRESH_EVENT } from "@/lib/portfolio-refresh";

const PORTFOLIO_POLL_INTERVAL_MS = 30_000;

export function useVaultPortfolioData() {
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [payload, setPayload] = useState<PortfolioPayload>(
    createEmptyPortfolioPayload()
  );
  const hasSuccessfulLoadRef = useRef(false);
  const refresh = useCallback(() => {
    setRefreshNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    hasSuccessfulLoadRef.current = false;
    setPayload(createEmptyPortfolioPayload());
    setErrorMessage(null);
    setIsLoading(true);
    setIsRefreshing(false);
  }, [address]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      const isBackgroundRefresh = hasSuccessfulLoadRef.current;

      if (isBackgroundRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const searchParams = new URLSearchParams();
        if (address) {
          searchParams.set("userAddress", address);
        }

        const response = await fetch(
          `/api/portfolio${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as
            | {
                error?: string;
                detail?: string;
              }
            | null;
          throw new Error(
            errorPayload?.detail ??
              errorPayload?.error ??
              `Failed to load portfolio snapshot (HTTP ${response.status})`
          );
        }

        const nextPayload = (await response.json()) as PortfolioPayload;
        if (!controller.signal.aborted) {
          hasSuccessfulLoadRef.current = true;
          setPayload(nextPayload);
          setErrorMessage(null);
        }
      } catch (error) {
        if (
          !controller.signal.aborted &&
          error instanceof Error &&
          error.name !== "AbortError"
        ) {
          setErrorMessage(error.message);

          if (!hasSuccessfulLoadRef.current) {
            setPayload(createEmptyPortfolioPayload());
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    load();
    return () => {
      controller.abort();
    };
  }, [address, refreshNonce]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refresh();
    }, PORTFOLIO_POLL_INTERVAL_MS);

    const handleFocus = () => {
      refresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    const handlePortfolioRefresh = () => {
      refresh();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(PORTFOLIO_REFRESH_EVENT, handlePortfolioRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(PORTFOLIO_REFRESH_EVENT, handlePortfolioRefresh);
    };
  }, [refresh]);

  return {
    isLoading,
    isRefreshing,
    errorMessage,
    refresh,
    ...payload,
  };
}
