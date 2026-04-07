"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildRouteRequestStatusUrl,
  isTerminalRouteRequestStatus,
  parsePublicRouteRequestStatus,
  type RecentRouteRequest,
  type RouteRequestSource,
} from "@/lib/route-request-status";
import {
  AEGIS_RUNTIME_ENV,
  type AegisRuntimeEnv,
} from "@/lib/runtime/environment";

const STORAGE_KEY_PREFIX = "aegis:recent-route-requests";
const MAX_RECENT_ROUTE_REQUESTS = 8;
const POLL_INTERVAL_MS = 10_000;

function getTimestampValue(request: RecentRouteRequest): number {
  const timestamp = request.updatedAt ?? request.createdAt;
  return timestamp ? Date.parse(timestamp) || 0 : 0;
}

function sortRouteRequests(
  requests: RecentRouteRequest[]
): RecentRouteRequest[] {
  return [...requests].sort(
    (left, right) => getTimestampValue(right) - getTimestampValue(left)
  );
}

function trimRouteRequests(
  requests: RecentRouteRequest[]
): RecentRouteRequest[] {
  return sortRouteRequests(requests).slice(0, MAX_RECENT_ROUTE_REQUESTS);
}

function mergeRouteRequests(
  current: RecentRouteRequest[],
  incoming: RecentRouteRequest[]
): RecentRouteRequest[] {
  const merged = new Map(current.map((request) => [request.requestId, request]));

  for (const request of incoming) {
    const previous = merged.get(request.requestId);
    merged.set(request.requestId, previous ? { ...previous, ...request } : request);
  }

  return trimRouteRequests([...merged.values()]);
}

function coerceRouteRequestSource(value: unknown): RouteRequestSource {
  return value === "chat" ? "chat" : "panel";
}

function coerceRuntimeEnv(value: unknown): AegisRuntimeEnv {
  return value === "moonbase-staging" ? "moonbase-staging" : "paseo-beta";
}

function normalizeUserAddress(userAddress: string | null | undefined): string {
  return userAddress?.trim().toLowerCase() ?? "anonymous";
}

function buildStorageKey(userAddress: string | null | undefined): string {
  return `${STORAGE_KEY_PREFIX}:${AEGIS_RUNTIME_ENV}:${normalizeUserAddress(userAddress)}`;
}

function readStoredRouteRequests(
  storageKey: string,
  userAddress?: string | null
): RecentRouteRequest[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const requests = parsedValue.flatMap((entry) => {
      const parsedRequest = parsePublicRouteRequestStatus(entry, userAddress);
      if (!parsedRequest) {
        return [];
      }

      return [
        {
          ...parsedRequest,
          source: coerceRouteRequestSource(
            typeof entry === "object" && entry ? (entry as { source?: unknown }).source : null
          ),
          runtimeEnv: coerceRuntimeEnv(
            typeof entry === "object" && entry
              ? (entry as { runtimeEnv?: unknown }).runtimeEnv
              : null
          ),
        },
      ];
    });

    return trimRouteRequests(requests);
  } catch {
    return [];
  }
}

function writeStoredRouteRequests(
  storageKey: string,
  requests: RecentRouteRequest[]
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(trimRouteRequests(requests)));
  } catch {
    // Ignore local persistence failures and keep the in-memory session state.
  }
}

