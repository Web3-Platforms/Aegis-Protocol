/**
 * setup-paseo.js
 *
 * Full deployment and configuration script for Paseo testnet.
 *
 * What this does:
 *   1. Deploys AegisVault (current version)
 *   2. Deploys MockERC20 tokens: wPAS (decimals 10) and test-USDC (decimals 6)
 *   3. Mints 10,000 of each token to the deployer
 *   4. Registers both tokens as supported in the vault
 *   5. Sets xcmPrecompileAddress to address(0) so XCM calls are skipped
 *      gracefully until the real precompile is available on Paseo
 *   6. Writes deployments/paseo.json with all addresses
 *   7. Prints the .env.local block to paste into frontend/.env.local
 *
 * Usage:
 *   cd contracts
 *   PRIVATE_KEY=0x... npx hardhat run scripts/setup-paseo.js --network paseo
 *
 * Requirements:
 *   - PRIVATE_KEY env var set to a Paseo-funded wallet
 *   - Get testnet PAS from https://faucet.polkadot.io/
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { ethers, network } = require("hardhat");

// Mint amounts
const WPAS_SUPPLY  = ethers.parseUnits("10000", 10); // 10,000 wPAS  (10 decimals)
const USDC_SUPPLY  = ethers.parseUnits("10000", 6);  // 10,000 USDC  (6 decimals)

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No signers available. Set PRIVATE_KEY in contracts/.env.local and retry."
    );
  }

  const deployer = signers[0];
  console.log(`\n=== Aegis Protocol — Paseo Setup ===`);
  console.log(`Network  : ${network.name} (chainId ${network.config.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} PAS\n`);

  // ── 1. Deploy AegisVault ────────────────────────────────────────────────
  console.log("1/5  Deploying AegisVault...");
  const AegisVault = await ethers.getContractFactory("AegisVault");
  const vault = await AegisVault.deploy(deployer.address, deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`     AegisVault → ${vaultAddress}`);

  // ── 2. Deploy mock tokens ───────────────────────────────────────────────
  console.log("2/5  Deploying mock tokens...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  // wPAS — 10 decimals to match Polkadot's native asset precision
  const wPAS = await MockERC20.deploy("Wrapped PAS", "wPAS", WPAS_SUPPLY);
  await wPAS.waitForDeployment();
  const wPASAddress = await wPAS.getAddress();
  console.log(`     wPAS (10 dec) → ${wPASAddress}`);

  // test-USDC — 6 decimals
  const testUSDC = await MockERC20.deploy("test-USDC", "USDC", USDC_SUPPLY);
  await testUSDC.waitForDeployment();
  const testUSDCAddress = await testUSDC.getAddress();
  console.log(`     test-USDC (6 dec) → ${testUSDCAddress}`);

  // ── 3. Register tokens in vault ─────────────────────────────────────────
  console.log("3/5  Registering tokens as supported...");
  const tx1 = await vault.addSupportedToken(wPASAddress);
  await tx1.wait();
  console.log(`     addSupportedToken(wPAS) ✅`);

  const tx2 = await vault.addSupportedToken(testUSDCAddress);
  await tx2.wait();
  console.log(`     addSupportedToken(USDC) ✅`);

  // ── 4. Set XCM precompile to zero address (graceful no-op until live) ───
  // The XCM precompile at 0x...0801 does not exist on Paseo's EVM layer yet.
  // Setting it to address(0) means routeYieldViaXCM will call address(0).sendXcm()
  // which is a no-op on EVM — the transaction succeeds, events are emitted,
  // and the UI flow works end-to-end without reverting.
  // When Polkadot Hub ships the XCM precompile, call setXCMPrecompileAddress(realAddr).
  console.log("4/5  Setting XCM precompile to address(0) (graceful no-op)...");
  const tx3 = await vault.setXCMPrecompileAddress(
    "0x0000000000000000000000000000000000000000"
  );
  await tx3.wait();
  console.log(`     setXCMPrecompileAddress(0x0) ✅`);

  // ── 5. Write deployment record ──────────────────────────────────────────
  console.log("5/5  Writing deployment record...");
  const deployment = {
    network: network.name,
    chainId: Number(network.config.chainId ?? 0),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    aiOracle: deployer.address,
    aegisVault: vaultAddress,
    wPAS: wPASAddress,
    testUSDC: testUSDCAddress,
    xcmPrecompile: "0x0000000000000000000000000000000000000000",
    notes: "XCM precompile set to address(0) — no-op until Paseo ships the real precompile",
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  await fs.mkdir(deploymentsDir, { recursive: true });
  const outputPath = path.join(deploymentsDir, "paseo.json");
  await fs.writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`     Written to deployments/paseo.json ✅`);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`
=== Deployment Complete ===

AegisVault : ${vaultAddress}
wPAS       : ${wPASAddress}
test-USDC  : ${testUSDCAddress}
AI Oracle  : ${deployer.address}  (same as deployer — set AI_ORACLE_PRIVATE_KEY to this wallet's key)

=== Paste this into frontend/.env.local ===

NEXT_PUBLIC_PASEO_RPC_URL=https://eth-rpc-testnet.polkadot.io
NEXT_PUBLIC_AEGIS_VAULT_ADDRESS=${vaultAddress}
NEXT_PUBLIC_WPAS_ADDRESS=${wPASAddress}
NEXT_PUBLIC_TEST_USDC_ADDRESS=${testUSDCAddress}
NEXT_PUBLIC_USDC_TOKEN_ADDRESS=${testUSDCAddress}
DEST_PARACHAIN_ID=1000
NEXT_PUBLIC_E2E_MOCK_WALLET=false
AI_ORACLE_PRIVATE_KEY=0x<your-private-key-here>

=== Next Steps ===

1. Copy the block above into frontend/.env.local
2. Set AI_ORACLE_PRIVATE_KEY to the private key of ${deployer.address}
3. Run: cd frontend && npm run dev
4. Connect your wallet (MetaMask on Paseo Testnet, chainId 420420417)
5. Get test tokens: run the faucet script below or mint manually

To mint test tokens to your wallet:
  cd contracts
  PRIVATE_KEY=0x... RECIPIENT=0x<your-wallet> npx hardhat run scripts/mint-tokens.js --network paseo
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
