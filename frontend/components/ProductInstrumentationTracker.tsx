"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import {
  getProductEventSurfaceFromPathname,
} from "@/lib/product-events";
import { trackProductEvent } from "@/lib/product-instrumentation";

export function ProductInstrumentationTracker() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const lastTrackedPathnameRef = useRef<string | null>(null);
  const lastTrackedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastTrackedPathnameRef.current === pathname) {
      return;
    }

    lastTrackedPathnameRef.current = pathname;

    void trackProductEvent({
      eventName: "surface_viewed",
      surface: getProductEventSurfaceFromPathname(pathname),
    });
  }, [pathname]);

  useEffect(() => {
    if (!isConnected || !address) {
      lastTrackedAddressRef.current = null;
      return;
    }

    const normalizedAddress = address.toLowerCase();
    if (lastTrackedAddressRef.current === normalizedAddress) {
      return;
    }

    lastTrackedAddressRef.current = normalizedAddress;

    void trackProductEvent({
      eventName: "wallet_connected",
      surface: getProductEventSurfaceFromPathname(pathname),
    });
  }, [address, isConnected, pathname]);

  return null;
}
