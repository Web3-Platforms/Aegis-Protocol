const { ethers } = require("ethers");
const {
  collectVaultState,
  getProvider,
  getVaultContract,
  loadLaunchConfig,
  parseArgs,
  resolveLaunchProfile,
  usage,
} = require("./common");

function buildAction(vaultInterface, description, functionName, args) {
  return {
    description,
    functionName,
    args,
    data: vaultInterface.encodeFunctionData(functionName, args),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage("prepare-bootstrap.js"));
    return;
  }

  const mode = args.mode ?? "plan";
  if (!["plan", "execute"].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use plan or execute.`);
  }

  const { config, configPath, runtimeEnv } = await loadLaunchConfig({
    profile: args.profile,
    configPath: args.config,
    frontendEnvPath: args["frontend-env"],
  });
  const profile = resolveLaunchProfile(config, runtimeEnv);
  const provider = getProvider(profile);
  const state = await collectVaultState(profile, provider);
  const vault = getVaultContract(profile, provider);
  const vaultInterface = vault.interface;

  const actions = [];

  const launchToken = profile.tokens[0];
  if (state.launchToken !== launchToken.address) {
    throw new Error(
      `Launch token mismatch. Contract reports ${state.launchToken}, expected ${launchToken.address}.`
    );
  }

  if (!state.tokens[0].supported) {
    throw new Error(
      `${state.tokens[0].label} is not marked as supported in the vault. Redeploy the launch contract with the intended launch token.`
    );
  }

  if (state.depositsPaused !== profile.operations.expectedDepositsPaused) {
    actions.push(
      buildAction(
        vaultInterface,
        `${profile.operations.expectedDepositsPaused ? "Pause" : "Unpause"} deposits`,
        "setDepositsPaused",
        [profile.operations.expectedDepositsPaused]
      )
    );
  }

  if (state.withdrawalsPaused !== profile.operations.expectedWithdrawalsPaused) {
    actions.push(
      buildAction(
        vaultInterface,
        `${profile.operations.expectedWithdrawalsPaused ? "Pause" : "Unpause"} withdrawals`,
        "setWithdrawalsPaused",
        [profile.operations.expectedWithdrawalsPaused]
      )
    );
  }

  if (state.owner !== profile.vault.ownerAddress) {
    actions.push(
      buildAction(
        vaultInterface,
        `Transfer ownership to ${profile.vault.ownerAddress}`,
        "transferOwnership",
        [profile.vault.ownerAddress]
      )
    );
  }

  console.log(`\nAEGIS-408 prepare-bootstrap`);
  console.log(`Config: ${configPath}`);
  console.log(`Vault : ${profile.vault.address}`);
  console.log(`Mode  : ${mode}`);

  if (actions.length === 0) {
    console.log("\nNo bootstrap actions are required. The deployment already matches the target profile.");
    return;
  }

  console.log("\nPlanned owner actions:");
  actions.forEach((action, index) => {
    console.log(`\n${index + 1}. ${action.description}`);
    console.log(`   function: ${action.functionName}`);
    console.log(`   to      : ${profile.vault.address}`);
    console.log(`   data    : ${action.data}`);
  });

  if (mode === "plan") {
    console.log(
      "\nPlan mode only. Use the calldata above in your multisig or rerun with --mode execute " +
        "from the current owner if direct execution is appropriate."
    );
    return;
  }

  const keyEnv = profile.vault.bootstrapOwnerKeyEnv;
  const rawPrivateKey = runtimeEnv[keyEnv];
  if (!rawPrivateKey) {
    throw new Error(`Missing bootstrap owner private key in env ${keyEnv}.`);
  }

  const signer = new ethers.Wallet(rawPrivateKey, provider);
  const signerAddress = ethers.getAddress(signer.address);
  if (signerAddress !== state.owner) {
    throw new Error(
      `Bootstrap signer ${signerAddress} is not the current owner ${state.owner}. ` +
        "Use --mode plan for multisig execution."
    );
  }

  const ownerCode = await provider.getCode(state.owner);
  if (ownerCode !== "0x") {
    throw new Error(
      "Current owner is a contract. Direct execution is disabled; use --mode plan and execute via multisig."
    );
  }

  const writableVault = getVaultContract(profile, signer);
  console.log("\nExecuting owner actions...");
  for (const action of actions) {
    const tx = await writableVault[action.functionName](...action.args);
    console.log(`- ${action.description}: ${tx.hash}`);
    await tx.wait();
  }

  console.log("\nExecute mode complete. Rerun verify-bootstrap to confirm the final state.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
