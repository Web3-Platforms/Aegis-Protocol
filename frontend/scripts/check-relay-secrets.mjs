import fs from "node:fs/promises";
import path from "node:path";
import { createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ENV_FILE_PATH = path.join(process.cwd(), ".env.local");
const AI_ORACLE_ABI = [
  {
    type: "function",
    name: "aiOracleAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];

async function parseEnvFile(filePath) {
  try {
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
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function pushResult(collection, symbol, message) {
  collection.push(`${symbol} ${message}`);
}

function isValidPrivateKey(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isIsoDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function detectRuntime(env) {
  if (
    env.RAILWAY_ENVIRONMENT_NAME ||
    env.RAILWAY_ENVIRONMENT_ID ||
    env.RAILWAY_PROJECT_ID
  ) {
    return "railway";
  }

  if (env.VERCEL || env.VERCEL_ENV) {
    return "vercel";
  }

  return "local";
}

function formatAddress(value) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function checkMetadata({ env, versionEnv, rotatedAtEnv, strict, label, passes, warnings, failures }) {
  const version = env[versionEnv]?.trim() ?? "";
  const rotatedAt = env[rotatedAtEnv]?.trim() ?? "";
  const targetWarnings = strict ? failures : warnings;
  const symbol = strict ? "FAIL" : "WARN";

  if (!version) {
    pushResult(targetWarnings, symbol, `${label} metadata is missing ${versionEnv}.`);
  } else {
    pushResult(passes, "PASS", `${label} version metadata is set (${version}).`);
  }

  if (!rotatedAt) {
    pushResult(targetWarnings, symbol, `${label} metadata is missing ${rotatedAtEnv}.`);
    return;
  }

  if (!isIsoDate(rotatedAt)) {
    pushResult(failures, "FAIL", `${rotatedAtEnv} must be a valid ISO-8601 timestamp.`);
    return;
  }

  pushResult(passes, "PASS", `${label} rotation timestamp is valid (${rotatedAt}).`);
}

async function main() {
  const fileEnv = await parseEnvFile(ENV_FILE_PATH);
  const env = { ...fileEnv, ...process.env };

  const passes = [];
  const warnings = [];
  const failures = [];

  const runtime = detectRuntime(env);
  const relayEnabled = env.AI_ORACLE_RELAY_ENABLED === "true";
  const experimentalRoutingEnabled =
    env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING === "true";
  const relayKey = env.AI_ORACLE_PRIVATE_KEY?.trim() ?? "";
  const explicitDatabaseUrl = env.AI_ORACLE_RELAY_DATABASE_URL?.trim() ?? "";
  const fallbackDatabaseUrl = env.DATABASE_URL?.trim() ?? "";
  const databaseUrl = explicitDatabaseUrl || fallbackDatabaseUrl;
  const fileStoreEnabled = env.AI_ORACLE_RELAY_ALLOW_FILE_STORE === "true";
  const rpcUrl = env.NEXT_PUBLIC_PASEO_RPC_URL?.trim() ?? "";
  const vaultAddress = env.NEXT_PUBLIC_AEGIS_VAULT_ADDRESS?.trim() ?? "";

  pushResult(
    passes,
    "PASS",
    `Runtime classified as ${runtime}${env.RAILWAY_ENVIRONMENT_NAME ? ` (${env.RAILWAY_ENVIRONMENT_NAME})` : ""}.`
  );

  const forbiddenKeyEnvs = [
    "PRIVATE_KEY",
    "BOOTSTRAP_OWNER_PRIVATE_KEY",
    "PROOF_WALLET_PRIVATE_KEY",
  ];

  for (const keyEnv of forbiddenKeyEnvs) {
    if (!env[keyEnv]?.trim()) {
      continue;
    }

    if (runtime === "local") {
      pushResult(
        warnings,
        "WARN",
        `${keyEnv} is loaded in the frontend service env. Keep this to local-only operator work.`
      );
    } else {
      pushResult(
        failures,
        "FAIL",
        `${keyEnv} must not be loaded in the frontend/Railway service env.`
      );
    }
  }

  if (!relayEnabled) {
    pushResult(
      passes,
      "PASS",
      "AI_ORACLE_RELAY_ENABLED is false; relay signer secrets are not required for the default public beta."
    );

    if (relayKey) {
      const target = runtime === "local" ? warnings : failures;
      const symbol = runtime === "local" ? "WARN" : "FAIL";
      pushResult(
        target,
        symbol,
        "AI_ORACLE_PRIVATE_KEY is loaded even though the relay is disabled."
      );
    }
  } else {
    pushResult(passes, "PASS", "AI_ORACLE_RELAY_ENABLED is true.");

    if (!relayKey) {
      pushResult(failures, "FAIL", "AI_ORACLE_PRIVATE_KEY is required when the relay is enabled.");
    } else if (!isValidPrivateKey(relayKey)) {
      pushResult(failures, "FAIL", "AI_ORACLE_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
    } else {
      const oracleAddress = privateKeyToAccount(relayKey).address;
      pushResult(
        passes,
        "PASS",
        `Relay signer private key format is valid (${formatAddress(oracleAddress)}).`
      );

      for (const keyEnv of forbiddenKeyEnvs) {
        const otherKey = env[keyEnv]?.trim();
        if (!otherKey || !isValidPrivateKey(otherKey)) {
          continue;
        }

        const duplicateSeverity = runtime === "local" ? warnings : failures;
        const symbol = runtime === "local" ? "WARN" : "FAIL";
        if (otherKey.toLowerCase() === relayKey.toLowerCase()) {
          pushResult(
            duplicateSeverity,
            symbol,
            `AI_ORACLE_PRIVATE_KEY matches ${keyEnv}. Dedicated oracle-only keys are required outside local demo work.`
          );
        }
      }

      checkMetadata({
        env,
        versionEnv: "AI_ORACLE_KEY_VERSION",
        rotatedAtEnv: "AI_ORACLE_KEY_ROTATED_AT",
        strict: runtime !== "local",
        label: "Relay signer",
        passes,
        warnings,
        failures,
      });

      if (!rpcUrl) {
        pushResult(
          failures,
          "FAIL",
          "NEXT_PUBLIC_PASEO_RPC_URL must be set when relay signing is enabled."
        );
      }

      if (!isAddress(vaultAddress)) {
        pushResult(
          failures,
          "FAIL",
          "NEXT_PUBLIC_AEGIS_VAULT_ADDRESS must be a valid address when relay signing is enabled."
        );
      }

      if (rpcUrl && isAddress(vaultAddress)) {
        try {
          const client = createPublicClient({
            transport: http(rpcUrl),
          });

          const configuredOracleAddress = await client.readContract({
            address: vaultAddress,
            abi: AI_ORACLE_ABI,
            functionName: "aiOracleAddress",
          });

          if (configuredOracleAddress.toLowerCase() !== oracleAddress.toLowerCase()) {
            pushResult(
              failures,
              "FAIL",
              `Relay signer ${formatAddress(oracleAddress)} does not match vault aiOracleAddress ${formatAddress(configuredOracleAddress)}.`
            );
          } else {
            pushResult(
              passes,
              "PASS",
              `Relay signer matches the vault aiOracleAddress (${formatAddress(oracleAddress)}).`
            );
          }
        } catch (error) {
          pushResult(
            failures,
            "FAIL",
            `Unable to read aiOracleAddress from the configured vault: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  if (fileStoreEnabled && runtime !== "local") {
    pushResult(
      failures,
      "FAIL",
      "AI_ORACLE_RELAY_ALLOW_FILE_STORE=true is only allowed for local single-instance prototype work."
    );
  } else if (fileStoreEnabled) {
    pushResult(
      warnings,
      "WARN",
      "File-store relay mode is enabled. Keep this to local single-instance prototype work only."
    );
  }

  if (!databaseUrl && relayEnabled && !fileStoreEnabled) {
    pushResult(
      failures,
      "FAIL",
      "Relay-enabled deployments need AI_ORACLE_RELAY_DATABASE_URL or DATABASE_URL unless local file-store mode is explicitly enabled."
    );
  } else if (databaseUrl) {
    pushResult(
      passes,
      "PASS",
      `Relay storage is configured for ${explicitDatabaseUrl ? "AI_ORACLE_RELAY_DATABASE_URL" : "DATABASE_URL"}.`
    );
  }

  if (
    explicitDatabaseUrl &&
    fallbackDatabaseUrl &&
    explicitDatabaseUrl !== fallbackDatabaseUrl
  ) {
    pushResult(
      warnings,
      "WARN",
      "AI_ORACLE_RELAY_DATABASE_URL and DATABASE_URL are both set with different values. The relay will prefer AI_ORACLE_RELAY_DATABASE_URL."
    );
  }

  if (experimentalRoutingEnabled && !relayEnabled) {
    pushResult(
      warnings,
      "WARN",
      "NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING is true while AI_ORACLE_RELAY_ENABLED is false. The UI can expose operator flows that the server will reject."
    );
  }

  console.log("\nAEGIS-703 relay secret posture\n");
  for (const line of passes) {
    console.log(line);
  }

  if (warnings.length > 0) {
    console.log("");
    for (const line of warnings) {
      console.log(line);
    }
  }

  if (failures.length > 0) {
    console.error("");
    for (const line of failures) {
      console.error(line);
    }
    process.exitCode = 1;
    return;
  }

  if (warnings.length > 0) {
    console.log(
      "\nWARN: relay secret posture is acceptable for the current environment, with warnings."
    );
    return;
  }

  console.log("\nPASS: relay secret posture is acceptable for the current environment.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
