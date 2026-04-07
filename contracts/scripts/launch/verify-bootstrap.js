const {
  collectVaultState,
  getProvider,
  loadLaunchConfig,
  parseArgs,
  resolveLaunchProfile,
  usage,
} = require("./common");

function pushResult(collection, symbol, message) {
  collection.push(`${symbol} ${message}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage("verify-bootstrap.js"));
    return;
  }

  const { config, configPath, frontendEnv, runtimeEnv } = await loadLaunchConfig({
    profile: args.profile,
    configPath: args.config,
    frontendEnvPath: args["frontend-env"],
  });
  const profile = resolveLaunchProfile(config, runtimeEnv);
  const provider = getProvider(profile);

  const failures = [];
  const warnings = [];
  const passes = [];

  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== profile.network.chainId) {
    pushResult(
      failures,
      "FAIL",
      `Chain ID mismatch. Expected ${profile.network.chainId} (${profile.network.name}), received ${chainId}.`
    );
  } else {
    pushResult(passes, "PASS", `Connected to ${profile.network.name} (chainId ${chainId}).`);
  }

  const state = await collectVaultState(profile, provider);

  if (state.owner !== profile.vault.ownerAddress) {
    pushResult(
      failures,
      "FAIL",
      `Vault owner mismatch. Expected ${profile.vault.ownerAddress}, received ${state.owner}.`
    );
  } else {
    pushResult(passes, "PASS", `Vault owner matches expected address ${state.owner}.`);
  }

  if (profile.vault.deployerAddress === state.owner) {
    pushResult(failures, "FAIL", "Deployer is still the vault owner.");
  } else {
    pushResult(passes, "PASS", "Deployer is not the current owner.");
  }

  if (profile.vault.requireOwnerContract) {
    const ownerCode = await provider.getCode(state.owner);
    if (ownerCode === "0x") {
      pushResult(failures, "FAIL", "Owner address has no contract code; expected a multisig contract.");
    } else {
      pushResult(passes, "PASS", "Owner address has deployed contract code.");
    }
  }

  if (state.depositsPaused !== profile.operations.expectedDepositsPaused) {
    pushResult(
      failures,
      "FAIL",
      `depositsPaused mismatch. Expected ${profile.operations.expectedDepositsPaused}, received ${state.depositsPaused}.`
    );
  } else {
    pushResult(passes, "PASS", `depositsPaused is ${state.depositsPaused}.`);
  }

  if (state.withdrawalsPaused !== profile.operations.expectedWithdrawalsPaused) {
    pushResult(
      failures,
      "FAIL",
      `withdrawalsPaused mismatch. Expected ${profile.operations.expectedWithdrawalsPaused}, received ${state.withdrawalsPaused}.`
    );
  } else {
    pushResult(passes, "PASS", `withdrawalsPaused is ${state.withdrawalsPaused}.`);
  }

  if (profile.frontend) {
    const frontendEnvPath = args["frontend-env"];
    const frontendFlagSource = frontendEnvPath ? frontendEnv : runtimeEnv;
    const rawFlag = frontendFlagSource[profile.frontend.experimentalRoutingEnv];
    if (rawFlag === undefined) {
      pushResult(
        frontendEnvPath ? failures : warnings,
        frontendEnvPath ? "FAIL" : "WARN",
        frontendEnvPath
          ? `Frontend flag ${profile.frontend.experimentalRoutingEnv} was not found in ${frontendEnvPath}; cannot verify the actual frontend launch posture.`
          : `Frontend flag ${profile.frontend.experimentalRoutingEnv} was not supplied; experimental-routing drift was not verified.`
      );
    } else {
      const experimentalRoutingEnabled = rawFlag === "true";
      if (experimentalRoutingEnabled !== profile.frontend.expectedExperimentalRouting) {
        pushResult(
          failures,
          "FAIL",
          `Frontend routing flag mismatch. Expected ${profile.frontend.expectedExperimentalRouting}, received ${experimentalRoutingEnabled}.`
        );
      } else {
        pushResult(
          passes,
          "PASS",
          `Frontend routing flag ${profile.frontend.experimentalRoutingEnv} matches the expected launch posture.`
        );
      }
    }
  }

  const launchToken = profile.tokens[0];
  if (state.launchToken !== launchToken.address) {
    pushResult(
      failures,
      "FAIL",
      `Launch token mismatch. Expected ${launchToken.address}, received ${state.launchToken}.`
    );
  } else {
    pushResult(passes, "PASS", `Launch token matches expected address ${state.launchToken}.`);
  }

  for (const tokenState of state.tokens) {
    const tokenProfile = profile.tokens.find((token) => token.address === tokenState.address);

    if (!tokenState.supported) {
      pushResult(failures, "FAIL", `${tokenState.label} is not whitelisted in the vault.`);
    } else {
      pushResult(passes, "PASS", `${tokenState.label} is whitelisted.`);
    }

    if (tokenState.decimals !== tokenProfile.decimals) {
      pushResult(
        failures,
        "FAIL",
        `${tokenState.label} decimals mismatch. Expected ${tokenProfile.decimals}, received ${tokenState.decimals}.`
      );
    } else {
      pushResult(passes, "PASS", `${tokenState.label} decimals match (${tokenState.decimals}).`);
    }

    if (tokenProfile.symbol && tokenState.symbol !== tokenProfile.symbol) {
      pushResult(
        failures,
        "FAIL",
        `${tokenState.label} symbol mismatch. Expected ${tokenProfile.symbol}, received ${tokenState.symbol}.`
      );
    } else if (tokenProfile.symbol) {
      pushResult(passes, "PASS", `${tokenState.label} symbol matches (${tokenState.symbol}).`);
    }

    if (tokenProfile.name && tokenState.name !== tokenProfile.name) {
      pushResult(
        warnings,
        "WARN",
        `${tokenState.label} name mismatch. Expected ${tokenProfile.name}, received ${tokenState.name}.`
      );
    }
  }

  console.log(`\nAEGIS-408 verify-bootstrap`);
  console.log(`Config: ${configPath}`);
  console.log(`Vault : ${profile.vault.address}`);
  console.log("");

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

  console.log("\nPASS: launch bootstrap invariants satisfied.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
