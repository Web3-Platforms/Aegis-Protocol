const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployLaunchFixture() {
  const [owner, user1, user2, outsider] = await ethers.getSigners();

  const MockToken = await ethers.getContractFactory("MockERC20");
  const launchToken = await MockToken.deploy(
    "Mock xcUSDC",
    "xcUSDC",
    ethers.parseEther("1000000")
  );
  await launchToken.waitForDeployment();

  const unsupportedToken = await MockToken.deploy(
    "Unsupported Token",
    "UNS",
    ethers.parseEther("1000000")
  );
  await unsupportedToken.waitForDeployment();

  const LaunchVault = await ethers.getContractFactory("AegisVaultLaunch");
  const aegisVaultLaunch = await LaunchVault.deploy(
    owner.address,
    await launchToken.getAddress()
  );
  await aegisVaultLaunch.waitForDeployment();

  await launchToken.mint(user1.address, ethers.parseEther("1000"));
  await launchToken.mint(user2.address, ethers.parseEther("1000"));
  await unsupportedToken.mint(user1.address, ethers.parseEther("1000"));

  await launchToken
    .connect(user1)
    .approve(await aegisVaultLaunch.getAddress(), ethers.MaxUint256);
  await launchToken
    .connect(user2)
    .approve(await aegisVaultLaunch.getAddress(), ethers.MaxUint256);
  await unsupportedToken
    .connect(user1)
    .approve(await aegisVaultLaunch.getAddress(), ethers.MaxUint256);

  return {
    aegisVaultLaunch,
    launchToken,
    unsupportedToken,
    owner,
    user1,
    user2,
    outsider,
  };
}

