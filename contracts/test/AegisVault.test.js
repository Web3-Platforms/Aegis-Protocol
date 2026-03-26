const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, aiOracle, user1, user2, outsider] = await ethers.getSigners();

  const MockToken = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockToken.deploy(
    "Mock Token",
    "MOCK",
    ethers.parseEther("1000000")
  );
  await mockToken.waitForDeployment();

  // Deploy MockXCM for testing
  const MockXCM = await ethers.getContractFactory("MockXCM");
  const mockXCM = await MockXCM.deploy();
  await mockXCM.waitForDeployment();

  const AegisVault = await ethers.getContractFactory("AegisVault");
  const aegisVault = await AegisVault.deploy(owner.address, aiOracle.address);
  await aegisVault.waitForDeployment();

  // Set MockXCM as the XCM precompile address
  await aegisVault.setXCMPrecompileAddress(await mockXCM.getAddress());

  await mockToken.mint(user1.address, ethers.parseEther("1000"));
  await mockToken.mint(user2.address, ethers.parseEther("1000"));

  await mockToken
    .connect(user1)
    .approve(await aegisVault.getAddress(), ethers.MaxUint256);
  await mockToken
    .connect(user2)
    .approve(await aegisVault.getAddress(), ethers.MaxUint256);

  await aegisVault.addSupportedToken(await mockToken.getAddress());

  return {
    aegisVault,
    mockToken,
    mockXCM,
    owner,
    aiOracle,
    user1,
    user2,
    outsider,
  };
}

