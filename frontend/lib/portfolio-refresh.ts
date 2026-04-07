"use client";

export const PORTFOLIO_REFRESH_EVENT = "aegis:portfolio-refresh";

export function dispatchPortfolioRefresh(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(PORTFOLIO_REFRESH_EVENT));
}
