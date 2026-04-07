const fs = require("node:fs/promises");
const path = require("node:path");
const { ethers } = require("ethers");

const { REPO_ROOT, assertNoForbiddenKeys } = require("./common");

const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

function assertPlainObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must be an object.`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertEnvName(value, label) {
  assertString(value, label);
  if (!ENV_NAME_RE.test(value)) {
    throw new Error(`${label} must be an uppercase env var name.`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be true or false.`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertBigIntSpec(spec, label) {
  assertPlainObject(spec, label);

  const hasEnv = Object.prototype.hasOwnProperty.call(spec, "env");
  const hasValue = Object.prototype.hasOwnProperty.call(spec, "value");

  if (hasEnv === hasValue) {
    throw new Error(`${label} must define exactly one of "env" or "value".`);
  }

  if (hasEnv) {
    assertEnvName(spec.env, `${label}.env`);
    return;
  }

  try {
    BigInt(spec.value);
  } catch {
    throw new Error(`${label}.value must be a bigint-compatible value.`);
  }
}

function assertAddressReference(token, label) {
  const hasAddress = typeof token.address === "string";
  const hasAddressEnv = typeof token.addressEnv === "string";

  if (hasAddress === hasAddressEnv) {
    throw new Error(`${label} must define exactly one of "address" or "addressEnv".`);
  }

  if (hasAddress) {
    if (!ethers.isAddress(token.address)) {
      throw new Error(`${label}.address is not a valid EVM address.`);
    }
    return;
  }

  assertEnvName(token.addressEnv, `${label}.addressEnv`);
}

function assertOptionalEnvName(value, label) {
  if (value === undefined) {
    return;
  }
  assertEnvName(value, label);
}

function assertSmokeTestAmount(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} must be provided.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number-like value.`);
  }
}

function validateToken(token, index) {
  const label = `tokens[${index}]`;
  assertPlainObject(token, label);
  assertString(token.label, `${label}.label`);
  assertAddressReference(token, label);

  const decimals = Number(token.decimals);
  assertNonNegativeInteger(decimals, `${label}.decimals`);

  if (token.symbol !== undefined) {
    assertString(token.symbol, `${label}.symbol`);
  }
  assertOptionalEnvName(token.symbolEnv, `${label}.symbolEnv`);

  if (token.name !== undefined) {
    assertString(token.name, `${label}.name`);
  }
  assertOptionalEnvName(token.nameEnv, `${label}.nameEnv`);

  assertSmokeTestAmount(token.smokeTestAmount, `${label}.smokeTestAmount`);

  if (token.assetRegistry !== undefined) {
    assertPlainObject(token.assetRegistry, `${label}.assetRegistry`);
    assertPositiveInteger(
      Number(token.assetRegistry.reserveParachainId),
      `${label}.assetRegistry.reserveParachainId`
    );
    assertPositiveInteger(
      Number(token.assetRegistry.reserveAssetId),
      `${label}.assetRegistry.reserveAssetId`
    );
    assertPositiveInteger(
      Number(token.assetRegistry.packedLocator),
      `${label}.assetRegistry.packedLocator`
    );
  }
}

function validateConfig(config, filePath) {
  const fileName = path.basename(filePath, ".json");

  assertPlainObject(config, fileName);
  assertNoForbiddenKeys(config);
  assertString(config.profile, `${fileName}.profile`);

  if (config.profile !== fileName) {
    throw new Error(`${fileName}.profile must match the config filename.`);
  }

  if (config.launchMode !== "vault_only") {
    throw new Error(`${fileName}.launchMode must remain "vault_only".`);
  }

  assertPlainObject(config.network, `${fileName}.network`);
  assertString(config.network.name, `${fileName}.network.name`);
  assertPositiveInteger(Number(config.network.chainId), `${fileName}.network.chainId`);
  assertEnvName(config.network.rpcEnv, `${fileName}.network.rpcEnv`);

  assertPlainObject(config.vault, `${fileName}.vault`);
  assertEnvName(config.vault.addressEnv, `${fileName}.vault.addressEnv`);
  assertEnvName(config.vault.ownerAddressEnv, `${fileName}.vault.ownerAddressEnv`);
  assertEnvName(config.vault.deployerAddressEnv, `${fileName}.vault.deployerAddressEnv`);
  assertEnvName(
    config.vault.bootstrapOwnerKeyEnv,
    `${fileName}.vault.bootstrapOwnerKeyEnv`
  );
  assertBoolean(config.vault.requireOwnerContract, `${fileName}.vault.requireOwnerContract`);

  assertPlainObject(config.operations, `${fileName}.operations`);
  assertBoolean(
    config.operations.expectedDepositsPaused,
    `${fileName}.operations.expectedDepositsPaused`
  );
  assertBoolean(
    config.operations.expectedWithdrawalsPaused,
    `${fileName}.operations.expectedWithdrawalsPaused`
  );

  if (config.frontend !== undefined) {
    assertPlainObject(config.frontend, `${fileName}.frontend`);
    assertEnvName(
      config.frontend.experimentalRoutingEnv,
      `${fileName}.frontend.experimentalRoutingEnv`
    );
    assertBoolean(
      config.frontend.expectedExperimentalRouting,
      `${fileName}.frontend.expectedExperimentalRouting`
    );
  }

  if (!Array.isArray(config.tokens) || config.tokens.length !== 1) {
    throw new Error(`${fileName}.tokens must contain exactly one launch token.`);
  }

  config.tokens.forEach((token, index) => validateToken(token, index));
}

async function main() {
  const configDir = path.join(REPO_ROOT, "config", "launch");
  const fileNames = (await fs.readdir(configDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  if (fileNames.length === 0) {
    throw new Error("No launch config files found.");
  }

  for (const fileName of fileNames) {
    const filePath = path.join(configDir, fileName);
    const config = JSON.parse(await fs.readFile(filePath, "utf8"));
    validateConfig(config, filePath);
    console.log(`PASS ${fileName}`);
  }

  console.log(`\nPASS: validated ${fileNames.length} launch profile(s).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
