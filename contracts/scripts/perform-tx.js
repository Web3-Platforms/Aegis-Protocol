const { ethers } = require("hardhat");

async function main() {
  const VAULT_ADDRESS = "0x2BEf17e09b6F9a589d284f62F74281f0580969B3";
  const TOKEN_TO_SUPPORT = "0x0000000000000000000000000000000000000000";
  
  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);

  const AegisVault = await ethers.getContractAt("AegisVault", VAULT_ADDRESS);

  console.log(`Checking support for ${TOKEN_TO_SUPPORT}...`);
  const alreadySupported = await AegisVault.supportedTokens(TOKEN_TO_SUPPORT);
  
  if (alreadySupported) {
    console.log("Token is already supported.");
    return;
  }

  console.log("Sending transaction to addSupportedToken...");
  try {
    const tx = await AegisVault.addSupportedToken(TOKEN_TO_SUPPORT);
    console.log("Transaction hash:", tx.hash);
    
    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    console.log("Status: Success");
  } catch (error) {
    console.error("Transaction failed:", error.message);
    if (error.message.includes("insufficient funds")) {
      console.error("ERROR: The account does not have enough PAS tokens to pay for gas.");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
