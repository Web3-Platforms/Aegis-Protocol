import { AEGIS_RUNTIME_ENV } from "@/lib/runtime/environment";

export const EXPERIMENTAL_ROUTING_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING === "true" &&
  AEGIS_RUNTIME_ENV === "paseo-beta";

export const PRODUCT_INSTRUMENTATION_ENABLED =
  process.env.NEXT_PUBLIC_AEGIS_PRODUCT_INSTRUMENTATION_ENABLED === "true";
