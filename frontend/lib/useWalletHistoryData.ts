"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  createEmptyWalletHistoryPayload,
  type WalletHistoryPayload,
} from "@/lib/history";

const DEFAULT_HISTORY_LIMIT = 25;

export function useWalletHistoryData(limit = DEFAULT_HISTORY_LIMIT) {
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<WalletHistoryPayload>(
    createEmptyWalletHistoryPayload()
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      if (!address) {
        setPayload(createEmptyWalletHistoryPayload());
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const searchParams = new URLSearchParams({
          userAddress: address,
          limit: String(limit),
        });

        const response = await fetch(`/api/history?${searchParams.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorPayload = (await response.json()) as {
            error?: string;
            detail?: string;
          };
          throw new Error(
            errorPayload.detail ??
              errorPayload.error ??
              "Failed to load wallet history"
          );
        }

        const nextPayload = (await response.json()) as WalletHistoryPayload;
        if (!controller.signal.aborted) {
          setPayload(nextPayload);
          setErrorMessage(null);
        }
      } catch (error) {
        if (
          !controller.signal.aborted &&
          error instanceof Error &&
          error.name !== "AbortError"
        ) {
          setPayload(createEmptyWalletHistoryPayload());
          setErrorMessage(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      controller.abort();
    };
  }, [address, limit]);

  return {
    isLoading,
    errorMessage,
    ...payload,
  };
}
