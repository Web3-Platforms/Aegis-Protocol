const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Deploying MockToken with signer:", signer.address);

  const MockToken = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockToken.deploy("Test Polka Agent", "TPA", ethers.parseEther("1000000"));
  await mockToken.waitForDeployment();

  const tokenAddress = await mockToken.getAddress();
  console.log("MockToken deployed to:", tokenAddress);

  const VAULT_ADDRESS = "0x2BEf17e09b6F9a589d284f62F74281f0580969B3";
  const AegisVault = await ethers.getContractAt("AegisVault", VAULT_ADDRESS);

  console.log(`Adding ${tokenAddress} to supported tokens in vault...`);
  try {
    const tx = await AegisVault.addSupportedToken(tokenAddress);
    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("Success! Token added to vault.");
    
    // Now try to deposit 1 token as a real user transaction
    console.log("Approving vault to spend 10 TPA...");
    const approveTx = await mockToken.approve(VAULT_ADDRESS, ethers.parseEther("10"));
    await approveTx.wait();
    console.log("Approval confirmed.");

    console.log("Depositing 1 TPA into vault...");
    const depositTx = await AegisVault.deposit(tokenAddress, ethers.parseEther("1"));
    console.log("Deposit hash:", depositTx.hash);
    await depositTx.wait();
    console.log("Deposit Success!");

  } catch (error) {
    console.error("Operation failed:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
