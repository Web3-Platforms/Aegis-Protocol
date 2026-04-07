import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const PRODUCT_INSTRUMENTATION_SESSION_COOKIE =
  "aegis-product-instrumentation-session";

function addLoopbackAliases(origins: Set<string>, origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost") {
      origins.add(origin.replace("://localhost", "://127.0.0.1"));
    } else if (url.hostname === "127.0.0.1") {
      origins.add(origin.replace("://127.0.0.1", "://localhost"));
    }
  } catch {
    // ignore malformed origins; request validation will fail later if needed
  }
}

function getExpectedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin]);
  addLoopbackAliases(origins, request.nextUrl.origin);

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(/:$/, "");

  if (host) {
    const derivedOrigin = `${proto}://${host}`;
    origins.add(derivedOrigin);
    addLoopbackAliases(origins, derivedOrigin);
  }

  return origins;
}

function matchesExpectedOrigin(value: string | null, request: NextRequest): boolean {
  if (!value) {
    return false;
  }

  return [...getExpectedOrigins(request)].some(
    (origin) => value === origin || value.startsWith(`${origin}/`)
  );
}

function getInstrumentationSessionSecret(): string | null {
  return (
    process.env.AEGIS_PRODUCT_INSTRUMENTATION_SECRET?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.AI_ORACLE_RELAY_DATABASE_URL?.trim() ||
    null
  );
}

function isSessionId(value: string): boolean {
  return /^[a-z0-9-]{16,128}$/i.test(value);
}

function signSessionId(sessionId: string): string | null {
  const secret = getInstrumentationSessionSecret();
  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

function encodeSessionCookieValue(sessionId: string): string | null {
  const signature = signSessionId(sessionId);
  if (!signature) {
    return null;
  }

  return `${sessionId}.${signature}`;
}

function decodeSessionCookieValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [sessionId, signature] = value.split(".", 2);
  if (!sessionId || !signature || !isSessionId(sessionId)) {
    return null;
  }

  const expectedSignature = signSessionId(sessionId);
  if (!expectedSignature) {
    return null;
  }

  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer) ? sessionId : null;
}

export function isTrustedInstrumentationRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const matchesCurrentOrigin =
    matchesExpectedOrigin(origin, request) || matchesExpectedOrigin(referer, request);

  if (!matchesCurrentOrigin) {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return false;
  }

  return true;
}

export function getValidatedInstrumentationSessionId(
  request: NextRequest
): string | null {
  return decodeSessionCookieValue(
    request.cookies.get(PRODUCT_INSTRUMENTATION_SESSION_COOKIE)?.value
  );
}

export function createInstrumentationSessionId(): string {
  return randomUUID();
}

export function attachInstrumentationSessionCookie(
  response: NextResponse,
  sessionId: string
): NextResponse {
  const encoded = encodeSessionCookieValue(sessionId);
  if (!encoded) {
    return response;
  }

  response.cookies.set(PRODUCT_INSTRUMENTATION_SESSION_COOKIE, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
