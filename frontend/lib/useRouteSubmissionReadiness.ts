"use client";

import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";

import { SUPPORTED_TOKENS } from "@/lib/contracts";
import {
  humanizeRouteRelayValue,
  isTerminalRouteRequestStatus,
  type RecentRouteRequest,
} from "@/lib/route-request-status";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";
import { useVaultPortfolioData } from "@/lib/useVaultPortfolioData";

const ROUTE_REQUEST_STALE_THRESHOLD_MS = 10 * 60 * 1000;

export const DEFAULT_ROUTE_ASSET =
  SUPPORTED_TOKENS.find((token) => token.symbol === "USDC") ??
  SUPPORTED_TOKENS[0] ?? {
    symbol: "USDC",
    decimals: 6,
    address: "0x0000000000000000000000000000000000000000",
  };

function parseRawAmount(value: string | null | undefined): bigint {
  if (!value) {
    return 0n;
  }

  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function getRequestTimestampValue(request: RecentRouteRequest | null): number | null {
  if (!request) {
    return null;
  }

  const rawTimestamp = request.updatedAt ?? request.createdAt;
  if (!rawTimestamp) {
    return null;
  }

  const timestampValue = Date.parse(rawTimestamp);
  return Number.isNaN(timestampValue) ? null : timestampValue;
}

export function useRouteSubmissionReadiness(requests: RecentRouteRequest[]) {
  const { address } = useAccount();
  const chainId = useChainId();
  const portfolio = useVaultPortfolioData();
  const normalizedAddress = address?.trim().toLowerCase() ?? null;
  const normalizedPortfolioUserAddress =
    portfolio.userAddress?.trim().toLowerCase() ?? null;
  const hasScopedPortfolioSnapshot =
    normalizedAddress === null ||
    normalizedPortfolioUserAddress === normalizedAddress;

  const routeAssetPosition = useMemo(() => {
    if (!hasScopedPortfolioSnapshot) {
      return null;
    }

    const normalizedRouteAssetAddress = DEFAULT_ROUTE_ASSET.address.toLowerCase();

    return (
      portfolio.assets.find(
        (asset) =>
          asset.symbol === DEFAULT_ROUTE_ASSET.symbol ||
          asset.tokenAddress.toLowerCase() === normalizedRouteAssetAddress
      ) ?? null
    );
  }, [hasScopedPortfolioSnapshot, portfolio.assets]);

  const depositedBalanceRaw = useMemo(
    () => parseRawAmount(routeAssetPosition?.userPosition.raw),
    [routeAssetPosition?.userPosition.raw]
  );

  const activeRequest = useMemo(
    () => requests.find((request) => !isTerminalRouteRequestStatus(request.status)) ?? null,
    [requests]
  );

  const latestRequest = useMemo(() => requests[0] ?? null, [requests]);

  const latestFailedRequest = useMemo(
    () => (latestRequest?.status === "failed" ? latestRequest : null),
    [latestRequest]
  );

  const activeRequestTimestampValue = getRequestTimestampValue(activeRequest);
  const isActiveRequestStale =
    activeRequestTimestampValue !== null &&
    Date.now() - activeRequestTimestampValue >= ROUTE_REQUEST_STALE_THRESHOLD_MS;

  return {
    routeAsset: DEFAULT_ROUTE_ASSET,
    connectedChainId: chainId,
    isWrongNetwork: chainId !== undefined && chainId !== AEGIS_RUNTIME.chainId,
    routeAssetPosition,
    routeAssetBalanceDisplay: routeAssetPosition?.userPosition.display ?? "0",
    depositedBalanceRaw,
    hasDepositedRouteBalance: depositedBalanceRaw > 0n,
    isPortfolioLoading: portfolio.isLoading || !hasScopedPortfolioSnapshot,
    portfolioErrorMessage:
      hasScopedPortfolioSnapshot || normalizedPortfolioUserAddress === null
        ? portfolio.errorMessage
        : null,
    portfolioObservedAt: portfolio.snapshot.observedAt,
    refreshPortfolio: portfolio.refresh,
    activeRequest,
    isActiveRequestStale,
    latestRequest,
    latestFailedRequest,
    latestFailedFailureCategory: humanizeRouteRelayValue(
      latestFailedRequest?.failureCategory ?? null
    ),
    latestFailedRetryDisposition: humanizeRouteRelayValue(
      latestFailedRequest?.retryDisposition ?? null
    ),
  };
}
