const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

async function deployRebalanceFixture() {
  const [owner, aiOracle, user1, user2] = await ethers.getSigners();

  const MockToken = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockToken.deploy(
    "Mock USDC",
    "USDC",
    ethers.parseEther("1000000")
  );
  await mockToken.waitForDeployment();

  // Deploy MockXCM for testing
  const MockXCM = await ethers.getContractFactory("contracts/test/MockXCM.sol:MockXCM");
  const mockXCM = await MockXCM.deploy();
  await mockXCM.waitForDeployment();

  const AegisVault = await ethers.getContractFactory("AegisVault");
  const aegisVault = await AegisVault.deploy(owner.address, aiOracle.address);
  await aegisVault.waitForDeployment();

  // Set MockXCM as the XCM precompile address
  await aegisVault.setXCMPrecompileAddress(await mockXCM.getAddress());

  // Mint tokens to users
  await mockToken.mint(user1.address, ethers.parseEther("10000"));
  await mockToken.mint(user2.address, ethers.parseEther("10000"));

  // Approve vault
  await mockToken.connect(user1).approve(await aegisVault.getAddress(), ethers.MaxUint256);
  await mockToken.connect(user2).approve(await aegisVault.getAddress(), ethers.MaxUint256);

  // Add supported token
  await aegisVault.addSupportedToken(await mockToken.getAddress());

  return {
    aegisVault,
    mockToken,
    mockXCM,
    owner,
    aiOracle,
    user1,
    user2,
  };
}

