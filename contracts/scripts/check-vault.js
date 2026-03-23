const { ethers } = require("hardhat");

async function main() {
  const VAULT_ADDRESS = "0x2BEf17e09b6F9a589d284f62F74281f0580969B3";
  const AegisVault = await ethers.getContractAt("AegisVault", VAULT_ADDRESS);

  console.log("Checking AegisVault at:", VAULT_ADDRESS);

  try {
    const owner = await AegisVault.owner();
    console.log("Owner:", owner);

    const aiOracle = await AegisVault.aiOracleAddress();
    console.log("AI Oracle:", aiOracle);

    // Common token addresses on Paseo (if known) or just check some
    // Since we don't have a list, we just check the ones from the frontend config if possible
  } catch (error) {
    console.error("Error connecting to contract:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
