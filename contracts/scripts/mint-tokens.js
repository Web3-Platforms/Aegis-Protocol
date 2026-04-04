/**
 * mint-tokens.js
 *
 * Mints test tokens (wPAS and test-USDC) to a recipient address.
 * Run this after setup-paseo.js to fund a wallet for testing.
 *
 * Usage:
 *   cd contracts
 *   PRIVATE_KEY=0x... RECIPIENT=0x<wallet> npx hardhat run scripts/mint-tokens.js --network paseo
 *
 * If RECIPIENT is not set, tokens are minted to the deployer wallet.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { ethers } = require("hardhat");

const WPAS_AMOUNT = ethers.parseUnits("1000", 10); // 1,000 wPAS
const USDC_AMOUNT = ethers.parseUnits("1000", 6);  // 1,000 USDC

const ERC20_ABI = [
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  const [deployer] = await ethers.getSigners();

  // Load deployment record
  const deploymentsPath = path.join(__dirname, "..", "deployments", "paseo.json");
  let deployment;
  try {
    deployment = JSON.parse(await fs.readFile(deploymentsPath, "utf8"));
  } catch {
    throw new Error(
      "deployments/paseo.json not found. Run setup-paseo.js first."
    );
  }

  const recipient = process.env.RECIPIENT ?? deployer.address;
  console.log(`\nMinting tokens to: ${recipient}`);

  const wPAS = new ethers.Contract(deployment.wPAS, ERC20_ABI, deployer);
  const usdc = new ethers.Contract(deployment.testUSDC, ERC20_ABI, deployer);

  const tx1 = await wPAS.mint(recipient, WPAS_AMOUNT);
  await tx1.wait();
  const wPASBal = await wPAS.balanceOf(recipient);
  console.log(`wPAS balance: ${ethers.formatUnits(wPASBal, 10)} wPAS ✅`);

  const tx2 = await usdc.mint(recipient, USDC_AMOUNT);
  await tx2.wait();
  const usdcBal = await usdc.balanceOf(recipient);
  console.log(`USDC balance: ${ethers.formatUnits(usdcBal, 6)} USDC ✅`);

  console.log("\nDone. You can now deposit tokens in the Aegis vault UI.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
