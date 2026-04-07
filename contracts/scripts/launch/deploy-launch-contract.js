const fs = require("node:fs/promises");
const path = require("node:path");
const { ethers } = require("ethers");
const {
  REPO_ROOT,
  getProvider,
  loadLaunchConfig,
  parseArgs,
  resolveLaunchProfile,
  usage,
} = require("./common");

const DEFAULT_DEPLOY_KEY_ENV = "PRIVATE_KEY";
const ARTIFACT_PATH = path.join(
  REPO_ROOT,
  "contracts",
  "artifacts",
  "contracts",
  "AegisVaultLaunch.sol",
  "AegisVaultLaunch.json"
);

function deployUsage() {
  return [
    usage("deploy-launch-contract.js"),
    "",
    "Deploy options:",
    `  --deploy-key-env <name>  Env var for the deployer private key (default: ${DEFAULT_DEPLOY_KEY_ENV})`,
    "  --output <path>          Optional output path for deployment metadata",
    "",
    "Examples:",
    "  node scripts/launch/deploy-launch-contract.js --profile moonbase-staging",
    "  node scripts/launch/deploy-launch-contract.js --profile moonbeam-pilot",
    "  node scripts/launch/deploy-launch-contract.js --profile moonbase-staging --output ./deployments/moonbase-staging.local.json",
  ].join("\n");
}

async function loadArtifact() {
  try {
    return JSON.parse(await fs.readFile(ARTIFACT_PATH, "utf8"));
  } catch (error) {
    throw new Error(
      `Missing compiled AegisVaultLaunch artifact at ${ARTIFACT_PATH}. Run "npm run compile" in contracts/ before launch deployment.`
    );
  }
}

function resolveDeployProfile(config, runtimeEnv) {
  const resolved = resolveLaunchProfile(
    {
      ...config,
      vault: {
        ...config.vault,
        addressEnv: config.vault.addressEnv,
      },
    },
    {
      ...runtimeEnv,
      [config.vault.addressEnv]:
        runtimeEnv[config.vault.addressEnv] ?? ethers.ZeroAddress,
    }
  );

  return {
    ...resolved,
    vault: {
      ...resolved.vault,
      address: null,
      addressEnv: config.vault.addressEnv,
      ownerAddressEnv: config.vault.ownerAddressEnv,
      deployerAddressEnv: config.vault.deployerAddressEnv,
    },
    launchToken: {
      ...resolved.tokens[0],
      addressEnv: config.tokens[0].addressEnv ?? null,
      symbolEnv: config.tokens[0].symbolEnv ?? null,
      nameEnv: config.tokens[0].nameEnv ?? null,
    },
  };
}

async function assertLaunchToken(provider, launchToken) {
  const launchTokenCode = await provider.getCode(launchToken.address);
  if (launchTokenCode === "0x") {
    throw new Error(
      `Launch token ${launchToken.label} at ${launchToken.address} has no deployed contract code.`
    );
  }
}

async function assertOwnerContract(profile, provider) {
  if (!profile.vault.requireOwnerContract) {
    return;
  }

  const ownerCode = await provider.getCode(profile.vault.ownerAddress);
  if (ownerCode === "0x") {
    throw new Error(
      `Owner ${profile.vault.ownerAddress} has no contract code, but ${profile.profile} requires a deployed multisig owner.`
    );
  }
}