export function useRecentRouteRequests(userAddress?: string | null) {
  const [requests, setRequests] = useState<RecentRouteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const storageKey = buildStorageKey(userAddress);
  const [refreshingStorageKey, setRefreshingStorageKey] = useState<string | null>(
    null
  );
  const [errorState, setErrorState] = useState<{
    storageKey: string;
    message: string | null;
  }>({
    storageKey,
    message: null,
  });
  const [loadedStorageKey, setLoadedStorageKey] = useState(storageKey);
  const visibleRequests = useMemo(
    () => (loadedStorageKey === storageKey ? requests : []),
    [loadedStorageKey, requests, storageKey]
  );
  const activeStorageKeyRef = useRef(storageKey);
  const isRefreshing = refreshingStorageKey === storageKey;
  const errorMessage =
    errorState.storageKey === storageKey ? errorState.message : null;

  const commitScopedRequests = useCallback(
    (
      targetStorageKey: string,
      targetUserAddress: string | null | undefined,
      updater: (current: RecentRouteRequest[]) => RecentRouteRequest[]
    ) => {
      if (targetStorageKey === activeStorageKeyRef.current) {
        setRequests((current) => {
          const nextRequests = trimRouteRequests(updater(current));
          writeStoredRouteRequests(targetStorageKey, nextRequests);
          return nextRequests;
        });
        return;
      }

      const currentStoredRequests = readStoredRouteRequests(
        targetStorageKey,
        targetUserAddress
      );
      const nextRequests = trimRouteRequests(updater(currentStoredRequests));
      writeStoredRouteRequests(targetStorageKey, nextRequests);
    },
    []
  );

  const rememberRequest = useCallback(
    (payload: unknown, source: RouteRequestSource) => {
      const parsedRequest = parsePublicRouteRequestStatus(payload, userAddress);
      if (!parsedRequest) {
        return;
      }

      setErrorState({ storageKey, message: null });
      commitScopedRequests(storageKey, userAddress, (current) =>
        mergeRouteRequests(current, [
          {
            ...parsedRequest,
            source,
            runtimeEnv: AEGIS_RUNTIME_ENV,
          },
        ])
      );
    },
    [commitScopedRequests, storageKey, userAddress]
  );

  const dismissRequest = useCallback(
    (requestId: string) => {
      commitScopedRequests(storageKey, userAddress, (current) =>
        current.filter((request) => request.requestId !== requestId)
      );
    },
    [commitScopedRequests, storageKey, userAddress]
  );

  const refresh = useCallback(async () => {
    if (loadedStorageKey !== storageKey || visibleRequests.length === 0) {
      if (storageKey === activeStorageKeyRef.current) {
        setErrorState({ storageKey, message: null });
      }
      return;
    }

    setRefreshingStorageKey(storageKey);
    const refreshErrors: string[] = [];

    const refreshedRequests = await Promise.all(
      visibleRequests.map(async (request) => {
        try {
          const response = await fetch(
            buildRouteRequestStatusUrl(request.requestId, userAddress),
            { cache: "no-store" }
          );

          if (!response.ok) {
            const errorPayload = (await response.json().catch(() => null)) as
              | { error?: string; detail?: string }
              | null;

            throw new Error(
              errorPayload?.detail ??
                errorPayload?.error ??
                `Failed to refresh route request ${request.requestId}`
            );
          }

          const payload = await response.json();
          const parsedRequest = parsePublicRouteRequestStatus(payload, userAddress);
          return parsedRequest ? { ...request, ...parsedRequest } : request;
        } catch (error) {
          refreshErrors.push(
            error instanceof Error
              ? error.message
              : `Failed to refresh route request ${request.requestId}`
          );
          return request;
        }
      })
    );

    commitScopedRequests(storageKey, userAddress, (current) =>
      mergeRouteRequests(current, refreshedRequests)
    );
    if (storageKey === activeStorageKeyRef.current) {
      setErrorState({ storageKey, message: refreshErrors[0] ?? null });
    }
    setRefreshingStorageKey((current) =>
      current === storageKey ? null : current
    );
  }, [
    commitScopedRequests,
    loadedStorageKey,
    storageKey,
    userAddress,
    visibleRequests,
  ]);

  useEffect(() => {
    activeStorageKeyRef.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    setIsLoading(true);
    setErrorState({ storageKey, message: null });
    setRequests(readStoredRouteRequests(storageKey, userAddress));
    setLoadedStorageKey(storageKey);
    setIsLoading(false);

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) {
        setRequests(readStoredRouteRequests(storageKey, userAddress));
        setLoadedStorageKey(storageKey);
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [storageKey, userAddress]);

  useEffect(() => {
    if (
      loadedStorageKey !== storageKey ||
      visibleRequests.length === 0 ||
      visibleRequests.every((request) => isTerminalRouteRequestStatus(request.status))
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadedStorageKey, refresh, storageKey, visibleRequests]);

  return {
    requests: visibleRequests,
    isLoading,
    isRefreshing,
    errorMessage,
    rememberRequest,
    refresh,
    dismissRequest,
  };
}
