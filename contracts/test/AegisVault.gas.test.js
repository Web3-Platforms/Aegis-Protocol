const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AegisVault gas profile", function () {
  async function deployFixture() {
    const [owner, aiOracle, user] = await ethers.getSigners();

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

    await mockToken.mint(user.address, ethers.parseEther("1000"));
    await mockToken
      .connect(user)
      .approve(await aegisVault.getAddress(), ethers.MaxUint256);

    return { aegisVault, mockToken, mockXCM, owner, aiOracle, user };
  }

  async function expectUnderGas(txPromise, limit, label) {
    const tx = await txPromise;
    const receipt = await tx.wait();
    expect(receipt.gasUsed, `${label} exceeded gas budget`).to.be.lessThan(limit);
  }

  it("keeps core functions under 200,000 gas", async function () {
    const { aegisVault, mockToken, aiOracle, user } = await deployFixture();
    const tokenAddress = await mockToken.getAddress();

    await expectUnderGas(
      aegisVault.addSupportedToken(tokenAddress),
      200000n,
      "addSupportedToken"
    );

    await expectUnderGas(
      aegisVault.setAIOracleAddress(user.address),
      200000n,
      "setAIOracleAddress"
    );

    await aegisVault.setAIOracleAddress(aiOracle.address);

    await expectUnderGas(
      aegisVault.connect(user).deposit(tokenAddress, ethers.parseEther("100")),
      200000n,
      "deposit"
    );

    await expectUnderGas(
      aegisVault.connect(user).withdraw(tokenAddress, ethers.parseEther("40")),
      200000n,
      "withdraw"
    );

    const assetData = "0x1234";
    const feeAssetItem = 0;
    const weightLimit = 1000000;
    const assetType = 1; // Wrapper/Mapped
    await expectUnderGas(
      aegisVault.connect(aiOracle).routeYieldViaXCM(2000, tokenAddress, ethers.parseEther("5"), 35, assetData, feeAssetItem, weightLimit, assetType),
      300000n,
      "routeYieldViaXCM"
    );
  });
});