async function assertEmptyOutput(outputPath) {
  try {
    await fs.access(outputPath);
    throw new Error(
      `Refusing to overwrite existing deployment metadata at ${outputPath}. Remove it first or pass --output <different-path>.`
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function buildDeploymentMetadata(profile, contractAddress, deployerAddress, txHash, chainId) {
  return {
    profile: profile.profile,
    launchMode: profile.launchMode,
    network: profile.network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    owner: profile.vault.ownerAddress,
    launchToken: profile.launchToken.address,
    launchTokenSymbol: profile.launchToken.symbol ?? null,
    depositsPaused: true,
    withdrawalsPaused: true,
    deploymentTxHash: txHash,
    aegisVaultLaunch: contractAddress,
  };
}

function buildNextStepLines(profile, contractAddress, selectorArg) {
  const lines = [
    "Next manual steps:",
    `1. Set ${profile.vault.addressEnv}=${contractAddress} in contracts/.env.local for the chosen launch profile.`,
    `2. Run "npm run launch:check-key-posture -- ${selectorArg}" before any owner action.`,
    `3. Run "npm run launch:prepare -- ${selectorArg} --mode plan" to generate the owner action packet.`,
    `4. After the owner unpauses to match the proof posture, run "npm run launch:verify -- ${selectorArg}" and "npm run launch:prove -- ${selectorArg}".`,
  ];

  if (profile.profile === "moonbase-staging") {
    lines.push(
      "5. Mirror the new vault/token addresses into frontend/.env.local before protected staging UI checks.",
      `   - NEXT_PUBLIC_MOONBASE_STAGING_VAULT_ADDRESS=${contractAddress}`,
      `   - NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_ADDRESS=${profile.launchToken.address}`,
      profile.launchToken.symbol
        ? `   - NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_SYMBOL=${profile.launchToken.symbol}`
        : "   - NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_SYMBOL=<staging-token-symbol>"
    );
  }

  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(deployUsage());
    return;
  }

  const { config, configPath, runtimeEnv } = await loadLaunchConfig({
    profile: args.profile,
    configPath: args.config,
  });
  const profile = resolveDeployProfile(config, runtimeEnv);
  const selectorArg = args.profile
    ? `--profile ${args.profile}`
    : `--config ${configPath}`;
  const deployKeyEnv = args["deploy-key-env"] ?? DEFAULT_DEPLOY_KEY_ENV;
  const rawPrivateKey = runtimeEnv[deployKeyEnv];

  if (!rawPrivateKey) {
    throw new Error(`Missing deployer private key in env ${deployKeyEnv}.`);
  }

  const provider = getProvider(profile);
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== profile.network.chainId) {
    throw new Error(
      `Chain ID mismatch. Expected ${profile.network.chainId} (${profile.network.name}), received ${chainId}.`
    );
  }

  const signer = new ethers.Wallet(rawPrivateKey, provider);
  const deployerAddress = ethers.getAddress(signer.address);
  if (deployerAddress !== profile.vault.deployerAddress) {
    throw new Error(
      `Deployer key mismatch. Expected ${profile.vault.deployerAddress} from ${profile.vault.deployerAddressEnv}, received ${deployerAddress}.`
    );
  }

  const nativeBalance = await provider.getBalance(deployerAddress);
  if (nativeBalance === 0n) {
    throw new Error(`Deployer ${deployerAddress} has zero native balance on ${profile.network.name}.`);
  }

  await assertLaunchToken(provider, profile.launchToken);
  await assertOwnerContract(profile, provider);

  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(REPO_ROOT, "contracts", "deployments", `${profile.profile}.json`);
  await assertEmptyOutput(outputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const artifact = await loadArtifact();
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);

  console.log(`\nAEGIS-408 deploy-launch-contract`);
  console.log(`Config       : ${configPath}`);
  console.log(`Network      : ${profile.network.name} (${chainId})`);
  console.log(`Deployer     : ${deployerAddress}`);
  console.log(`Owner        : ${profile.vault.ownerAddress}`);
  console.log(`Launch token : ${profile.launchToken.address}`);

  const contract = await factory.deploy(
    profile.vault.ownerAddress,
    profile.launchToken.address
  );
  const deploymentTx = contract.deploymentTransaction();

  if (!deploymentTx) {
    throw new Error("Hardhat/ethers did not return a deployment transaction.");
  }

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`Deployed     : ${contractAddress}`);
  const deployedLaunchContract = new ethers.Contract(
    contractAddress,
    [
      "function owner() view returns (address)",
      "function launchToken() view returns (address)",
      "function depositsPaused() view returns (bool)",
      "function withdrawalsPaused() view returns (bool)",
    ],
    provider
  );

  const [owner, launchToken, depositsPaused, withdrawalsPaused] = await Promise.all([
    deployedLaunchContract.owner(),
    deployedLaunchContract.launchToken(),
    deployedLaunchContract.depositsPaused(),
    deployedLaunchContract.withdrawalsPaused(),
  ]);

  if (ethers.getAddress(owner) !== profile.vault.ownerAddress) {
    throw new Error(
      `Post-deploy owner mismatch. Expected ${profile.vault.ownerAddress}, received ${owner}.`
    );
  }
  if (ethers.getAddress(launchToken) !== profile.launchToken.address) {
    throw new Error(
      `Post-deploy launchToken mismatch. Expected ${profile.launchToken.address}, received ${launchToken}.`
    );
  }
  if (!depositsPaused || !withdrawalsPaused) {
    throw new Error(
      `Post-deploy pause mismatch. Expected depositsPaused=true and withdrawalsPaused=true, received ${depositsPaused}/${withdrawalsPaused}.`
    );
  }

  const deploymentMetadata = buildDeploymentMetadata(
    profile,
    contractAddress,
    deployerAddress,
    deploymentTx.hash,
    chainId
  );
  try {
    await fs.writeFile(outputPath, `${JSON.stringify(deploymentMetadata, null, 2)}\n`);
  } catch (error) {
    console.error(`CRITICAL: deployment succeeded but metadata write failed for ${outputPath}.`);
    console.error("Record this deployment packet manually before retrying:");
    console.error(JSON.stringify(deploymentMetadata, null, 2));
    throw error;
  }

  console.log("");
  console.log(`PASS: deployed AegisVaultLaunch to ${contractAddress}`);
  console.log(`Deployment metadata: ${path.relative(REPO_ROOT, outputPath)}`);
  console.log("");
  for (const line of buildNextStepLines(profile, contractAddress, selectorArg)) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