describe("AegisVault Rebalancing", function () {
  describe("Target Weight Management", function () {
    it("allows owner to set target weights for parachains", async function () {
      const { aegisVault, owner } = await deployRebalanceFixture();
      
      const parachainId = 2000;
      const targetWeight = 2500; // 25%
      
      await expect(aegisVault.setTargetWeight(parachainId, targetWeight))
        .to.emit(aegisVault, "TargetWeightUpdated")
        .withArgs(parachainId, targetWeight, anyValue);
      
      expect(await aegisVault.getTargetWeight(parachainId)).to.equal(targetWeight);
    });

    it("rejects target weights exceeding 100%", async function () {
      const { aegisVault } = await deployRebalanceFixture();
      
      const parachainId = 2000;
      const invalidWeight = 10001; // > 100%
      
      await expect(aegisVault.setTargetWeight(parachainId, invalidWeight))
        .to.be.revertedWithCustomError(aegisVault, "InvalidTargetWeight")
        .withArgs(invalidWeight);
    });

    it("rejects non-owners from setting target weights", async function () {
      const { aegisVault, user1 } = await deployRebalanceFixture();
      
      await expect(aegisVault.connect(user1).setTargetWeight(2000, 2500))
        .to.be.revertedWithCustomError(aegisVault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });
  });

  describe("Rebalancing Pause Control", function () {
    it("allows owner to toggle rebalancing pause", async function () {
      const { aegisVault, owner } = await deployRebalanceFixture();
      
      expect(await aegisVault.rebalancingPaused()).to.equal(false);
      
      await expect(aegisVault.toggleRebalancing())
        .to.emit(aegisVault, "RebalancingToggled")
        .withArgs(true, owner.address);
      
      expect(await aegisVault.rebalancingPaused()).to.equal(true);
      
      await aegisVault.toggleRebalancing();
      expect(await aegisVault.rebalancingPaused()).to.equal(false);
    });

    it("rejects non-owners from toggling rebalancing", async function () {
      const { aegisVault, user1 } = await deployRebalanceFixture();
      
      await expect(aegisVault.connect(user1).toggleRebalancing())
        .to.be.revertedWithCustomError(aegisVault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });
  });

  describe("Weight Calculation", function () {
    it("calculates parachain weight correctly", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const parachainId = 2000;
      const amount = ethers.parseEther("1000");
      
      // Deposit and route to set up initial state
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      // Route to parachain
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        parachainId,
        tokenAddress,
        amount,
        50, // risk score
        assetData,
        0,
        1000000,
        1
      );
      
      // Weight should be 100% (10000 bps) since all routed to this parachain
      const weight = await aegisVault.calculateParachainWeight(parachainId, tokenAddress);
      expect(weight).to.equal(10000n);
    });

    it("calculates deviation from target correctly", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const parachainId = 2000;
      
      // Set target weight to 25%
      await aegisVault.setTargetWeight(parachainId, 2500);
      
      // Deposit and route all to this parachain (100% vs 25% target)
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        parachainId,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      // Deviation should be 75% (7500 bps) above target
      const [deviation, isAbove] = await aegisVault.calculateDeviation(parachainId, tokenAddress);
      expect(deviation).to.equal(7500n);
      expect(isAbove).to.equal(true);
    });

    it("returns zero weight when no funds routed", async function () {
      const { aegisVault, mockToken } = await deployRebalanceFixture();
      
      const weight = await aegisVault.calculateParachainWeight(2000, await mockToken.getAddress());
      expect(weight).to.equal(0n);
    });
  });

  describe("Rebalance Threshold Logic", function () {
    it("detects when rebalancing is needed (deviation > 5%)", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const parachainId = 2000;
      
      // Set target to 25%, route 100% -> 75% deviation
      await aegisVault.setTargetWeight(parachainId, 2500);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        parachainId,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      // Should need rebalancing (75% > 5% threshold)
      const isNeeded = await aegisVault.isRebalanceNeeded(parachainId, tokenAddress);
      expect(isNeeded).to.equal(true);
    });

    it("detects when rebalancing is NOT needed (deviation < 5%)", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const parachainId = 2000;
      const secondParachain = 2004;
      
      // Set targets: 50% each
      await aegisVault.setTargetWeight(parachainId, 5000);
      await aegisVault.setTargetWeight(secondParachain, 5000);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      // Route 50% to first parachain, 50% to second
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        parachainId,
        tokenAddress,
        ethers.parseEther("500"),
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        secondParachain,
        tokenAddress,
        ethers.parseEther("500"),
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      // Should NOT need rebalancing (0% deviation)
      const isNeeded = await aegisVault.isRebalanceNeeded(parachainId, tokenAddress);
      expect(isNeeded).to.equal(false);
    });

    it("calculates correct rebalance amount", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const parachainId = 2000;
      
      // Target: 25%, Current: 100% -> Need to remove 75%
      await aegisVault.setTargetWeight(parachainId, 2500);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        parachainId,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      // Should need to remove 750 tokens (75% of 1000)
      const [rebalanceAmount, isDeposit] = await aegisVault.calculateRebalanceAmount(
        parachainId,
        tokenAddress
      );
      
      expect(rebalanceAmount).to.equal(ethers.parseEther("750"));
      expect(isDeposit).to.equal(false);
    });
  });

  describe("Rebalance Execution", function () {
    it("executes rebalance when threshold is exceeded", async function () {
      const { aegisVault, mockToken, mockXCM, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const sourceParachain = 2000;
      const destParachain = 2004;
      
      // Setup: Route all to source parachain
      await aegisVault.setTargetWeight(sourceParachain, 2500); // 25% target
      await aegisVault.setTargetWeight(destParachain, 2500);   // 25% target
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        sourceParachain,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      // Execute rebalance with 0.5% slippage tolerance
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const maxSlippageBps = 50; // 0.5%
      
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        sourceParachain,
        destParachain,
        tokenAddress,
        maxSlippageBps,
        deadline,
        50, // risk score
        assetData,
        0,
        1000000,
        1
      ))
        .to.emit(aegisVault, "RebalanceInitiated")
        .to.emit(aegisVault, "RebalanceCompleted")
        .to.emit(mockXCM, "XcmSent");
    });

    it("reverts when rebalancing is paused", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      await aegisVault.toggleRebalancing(); // Pause rebalancing
      
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        2000,
        2004,
        await mockToken.getAddress(),
        50,
        Math.floor(Date.now() / 1000) + 3600,
        50,
        "0x1234",
        0,
        1000000,
        1
      )).to.be.revertedWithCustomError(aegisVault, "XCMRoutingPaused");
    });

    it("reverts when deadline has passed", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const pastDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        2000,
        2004,
        await mockToken.getAddress(),
        50,
        pastDeadline,
        50,
        "0x1234",
        0,
        1000000,
        1
      )).to.be.revertedWithCustomError(aegisVault, "DeadlinePassed");
    });

    it("reverts when slippage exceeds maximum (10%)", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const futureDeadline = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        2000,
        2004,
        await mockToken.getAddress(),
        1500, // 15% > 10% max
        futureDeadline,
        50,
        "0x1234",
        0,
        1000000,
        1
      )).to.be.revertedWithCustomError(aegisVault, "SlippageExceeded");
    });

    it("reverts when threshold is not met", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const sourceParachain = 2000;
      const destParachain = 2004;
      
      // Setup balanced state (no deviation)
      await aegisVault.setTargetWeight(sourceParachain, 5000);
      await aegisVault.setTargetWeight(destParachain, 5000);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        sourceParachain,
        tokenAddress,
        ethers.parseEther("500"),
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        destParachain,
        tokenAddress,
        ethers.parseEther("500"),
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      // Try to rebalance when already balanced
      const futureDeadline = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        sourceParachain,
        destParachain,
        tokenAddress,
        50,
        futureDeadline,
        50,
        assetData,
        0,
        1000000,
        1
      )).to.be.revertedWithCustomError(aegisVault, "RebalanceThresholdNotMet");
    });

    it("reverts when called by non-oracle", async function () {
      const { aegisVault, mockToken, user1 } = await deployRebalanceFixture();
      
      const futureDeadline = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(aegisVault.connect(user1).rebalanceVault(
        2000,
        2004,
        await mockToken.getAddress(),
        50,
        futureDeadline,
        50,
        "0x1234",
        0,
        1000000,
        1
      )).to.be.revertedWithCustomError(aegisVault, "OnlyAIOracle");
    });
  });

  describe("Slippage Protection Scenarios", function () {
    it("accepts 0.5% slippage tolerance", async function () {
      const { aegisVault, mockToken, mockXCM, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const sourceParachain = 2000;
      const destParachain = 2004;
      
      await aegisVault.setTargetWeight(sourceParachain, 2500);
      await aegisVault.setTargetWeight(destParachain, 2500);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        sourceParachain,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // 0.5% slippage should be accepted
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        sourceParachain,
        destParachain,
        tokenAddress,
        50, // 0.5%
        deadline,
        50,
        assetData,
        0,
        1000000,
        1
      )).to.not.be.reverted;
    });

    it("accepts 1% slippage tolerance", async function () {
      const { aegisVault, mockToken, mockXCM, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const sourceParachain = 2000;
      const destParachain = 2004;
      
      await aegisVault.setTargetWeight(sourceParachain, 2500);
      await aegisVault.setTargetWeight(destParachain, 2500);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        sourceParachain,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // 1% slippage should be accepted
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        sourceParachain,
        destParachain,
        tokenAddress,
        100, // 1%
        deadline,
        50,
        assetData,
        0,
        1000000,
        1
      )).to.not.be.reverted;
    });

    it("rejects 11% slippage tolerance (exceeds 10% max)", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const futureDeadline = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(aegisVault.connect(aiOracle).rebalanceVault(
        2000,
        2004,
        await mockToken.getAddress(),
        1100, // 11% > 10% max
        futureDeadline,
        50,
        "0x1234",
        0,
        1000000,
        1
      )).to.be.revertedWithCustomError(aegisVault, "SlippageExceeded");
    });
  });

  describe("Parachain Accounting", function () {
    it("tracks routed amounts per parachain correctly", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const parachainId = 2000;
      const amount = ethers.parseEther("500");
      
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        parachainId,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      const routedAmount = await aegisVault.getRoutedToParachain(parachainId, tokenAddress);
      expect(routedAmount).to.equal(amount);
    });

    it("updates parachain balances after rebalance", async function () {
      const { aegisVault, mockToken, mockXCM, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const sourceParachain = 2000;
      const destParachain = 2004;
      
      await aegisVault.setTargetWeight(sourceParachain, 2500);
      await aegisVault.setTargetWeight(destParachain, 2500);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        sourceParachain,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      await aegisVault.connect(aiOracle).rebalanceVault(
        sourceParachain,
        destParachain,
        tokenAddress,
        50,
        deadline,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      // Source should have decreased
      const sourceAmount = await aegisVault.getRoutedToParachain(sourceParachain, tokenAddress);
      expect(sourceAmount).to.be.lessThan(amount);
      
      // Destination should have increased
      const destAmount = await aegisVault.getRoutedToParachain(destParachain, tokenAddress);
      expect(destAmount).to.be.greaterThan(0n);
    });
  });

  describe("Gas Cost Analysis", function () {
    it("measures gas cost for rebalance execution", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const sourceParachain = 2000;
      const destParachain = 2004;
      
      await aegisVault.setTargetWeight(sourceParachain, 2500);
      await aegisVault.setTargetWeight(destParachain, 2500);
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        sourceParachain,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      const tx = await aegisVault.connect(aiOracle).rebalanceVault(
        sourceParachain,
        destParachain,
        tokenAddress,
        50,
        deadline,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      const receipt = await tx.wait();
      console.log(`      Gas used for rebalance: ${receipt.gasUsed.toString()}`);
      
      // Should be under 500k gas
      expect(receipt.gasUsed).to.be.lessThan(500000n);
    });

    it("measures gas cost for weight calculation", async function () {
      const { aegisVault, mockToken, user1, aiOracle } = await deployRebalanceFixture();
      
      const tokenAddress = await mockToken.getAddress();
      const parachainId = 2000;
      
      const amount = ethers.parseEther("1000");
      await aegisVault.connect(user1).deposit(tokenAddress, amount);
      
      const assetData = "0x1234abcd";
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        parachainId,
        tokenAddress,
        amount,
        50,
        assetData,
        0,
        1000000,
        1
      );
      
      const gasEstimate = await aegisVault.calculateParachainWeight.estimateGas(
        parachainId,
        tokenAddress
      );
      console.log(`      Gas used for weight calculation: ${gasEstimate.toString()}`);
      
      // View functions should be cheap
      expect(gasEstimate).to.be.lessThan(50000n);
    });
  });
});
