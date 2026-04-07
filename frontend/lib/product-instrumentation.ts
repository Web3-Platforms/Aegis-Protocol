"use client";

import { PRODUCT_INSTRUMENTATION_ENABLED } from "@/lib/feature-flags";
import type {
  ProductEventMetadata,
  ProductEventName,
  ProductEventSurface,
} from "@/lib/product-events";

const PRODUCT_SESSION_STORAGE_KEY = "aegis-product-session-id";
let fallbackSessionId: string | null = null;
let sessionBootstrapPromise: Promise<string | null> | null = null;

function storeProductSessionId(sessionId: string) {
  try {
    window.sessionStorage.setItem(PRODUCT_SESSION_STORAGE_KEY, sessionId);
  } catch {
    fallbackSessionId = sessionId;
  }
}

function clearStoredProductSessionId() {
  try {
    window.sessionStorage.removeItem(PRODUCT_SESSION_STORAGE_KEY);
  } catch {
    // ignore storage failures; fallbackSessionId handles restricted environments
  }

  fallbackSessionId = null;
}

async function bootstrapProductSessionId(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const existingId = window.sessionStorage.getItem(PRODUCT_SESSION_STORAGE_KEY);
    if (existingId) {
      return existingId;
    }
  } catch {
    if (fallbackSessionId) {
      return fallbackSessionId;
    }
  }

  try {
    const response = await fetch("/api/instrumentation/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return fallbackSessionId;
    }

    const payload: unknown = await response.json();
    const sessionId =
      typeof payload === "object" &&
      payload !== null &&
      "sessionId" in payload &&
      typeof payload.sessionId === "string"
        ? payload.sessionId
        : null;

    if (!sessionId) {
      return fallbackSessionId;
    }

    storeProductSessionId(sessionId);
    return sessionId;
  } catch {
    return fallbackSessionId;
  }
}

async function getOrCreateProductSessionId(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = bootstrapProductSessionId().finally(() => {
      sessionBootstrapPromise = null;
    });
  }

  return sessionBootstrapPromise;
}

export async function trackProductEvent(input: {
  eventName: ProductEventName;
  surface: ProductEventSurface;
  metadata?: ProductEventMetadata;
}): Promise<void> {
  return trackProductEventInternal(input, 0);
}

async function trackProductEventInternal(
  input: {
    eventName: ProductEventName;
    surface: ProductEventSurface;
    metadata?: ProductEventMetadata;
  },
  attempt: number
): Promise<void> {
  if (!PRODUCT_INSTRUMENTATION_ENABLED || typeof window === "undefined") {
    return;
  }

  const sessionId = await getOrCreateProductSessionId();
  if (!sessionId) {
    return;
  }

  try {
    const response = await fetch("/api/instrumentation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        sessionId,
      }),
      keepalive: true,
      cache: "no-store",
    });

    const payload: unknown = await response
      .json()
      .catch(() => null);

    if (
      response.ok &&
      attempt === 0 &&
      typeof payload === "object" &&
      payload !== null &&
      "recorded" in payload &&
      payload.recorded === false &&
      "reason" in payload &&
      payload.reason === "invalid_session"
    ) {
      clearStoredProductSessionId();
      await trackProductEventInternal(input, 1);
      return;
    }

    if (!response.ok) {
      console.warn("Aegis product instrumentation was not recorded.", {
        eventName: input.eventName,
        surface: input.surface,
        status: response.status,
      });
    }
  } catch (error) {
    console.warn("Aegis product instrumentation request failed.", {
      eventName: input.eventName,
      surface: input.surface,
      error,
    });
  }
}
