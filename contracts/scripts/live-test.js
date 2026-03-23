const { ethers } = require("hardhat");

async function main() {
  const VAULT_ADDRESS = "0x2BEf17e09b6F9a589d284f62F74281f0580969B3";
  const AegisVault = await ethers.getContractAt("AegisVault", VAULT_ADDRESS);

  console.log("--- AegisVault Live Test (Paseo) ---");
  console.log("Vault Address:", VAULT_ADDRESS);

  try {
    const owner = await AegisVault.owner();
    const aiOracle = await AegisVault.aiOracleAddress();
    const maxRisk = await AegisVault.MAX_RISK_SCORE();
    
    console.log("Owner:", owner);
    console.log("AI Oracle:", aiOracle);
    console.log("Max Risk Score:", maxRisk.toString());

    const tokensToCheck = [
      { name: "Native/Zero", address: "0x0000000000000000000000000000000000000000" },
      { name: "Placeholder USDC", address: "0x0000000000000000000000000000000000000002" }
    ];

    for (const token of tokensToCheck) {
      const isSupported = await AegisVault.supportedTokens(token.address);
      console.log(`Token ${token.name} (${token.address}) Supported:`, isSupported);
      
      const totalDep = await AegisVault.totalDeposits(token.address);
      console.log(`  Total Deposits: ${ethers.formatEther(totalDep)}`);
    }

    // Attempt a read-only "simulation" or check of a real transaction state
    const provider = ethers.provider;
    const balance = await provider.getBalance(VAULT_ADDRESS);
    console.log("Vault Native Balance:", ethers.formatEther(balance), "PAS");

  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
