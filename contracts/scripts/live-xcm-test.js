/**
 * Live XCM Test Script
 * 
 * This script tests the AegisVault XCM routing functionality on live networks
 * (local node or Moonbase Alpha). It uses the xcm-encoder utility to create
 * properly encoded asset data for XCM transfers.
 * 
 * Usage:
 *   npx hardhat run scripts/live-xcm-test.js --network localhost
 *   npx hardhat run scripts/live-xcm-test.js --network moonbaseAlpha
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// XCM Precompile addresses
const XCM_PRECOMPILE = "0x0000000000000000000000000000000000000801";

// Network configurations
const NETWORKS = {
  localhost: {
    name: "Local Node",
    chainId: 1281,
    xcmPrecompile: XCM_PRECOMPILE
  },
  moonbaseAlpha: {
    name: "Moonbase Alpha",
    chainId: 1287,
    xcmPrecompile: XCM_PRECOMPILE,
    faucet: "https://faucet.moonbeam.network/"
  }
};

/**
 * Simple XCM asset data encoder (JavaScript implementation of xcm-encoder.ts)
 * Creates properly formatted XCM MultiAsset encoding
 */
function encodeAssetDataForXCM(tokenAddress, amount, destParachainId = 1000) {
  // Validate token address
  if (!tokenAddress.startsWith("0x") || tokenAddress.length !== 42) {
    throw new Error("Invalid token address format");
  }
  
  // Structure:
  // - Version (1 byte): 0x02 for V2
  // - Parents (1 byte): 0x00 for local
  // - Interior (variable): Junctions path
  // - Asset Type (1 byte): 0x00 for Fungible
  // - Amount (16 bytes): u128 amount
  
  const version = "02"; // V2
  const parents = "00"; // Local
  
  // Interior: X2(PalletInstance(48), AccountKey20(tokenAddress))
  const interior = encodeInteriorX2(tokenAddress);
  
  // Asset type: Fungible
  const assetType = "00";
  
  // Amount as u128 (16 bytes, little-endian)
  const amountHex = amount.toString(16).padStart(32, "0");
  const amountLE = hexToLittleEndian(amountHex);
  
  // Combine all parts
  const encoded = `${version}${parents}${interior}${assetType}${amountLE}`;
  
  return `0x${encoded}`;
}

function encodeInteriorX2(tokenAddress) {
  // X2 indicator
  const x2Indicator = "01"; // X2 variant
  
  // PalletInstance(48) - ERC20 pallet
  const palletInstance = "30"; // 48 in hex
  
  // AccountKey20 indicator + address
  const accountKey20Indicator = "02"; // AccountKey20 variant
  const address = tokenAddress.toLowerCase().slice(2);
  
  return `${x2Indicator}${palletInstance}${accountKey20Indicator}${address}`;
}

function hexToLittleEndian(hex) {
  // Ensure even length
  const padded = hex.length % 2 === 0 ? hex : "0" + hex;
  const bytes = padded.match(/.{2}/g) || [];
  return bytes.reverse().join("");
}

/**
 * Main test execution
 */
