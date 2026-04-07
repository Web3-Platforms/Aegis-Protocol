const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export type AegisRuntimeEnv = "paseo-beta" | "moonbase-staging";

export function resolveAddress(
  value: string | undefined,
  fallback: `0x${string}` = ZERO_ADDRESS
): `0x${string}` {
  return value && ADDRESS_PATTERN.test(value)
    ? (value.toLowerCase() as `0x${string}`)
    : fallback;
}

export function isConfiguredAddress(
  value: string | null | undefined
): value is `0x${string}` {
  return Boolean(
    value &&
      ADDRESS_PATTERN.test(value) &&
      value.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
  );
}

const configuredEnv = process.env.NEXT_PUBLIC_AEGIS_ENV?.trim();

const paseoRpcUrl =
  process.env.NEXT_PUBLIC_PASEO_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";
const moonbaseRpcUrl =
  process.env.NEXT_PUBLIC_MOONBASE_RPC_URL ??
  "https://rpc.api.moonbase.moonbeam.network";

export const AEGIS_RUNTIMES = {
  "moonbase-staging": {
    env: "moonbase-staging" as const,
    chainId: 1287,
    chainName: "Moonbase Alpha",
    networkName: "moonbase-alpha",
    rpcUrl: moonbaseRpcUrl,
    explorerTxBaseUrl: "https://moonbase.subscan.io/tx/",
    nativeCurrency: {
      decimals: 18,
      name: "DEV",
      symbol: "DEV",
    },
    statusBadge: "Moonbase Alpha Staging",
    postureLabel: "Protected staging",
    postureDescription:
      "Protected staging environment for internal and partner-preview validation.",
  },
  "paseo-beta": {
    env: "paseo-beta" as const,
    chainId: 420420417,
    chainName: "Paseo Testnet",
    networkName: "paseo-testnet",
    rpcUrl: paseoRpcUrl,
    explorerTxBaseUrl: "https://paseo.subscan.io/tx/",
    nativeCurrency: {
      decimals: 18,
      name: "Paseo",
      symbol: "PAS",
    },
    statusBadge: "Paseo Testnet Beta",
    postureLabel: "Public beta",
    postureDescription: "Public beta network for demos and product discovery.",
  },
} as const;

export const AEGIS_RUNTIME_ENV: AegisRuntimeEnv =
  configuredEnv === "moonbase-staging" ? "moonbase-staging" : "paseo-beta";

export function getAegisRuntime(env: AegisRuntimeEnv) {
  return AEGIS_RUNTIMES[env];
}

export const AEGIS_RUNTIME = getAegisRuntime(AEGIS_RUNTIME_ENV);

export const AEGIS_CHAIN = {
  id: AEGIS_RUNTIME.chainId,
  name: AEGIS_RUNTIME.chainName,
  network: AEGIS_RUNTIME.networkName,
  nativeCurrency: AEGIS_RUNTIME.nativeCurrency,
  rpcUrls: {
    default: { http: [AEGIS_RUNTIME.rpcUrl] },
    public: { http: [AEGIS_RUNTIME.rpcUrl] },
  },
} as const;

export function getAegisExplorerTxUrl(
  hash: string,
  env: AegisRuntimeEnv = AEGIS_RUNTIME_ENV
): string {
  return `${getAegisRuntime(env).explorerTxBaseUrl}${hash}`;
}
