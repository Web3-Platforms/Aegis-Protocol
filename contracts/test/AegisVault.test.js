const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

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
  const MockXCM = await ethers.getContractFactory("contracts/test/MockXCM.sol:MockXCM");
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
          1000000,
          1 // assetType: Wrapper/Mapped
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
          1000000,
          1 // assetType: Wrapper/Mapped
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
          1000000,
          1 // assetType: Wrapper/Mapped
        )
      )
        .to.emit(aegisVault, "YieldRoutedViaXCM")
        .withArgs(2004, await mockToken.getAddress(), amount, 74, assetData, anyUint());
    });

    it("emits XcmRouted event with txHash and parachainNonce for audit tracking", async function () {
      const { aegisVault, mockToken, aiOracle, user1 } = await deployFixture();
      const amount = ethers.parseEther("10");
      const assetData = "0x1234abcd";
      const destParachainId = 2004;
      const assetType = 1; // Wrapper/Mapped
      const riskScore = 74;

      // Deposit tokens first
      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), amount);

      // Get initial nonce
      const initialNonce = await aegisVault.parachainNonces(destParachainId);
      expect(initialNonce).to.equal(0n);

      // Execute route and capture transaction
      const tx = await aegisVault.connect(aiOracle).routeYieldViaXCM(
        destParachainId,
        await mockToken.getAddress(),
        amount,
        riskScore,
        assetData,
        0,
        1000000,
        assetType
      );
      const receipt = await tx.wait();

      // Verify XcmRouted event was emitted with correct parameters
      await expect(tx)
        .to.emit(aegisVault, "XcmRouted")
        .withArgs(
          destParachainId,
          await mockToken.getAddress(),
          amount,
          initialNonce, // parachainNonce should be 0 for first route
          anyValue, // txHash (bytes32) - computed hash
          riskScore,
          assetType,
          anyUint() // timestamp
        );

      // Verify nonce was incremented
      const newNonce = await aegisVault.parachainNonces(destParachainId);
      expect(newNonce).to.equal(1n);

      // Verify nonce increments per destination
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        destParachainId,
        await mockToken.getAddress(),
        amount,
        riskScore,
        assetData,
        0,
        1000000,
        assetType
      );
      const finalNonce = await aegisVault.parachainNonces(destParachainId);
      expect(finalNonce).to.equal(2n);
    });

    it("tracks parachain nonces independently per destination chain", async function () {
      const { aegisVault, mockToken, aiOracle, user1 } = await deployFixture();
      const amount = ethers.parseEther("10");
      const assetData = "0x1234abcd";

      // Deposit tokens first
      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), ethers.parseEther("100"));

      // Route to parachain 2000
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        2000,
        await mockToken.getAddress(),
        amount,
        50,
        assetData,
        0,
        1000000,
        0
      );

      // Route to parachain 2004
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        2004,
        await mockToken.getAddress(),
        amount,
        50,
        assetData,
        0,
        1000000,
        0
      );

      // Route to parachain 2000 again
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        2000,
        await mockToken.getAddress(),
        amount,
        50,
        assetData,
        0,
        1000000,
        0
      );

      // Verify nonces are tracked independently
      expect(await aegisVault.parachainNonces(2000)).to.equal(2n);
      expect(await aegisVault.parachainNonces(2004)).to.equal(1n);
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
          1000000,
          0 // assetType: Native
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
          1000000,
          0 // assetType: Native
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
          1000000,
          0 // assetType: Native
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
          1000000,
          0 // assetType: Native
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
          1000000,
          0 // assetType: Native
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
          1000000,
          0 // assetType: Native
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "InsufficientRoutedBalance")
        .withArgs(await mockToken.getAddress(), 0n, requestedAmount);
    });

    it("rejects routing when XCM routing is paused (circuit breaker)", async function () {
      const { aegisVault, mockToken, aiOracle, owner, user1 } = await deployFixture();
      const assetData = "0x1234";
      const amount = ethers.parseEther("10");

      // Deposit tokens first
      await aegisVault.connect(user1).deposit(await mockToken.getAddress(), amount);

      // Pause XCM routing
      await expect(aegisVault.connect(owner).toggleXcmRoute())
        .to.emit(aegisVault, "XCMRoutingToggled")
        .withArgs(true, owner.address);

      // Verify routing is paused
      expect(await aegisVault.xcmRoutingPaused()).to.equal(true);

      // Try to route while paused - should fail
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          amount,
          50,
          assetData,
          0,
          1000000,
          0 // assetType: Native
        )
      ).to.be.revertedWithCustomError(aegisVault, "XCMRoutingPaused");

      // Unpause and verify routing works again
      await aegisVault.connect(owner).toggleXcmRoute();
      expect(await aegisVault.xcmRoutingPaused()).to.equal(false);

      // Now routing should succeed
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          await mockToken.getAddress(),
          amount,
          50,
          assetData,
          0,
          1000000,
          0 // assetType: Native
        )
      ).to.emit(aegisVault, "YieldRoutedViaXCM");
    });

    it("rejects routing when route cap is exceeded", async function () {
      const { aegisVault, mockToken, aiOracle, owner, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();
      const assetData = "0x1234";
      const depositAmount = ethers.parseEther("100");
      const capAmount = ethers.parseEther("50");
      const routeAmount = ethers.parseEther("60");

      // Deposit tokens
      await aegisVault.connect(user1).deposit(tokenAddress, depositAmount);

      // Set route cap
      await expect(aegisVault.connect(owner).setRouteCap(tokenAddress, capAmount))
        .to.emit(aegisVault, "RouteCapUpdated")
        .withArgs(tokenAddress, capAmount);

      // Verify cap is set
      expect(await aegisVault.routeCaps(tokenAddress)).to.equal(capAmount);

      // Try to route more than cap - should fail
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          tokenAddress,
          routeAmount,
          50,
          assetData,
          0,
          1000000,
          0 // assetType: Native
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "RouteCapExceeded")
        .withArgs(tokenAddress, routeAmount, capAmount);

      // Route within cap should succeed
      const validRouteAmount = ethers.parseEther("30");
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          tokenAddress,
          validRouteAmount,
          50,
          assetData,
          0,
          1000000,
          0 // assetType: Native
        )
      ).to.emit(aegisVault, "YieldRoutedViaXCM");

      // Verify totalRouted updated
      expect(await aegisVault.totalRouted(tokenAddress)).to.equal(validRouteAmount);

      // Try to route again - cumulative amount would exceed cap
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          tokenAddress,
          validRouteAmount,
          50,
          assetData,
          0,
          1000000,
          0 // assetType: Native
        )
      )
        .to.be.revertedWithCustomError(aegisVault, "RouteCapExceeded")
        .withArgs(tokenAddress, validRouteAmount * 2n, capAmount);
    });

    it("allows owner to set route cap to zero (no cap)", async function () {
      const { aegisVault, mockToken, aiOracle, owner, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();
      const assetData = "0x1234";
      const depositAmount = ethers.parseEther("1000");
      const routeAmount = ethers.parseEther("500");

      // Deposit tokens
      await aegisVault.connect(user1).deposit(tokenAddress, depositAmount);

      // Set cap to zero (no limit)
      await aegisVault.connect(owner).setRouteCap(tokenAddress, 0);
      expect(await aegisVault.routeCaps(tokenAddress)).to.equal(0);

      // Routing any amount should succeed
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          2000,
          tokenAddress,
          routeAmount,
          50,
          assetData, 0, 1000000, 1)
      ).to.emit(aegisVault, "YieldRoutedViaXCM");
    });

    it("rejects non-owners from setting route cap", async function () {
      const { aegisVault, mockToken, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();

      await expect(
        aegisVault.connect(user1).setRouteCap(tokenAddress, ethers.parseEther("100"))
      )
        .to.be.revertedWithCustomError(aegisVault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("rejects non-owners from toggling XCM route", async function () {
      const { aegisVault, user1 } = await deployFixture();

      await expect(aegisVault.connect(user1).toggleXcmRoute())
        .to.be.revertedWithCustomError(aegisVault, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("rejects setting route cap for zero address", async function () {
      const { aegisVault, owner } = await deployFixture();

      await expect(
        aegisVault.connect(owner).setRouteCap(ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(aegisVault, "InvalidTokenAddress");
    });


    it("should increment totalRouted with valid encoded asset data", async function () {
      const { aegisVault, mockToken, mockXCM, aiOracle, user1 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();
      const depositAmount = ethers.parseEther("100");
      const routeAmount = ethers.parseEther("25");
      const destParachainId = 1000; // Paseo Asset Hub

      // Create valid XCM-encoded asset data
      // Format: version(1) + parents(1) + interior(X2) + assetType(1) + amount(16)
      // This follows the Polkadot XCM MultiAsset encoding spec
      const version = "02"; // XCM V2
      const parents = "00"; // Local chain
      const interior = "01"; // X2 variant
      const palletInstance = "30"; // PalletInstance(48) - ERC20
      const accountKey20 = "02"; // AccountKey20 type
      const tokenPadded = tokenAddress.toLowerCase().slice(2).padStart(40, "0");
      const assetType = "00"; // Fungible
      const amountHex = routeAmount.toString(16).padStart(32, "0");
      // Convert to little-endian
      const amountLE = amountHex.match(/.{2}/g).reverse().join("");
      
      const assetData = `0x${version}${parents}${interior}${palletInstance}${accountKey20}${tokenPadded}${assetType}${amountLE}`;

      // Deposit tokens first
      await aegisVault.connect(user1).deposit(tokenAddress, depositAmount);

      // Verify initial state
      expect(await aegisVault.getTotalRouted(tokenAddress)).to.equal(0n);

      // Execute routing with encoded asset data
      await expect(
        aegisVault.connect(aiOracle).routeYieldViaXCM(
          destParachainId,
          tokenAddress,
          routeAmount,
          42, // Valid risk score
          assetData,
          0, // feeAssetItem
          1000000, // weightLimit
          0  // assetType: Native
        )
      )
        .to.emit(aegisVault, "YieldRoutedViaXCM")
        .withArgs(destParachainId, tokenAddress, routeAmount, 42, assetData, anyUint());

      // Verify totalRouted was incremented
      expect(await aegisVault.getTotalRouted(tokenAddress)).to.equal(routeAmount);

      // Verify XCM was called with correct parameters
      const lastCall = await mockXCM.getLastCall();
      expect(lastCall.parachainId).to.equal(destParachainId);
      expect(lastCall.assets).to.equal(assetData);
    });

    it("should handle multiple routing operations with totalRouted accounting", async function () {
      const { aegisVault, mockToken, mockXCM, aiOracle, user1, user2 } = await deployFixture();
      const tokenAddress = await mockToken.getAddress();
      
      // Setup: deposits from multiple users
      await aegisVault.connect(user1).deposit(tokenAddress, ethers.parseEther("100"));
      await aegisVault.connect(user2).deposit(tokenAddress, ethers.parseEther("50"));

      // Create encoded asset data for multiple routing operations
      const routeAmount1 = ethers.parseEther("30");
      const routeAmount2 = ethers.parseEther("20");
      const destParachainId = 2004;

      // First routing with encoded asset data
      const assetData1 = `0x02${tokenAddress.toLowerCase().slice(2)}${routeAmount1.toString(16).padStart(64, "0")}`;
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        destParachainId,
        tokenAddress,
        routeAmount1,
        40,
        assetData1, 0, 1000000, 1);

      // Verify first routing
      expect(await aegisVault.getTotalRouted(tokenAddress)).to.equal(routeAmount1);

      // Second routing with different encoded asset data
      const assetData2 = `0x02${tokenAddress.toLowerCase().slice(2)}${routeAmount2.toString(16).padStart(64, "0")}`;
      await aegisVault.connect(aiOracle).routeYieldViaXCM(
        destParachainId,
        tokenAddress,
        routeAmount2,
        35,
        assetData2, 0, 1000000, 1);

      // Verify cumulative totalRouted
      expect(await aegisVault.getTotalRouted(tokenAddress)).to.equal(
        routeAmount1 + routeAmount2
      );

      // Verify deposits remain unchanged
      expect(await aegisVault.getUserDeposit(user1.address, tokenAddress)).to.equal(
        ethers.parseEther("100")
      );
      expect(await aegisVault.getUserDeposit(user2.address, tokenAddress)).to.equal(
        ethers.parseEther("50")
      );
      expect(await aegisVault.totalDeposits(tokenAddress)).to.equal(
        ethers.parseEther("150")
      );
    });

    it("should trigger XCM call on routing (duplicate placeholder)", async function () {
      const { aegisVault, mockToken, mockXCM, aiOracle, user1 } = await deployFixture();
      const amount = ethers.parseEther("10");
      const destParachainId = 2004;
      const assetData = "0x1234abcd5678";
      const feeAssetItem = 0;
      const weightLimit = 1000000;
      const assetType = 1; // Wrapper/Mapped

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
        weightLimit,
        assetType
      );

      // Verify that MockXCM received the call
      const callCount = await mockXCM.getCallCount();
      expect(callCount).to.equal(1n);

      // Verify the call details
      const lastCall = await mockXCM.getLastCall();
      expect(lastCall.parachainId).to.equal(destParachainId);
      expect(lastCall.assets).to.equal(assetData);
      expect(lastCall.feeAssetItem).to.equal(feeAssetItem);
      expect(lastCall.weightLimit).to.equal(BigInt(weightLimit));
      expect(lastCall.caller).to.equal(await aegisVault.getAddress());

      // Verify calls by parachain
      expect(await mockXCM.hasCallsToParachain(destParachainId)).to.equal(true);
      const callsToPara = await mockXCM.getCallsByParachain(destParachainId);
      expect(callsToPara.length).to.equal(1);
    });

    it("should track total routed amounts correctly", async function () {
      const { aegisVault, mockToken, aiOracle, user1 } = await deployFixture();
      const amount1 = ethers.parseEther("10");
      const amount2 = ethers.parseEther("20");
      const assetData = "0x1234";
      const assetType = 1; // Wrapper/Mapped

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
        1000000,
        assetType
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
        1000000,
        assetType
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
      const assetType = 1; // Wrapper/Mapped

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
          weightLimit,
          assetType
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
          1000000,
          0 // assetType: Native
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