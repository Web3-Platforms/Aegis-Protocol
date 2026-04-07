const fs = require("node:fs/promises");
const path = require("node:path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const ZERO_ADDRESS = ethers.ZeroAddress;
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const FORBIDDEN_KEYS = new Set([
  "destParachainId",
  "assetData",
  "weightLimit",
  "feeAssetItem",
  "targetWeights",
  "rebalancing",
  "routes",
  "routing",
  "oracleAddressEnv",
  "requireDedicatedOracle",
  "globalRouteCap",
  "assetTypeCaps",
]);

const VAULT_READ_ABI = [
  "function owner() view returns (address)",
  "function launchToken() view returns (address)",
  "function depositsPaused() view returns (bool)",
  "function withdrawalsPaused() view returns (bool)",
  "function supportedTokens(address) view returns (bool)",
  "function totalDeposits(address) view returns (uint256)",
  "function getVaultBalance(address) view returns (uint256)",
  "function getUserDeposit(address, address) view returns (uint256)"
];

const VAULT_WRITE_ABI = [
  "function deposit(address, uint256)",
  "function withdraw(address, uint256)",
  "function setDepositsPaused(bool)",
  "function setWithdrawalsPaused(bool)",
  "function transferOwnership(address)"
];

const ERC20_METADATA_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const ERC20_ACCOUNTING_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)"
];

function usage(scriptName) {
  return [
    `Usage: node scripts/launch/${scriptName} (--profile <profile> | --config <path>) [options]`,
    "",
    "Choose one profile source:",
    "  --profile <name>        Launch profile name (e.g. moonbeam-pilot)",
    "  --config <path>         Explicit path to a launch config JSON file",
    "",
    "Common options:",
    "  --frontend-env <path>   Optional frontend env file to verify feature flags (verify only)",
    "  --mode <plan|execute>   Only used by prepare-bootstrap.js (default: plan)",
    "  --help                  Show this message",
    "",
    "Examples:",
    "  node scripts/launch/verify-bootstrap.js --profile moonbeam-pilot",
    "  node scripts/launch/verify-bootstrap.js --config config/launch/moonbase-staging.json",
    "  node scripts/launch/prepare-bootstrap.js --profile moonbeam-pilot --mode plan",
    "  node scripts/launch/prepare-bootstrap.js --profile moonbeam-pilot --mode execute",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    if (key === "help") {
      args.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

async function parseEnvFile(filePath) {
  const contents = await fs.readFile(filePath, "utf8");
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

async function buildRuntimeEnv(frontendEnvPath) {
  const runtimeEnv = { ...process.env };
  let frontendEnv = {};

  if (frontendEnvPath) {
    const resolvedPath = path.resolve(process.cwd(), frontendEnvPath);
    frontendEnv = await parseEnvFile(resolvedPath);
    for (const [key, value] of Object.entries(frontendEnv)) {
      if (key.startsWith("NEXT_PUBLIC_")) {
        runtimeEnv[key] = value;
      } else if (runtimeEnv[key] === undefined) {
        runtimeEnv[key] = value;
      }
    }
  }

  return { runtimeEnv, frontendEnv };
}

function assertNoForbiddenKeys(value, trail = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenKeys(value[index], [...trail, String(index)]);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      const location = [...trail, key].join(".");
      throw new Error(
        `Launch config contains forbidden launch-shape field "${location}". ` +
          "AEGIS-408 must stay on the reduced-surface vault-only launch path."
      );
    }
    assertNoForbiddenKeys(nested, [...trail, key]);
  }
}

async function loadLaunchConfig({ profile, configPath, frontendEnvPath }) {
  if (!profile && !configPath) {
    throw new Error("Provide --profile <name> or --config <path>.");
  }
  if (profile && configPath) {
    throw new Error("Provide either --profile <name> or --config <path>, not both.");
  }

  const resolvedConfigPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : path.join(REPO_ROOT, "config", "launch", `${profile}.json`);

  const rawConfig = JSON.parse(await fs.readFile(resolvedConfigPath, "utf8"));
  assertNoForbiddenKeys(rawConfig);

  const { runtimeEnv, frontendEnv } = await buildRuntimeEnv(frontendEnvPath);

  return {
    config: rawConfig,
    configPath: resolvedConfigPath,
    frontendEnv,
    runtimeEnv,
  };
}

function resolveValue({ value, env }, runtimeEnv, label) {
  const resolved = value ?? (env ? runtimeEnv[env] : undefined);
  if (resolved === undefined || resolved === null || resolved === "") {
    const source = env ? `env ${env}` : "config";
    throw new Error(`Missing ${label}; expected value from ${source}.`);
  }
  return resolved;
}

function resolveAddress(spec, runtimeEnv, label) {
  const raw = resolveValue(spec, runtimeEnv, label);
  if (!ethers.isAddress(raw)) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }
  return ethers.getAddress(raw);
}

function resolveOptionalAddress(spec, runtimeEnv, label) {
  if (!spec) {
    return null;
  }

  const raw = spec.value ?? (spec.env ? runtimeEnv[spec.env] : undefined);
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }

  if (!ethers.isAddress(raw)) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }

  return ethers.getAddress(raw);
}

