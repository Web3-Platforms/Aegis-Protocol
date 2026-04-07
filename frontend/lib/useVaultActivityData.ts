"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  createEmptyVaultActivityPayload,
  type VaultActivityPayload,
} from "@/lib/activity";

interface UseVaultActivityDataOptions {
  includeGlobalRoutes?: boolean;
}

export function useVaultActivityData(options?: UseVaultActivityDataOptions) {
  const { address } = useAccount();
  const includeGlobalRoutes = options?.includeGlobalRoutes ?? true;
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<VaultActivityPayload>(
    createEmptyVaultActivityPayload()
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);

      try {
        const searchParams = new URLSearchParams();
        if (address) {
          searchParams.set("userAddress", address);
        }
        if (!includeGlobalRoutes) {
          searchParams.set("includeGlobalRoutes", "false");
        }

        const response = await fetch(
          `/api/activity${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorPayload = (await response.json()) as {
            error?: string;
            detail?: string;
          };
          throw new Error(
            errorPayload.detail ?? errorPayload.error ?? "Failed to load activity data"
          );
        }

        const nextPayload = (await response.json()) as VaultActivityPayload;
        if (!controller.signal.aborted) {
          setPayload(nextPayload);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!controller.signal.aborted && error instanceof Error && error.name !== "AbortError") {
          setPayload(createEmptyVaultActivityPayload());
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
  }, [address, includeGlobalRoutes]);

  return {
    isLoading,
    errorMessage,
    ...payload,
  };
}