describe("AegisVaultLaunch", function () {
  describe("Deployment", function () {
    it("boots in a safe default posture with a fixed single launch token", async function () {
      const { aegisVaultLaunch, launchToken, unsupportedToken, owner } =
        await deployLaunchFixture();

      expect(await aegisVaultLaunch.owner()).to.equal(owner.address);
      expect(await aegisVaultLaunch.launchToken()).to.equal(
        await launchToken.getAddress()
      );
      expect(await aegisVaultLaunch.supportedTokens(await launchToken.getAddress())).to
        .equal(true);
      expect(
        await aegisVaultLaunch.supportedTokens(await unsupportedToken.getAddress())
      ).to.equal(false);
      expect(await aegisVaultLaunch.depositsPaused()).to.equal(true);
      expect(await aegisVaultLaunch.withdrawalsPaused()).to.equal(true);
    });

    it("reverts when deployed with a zero launch token", async function () {
      const [owner] = await ethers.getSigners();
      const LaunchVault = await ethers.getContractFactory("AegisVaultLaunch");

      await expect(
        LaunchVault.deploy(owner.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(LaunchVault, "InvalidTokenAddress");
    });

    it("removes prototype routing, oracle, and rebalancing surfaces from the ABI", async function () {
      const { aegisVaultLaunch } = await deployLaunchFixture();
      const functionNames = aegisVaultLaunch.interface.fragments
        .filter((fragment) => fragment.type === "function")
        .map((fragment) => fragment.name);
      const eventNames = aegisVaultLaunch.interface.fragments
        .filter((fragment) => fragment.type === "event")
        .map((fragment) => fragment.name);

      for (const name of [
        "setAIOracleAddress",
        "setXCMPrecompileAddress",
        "setRouteCap",
        "setRouteCapByAssetType",
        "toggleXcmRoute",
        "routeYieldViaXCM",
        "getTotalRouted",
        "getTotalRoutedByAssetType",
        "setTargetWeight",
        "toggleRebalancing",
        "calculateParachainWeight",
        "calculateDeviation",
        "calculateRebalanceAmount",
        "isRebalanceNeeded",
        "rebalanceVault",
        "getRoutedToParachain",
        "getTargetWeight",
        "isRebalanceActive",
        "addSupportedToken",
      ]) {
        expect(functionNames).to.not.include(name);
      }

      for (const name of [
        "AIOracleUpdated",
        "XCMPrecompileUpdated",
        "YieldRoutedViaXCM",
        "YieldRoutedViaXCMWithAssetType",
        "XCMCalled",
        "XcmRouted",
        "RouteCapUpdated",
        "RouteCapByAssetTypeUpdated",
        "XCMRoutingToggled",
        "TargetWeightUpdated",
        "RebalanceInitiated",
        "RebalanceCompleted",
        "RebalancingToggled",
        "SlippageProtected",
      ]) {
        expect(eventNames).to.not.include(name);
      }
    });
  });

  describe("Owner pause controls", function () {
    it("allows the owner to independently update deposit and withdrawal pause states", async function () {
      const { aegisVaultLaunch, owner } = await deployLaunchFixture();

      await expect(aegisVaultLaunch.setDepositsPaused(false))
        .to.emit(aegisVaultLaunch, "DepositsPauseUpdated")
        .withArgs(false, owner.address);
      expect(await aegisVaultLaunch.depositsPaused()).to.equal(false);

      await expect(aegisVaultLaunch.setWithdrawalsPaused(false))
        .to.emit(aegisVaultLaunch, "WithdrawalsPauseUpdated")
        .withArgs(false, owner.address);
      expect(await aegisVaultLaunch.withdrawalsPaused()).to.equal(false);
    });

    it("rejects non-owners from changing pause states", async function () {
      const { aegisVaultLaunch, user1 } = await deployLaunchFixture();

      await expect(aegisVaultLaunch.connect(user1).setDepositsPaused(false))
        .to.be.revertedWithCustomError(
          aegisVaultLaunch,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(user1.address);

      await expect(aegisVaultLaunch.connect(user1).setWithdrawalsPaused(false))
        .to.be.revertedWithCustomError(
          aegisVaultLaunch,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(user1.address);
    });
  });

  describe("Deposits", function () {
    it("rejects deposits while deposits are paused", async function () {
      const { aegisVaultLaunch, launchToken, user1 } = await deployLaunchFixture();

      await expect(
        aegisVaultLaunch
          .connect(user1)
          .deposit(await launchToken.getAddress(), ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(aegisVaultLaunch, "DepositsPaused");
    });

    it("accepts supported launch-token deposits and tracks balances", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();
      const amount = ethers.parseEther("100");

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);

      await expect(
        aegisVaultLaunch.connect(user1).deposit(await launchToken.getAddress(), amount)
      )
        .to.emit(aegisVaultLaunch, "Deposit")
        .withArgs(user1.address, await launchToken.getAddress(), amount, anyUint());

      expect(
        await aegisVaultLaunch.getUserDeposit(
          user1.address,
          await launchToken.getAddress()
        )
      ).to.equal(amount);
      expect(
        await aegisVaultLaunch.totalDeposits(await launchToken.getAddress())
      ).to.equal(amount);
      expect(
        await aegisVaultLaunch.getVaultBalance(await launchToken.getAddress())
      ).to.equal(amount);
    });

    it("supports repeated deposits from multiple users after unpausing deposits", async function () {
      const { aegisVaultLaunch, launchToken, user1, user2, owner } =
        await deployLaunchFixture();
      const tokenAddress = await launchToken.getAddress();

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);
      await aegisVaultLaunch.connect(user1).deposit(tokenAddress, ethers.parseEther("25"));
      await aegisVaultLaunch.connect(user2).deposit(tokenAddress, ethers.parseEther("75"));
      await aegisVaultLaunch.connect(user1).deposit(tokenAddress, ethers.parseEther("10"));

      expect(await aegisVaultLaunch.getUserDeposit(user1.address, tokenAddress)).to
        .equal(ethers.parseEther("35"));
      expect(await aegisVaultLaunch.getUserDeposit(user2.address, tokenAddress)).to
        .equal(ethers.parseEther("75"));
      expect(await aegisVaultLaunch.totalDeposits(tokenAddress)).to.equal(
        ethers.parseEther("110")
      );
    });

    it("rejects deposits for unsupported tokens", async function () {
      const { aegisVaultLaunch, unsupportedToken, user1, owner } =
        await deployLaunchFixture();

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);

      await expect(
        aegisVaultLaunch
          .connect(user1)
          .deposit(await unsupportedToken.getAddress(), ethers.parseEther("1"))
      )
        .to.be.revertedWithCustomError(aegisVaultLaunch, "TokenNotSupported")
        .withArgs(await unsupportedToken.getAddress());
    });

    it("rejects zero-value deposits", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);

      await expect(
        aegisVaultLaunch.connect(user1).deposit(await launchToken.getAddress(), 0)
      ).to.be.revertedWithCustomError(aegisVaultLaunch, "AmountMustBeGreaterThanZero");
    });
  });

  describe("Withdrawals", function () {
    it("keeps withdrawals independently paused until the owner enables them", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();
      const tokenAddress = await launchToken.getAddress();

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);
      await aegisVaultLaunch.connect(user1).deposit(tokenAddress, ethers.parseEther("50"));

      await expect(
        aegisVaultLaunch.connect(user1).withdraw(tokenAddress, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(aegisVaultLaunch, "WithdrawalsPaused");
    });

    it("allows partial withdrawals and updates accounting after unpausing withdrawals", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();
      const tokenAddress = await launchToken.getAddress();

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);
      await aegisVaultLaunch.connect(owner).setWithdrawalsPaused(false);
      await aegisVaultLaunch.connect(user1).deposit(tokenAddress, ethers.parseEther("100"));

      await expect(
        aegisVaultLaunch.connect(user1).withdraw(tokenAddress, ethers.parseEther("40"))
      )
        .to.emit(aegisVaultLaunch, "Withdrawal")
        .withArgs(user1.address, tokenAddress, ethers.parseEther("40"), anyUint());

      expect(await aegisVaultLaunch.getUserDeposit(user1.address, tokenAddress)).to
        .equal(ethers.parseEther("60"));
      expect(await aegisVaultLaunch.totalDeposits(tokenAddress)).to.equal(
        ethers.parseEther("60")
      );
      expect(await aegisVaultLaunch.getVaultBalance(tokenAddress)).to.equal(
        ethers.parseEther("60")
      );
    });

    it("supports multiple withdrawals until balance is exhausted", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();
      const tokenAddress = await launchToken.getAddress();

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);
      await aegisVaultLaunch.connect(owner).setWithdrawalsPaused(false);
      await aegisVaultLaunch.connect(user1).deposit(tokenAddress, ethers.parseEther("100"));
      await aegisVaultLaunch.connect(user1).withdraw(tokenAddress, ethers.parseEther("30"));
      await aegisVaultLaunch.connect(user1).withdraw(tokenAddress, ethers.parseEther("70"));

      expect(await aegisVaultLaunch.getUserDeposit(user1.address, tokenAddress)).to.equal(
        0
      );
      expect(await aegisVaultLaunch.totalDeposits(tokenAddress)).to.equal(0);
      expect(await aegisVaultLaunch.getVaultBalance(tokenAddress)).to.equal(0);
    });

    it("rejects zero-value withdrawals", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();

      await aegisVaultLaunch.connect(owner).setWithdrawalsPaused(false);

      await expect(
        aegisVaultLaunch.connect(user1).withdraw(await launchToken.getAddress(), 0)
      ).to.be.revertedWithCustomError(aegisVaultLaunch, "AmountMustBeGreaterThanZero");
    });

    it("rejects withdrawals that exceed the user's deposit", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();
      const tokenAddress = await launchToken.getAddress();
      const requestedAmount = ethers.parseEther("1");

      await aegisVaultLaunch.connect(owner).setWithdrawalsPaused(false);

      await expect(
        aegisVaultLaunch.connect(user1).withdraw(tokenAddress, requestedAmount)
      )
        .to.be.revertedWithCustomError(
          aegisVaultLaunch,
          "InsufficientDepositBalance"
        )
        .withArgs(user1.address, tokenAddress, 0n, requestedAmount);
    });
  });

  describe("Liability safety", function () {
    it("keeps the vault fully backed across owner pause actions", async function () {
      const { aegisVaultLaunch, launchToken, user1, owner } =
        await deployLaunchFixture();
      const tokenAddress = await launchToken.getAddress();
      const amount = ethers.parseEther("75");

      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);
      await aegisVaultLaunch.connect(user1).deposit(tokenAddress, amount);

      await aegisVaultLaunch.connect(owner).setDepositsPaused(true);
      await aegisVaultLaunch.connect(owner).setWithdrawalsPaused(false);
      await aegisVaultLaunch.connect(owner).setWithdrawalsPaused(true);
      await aegisVaultLaunch.connect(owner).setDepositsPaused(false);

      expect(await aegisVaultLaunch.getUserDeposit(user1.address, tokenAddress)).to.equal(
        amount
      );
      expect(await aegisVaultLaunch.totalDeposits(tokenAddress)).to.equal(amount);
      expect(await aegisVaultLaunch.getVaultBalance(tokenAddress)).to.equal(amount);
    });
  });

  describe("Reentrancy protection", function () {
    it("blocks reentrant deposits triggered by a malicious token callback", async function () {
      const [owner, user1] = await ethers.getSigners();
      const ReentrantToken = await ethers.getContractFactory("ReentrantERC20");
      const reentrantToken = await ReentrantToken.deploy();
      await reentrantToken.waitForDeployment();

      const LaunchVault = await ethers.getContractFactory("AegisVaultLaunch");
      const aegisVaultLaunch = await LaunchVault.deploy(
        owner.address,
        await reentrantToken.getAddress()
      );
      await aegisVaultLaunch.waitForDeployment();

      await aegisVaultLaunch.setDepositsPaused(false);
      await reentrantToken.mint(user1.address, ethers.parseEther("10"));
      await reentrantToken
        .connect(user1)
        .approve(await aegisVaultLaunch.getAddress(), ethers.MaxUint256);
      await reentrantToken.armDepositAttack(
        await aegisVaultLaunch.getAddress(),
        ethers.parseEther("1")
      );

      await expect(
        aegisVaultLaunch
          .connect(user1)
          .deposit(await reentrantToken.getAddress(), ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(
        aegisVaultLaunch,
        "ReentrancyGuardReentrantCall"
      );

      expect(
        await aegisVaultLaunch.getUserDeposit(
          user1.address,
          await reentrantToken.getAddress()
        )
      ).to.equal(0);
    });

    it("blocks reentrant withdrawals triggered during token transfer", async function () {
      const [owner] = await ethers.getSigners();
      const ReentrantToken = await ethers.getContractFactory("ReentrantERC20");
      const reentrantToken = await ReentrantToken.deploy();
      await reentrantToken.waitForDeployment();

      const LaunchVault = await ethers.getContractFactory("AegisVaultLaunch");
      const aegisVaultLaunch = await LaunchVault.deploy(
        owner.address,
        await reentrantToken.getAddress()
      );
      await aegisVaultLaunch.waitForDeployment();

      await aegisVaultLaunch.setDepositsPaused(false);
      await reentrantToken.seedAndArmWithdrawAttack(
        await aegisVaultLaunch.getAddress(),
        ethers.parseEther("5"),
        ethers.parseEther("1")
      );
      await aegisVaultLaunch.setWithdrawalsPaused(false);

      await expect(
        reentrantToken.attackWithdraw(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(
        aegisVaultLaunch,
        "ReentrancyGuardReentrantCall"
      );

      expect(
        await aegisVaultLaunch.getUserDeposit(
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
