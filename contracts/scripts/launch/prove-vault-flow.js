const { ethers } = require("ethers");
const {
  collectVaultState,
  formatUnitsIfPossible,
  getProvider,
  getTokenContract,
  getVaultContract,
  loadLaunchConfig,
  parseArgs,
  resolveLaunchProfile,
  usage,
} = require("./common");

const DEFAULT_PROOF_KEY_ENV = "PROOF_WALLET_PRIVATE_KEY";

function proveUsage() {
  return [
    usage("prove-vault-flow.js"),
    "",
    "Proof options:",
    `  --proof-key-env <name>  Env var for the proof wallet private key (default: ${DEFAULT_PROOF_KEY_ENV})`,
    "",
    "Examples:",
    "  node scripts/launch/prove-vault-flow.js --profile moonbase-staging",
    "  node scripts/launch/prove-vault-flow.js --config config/launch/moonbeam-pilot.json",
    "  node scripts/launch/prove-vault-flow.js --profile moonbeam-pilot --proof-key-env PILOT_PROOF_WALLET_PRIVATE_KEY",
  ].join("\n");
}

function parseSmokeTestAmount(token) {
  if (token.smokeTestAmount === undefined || token.smokeTestAmount === null) {
    throw new Error(`Missing smokeTestAmount for ${token.label}.`);
  }

  try {
    const amount = ethers.parseUnits(String(token.smokeTestAmount), token.decimals);
    if (amount <= 0n) {
      throw new Error("must be greater than zero");
    }
    return amount;
  } catch (error) {
    throw new Error(
      `Invalid smokeTestAmount for ${token.label}: ${token.smokeTestAmount} (${error.message}).`
    );
  }
}

function assertProofProfile(profile) {
  if (profile.operations.expectedDepositsPaused) {
    throw new Error("Proof flow requires deposits to be unpaused in the target launch profile.");
  }

  if (profile.operations.expectedWithdrawalsPaused) {
    throw new Error("Proof flow requires withdrawals to be unpaused in the target launch profile.");
  }
}

async function assertLaunchGuards(profile, state, provider, proofWalletAddress) {
  if (state.depositsPaused !== profile.operations.expectedDepositsPaused) {
    throw new Error(
      `depositsPaused mismatch. Expected ${profile.operations.expectedDepositsPaused}, received ${state.depositsPaused}.`
    );
  }

  if (state.withdrawalsPaused !== profile.operations.expectedWithdrawalsPaused) {
    throw new Error(
      `withdrawalsPaused mismatch. Expected ${profile.operations.expectedWithdrawalsPaused}, received ${state.withdrawalsPaused}.`
    );
  }

  const launchToken = profile.tokens[0];
  if (state.launchToken !== launchToken.address) {
    throw new Error(
      `Launch token mismatch. Expected ${launchToken.address}, received ${state.launchToken}.`
    );
  }

  await Promise.all(
    state.tokens.map(async (tokenState) => {
      if (!tokenState.supported) {
        throw new Error(`${tokenState.label} is not whitelisted in the vault.`);
      }

      const smokeTestAmount = parseSmokeTestAmount(tokenState);
      const token = getTokenContract(tokenState.address, provider);
      const proofBalance = await token.balanceOf(proofWalletAddress);
      if (proofBalance < smokeTestAmount) {
        throw new Error(
          `${tokenState.label} proof wallet balance ${formatUnitsIfPossible(
            proofBalance,
            tokenState.decimals
          )} is below smokeTestAmount ${formatUnitsIfPossible(
            smokeTestAmount,
            tokenState.decimals
          )}.`
        );
      }
    })
  );
}