async function main() {
  const networkName = hre.network.name;
  const networkConfig = NETWORKS[networkName];
  
  if (!networkConfig) {
    console.error(`❌ Unknown network: ${networkName}`);
    console.error("Supported networks: localhost, moonbaseAlpha");
    process.exit(1);
  }
  
  console.log(`\n🚀 AegisVault Live XCM Test - ${networkConfig.name}`);
  console.log("=" .repeat(60));
  
  const [deployer, aiOracle] = await ethers.getSigners();
  console.log("\n📋 Test Configuration:");
  console.log(`  Network: ${networkName}`);
  console.log(`  Chain ID: ${networkConfig.chainId}`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  AI Oracle: ${aiOracle.address}`);
  console.log(`  XCM Precompile: ${networkConfig.xcmPrecompile}`);
  
  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer Balance: ${ethers.formatEther(balance)} ETH/DEV`);
  
  if (balance < ethers.parseEther("0.1")) {
    console.warn("\n⚠️  Warning: Low balance. You may need to fund the deployer account.");
    if (networkName === "moonbaseAlpha") {
      console.log(`   Get tokens from: ${networkConfig.faucet}`);
    }
  }
  
  // Deploy or connect to AegisVault
  let aegisVault;
  let mockToken;
  let vaultAddress = process.env.VAULT_ADDRESS;
  
  if (vaultAddress) {
    console.log(`\n📡 Connecting to existing AegisVault at ${vaultAddress}...`);
    aegisVault = await ethers.getContractAt("AegisVault", vaultAddress);
  } else {
    console.log("\n🔨 Deploying AegisVault...");
    const AegisVault = await ethers.getContractFactory("AegisVault");
    aegisVault = await AegisVault.deploy(deployer.address, aiOracle.address);
    await aegisVault.waitForDeployment();
    vaultAddress = await aegisVault.getAddress();
    console.log(`  ✓ AegisVault deployed to: ${vaultAddress}`);
  }
  
  // Deploy MockToken for testing
  console.log("\n🔨 Deploying MockToken...");
  const MockToken = await ethers.getContractFactory("MockERC20");
  mockToken = await MockToken.deploy("Test XCM Token", "TXCM", ethers.parseEther("1000000"));
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log(`  ✓ MockToken deployed to: ${tokenAddress}`);
  
  // Setup vault
  console.log("\n⚙️  Configuring Vault...");
  
  // Add supported token
  const isSupported = await aegisVault.supportedTokens(tokenAddress);
  if (!isSupported) {
    console.log("  Adding token to supported list...");
    const tx1 = await aegisVault.addSupportedToken(tokenAddress);
    await tx1.wait();
    console.log("  ✓ Token added");
  } else {
    console.log("  Token already supported");
  }
  
  // Set XCM precompile address
  const currentXcmAddress = await aegisVault.xcmPrecompileAddress();
  if (currentXcmAddress.toLowerCase() !== networkConfig.xcmPrecompile.toLowerCase()) {
    console.log("  Setting XCM precompile address...");
    const tx2 = await aegisVault.setXCMPrecompileAddress(networkConfig.xcmPrecompile);
    await tx2.wait();
    console.log("  ✓ XCM precompile set");
  } else {
    console.log("  XCM precompile already configured");
  }
  
  // Fund vault with tokens
  console.log("\n💰 Funding Vault...");
  const fundAmount = ethers.parseEther("1000");
  await (await mockToken.mint(vaultAddress, fundAmount)).wait();
  const vaultBalance = await mockToken.balanceOf(vaultAddress);
  console.log(`  ✓ Vault funded with ${ethers.formatEther(vaultBalance)} TXCM`);
  
  // Test 1: Set route cap
  console.log("\n🧪 Test 1: Setting Route Cap...");
  const routeCap = ethers.parseEther("500");
  const tx3 = await aegisVault.setRouteCap(tokenAddress, routeCap);
  await tx3.wait();
  const setCap = await aegisVault.routeCaps(tokenAddress);
  console.log(`  ✓ Route cap set to: ${ethers.formatEther(setCap)} TXCM`);
  
  // Test 2: Execute XCM route
  console.log("\n🧪 Test 2: Executing XCM Route...");
  
  const destParachainId = 1000; // Asset Hub
  const routeAmount = ethers.parseEther("100");
  const riskScore = 50; // Below threshold of 75
  const feeAssetItem = 0;
  const weightLimit = 1000000;
  const assetType = 0; // Native
  
  // Encode asset data using our encoder
  const assetData = encodeAssetDataForXCM(tokenAddress, routeAmount, destParachainId);
  console.log(`  Encoded Asset Data: ${assetData.slice(0, 50)}...`);
  
  // Get initial parachain nonce for audit tracking
  const initialNonce = await aegisVault.parachainNonces(destParachainId);
  console.log(`  Initial Parachain Nonce: ${initialNonce}`);
  
  // Execute route as AI Oracle
  const tx4 = await aegisVault.connect(aiOracle).routeYieldViaXCM(
    destParachainId,
    tokenAddress,
    routeAmount,
    riskScore,
    assetData,
    feeAssetItem,
    weightLimit,
    assetType
  );
  
  const receipt = await tx4.wait();
  console.log(`  ✓ XCM Route executed!`);
  console.log(`    Transaction Hash: ${receipt.hash}`);
  console.log(`    Gas Used: ${receipt.gasUsed.toString()}`);
  
  // Parse XcmRouted event for audit-ready parameters
  const xcmRoutedEvent = receipt.logs.find(
    log => {
      try {
        const parsed = aegisVault.interface.parseLog(log);
        return parsed && parsed.name === "XcmRouted";
      } catch {
        return false;
      }
    }
  );
  
  if (xcmRoutedEvent) {
    const parsedEvent = aegisVault.interface.parseLog(xcmRoutedEvent);
    console.log(`\n  📋 Audit-Ready XcmRouted Event:`);
    console.log(`    targetChainId: ${parsedEvent.args[0]}`);
    console.log(`    token: ${parsedEvent.args[1]}`);
    console.log(`    amount: ${ethers.formatEther(parsedEvent.args[2])} TXCM`);
    console.log(`    parachainNonce: ${parsedEvent.args[3]}`);
    console.log(`    txHash: ${parsedEvent.args[4]}`);
    console.log(`    riskScore: ${parsedEvent.args[5]}`);
    console.log(`    assetType: ${parsedEvent.args[6]}`);
    console.log(`    timestamp: ${parsedEvent.args[7]}`);
  }
  
  // Verify totalRouted updated
  const totalRouted = await aegisVault.totalRouted(tokenAddress);
  console.log(`\n    Total Routed: ${ethers.formatEther(totalRouted)} TXCM`);
  
  // Verify nonce was incremented
  const newNonce = await aegisVault.parachainNonces(destParachainId);
  console.log(`    New Parachain Nonce: ${newNonce}`);
  
  // Test 3: Verify circuit breaker
  console.log("\n🧪 Test 3: Testing Circuit Breaker...");
  
  // Toggle pause
  const tx5 = await aegisVault.toggleXcmRoute();
  await tx5.wait();
  const isPaused = await aegisVault.xcmRoutingPaused();
  console.log(`  ✓ XCM Routing paused: ${isPaused}`);
  
  // Try to route while paused (should fail)
  try {
    await aegisVault.connect(aiOracle).routeYieldViaXCM(
      destParachainId,
      tokenAddress,
      routeAmount,
      riskScore,
      assetData,
      feeAssetItem,
      weightLimit
    );
    console.log("  ❌ ERROR: Route should have failed when paused!");
  } catch (error) {
    if (error.message.includes("XCMRoutingPaused")) {
      console.log("  ✓ Correctly rejected routing when paused");
    } else {
      console.log(`  ⚠️  Unexpected error: ${error.message}`);
    }
  }
  
  // Unpause
  await (await aegisVault.toggleXcmRoute()).wait();
  console.log("  ✓ XCM Routing unpaused");
  
  // Test 4: Verify route cap enforcement
  console.log("\n🧪 Test 4: Testing Route Cap Enforcement...");
  
  const largeAmount = ethers.parseEther("1000"); // Exceeds cap of 500
  const largeAssetData = encodeAssetDataForXCM(tokenAddress, largeAmount, destParachainId);
  
  try {
    await aegisVault.connect(aiOracle).routeYieldViaXCM(
      destParachainId,
      tokenAddress,
      largeAmount,
      riskScore,
      largeAssetData,
      feeAssetItem,
      weightLimit
    );
    console.log("  ❌ ERROR: Route should have failed due to cap!");
  } catch (error) {
    if (error.message.includes("RouteCapExceeded")) {
      console.log("  ✓ Correctly rejected routing exceeding cap");
    } else {
      console.log(`  ⚠️  Unexpected error: ${error.message}`);
    }
  }
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ Live XCM Test Complete!");
  console.log("=".repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`  Vault Address: ${vaultAddress}`);
  console.log(`  Token Address: ${tokenAddress}`);
  console.log(`  Total Routed: ${ethers.formatEther(totalRouted)} TXCM`);
  console.log(`  Route Cap: ${ethers.formatEther(setCap)} TXCM`);
  
  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    chainId: networkConfig.chainId,
    vaultAddress,
    tokenAddress,
    xcmPrecompile: networkConfig.xcmPrecompile,
    timestamp: new Date().toISOString()
  };
  
  const outputPath = path.join(__dirname, `deployment-${networkName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: ${outputPath}`);
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
