const { ethers } = require("ethers");
const {
  loadLaunchConfig,
  parseArgs,
  resolveLaunchProfile,
  usage,
} = require("./common");

function postureUsage() {
  return [
    usage("check-key-posture.js"),
    "",
    "Examples:",
    "  node scripts/launch/check-key-posture.js --profile moonbase-staging",
    "  node scripts/launch/check-key-posture.js --profile moonbeam-pilot",
  ].join("\n");
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

function formatAddress(value) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function deriveAddress(privateKey) {
  return ethers.getAddress(new ethers.Wallet(privateKey).address);
}

function validateMetadata({
  runtimeEnv,
  keyPresent,
  label,
  versionEnv,
  rotatedAtEnv,
  passes,
  warnings,
  failures,
}) {
  if (!keyPresent) {
    return;
  }

  const version = runtimeEnv[versionEnv]?.trim() ?? "";
  const rotatedAt = runtimeEnv[rotatedAtEnv]?.trim() ?? "";

  if (!version) {
    pushResult(failures, "FAIL", `${label} is loaded but ${versionEnv} is missing.`);
  } else {
    pushResult(passes, "PASS", `${label} version metadata is set (${version}).`);
  }

  if (!rotatedAt) {
    pushResult(failures, "FAIL", `${label} is loaded but ${rotatedAtEnv} is missing.`);
    return;
  }

  if (!isIsoDate(rotatedAt)) {
    pushResult(failures, "FAIL", `${rotatedAtEnv} must be a valid ISO-8601 timestamp.`);
    return;
  }

  pushResult(passes, "PASS", `${label} rotation timestamp is valid (${rotatedAt}).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(postureUsage());
    return;
  }

  const { config, runtimeEnv } = await loadLaunchConfig({
    profile: args.profile,
    configPath: args.config,
  });
  const profile = resolveLaunchProfile(config, runtimeEnv);

  const passes = [];
  const warnings = [];
  const failures = [];

  if (
    profile.vault.deployerAddress.toLowerCase() ===
    profile.vault.ownerAddress.toLowerCase()
  ) {
    pushResult(failures, "FAIL", "Configured deployer and owner addresses overlap.");
  } else {
    pushResult(passes, "PASS", "Configured deployer and owner addresses are distinct.");
  }

  const keyChecks = [
    {
      label: "Deployer key",
      keyEnv: "PRIVATE_KEY",
      expectedAddress: profile.vault.deployerAddress,
      versionEnv: "DEPLOYER_KEY_VERSION",
      rotatedAtEnv: "DEPLOYER_KEY_ROTATED_AT",
      warnIfMissing:
        "PRIVATE_KEY is not loaded. Deploy/bootstrap commands cannot run from this environment until the deployer key is injected.",
      shouldCompare: true,
    },
    {
      label: "Bootstrap owner key",
      keyEnv: profile.vault.bootstrapOwnerKeyEnv,
      expectedAddress: null,
      versionEnv: "BOOTSTRAP_OWNER_KEY_VERSION",
      rotatedAtEnv: "BOOTSTRAP_OWNER_KEY_ROTATED_AT",
      warnIfMissing:
        `${profile.vault.bootstrapOwnerKeyEnv} is not loaded. Prepare execute mode is unavailable from this environment until that transitional key is injected.`,
      shouldCompare: false,
    },
    {
      label: "Proof wallet key",
      keyEnv: "PROOF_WALLET_PRIVATE_KEY",
      expectedAddress: null,
      versionEnv: "PROOF_WALLET_KEY_VERSION",
      rotatedAtEnv: "PROOF_WALLET_KEY_ROTATED_AT",
      warnIfMissing:
        "PROOF_WALLET_PRIVATE_KEY is not loaded. launch:prove cannot run from this environment until the proof wallet key is injected.",
      shouldCompare: false,
    },
  ];

  const resolvedKeys = [];

  for (const check of keyChecks) {
    const privateKey = runtimeEnv[check.keyEnv]?.trim() ?? "";

    if (!privateKey) {
      pushResult(warnings, "WARN", check.warnIfMissing);
      continue;
    }

    if (!isValidPrivateKey(privateKey)) {
      pushResult(
        failures,
        "FAIL",
        `${check.keyEnv} must be a 0x-prefixed 32-byte hex string.`
      );
      continue;
    }

    const address = deriveAddress(privateKey);
    resolvedKeys.push({
      label: check.label,
      keyEnv: check.keyEnv,
      address,
      privateKey,
    });

    pushResult(
      passes,
      "PASS",
      `${check.label} is loaded (${formatAddress(address)}).`
    );

    validateMetadata({
      runtimeEnv,
      keyPresent: true,
      label: check.label,
      versionEnv: check.versionEnv,
      rotatedAtEnv: check.rotatedAtEnv,
      passes,
      warnings,
      failures,
    });

    if (check.shouldCompare && check.expectedAddress) {
      if (address.toLowerCase() !== check.expectedAddress.toLowerCase()) {
        pushResult(
          failures,
          "FAIL",
          `${check.label} resolves to ${formatAddress(address)}, but the profile expects ${formatAddress(check.expectedAddress)}.`
        );
      } else {
        pushResult(
          passes,
          "PASS",
          `${check.label} matches the profile address (${formatAddress(address)}).`
        );
      }
    }

    if (check.keyEnv === profile.vault.bootstrapOwnerKeyEnv) {
      pushResult(
        warnings,
        "WARN",
        `${profile.vault.bootstrapOwnerKeyEnv} is a transitional secret and should be retired after ownership handoff.`
      );
    }
  }

  for (let index = 0; index < resolvedKeys.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < resolvedKeys.length; compareIndex += 1) {
      const left = resolvedKeys[index];
      const right = resolvedKeys[compareIndex];

      if (left.privateKey.toLowerCase() === right.privateKey.toLowerCase()) {
        pushResult(
          failures,
          "FAIL",
          `${left.label} and ${right.label} reuse the same private key. Protected environments require dedicated keys per role.`
        );
      }
    }
  }

  console.log("\nAEGIS-703 launch key posture\n");
  console.log(`Profile: ${profile.profile}`);
  console.log(`Owner  : ${profile.vault.ownerAddress}`);
  console.log(`Deployer: ${profile.vault.deployerAddress}\n`);

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
      "\nWARN: launch key posture is acceptable for the current environment, with warnings."
    );
    return;
  }

  console.log("\nPASS: launch key posture is acceptable for the current environment.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