async function assertOperationalState(vault, profile, tokenAddress) {
  const [launchToken, depositsPaused, withdrawalsPaused, supported] = await Promise.all([
    vault.launchToken(),
    vault.depositsPaused(),
    vault.withdrawalsPaused(),
    vault.supportedTokens(tokenAddress),
  ]);

  if (ethers.getAddress(launchToken) !== tokenAddress) {
    throw new Error(`Launch token drift detected. Expected ${tokenAddress}, received ${launchToken}.`);
  }

  if (depositsPaused !== profile.operations.expectedDepositsPaused) {
    throw new Error(
      `depositsPaused drift detected. Expected ${profile.operations.expectedDepositsPaused}, received ${depositsPaused}.`
    );
  }

  if (withdrawalsPaused !== profile.operations.expectedWithdrawalsPaused) {
    throw new Error(
      `withdrawalsPaused drift detected. Expected ${profile.operations.expectedWithdrawalsPaused}, received ${withdrawalsPaused}.`
    );
  }

  if (!supported) {
    throw new Error(`Supported-token drift detected for launch token ${tokenAddress}.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(proveUsage());
    return;
  }

  const { config, configPath, runtimeEnv } = await loadLaunchConfig({
    profile: args.profile,
    configPath: args.config,
  });
  const profile = resolveLaunchProfile(config, runtimeEnv);
  assertProofProfile(profile);

  const proofKeyEnv = args["proof-key-env"] ?? DEFAULT_PROOF_KEY_ENV;
  const rawPrivateKey = runtimeEnv[proofKeyEnv];

  if (!rawPrivateKey) {
    throw new Error(`Missing proof wallet private key in env ${proofKeyEnv}.`);
  }

  const provider = getProvider(profile);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== profile.network.chainId) {
    throw new Error(
      `Chain ID mismatch. Expected ${profile.network.chainId} (${profile.network.name}), received ${chainId}.`
    );
  }

  const proofSigner = new ethers.Wallet(rawPrivateKey, provider);
  const proofWalletAddress = ethers.getAddress(proofSigner.address);
  const initialState = await collectVaultState(profile, provider);

  await assertLaunchGuards(profile, initialState, provider, proofWalletAddress);

  const writableVault = getVaultContract(profile, proofSigner);
  const results = [];

  for (const tokenState of initialState.tokens) {
    const tokenAddress = tokenState.address;
    const smokeTestAmount = parseSmokeTestAmount(tokenState);
    const token = getTokenContract(tokenAddress, proofSigner);
    const beforeDeposit = await writableVault.getUserDeposit(proofWalletAddress, tokenAddress);
    const beforeTotalDeposits = await writableVault.totalDeposits(tokenAddress);
    const beforeVaultBalance = await writableVault.getVaultBalance(tokenAddress);
    const allowance = await token.allowance(proofWalletAddress, profile.vault.address);
    let resetApprovalTxHash = null;

    if (allowance > 0n) {
      const resetTx = await token.approve(profile.vault.address, 0);
      resetApprovalTxHash = resetTx.hash;
      await resetTx.wait();
    }

    const approveTx = await token.approve(profile.vault.address, smokeTestAmount);
    await approveTx.wait();

    const depositTx = await writableVault.deposit(tokenAddress, smokeTestAmount);
    await depositTx.wait();

    await assertOperationalState(writableVault, profile, tokenAddress);

    const afterDeposit = await writableVault.getUserDeposit(proofWalletAddress, tokenAddress);
    const afterDepositTotals = await writableVault.totalDeposits(tokenAddress);
    const afterDepositVaultBalance = await writableVault.getVaultBalance(tokenAddress);
    if (afterDeposit !== beforeDeposit + smokeTestAmount) {
      throw new Error(
        `${tokenState.label} deposit balance mismatch after deposit. Expected ${formatUnitsIfPossible(
          beforeDeposit + smokeTestAmount,
          tokenState.decimals
        )}, received ${formatUnitsIfPossible(afterDeposit, tokenState.decimals)}.`
      );
    }
    if (afterDepositTotals !== beforeTotalDeposits + smokeTestAmount) {
      throw new Error(
        `${tokenState.label} totalDeposits mismatch after deposit. Expected ${formatUnitsIfPossible(
          beforeTotalDeposits + smokeTestAmount,
          tokenState.decimals
        )}, received ${formatUnitsIfPossible(afterDepositTotals, tokenState.decimals)}.`
      );
    }
    if (afterDepositVaultBalance !== beforeVaultBalance + smokeTestAmount) {
      throw new Error(
        `${tokenState.label} vault balance mismatch after deposit. Expected ${formatUnitsIfPossible(
          beforeVaultBalance + smokeTestAmount,
          tokenState.decimals
        )}, received ${formatUnitsIfPossible(afterDepositVaultBalance, tokenState.decimals)}.`
      );
    }

    const withdrawTx = await writableVault.withdraw(tokenAddress, smokeTestAmount);
    await withdrawTx.wait();

    await assertOperationalState(writableVault, profile, tokenAddress);

    const afterWithdraw = await writableVault.getUserDeposit(proofWalletAddress, tokenAddress);
    const afterWithdrawTotals = await writableVault.totalDeposits(tokenAddress);
    const afterWithdrawVaultBalance = await writableVault.getVaultBalance(tokenAddress);
    if (afterWithdraw !== beforeDeposit) {
      throw new Error(
        `${tokenState.label} deposit balance mismatch after withdraw. Expected ${formatUnitsIfPossible(
          beforeDeposit,
          tokenState.decimals
        )}, received ${formatUnitsIfPossible(afterWithdraw, tokenState.decimals)}.`
      );
    }
    if (afterWithdrawTotals !== beforeTotalDeposits) {
      throw new Error(
        `${tokenState.label} totalDeposits mismatch after withdraw. Expected ${formatUnitsIfPossible(
          beforeTotalDeposits,
          tokenState.decimals
        )}, received ${formatUnitsIfPossible(afterWithdrawTotals, tokenState.decimals)}.`
      );
    }
    if (afterWithdrawVaultBalance !== beforeVaultBalance) {
      throw new Error(
        `${tokenState.label} vault balance mismatch after withdraw. Expected ${formatUnitsIfPossible(
          beforeVaultBalance,
          tokenState.decimals
        )}, received ${formatUnitsIfPossible(afterWithdrawVaultBalance, tokenState.decimals)}.`
      );
    }

    results.push({
      label: tokenState.label,
      symbol: tokenState.symbol,
      amount: formatUnitsIfPossible(smokeTestAmount, tokenState.decimals),
      beforeDeposit: formatUnitsIfPossible(beforeDeposit, tokenState.decimals),
      afterDeposit: formatUnitsIfPossible(afterDeposit, tokenState.decimals),
      afterWithdraw: formatUnitsIfPossible(afterWithdraw, tokenState.decimals),
      resetApprovalTxHash,
      approveTxHash: approveTx.hash,
      depositTxHash: depositTx.hash,
      withdrawTxHash: withdrawTx.hash,
    });
  }

  console.log(`\nAEGIS-408 prove-vault-flow`);
  console.log(`Config      : ${configPath}`);
  console.log(`Network     : ${profile.network.name} (chainId ${chainId})`);
  console.log(`Vault       : ${profile.vault.address}`);
  console.log(`Proof wallet: ${proofWalletAddress}`);

  for (const result of results) {
    console.log("");
    console.log(
      `PASS ${result.label}${result.symbol ? ` (${result.symbol})` : ""} amount=${result.amount}`
    );
    console.log(`  deposit balance: ${result.beforeDeposit} -> ${result.afterDeposit}`);
    console.log(`  post-withdraw  : ${result.afterWithdraw}`);
    if (result.resetApprovalTxHash) {
      console.log(`  reset approval : ${result.resetApprovalTxHash}`);
    }
    console.log(`  approve tx     : ${result.approveTxHash}`);
    console.log(`  deposit tx     : ${result.depositTxHash}`);
    console.log(`  withdraw tx    : ${result.withdrawTxHash}`);
  }

  console.log("\nPASS: proof vault flow completed with launch-token and balance invariants intact.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