function resolveBigInt(spec, runtimeEnv, label) {
  const raw = resolveValue(spec, runtimeEnv, label);
  try {
    return BigInt(raw);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }
}

function resolveBoolean(spec, runtimeEnv, label) {
  const raw = resolveValue(spec, runtimeEnv, label);
  if (raw === true || raw === false) {
    return raw;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`Invalid ${label}: expected true/false but received ${raw}`);
}

function resolveTokenConfig(token, runtimeEnv) {
  const resolved = {
    label: token.label,
    address: resolveAddress(token.address ? { value: token.address } : { env: token.addressEnv }, runtimeEnv, `${token.label} address`),
    symbol: token.symbol ?? (token.symbolEnv ? resolveValue({ env: token.symbolEnv }, runtimeEnv, `${token.label} symbol`) : undefined),
    name: token.name ?? (token.nameEnv ? resolveValue({ env: token.nameEnv }, runtimeEnv, `${token.label} name`) : undefined),
    decimals: Number(token.decimals),
    smokeTestAmount: token.smokeTestAmount,
  };

  if (!Number.isInteger(resolved.decimals) || resolved.decimals < 0) {
    throw new Error(`Invalid decimals for ${token.label}: ${token.decimals}`);
  }

  return resolved;
}

function resolveLaunchProfile(config, runtimeEnv) {
  if (config.launchMode !== "vault_only") {
    throw new Error(
      `Unsupported launch mode "${config.launchMode}". AEGIS-408 only supports the reduced-surface vault-only launch path.`
    );
  }

  const rpcUrl = runtimeEnv[config.network.rpcEnv];
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL in env ${config.network.rpcEnv}`);
  }

  return {
    profile: config.profile,
    launchMode: config.launchMode,
    config,
    rpcUrl,
    network: {
      name: config.network.name,
      chainId: Number(config.network.chainId),
    },
    vault: {
      address: resolveAddress({ env: config.vault.addressEnv }, runtimeEnv, "vault address"),
      ownerAddress: resolveAddress({ env: config.vault.ownerAddressEnv }, runtimeEnv, "vault owner address"),
      deployerAddress: resolveAddress({ env: config.vault.deployerAddressEnv }, runtimeEnv, "vault deployer address"),
      bootstrapOwnerKeyEnv: config.vault.bootstrapOwnerKeyEnv,
      requireOwnerContract: Boolean(config.vault.requireOwnerContract),
    },
    operations: {
      expectedDepositsPaused: Boolean(config.operations.expectedDepositsPaused),
      expectedWithdrawalsPaused: Boolean(config.operations.expectedWithdrawalsPaused),
    },
    frontend: config.frontend
      ? {
          experimentalRoutingEnv: config.frontend.experimentalRoutingEnv,
          expectedExperimentalRouting: resolveBoolean(
            { value: config.frontend.expectedExperimentalRouting },
            runtimeEnv,
            "frontend experimental routing expectation"
          ),
        }
      : null,
    tokens: config.tokens.map((token) => resolveTokenConfig(token, runtimeEnv)),
  };
}

function getProvider(profile) {
  return new ethers.JsonRpcProvider(profile.rpcUrl);
}

function getVaultContract(profile, providerOrSigner) {
  return new ethers.Contract(
    profile.vault.address,
    [...VAULT_READ_ABI, ...VAULT_WRITE_ABI],
    providerOrSigner
  );
}

function getTokenContract(address, provider) {
  return new ethers.Contract(
    address,
    [...ERC20_METADATA_ABI, ...ERC20_ACCOUNTING_ABI],
    provider
  );
}

async function collectVaultState(profile, provider) {
  const vault = getVaultContract(profile, provider);
  const state = {
    owner: ethers.getAddress(await vault.owner()),
    launchToken: ethers.getAddress(await vault.launchToken()),
    depositsPaused: await vault.depositsPaused(),
    withdrawalsPaused: await vault.withdrawalsPaused(),
    tokens: [],
  };

  for (const token of profile.tokens) {
    const tokenContract = getTokenContract(token.address, provider);
    const tokenState = {
      ...token,
      supported: await vault.supportedTokens(token.address),
      totalDeposits: await vault.totalDeposits(token.address),
      symbol: await tokenContract.symbol(),
      decimals: Number(await tokenContract.decimals()),
      name: null,
      vaultBalance: await vault.getVaultBalance(token.address),
    };

    try {
      tokenState.name = await tokenContract.name();
    } catch {
      tokenState.name = null;
    }

    state.tokens.push(tokenState);
  }

  return state;
}

function formatUnitsIfPossible(amount, decimals) {
  try {
    return ethers.formatUnits(amount, decimals);
  } catch {
    return amount.toString();
  }
}

module.exports = {
  REPO_ROOT,
  ZERO_ADDRESS,
  assertNoForbiddenKeys,
  collectVaultState,
  formatUnitsIfPossible,
  getProvider,
  getTokenContract,
  getVaultContract,
  loadLaunchConfig,
  parseArgs,
  resolveAddress,
  resolveBigInt,
  resolveBoolean,
  resolveLaunchProfile,
  resolveValue,
  usage,
};