describe("AegisVault", function () {
  describe("Deployment", function () {
    it("sets the expected immutable configuration", async function () {
      const { aegisVault, owner, aiOracle } = await deployFixture();

      expect(await aegisVault.owner()).to.equal(owner.address);
      expect(await aegisVault.aiOracleAddress()).to.equal(aiOracle.address);
      expect(await aegisVault.MAX_RISK_SCORE()).to.equal(75n);
    });

    it("reverts when deployed with a zero AI oracle", async function () {
      const [owner] = await ethers.getSigners();
      const AegisVault = await ethers.getContractFactory("AegisVault");

      await expect(
        AegisVault.deploy(owner.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(AegisVault, "InvalidAIOracleAddress");
    });
  });

  describe("Owner controls", function () {
    it("allows the owner to add a supported token", async function () {
      const { aegisVault, owner, aiOracle } = await deployFixture();
      const MockToken = await ethers.getContractFactory("MockERC20");
      const newToken = await MockToken.deploy(
        "Another Token",
        "ATK",
        ethers.parseEther("100")
      );
      await newToken.waitForDeployment();

      const freshVault = await (
        await ethers.getContractFactory("AegisVault")
      ).deploy(owner.address, aiOracle.address);
      await freshVault.waitForDeployment();

      await expect(freshVault.addSupportedToken(await newToken.getAddress()))
        .to.emit(freshVault, "TokenSupported")
        .withArgs(await newToken.getAddress());

      expect(await freshVault.supportedTokens(await newToken.getAddress())).to.equal(
        true
      );
    });

    it("rejects adding the zero token address", async function () {
      const { aegisVault } = await deployFixture();

      await expect(
        aegisVault.addSupportedToken(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(aegisVault, "InvalidTokenAddress");
    });

    it("rejects non-owners adding supported tokens", async function () {
      const { aegisVault, user1 } = await deployFixture();

      await expect(
        aegisVault.connect(user1).addSupportedToken(user1.address)
      )
        .to.be.revertedWithCustomError(aegisVault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("allows the owner to update the oracle", async function () {
      const { aegisVault, user2 } = await deployFixture();

      await expect(aegisVault.setAIOracleAddress(user2.address))
        .to.emit(aegisVault, "AIOracleUpdated")
        .withArgs(user2.address);

      expect(await aegisVault.aiOracleAddress()).to.equal(user2.address);
    });

    it("rejects zero oracle updates", async function () {
      const { aegisVault } = await deployFixture();

      await expect(
        aegisVault.setAIOracleAddress(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(aegisVault, "InvalidOracleAddress");
    });

    it("rejects non-owners updating the oracle", async function () {
      const { aegisVault, user1, user2 } = await deployFixture();

      await expect(
        aegisVault.connect(user1).setAIOracleAddress(user2.address)
      )
        .to.be.revertedWithCustomError(aegisVault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("allows the owner to update the XCM precompile address", async function () {
      const { aegisVault, user2 } = await deployFixture();

      await expect(aegisVault.setXCMPrecompileAddress(user2.address))
        .to.emit(aegisVault, "XCMPrecompileUpdated")
        .withArgs(user2.address);

      expect(await aegisVault.xcmPrecompileAddress()).to.equal(user2.address);
    });

    it("rejects zero XCM precompile address updates", async function () {
      const { aegisVault } = await deployFixture();

      await expect(
        aegisVault.setXCMPrecompileAddress(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(aegisVault, "InvalidXCMPrecompileAddress");
    });

    it("rejects non-owners updating the XCM precompile address", async function () {
      const { aegisVault, user1, user2 } = await deployFixture();

      await expect(
        aegisVault.connect(user1).setXCMPrecompileAddress(user2.address)
      )
        .to.be.revertedWithCustomError(aegisVault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("activates the new oracle and revokes the previous one", async function () {
      const { aegisVault, mockToken, aiOracle, user2 } = await deployFixture();

      // First deposit some tokens
      await aegisVault.connect(user2).deposit(await mockToken.getAddress(), ethers.parseEther("100"));

      await aegisVault.setAIOracleAddress(user2.address);

      const assetData = "0x1234";
      await expect(
        aegisVault.connect(user2).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          ethers.parseEther("1"),
          42,
          assetData,
          0,
          1000000
        )
      ).to.emit(aegisVault, "YieldRoutedViaXCM");

      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          ethers.parseEther("1"),
          42,
          assetData,
          0,
          1000000
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "OnlyAIOracle")
        .withArgs(aiOracle.address);
    });
  });

  describe("Deposits", function () {
    it("accepts supported-token deposits and tracks balances", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const amount = ethers.parseEther("100");

      await expect(
        aegisVault.connect(user1).deposit(await mockToken.getAddress(), amount)
      )
        .to.emit(aegisVault, "Deposit")
        .withArgs(user1.address, await mockToken.getAddress(), amount, anyUint());

      expect(
        await aegisVault.getUserDeposit(user1.address, await mockToken.getAddress())
      ).to.equal(amount);
      expect(await aegisVault.totalDeposits(await mockToken.getAddress())).to.equal(
        amount
      );
      expect(await aegisVault.getVaultBalance(await mockToken.getAddress())).to.equal(
        amount
      );
    });

    it("aggregates deposits from multiple users", async function () {
      const { aegisVault, mockToken, user1, user2 } = await deployFixture();

      await aegisVault
        .connect(user1)
        .deposit(await mockToken.getAddress(), ethers.parseEther("100"));
      await aegisVault
        .connect(user2)
        .deposit(await mockToken.getAddress(), ethers.parseEther("250"));

      expect(await aegisVault.totalDeposits(await mockToken.getAddress())).to.equal(
        ethers.parseEther("350")
      );
    });

    it("supports repeated deposits from the same user", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();

      await aegisVault.connect(user1).deposit(tokenAddress, ethers.parseEther("25"));
      await aegisVault.connect(user1).deposit(tokenAddress, ethers.parseEther("75"));

      expect(await aegisVault.getUserDeposit(user1.address, tokenAddress)).to.equal(
        ethers.parseEther("100")
      );
    });

    it("rejects deposits for unsupported tokens", async function () {
      const { aegisVault, user1 } = await deployFixture();
      const MockToken = await ethers.getContractFactory("MockERC20");
      const unsupportedToken = await MockToken.deploy(
        "Unsupported",
        "UNS",
        ethers.parseEther("100")
      );
      await unsupportedToken.waitForDeployment();
      await unsupportedToken.mint(user1.address, ethers.parseEther("10"));
      await unsupportedToken
        .connect(user1)
        .approve(await aegisVault.getAddress(), ethers.MaxUint256);

      await expect(
        aegisVault
          .connect(user1)
          .deposit(await unsupportedToken.getAddress(), ethers.parseEther("1"))
      )
        .to.be.revertedWithCustomError(aegisVault, "TokenNotSupported")
        .withArgs(await unsupportedToken.getAddress());
    });

    it("rejects zero-value deposits", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();

      await expect(
        aegisVault.connect(user1).deposit(await mockToken.getAddress(), 0)
      ).to.be.revertedWithCustomError(aegisVault, "AmountMustBeGreaterThanZero");
    });
  });

  describe("Withdrawals", function () {
    it("allows partial withdrawals and updates accounting", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();

      await aegisVault.connect(user1).deposit(tokenAddress, ethers.parseEther("100"));

      await expect(
        aegisVault.connect(user1).withdraw(tokenAddress, ethers.parseEther("40"))
      )
        .to.emit(aegisVault, "Withdrawal")
        .withArgs(
          user1.address,
          tokenAddress,
          ethers.parseEther("40"),
          anyUint()
        );

      expect(await aegisVault.getUserDeposit(user1.address, tokenAddress)).to.equal(
        ethers.parseEther("60")
      );
      expect(await aegisVault.totalDeposits(tokenAddress)).to.equal(
        ethers.parseEther("60")
      );
      expect(await aegisVault.getVaultBalance(tokenAddress)).to.equal(
        ethers.parseEther("60")
      );
    });

    it("supports multiple withdrawals until balance is exhausted", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();

      await aegisVault.connect(user1).deposit(tokenAddress, ethers.parseEther("100"));
      await aegisVault.connect(user1).withdraw(tokenAddress, ethers.parseEther("30"));
      await aegisVault.connect(user1).withdraw(tokenAddress, ethers.parseEther("70"));

      expect(await aegisVault.getUserDeposit(user1.address, tokenAddress)).to.equal(0);
      expect(await aegisVault.totalDeposits(tokenAddress)).to.equal(0);
    });

    it("rejects zero-value withdrawals", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();

      await expect(
        aegisVault.connect(user1).withdraw(await mockToken.getAddress(), 0)
      ).to.be.revertedWithCustomError(aegisVault, "AmountMustBeGreaterThanZero");
    });

    it("rejects withdrawals that exceed the user's deposit", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();
      const requestedAmount = ethers.parseEther("1");

      await expect(
        aegisVault
          .connect(user1)
          .withdraw(tokenAddress, requestedAmount)
      )
        .to.be.revertedWithCustomError(aegisVault, "InsufficientDepositBalance")
        .withArgs(user1.address, tokenAddress, 0n, requestedAmount);
    });
  });

  describe("Yield routing via XCM", function () {
    it("allows the oracle to route yield when the risk score is below 75", async function () {
      const { aegisVault, mockToken, aiOracle, user1 } = await deployFixture();
      const amount = ethers.parseEther("10");
      const assetData = "0x1234abcd";

      // Deposit tokens first
      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), amount);

      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2004,
          await mockToken.getAddress(),
          amount,
          74,
          assetData,
          0,
          1000000
        )
      )
        .to.emit(aegisVault, "YieldRoutedViaXCM")
        .withArgs(2004, await mockToken.getAddress(), amount, 74, assetData, anyUint());
    });

    it("rejects routing when the caller is not the oracle", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const assetData = "0x1234";

      await expect(
        aegisVault.connect(user1).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          ethers.parseEther("1"),
          10,
          assetData,
          0,
          1000000
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "OnlyAIOracle")
        .withArgs(user1.address);
    });

    it("rejects risk scores at or above the threshold", async function () {
      const { aegisVault, mockToken, aiOracle } = await deployFixture();
      const assetData = "0x1234";

      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          ethers.parseEther("1"),
          75,
          assetData,
          0,
          1000000
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "RiskScoreTooHigh")
        .withArgs(75);

      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          ethers.parseEther("1"),
          99,
          assetData,
          0,
          1000000
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "RiskScoreTooHigh")
        .withArgs(99);
    });

    it("rejects zero-amount routing", async function () {
      const { aegisVault, mockToken, aiOracle } = await deployFixture();
      const assetData = "0x1234";

      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          0,
          10,
          assetData,
          0,
          1000000
        )
      ).to.be.revertedWithCustomError(aegisVault, "AmountMustBeGreaterThanZero");
    });

    it("rejects routing for unsupported tokens", async function () {
      const { aegisVault, aiOracle } = await deployFixture();
      const assetData = "0x1234";
      const unsupportedToken = "0x0000000000000000000000000000000000000999";

      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          unsupportedToken,
          ethers.parseEther("1"),
          10,
          assetData,
          0,
          1000000
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "TokenNotSupported")
        .withArgs(unsupportedToken);
    });

    it("rejects routing when vault has insufficient balance", async function () {
      const { aegisVault, mockToken, aiOracle } = await deployFixture();
      const assetData = "0x1234";
      const requestedAmount = ethers.parseEther("1000");

      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          requestedAmount,
          10,
          assetData,
          0,
          1000000
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "InsufficientRoutedBalance")
        .withArgs(await mockToken.getAddress(), 0n, requestedAmount);
    });

    it("should trigger XCM call on routing", async function () {
      const { aegisVault, mockToken, mockXCM, aiOracle, user1 } = await deployFixture();
      const amount = ethers.parseEther("10");
      const destParachainId = 2004;
      const assetData = "0x1234abcd5678";
      const feeAssetItem = 0;
      const weightLimit = 1000000;

      // Deposit tokens first
      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), amount);

      // Execute routing
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        destParachainId,
        await mockToken.getAddress(),
        amount,
        42,
        assetData,
        feeAssetItem,
        weightLimit
      );

      // Verify that MockXCM received the call
      const callCount = await mockXCM.getCallCount();
      expect(callCount).to.equal(1n);

      // Verify the call details
      const lastCall = await mockXCM.getLastCall();
      expect(lastCall.parachainId).to.equal(destParachainId);
      expect(lastCall.assets).to.equal(assetData);
      expect(lastCall.feeAssetItem).to.equal(feeAssetItem);
      expect(lastCall.weightLimit).to.equal(weightLimit);
      expect(lastCall.caller).to.equal(await aegisVault.getAddress());

      // Verify calls by parachain
      const callsToParachain = await mockXCM.getCallsByParachain(destParachainId);
      expect(callsToParachain.length).to.equal(1);
      expect(await mockXCM.hasCallsToParachain(destParachainId)).to.equal(true);
    });

    it("should track total routed amounts correctly", async function () {
      const { aegisVault, mockToken, aiOracle, user1 } = await deployFixture();
      const amount1 = ethers.parseEther("10");
      const amount2 = ethers.parseEther("20");
      const assetData = "0x1234";

      // Deposit tokens
      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), ethers.parseEther("100"));

      // First routing
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        2004,
        await mockToken.getAddress(),
        amount1,
        42,
        assetData,
        0,
        1000000
      );

      expect(await aegisVault.getTotalRouted(await mockToken.getAddress())).to.equal(amount1);

      // Second routing
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        2004,
        await mockToken.getAddress(),
        amount2,
        42,
        assetData,
        0,
        1000000
      );

      expect(await aegisVault.getTotalRouted(await mockToken.getAddress())).to.equal(
        amount1 + amount2
      );
    });

    it("should emit XCMCalled event with correct parameters", async function () {
      const { aegisVault, mockToken, aiOracle, user1 } = await deployFixture();
      const amount = ethers.parseEther("10");
      const destParachainId = 2004;
      const assetData = "0xabcd1234";
      const feeAssetItem = 1;
      const weightLimit = 500000;

      // Deposit tokens first
      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), amount);

      // Execute routing and verify XCMCalled event
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          destParachainId,
          await mockToken.getAddress(),
          amount,
          42,
          assetData,
          feeAssetItem,
          weightLimit
        )
      )
        .to.emit(aegisVault, "XCMCalled")
        .withArgs(destParachainId, assetData, feeAssetItem, weightLimit);
    });
  });

  describe("Views and state integrity", function () {
    it("returns the correct balances after mixed operations", async function () {
      const { aegisVault, mockToken, aiOracle, user1, user2 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();
      const assetData = "0x1234";

      await aegisVault.connect(user1).deposit(tokenAddress, ethers.parseEther("100"));
      await aegisVault.connect(user2).deposit(tokenAddress, ethers.parseEther("50"));
      await aegisVault
        .connect(aiOracle)
        .routeYieldViaXCM(
          2012,
          tokenAddress,
          ethers.parseEther("5"),
          45,
          assetData,
          0,
          1000000
        );
      await aegisVault.connect(user1).withdraw(tokenAddress, ethers.parseEther("25"));

      expect(await aegisVault.getUserDeposit(user1.address, tokenAddress)).to.equal(
        ethers.parseEther("75")
      );
      expect(await aegisVault.getUserDeposit(user2.address, tokenAddress)).to.equal(
        ethers.parseEther("50")
      );
      expect(await aegisVault.totalDeposits(tokenAddress)).to.equal(
        ethers.parseEther("125")
      );
      expect(await aegisVault.getVaultBalance(tokenAddress)).to.equal(
        ethers.parseEther("125")
      );
      expect(await aegisVault.getTotalRouted(tokenAddress)).to.equal(
        ethers.parseEther("5")
      );
    });

    it("handles large deposits within user balance", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const amount = ethers.parseEther("900");

      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), amount);

      expect(
        await aegisVault.getUserDeposit(user1.address, await mockToken.getAddress())
      ).to.equal(amount);
    });
  });

  describe("Reentrancy protection", function () {
    it("blocks reentrant deposits triggered by a malicious token callback", async function () {
      const { aegisVault, user1 } = await deployFixture();
      const ReentrantToken = await ethers.getContractFactory("ReentrantERC20");
      const reentrantToken = await ReentrantToken.deploy();
      await reentrantToken.waitForDeployment();

      await aegisVault.addSupportedToken(await reentrantToken.getAddress());
      await reentrantToken.mint(user1.address, ethers.parseEther("10"));
      await reentrantToken
        .connect(user1)
        .approve(await aegisVault.getAddress(), ethers.MaxUint256);
      await reentrantToken.armDepositAttack(
        await aegisVault.getAddress(),
        ethers.parseEther("1")
      );

      await expect(
        aegisVault
          .connect(user1)
          .deposit(await reentrantToken.getAddress(), ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(
        aegisVault,
        "ReentrancyGuardReentrantCall"
      );

      expect(
        await aegisVault.getUserDeposit(user1.address, await reentrantToken.getAddress())
      ).to.equal(0);
    });

    it("blocks reentrant withdrawals triggered during token transfer", async function () {
      const { aegisVault } = await deployFixture();
      const ReentrantToken = await ethers.getContractFactory("ReentrantERC20");
      const reentrantToken = await ReentrantToken.deploy();
      await reentrantToken.waitForDeployment();

      await aegisVault.addSupportedToken(await reentrantToken.getAddress());
      await reentrantToken.seedAndArmWithdrawAttack(
        await aegisVault.getAddress(),
        ethers.parseEther("5"),
        ethers.parseEther("1")
      );

      await expect(
        reentrantToken.attackWithdraw(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(
        aegisVault,
        "ReentrancyGuardReentrantCall"
      );

      expect(
        await aegisVault.getUserDeposit(
          await reentrantToken.getAddress(),
          await reentrantToken.getAddress()
        )
      ).to.equal(ethers.parseEther("5"));
    });
  });
});

function anyUint() {
  return (value) => typeof value === "bigint" && value >= 0n;
}
