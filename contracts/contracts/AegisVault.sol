// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IPolkadotXCM
 * @dev Interface for Polkadot's XCM precompile.
 * In production, this would interact with the actual PolkadotXCM precompile
 * at a well-known address on Asset Hub / relay chain.
 */
interface IPolkadotXCM {
    /// @dev Send XCM to a parachain with asset instructions
    /// @param parachainId The destination parachain ID
    /// @param assets Array of assets to send (encoded as bytes)
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
    error InvalidXCMPrecompileAddress();
    error InsufficientRoutedBalance(address token, uint256 available, uint256 requested);

    // Default XCM precompile address (can be overridden)
    address public constant DEFAULT_POLKADOT_XCM = 0x0000000000000000000000000000000000000801;

    // Configurable XCM precompile address
    address public xcmPrecompileAddress;

    // AI Oracle address authorized to call routeYieldViaXCM
    address public aiOracleAddress;

    // Supported deposit tokens
    mapping(address => bool) public supportedTokens;

    // User deposit tracking
    mapping(address => mapping(address => uint256)) public userDeposits;

    // Total deposits per token
    mapping(address => uint256) public totalDeposits;

    // Total routed amount per token (accounting for cross-chain transfers)
    mapping(address => uint256) public totalRouted;

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
        address indexed token,
        uint256 amount,
        uint256 riskScore,
        bytes assetData,
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
     * @dev Emitted when XCM precompile address is updated
     */
    event XCMPrecompileUpdated(address indexed newXCMPrecompile);

    /**
     * @dev Emitted when XCM send is triggered
     */
    event XCMCalled(
        uint32 indexed destParachainId,
        bytes assetData,
        uint32 feeAssetItem,
        uint64 weightLimit
    );

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
        xcmPrecompileAddress = DEFAULT_POLKADOT_XCM;
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
     * @dev Set the XCM precompile address
     * @param newXCMPrecompile Address of the XCM precompile
     */
    function setXCMPrecompileAddress(address newXCMPrecompile) external onlyOwner {
        if (newXCMPrecompile == address(0)) revert InvalidXCMPrecompileAddress();
        xcmPrecompileAddress = newXCMPrecompile;
        emit XCMPrecompileUpdated(newXCMPrecompile);
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
     * Includes accounting logic and actual XCM call
     *
     * @param destParachainId The destination parachain ID
     * @param token The ERC20 token to route
     * @param amount The amount of yield to route
     * @param aiRiskScore The AI-calculated risk score (0-100)
     * @param assetData Encoded asset data for XCM (e.g., MultiAsset encoding)
     * @param feeAssetItem The index of the fee asset in assetData
     * @param weightLimit The weight limit for XCM execution
     *
     * Requirements:
     * - Only AI Oracle can call this function
     * - aiRiskScore must be < 75 (strictly less than MAX_RISK_SCORE)
     * - Token must be supported
     * - Vault must have sufficient balance
     */
    function routeYieldViaXCM(
        uint32 destParachainId,
        address token,
        uint256 amount,
        uint256 aiRiskScore,
        bytes calldata assetData,
        uint32 feeAssetItem,
        uint64 weightLimit
    ) external onlyAIOracle nonReentrant {
        // Validate risk score
        if (aiRiskScore >= MAX_RISK_SCORE) revert RiskScoreTooHigh(aiRiskScore);
        
        // Validate amount
        if (amount == 0) revert AmountMustBeGreaterThanZero();
        
        // Validate token is supported
        if (!supportedTokens[token]) revert TokenNotSupported(token);
        
        // Check vault has sufficient balance for routing
        uint256 vaultBalance = IERC20(token).balanceOf(address(this));
        if (vaultBalance < amount) {
            revert InsufficientRoutedBalance(token, vaultBalance, amount);
        }

        // Update accounting - track routed amounts
        totalRouted[token] += amount;

        // Call XCM precompile to send cross-chain message
        // This is the actual XCM integration point
        IPolkadotXCM(xcmPrecompileAddress).sendXcm(
            destParachainId,
            assetData,
            feeAssetItem,
            weightLimit
        );

        // Emit event for off-chain tracking
        emit YieldRoutedViaXCM(
            destParachainId,
            token,
            amount,
            aiRiskScore,
            assetData,
            block.timestamp
        );

        // Emit detailed XCM call event
        emit XCMCalled(destParachainId, assetData, feeAssetItem, weightLimit);
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

    /**
     * @dev Get total routed amount for a specific token
     * @param token The ERC20 token address
     * @return The total amount routed via XCM
     */
    function getTotalRouted(address token) external view returns (uint256) {
        return totalRouted[token];
    }
}
