# Aegis Protocol — Code Quality Pass

## Changes Made

### 1. Fixed Corrupted NatSpec · [AegisVault.sol](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/contracts/contracts/AegisVault.sol#L9-L14)

Shell setup commands had been accidentally pasted into the `/** */` doc block above `IPolkadotXCM`. Replaced with proper `@title` / `@dev` NatSpec.

```diff:AegisVault.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**# 1. Set up wallet (create .env in contracts/)
echo "PRIVATE_KEY=0x<your-testnet-private-key>" > contracts/.env.local

# 2. Get Paseo testnet tokens from faucet
# https://faucet.polkadot.io

# 3. Deploy contracts
cd contracts && npm run deploy

# 4. Run frontend locally
cd ../frontend && npm run dev
# Runs on http://127.0.0.1:3010
 * @dev Mock interface for Polkadot's XCM precompile
 * In production, this would interact with the actual PolkadotXCM precompile
 */
interface IPolkadotXCM {
    /// @dev Send XCM to a parachain with asset instructions
    /// @param parachainId The destination parachain ID
    /// @param assets Array of assets to send
    /// @param feeAssetItem The index of the fee asset
    /// @param weightLimit The weight limit for execution
    function sendXcm(
        uint32 parachainId,
        bytes memory assets,
        uint32 feeAssetItem,
        uint64 weightLimit
    ) external;

    /// @dev Execute XCM program
    /// @param message The XCM program to execute
    /// @param maxWeight Maximum weight to consume
    function executeXcm(bytes memory message, uint64 maxWeight)
        external
        returns (bool);
}

/**
 * @title AegisVault
 * @dev Intent-based, AI-guarded cross-chain yield vault for Polkadot Hub
 * Users deposit ERC20 tokens and the vault routes yields across parachains
 * based on AI risk assessment scores
 */
contract AegisVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error OnlyAIOracle(address caller);
    error InvalidAIOracleAddress();
    error InvalidOracleAddress();
    error InvalidTokenAddress();
    error TokenNotSupported(address token);
    error AmountMustBeGreaterThanZero();
    error InsufficientDepositBalance(
        address account,
        address token,
        uint256 available,
        uint256 requested
    );
    error RiskScoreTooHigh(uint256 riskScore);

    // Mock XCM precompile address (represents the Polkadot XCM precompile)
    address public constant POLKADOT_XCM = 0x0000000000000000000000000000000000000801;

    // AI Oracle address authorized to call routeYieldViaXCM
    address public aiOracleAddress;

    // Supported deposit tokens
    mapping(address => bool) public supportedTokens;

    // User deposit tracking
    mapping(address => mapping(address => uint256)) public userDeposits;

    // Total deposits per token
    mapping(address => uint256) public totalDeposits;

    // Risk score threshold (max safe risk score is 74, anything >= 75 is rejected)
    uint256 public constant MAX_RISK_SCORE = 75;

    /**
     * @dev Emitted when a user deposits tokens
     */
    event Deposit(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev Emitted when yield is routed via XCM
     */
    event YieldRoutedViaXCM(
        uint32 indexed destParachainId,
        uint256 amount,
        uint256 riskScore,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a user withdraws tokens
     */
    event Withdrawal(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev Emitted when AI Oracle address is updated
     */
    event AIOracleUpdated(address indexed newOracleAddress);

    /**
     * @dev Emitted when a token is added to supported list
     */
    event TokenSupported(address indexed token);

    /**
     * @dev Modifier to ensure only the AI Oracle can call
     */
    modifier onlyAIOracle() {
        address caller = _msgSender();
        if (caller != aiOracleAddress) revert OnlyAIOracle(caller);
        _;
    }

    /**
     * @dev Constructor to initialize the vault
     * @param initialOwner The address that will own the vault
     * @param initialAiOracle The address of the AI Oracle
     */
    constructor(address initialOwner, address initialAiOracle) Ownable(initialOwner) {
        if (initialAiOracle == address(0)) revert InvalidAIOracleAddress();
        aiOracleAddress = initialAiOracle;
    }

    /**
     * @dev Set the AI Oracle address
     * @param newOracleAddress Address of the new AI Oracle
     */
    function setAIOracleAddress(address newOracleAddress) external onlyOwner {
        if (newOracleAddress == address(0)) revert InvalidOracleAddress();
        aiOracleAddress = newOracleAddress;
        emit AIOracleUpdated(newOracleAddress);
    }

    /**
     * @dev Add a supported deposit token
     * @param token The ERC20 token address
     */
    function addSupportedToken(address token) external onlyOwner {
        if (token == address(0)) revert InvalidTokenAddress();
        supportedTokens[token] = true;
        emit TokenSupported(token);
    }

    /**
     * @dev Deposit ERC20 tokens into the vault
     * @param token The ERC20 token to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount)
        external
        nonReentrant
    {
        if (!supportedTokens[token]) revert TokenNotSupported(token);
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        address sender = _msgSender();

        // Transfer tokens from user to vault
        IERC20(token).safeTransferFrom(sender, address(this), amount);

        // Update tracking
        userDeposits[sender][token] += amount;
        totalDeposits[token] += amount;

        emit Deposit(sender, token, amount, block.timestamp);
    }

    /**
     * @dev Withdraw deposited tokens from the vault
     * @param token The ERC20 token to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        address sender = _msgSender();
        uint256 available = userDeposits[sender][token];
        if (available < amount) {
            revert InsufficientDepositBalance(sender, token, available, amount);
        }

        // Update tracking
        userDeposits[sender][token] -= amount;
        totalDeposits[token] -= amount;

        // Transfer tokens back to user
        IERC20(token).safeTransfer(sender, amount);

        emit Withdrawal(sender, token, amount, block.timestamp);
    }

    /**
     * @dev Route yield across parachains via XCM
     * Only callable by the AI Oracle
     * Validates that the AI risk score is below the threshold
     *
     * @param destParachainId The destination parachain ID
     * @param amount The amount of yield to route
     * @param aiRiskScore The AI-calculated risk score (0-100)
     *
     * Requirements:
     * - Only AI Oracle can call this function
     * - aiRiskScore must be < 75 (strictly less than MAX_RISK_SCORE)
     */
    function routeYieldViaXCM(
        uint32 destParachainId,
        uint256 amount,
        uint256 aiRiskScore
    ) external onlyAIOracle nonReentrant {
        if (aiRiskScore >= MAX_RISK_SCORE) revert RiskScoreTooHigh(aiRiskScore);
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        // Mock XCM routing
        // In a production environment, this would call:
        // IPolkadotXCM(POLKADOT_XCM).sendXcm(destParachainId, assetData, feeIndex, weightLimit);

        emit YieldRoutedViaXCM(destParachainId, amount, aiRiskScore, block.timestamp);
    }

    /**
     * @dev Get the vault balance for a specific token
     * @param token The ERC20 token address
     * @return The balance of the token in the vault
     */
    function getVaultBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Get user's deposit balance for a specific token
     * @param user The user address
     * @param token The ERC20 token address
     * @return The user's deposit balance
     */
    function getUserDeposit(address user, address token)
        external
        view
        returns (uint256)
    {
        return userDeposits[user][token];
    }
}
===
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IPolkadotXCM
 * @dev Mock interface for Polkadot's XCM precompile.
 * In production, this would interact with the actual PolkadotXCM precompile
 * at a well-known address on Asset Hub / relay chain.
 */
interface IPolkadotXCM {
    /// @dev Send XCM to a parachain with asset instructions
    /// @param parachainId The destination parachain ID
    /// @param assets Array of assets to send
    /// @param feeAssetItem The index of the fee asset
    /// @param weightLimit The weight limit for execution
    function sendXcm(
        uint32 parachainId,
        bytes memory assets,
        uint32 feeAssetItem,
        uint64 weightLimit
    ) external;

    /// @dev Execute XCM program
    /// @param message The XCM program to execute
    /// @param maxWeight Maximum weight to consume
    function executeXcm(bytes memory message, uint64 maxWeight)
        external
        returns (bool);
}

/**
 * @title AegisVault
 * @dev Intent-based, AI-guarded cross-chain yield vault for Polkadot Hub
 * Users deposit ERC20 tokens and the vault routes yields across parachains
 * based on AI risk assessment scores
 */
contract AegisVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error OnlyAIOracle(address caller);
    error InvalidAIOracleAddress();
    error InvalidOracleAddress();
    error InvalidTokenAddress();
    error TokenNotSupported(address token);
    error AmountMustBeGreaterThanZero();
    error InsufficientDepositBalance(
        address account,
        address token,
        uint256 available,
        uint256 requested
    );
    error RiskScoreTooHigh(uint256 riskScore);

    // Mock XCM precompile address (represents the Polkadot XCM precompile)
    address public constant POLKADOT_XCM = 0x0000000000000000000000000000000000000801;

    // AI Oracle address authorized to call routeYieldViaXCM
    address public aiOracleAddress;

    // Supported deposit tokens
    mapping(address => bool) public supportedTokens;

    // User deposit tracking
    mapping(address => mapping(address => uint256)) public userDeposits;

    // Total deposits per token
    mapping(address => uint256) public totalDeposits;

    // Risk score threshold (max safe risk score is 74, anything >= 75 is rejected)
    uint256 public constant MAX_RISK_SCORE = 75;

    /**
     * @dev Emitted when a user deposits tokens
     */
    event Deposit(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev Emitted when yield is routed via XCM
     */
    event YieldRoutedViaXCM(
        uint32 indexed destParachainId,
        uint256 amount,
        uint256 riskScore,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a user withdraws tokens
     */
    event Withdrawal(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev Emitted when AI Oracle address is updated
     */
    event AIOracleUpdated(address indexed newOracleAddress);

    /**
     * @dev Emitted when a token is added to supported list
     */
    event TokenSupported(address indexed token);

    /**
     * @dev Modifier to ensure only the AI Oracle can call
     */
    modifier onlyAIOracle() {
        address caller = _msgSender();
        if (caller != aiOracleAddress) revert OnlyAIOracle(caller);
        _;
    }

    /**
     * @dev Constructor to initialize the vault
     * @param initialOwner The address that will own the vault
     * @param initialAiOracle The address of the AI Oracle
     */
    constructor(address initialOwner, address initialAiOracle) Ownable(initialOwner) {
        if (initialAiOracle == address(0)) revert InvalidAIOracleAddress();
        aiOracleAddress = initialAiOracle;
    }

    /**
     * @dev Set the AI Oracle address
     * @param newOracleAddress Address of the new AI Oracle
     */
    function setAIOracleAddress(address newOracleAddress) external onlyOwner {
        if (newOracleAddress == address(0)) revert InvalidOracleAddress();
        aiOracleAddress = newOracleAddress;
        emit AIOracleUpdated(newOracleAddress);
    }

    /**
     * @dev Add a supported deposit token
     * @param token The ERC20 token address
     */
    function addSupportedToken(address token) external onlyOwner {
        if (token == address(0)) revert InvalidTokenAddress();
        supportedTokens[token] = true;
        emit TokenSupported(token);
    }

    /**
     * @dev Deposit ERC20 tokens into the vault
     * @param token The ERC20 token to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount)
        external
        nonReentrant
    {
        if (!supportedTokens[token]) revert TokenNotSupported(token);
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        address sender = _msgSender();

        // Transfer tokens from user to vault
        IERC20(token).safeTransferFrom(sender, address(this), amount);

        // Update tracking
        userDeposits[sender][token] += amount;
        totalDeposits[token] += amount;

        emit Deposit(sender, token, amount, block.timestamp);
    }

    /**
     * @dev Withdraw deposited tokens from the vault
     * @param token The ERC20 token to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        address sender = _msgSender();
        uint256 available = userDeposits[sender][token];
        if (available < amount) {
            revert InsufficientDepositBalance(sender, token, available, amount);
        }

        // Update tracking
        userDeposits[sender][token] -= amount;
        totalDeposits[token] -= amount;

        // Transfer tokens back to user
        IERC20(token).safeTransfer(sender, amount);

        emit Withdrawal(sender, token, amount, block.timestamp);
    }

    /**
     * @dev Route yield across parachains via XCM
     * Only callable by the AI Oracle
     * Validates that the AI risk score is below the threshold
     *
     * @param destParachainId The destination parachain ID
     * @param amount The amount of yield to route
     * @param aiRiskScore The AI-calculated risk score (0-100)
     *
     * Requirements:
     * - Only AI Oracle can call this function
     * - aiRiskScore must be < 75 (strictly less than MAX_RISK_SCORE)
     */
    function routeYieldViaXCM(
        uint32 destParachainId,
        uint256 amount,
        uint256 aiRiskScore
    ) external onlyAIOracle nonReentrant {
        if (aiRiskScore >= MAX_RISK_SCORE) revert RiskScoreTooHigh(aiRiskScore);
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        // Mock XCM routing
        // In a production environment, this would call:
        // IPolkadotXCM(POLKADOT_XCM).sendXcm(destParachainId, assetData, feeIndex, weightLimit);

        emit YieldRoutedViaXCM(destParachainId, amount, aiRiskScore, block.timestamp);
    }

    /**
     * @dev Get the vault balance for a specific token
     * @param token The ERC20 token address
     * @return The balance of the token in the vault
     */
    function getVaultBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Get user's deposit balance for a specific token
     * @param user The user address
     * @param token The ERC20 token address
     * @return The user's deposit balance
     */
    function getUserDeposit(address user, address token)
        external
        view
        returns (uint256)
    {
        return userDeposits[user][token];
    }
}
```

---

### 2. Fixed Duplicate CSS Class · [WithdrawalForm.tsx](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/components/WithdrawalForm.tsx#L123)

Line 123 had `font-medium` and `font-bold` on the same element — conflicting Tailwind classes. Kept `font-bold`.

---

### 3. Added `ERC20_ABI` · [contracts.ts](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/lib/contracts.ts#L162-L192)

Added `balanceOf`, `allowance`, and `approve` to a new `ERC20_ABI` export so the frontend can read live token balances and handle approvals.

---

### 4. Rewrote [DepositForm](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/components/DepositForm.tsx#20-283) · [DepositForm.tsx](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/components/DepositForm.tsx)

Three improvements:
- **Live balance** — reads actual ERC-20 balance via `useReadContract` instead of hardcoded `0.00`
- **Approve → Deposit flow** — checks allowance; if insufficient, sends `approve` TX first, then auto-fires `deposit` on confirmation
- **Max button** — now fills the amount input with the user's full token balance

## Verification

| Check | Result |
|---|---|
| `hardhat compile` | ✅ 16 Solidity files compiled |
| `hardhat test` | ✅ All 20+ tests pass (incl. reentrancy, gas profiling) |
