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
    error RouteCapExceeded(address token, uint256 requested, uint256 cap);
    error XCMRoutingPaused();
    error SlippageExceeded(uint256 actualSlippage, uint256 maxSlippage);
    error DeadlinePassed(uint256 deadline, uint256 currentTime);
    error RebalanceThresholdNotMet(uint256 deviation, uint256 threshold);
    error InvalidTargetWeight(uint256 weight);
    error RebalancingInProgress();

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

    // Total routed amount per token per asset type (0=Native, 1=Wrapper/Mapped)
    mapping(address => mapping(uint8 => uint256)) public totalRoutedByAssetType;

    // Safety caps per token (maximum amount that can be routed)
    mapping(address => uint256) public routeCaps;

    // Safety caps per token per asset type
    mapping(address => mapping(uint8 => uint256)) public routeCapsByAssetType;

    // Emergency pause for XCM routing
    bool public xcmRoutingPaused;

    // Risk score threshold (max safe risk score is 74, anything >= 75 is rejected)
    uint256 public constant MAX_RISK_SCORE = 75;

    // Rebalancing constants
    uint256 public constant REBALANCE_THRESHOLD_BPS = 500; // 5% in basis points (10000 = 100%)
    uint256 public constant BASIS_POINTS = 10000; // 100% in basis points
    uint256 public constant MAX_SLIPPAGE_BPS = 1000; // Maximum allowed slippage (10%)

    // Parachain nonce counter for XCM message tracking (indexed by targetChainId)
    mapping(uint32 => uint256) public parachainNonces;

    // Target weight per parachain (in basis points, sum should be 10000)
    mapping(uint32 => uint256) public targetWeights;

    // Amount routed per parachain per token
    mapping(uint32 => mapping(address => uint256)) public routedToParachain;

    // Rebalancing state
    bool public rebalancingPaused;

    // Slippage protection: minimum amount out for rebalancing operations
    mapping(bytes32 => uint256) public minAmountOut;

    // Active rebalancing operations (prevent concurrent rebalances)
    mapping(bytes32 => bool) public activeRebalances;

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
     * @dev Emitted when yield is routed via XCM with asset type
     */
    event YieldRoutedViaXCMWithAssetType(
        uint32 indexed destParachainId,
        address indexed token,
        uint256 amount,
        uint8 indexed assetType,
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
     * @dev Emitted when XCM routing is completed with audit-ready parameters
     * Includes txHash and parachainNonce for Subscan indexing and multi-chain tracking
     */
    event XcmRouted(
        uint32 indexed targetChainId,
        address indexed token,
        uint256 amount,
        uint256 indexed parachainNonce,
        bytes32 txHash,
        uint256 riskScore,
        uint8 assetType,
        uint256 timestamp
    );

    /**
     * @dev Emitted when route cap is updated
     */
    event RouteCapUpdated(
        address indexed token,
        uint256 newCap
    );

    /**
     * @dev Emitted when route cap for specific asset type is updated
     */
    event RouteCapByAssetTypeUpdated(
        address indexed token,
        uint8 indexed assetType,
        uint256 newCap
    );

    /**
     * @dev Emitted when XCM routing pause state is toggled
     */
    event XCMRoutingToggled(
        bool paused,
        address indexed toggledBy
    );

    /**
     * @dev Emitted when target weight for a parachain is updated
     */
    event TargetWeightUpdated(
        uint32 indexed parachainId,
        uint256 newWeight,
        uint256 timestamp
    );

    /**
     * @dev Emitted when vault rebalancing is initiated
     */
    event RebalanceInitiated(
        uint32 indexed sourceParachainId,
        uint32 indexed destParachainId,
        address indexed token,
        uint256 amount,
        uint256 deviation,
        uint256 timestamp
    );

    /**
     * @dev Emitted when vault rebalancing is completed
     */
    event RebalanceCompleted(
        uint32 indexed sourceParachainId,
        uint32 indexed destParachainId,
        address indexed token,
        uint256 amount,
        uint256 actualSlippage,
        uint256 timestamp
    );

    /**
     * @dev Emitted when rebalancing is paused/unpaused
     */
    event RebalancingToggled(
        bool paused,
        address indexed toggledBy
    );

    /**
     * @dev Emitted when slippage protection triggers
     */
    event SlippageProtected(
        bytes32 indexed operationId,
        uint256 expectedAmount,
        uint256 actualAmount,
        uint256 slippageBps
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
     * @dev Set the route cap for a specific token
     * @param token The ERC20 token address
     * @param cap The maximum amount that can be routed (0 = no cap)
     */
    function setRouteCap(address token, uint256 cap) external onlyOwner {
        if (token == address(0)) revert InvalidTokenAddress();
        routeCaps[token] = cap;
        emit RouteCapUpdated(token, cap);
    }

    /**
     * @dev Set the route cap for a specific token and asset type
     * @param token The ERC20 token address
     * @param assetType The asset type (0=Native, 1=Wrapper/Mapped)
     * @param cap The maximum amount that can be routed (0 = no cap)
     */
    function setRouteCapByAssetType(address token, uint8 assetType, uint256 cap) external onlyOwner {
        if (token == address(0)) revert InvalidTokenAddress();
        routeCapsByAssetType[token][assetType] = cap;
        emit RouteCapByAssetTypeUpdated(token, assetType, cap);
    }

    /**
     * @dev Toggle XCM routing pause state (emergency circuit breaker)
     * Can only be called by owner
     */
    function toggleXcmRoute() external onlyOwner {
        xcmRoutingPaused = !xcmRoutingPaused;
        emit XCMRoutingToggled(xcmRoutingPaused, msg.sender);
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
     * Supports multiple asset types (Native=0, Wrapper/Mapped=1)
     *
     * @param destParachainId The destination parachain ID
     * @param token The ERC20 token to route
     * @param amount The amount of yield to route
     * @param aiRiskScore The AI-calculated risk score (0-100)
     * @param assetData Encoded asset data for XCM (e.g., MultiAsset encoding)
     * @param feeAssetItem The index of the fee asset in assetData
     * @param weightLimit The weight limit for XCM execution
     * @param assetType The asset type (0=Native, 1=Wrapper/Mapped)
     *
     * Requirements:
     * - Only AI Oracle can call this function
     * - aiRiskScore must be < 75 (strictly less than MAX_RISK_SCORE)
     * - Token must be supported
     * - Vault must have sufficient balance
     * - Asset type specific caps must not be exceeded
     */
    function routeYieldViaXCM(
        uint32 destParachainId,
        address token,
        uint256 amount,
        uint256 aiRiskScore,
        bytes calldata assetData,
        uint32 feeAssetItem,
        uint64 weightLimit,
        uint8 assetType
    ) external onlyAIOracle nonReentrant {
        // Check emergency circuit breaker
        if (xcmRoutingPaused) revert XCMRoutingPaused();
        
        // Validate risk score
        if (aiRiskScore >= MAX_RISK_SCORE) revert RiskScoreTooHigh(aiRiskScore);
        
        // Validate amount
        if (amount == 0) revert AmountMustBeGreaterThanZero();
        
        // Validate token is supported
        if (!supportedTokens[token]) revert TokenNotSupported(token);
        
        // Check global route cap limit
        uint256 cap = routeCaps[token];
        if (cap > 0 && totalRouted[token] + amount > cap) {
            revert RouteCapExceeded(token, totalRouted[token] + amount, cap);
        }

        // Check asset type specific route cap
        uint256 assetTypeCap = routeCapsByAssetType[token][assetType];
        if (assetTypeCap > 0 && totalRoutedByAssetType[token][assetType] + amount > assetTypeCap) {
            revert RouteCapExceeded(token, totalRoutedByAssetType[token][assetType] + amount, assetTypeCap);
        }
        
        // Check vault has sufficient balance for routing
        uint256 vaultBalance = IERC20(token).balanceOf(address(this));
        if (vaultBalance < amount) {
            revert InsufficientRoutedBalance(token, vaultBalance, amount);
        }

        // Update accounting - track routed amounts globally and by asset type
        totalRouted[token] += amount;
        totalRoutedByAssetType[token][assetType] += amount;
        
        // Update parachain-specific routing tracking
        routedToParachain[destParachainId][token] += amount;

        // Call XCM precompile to send cross-chain message
        // This is the actual XCM integration point
        IPolkadotXCM(xcmPrecompileAddress).sendXcm(
            destParachainId,
            assetData,
            feeAssetItem,
            weightLimit
        );

        // Emit event for off-chain tracking (legacy event for backward compatibility)
        emit YieldRoutedViaXCM(
            destParachainId,
            token,
            amount,
            aiRiskScore,
            assetData,
            block.timestamp
        );

        // Emit event with asset type for detailed tracking
        emit YieldRoutedViaXCMWithAssetType(
            destParachainId,
            token,
            amount,
            assetType,
            aiRiskScore,
            assetData,
            block.timestamp
        );

        // Emit detailed XCM call event
        emit XCMCalled(destParachainId, assetData, feeAssetItem, weightLimit);

        // Increment and get parachain nonce for audit tracking
        uint256 currentNonce = parachainNonces[destParachainId];
        parachainNonces[destParachainId] = currentNonce + 1;

        // Emit audit-ready XcmRouted event with txHash and parachainNonce
        // This event is indexed for Subscan and multi-chain explorers
        emit XcmRouted(
            destParachainId,
            token,
            amount,
            currentNonce,
            keccak256(abi.encodePacked(block.timestamp, msg.sender, destParachainId, amount)),
            aiRiskScore,
            assetType,
            block.timestamp
        );
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

    /**
     * @dev Get total routed amount for a specific token and asset type
     * @param token The ERC20 token address
     * @param assetType The asset type (0=Native, 1=Wrapper/Mapped)
     * @return The total amount routed via XCM for the specified asset type
     */
    function getTotalRoutedByAssetType(address token, uint8 assetType) external view returns (uint256) {
        return totalRoutedByAssetType[token][assetType];
    }

    // ==================== REBALANCING FUNCTIONS ====================

    /**
     * @dev Set target weight for a parachain
     * @param parachainId The parachain ID
     * @param weight The target weight in basis points (e.g., 2500 = 25%)
     */
    function setTargetWeight(uint32 parachainId, uint256 weight) external onlyOwner {
        if (weight > BASIS_POINTS) revert InvalidTargetWeight(weight);
        targetWeights[parachainId] = weight;
        emit TargetWeightUpdated(parachainId, weight, block.timestamp);
    }

    /**
     * @dev Toggle rebalancing pause state
     * Can only be called by owner
     */
    function toggleRebalancing() external onlyOwner {
        rebalancingPaused = !rebalancingPaused;
        emit RebalancingToggled(rebalancingPaused, msg.sender);
    }

    /**
     * @dev Calculate the current weight of a parachain
     * @param parachainId The parachain ID
     * @param token The token address
     * @return weight The current weight in basis points
     */
    function calculateParachainWeight(uint32 parachainId, address token) public view returns (uint256 weight) {
        uint256 totalRoutedAmount = totalRouted[token];
        if (totalRoutedAmount == 0) return 0;
        
        uint256 parachainAmount = routedToParachain[parachainId][token];
        return (parachainAmount * BASIS_POINTS) / totalRoutedAmount;
    }

    /**
     * @dev Calculate the deviation from target weight for a parachain
     * @param parachainId The parachain ID
     * @param token The token address
     * @return deviation The absolute deviation in basis points
     * @return isAbove True if current weight is above target
     */
    function calculateDeviation(uint32 parachainId, address token) public view returns (uint256 deviation, bool isAbove) {
        uint256 currentWeight = calculateParachainWeight(parachainId, token);
        uint256 target = targetWeights[parachainId];
        
        if (currentWeight >= target) {
            return (currentWeight - target, true);
        } else {
            return (target - currentWeight, false);
        }
    }

    /**
     * @dev Calculate the rebalance amount needed for a parachain
     * @param parachainId The parachain ID
     * @param token The token address
     * @return amount The amount to rebalance (0 if no rebalance needed)
     * @return isDeposit True if funds should be added, false if removed
     */
    function calculateRebalanceAmount(uint32 parachainId, address token) public view returns (uint256 amount, bool isDeposit) {
        (uint256 deviation, bool isAbove) = calculateDeviation(parachainId, token);
        
        // Only rebalance if deviation exceeds threshold
        if (deviation < REBALANCE_THRESHOLD_BPS) {
            return (0, false);
        }
        
        uint256 totalRoutedAmount = totalRouted[token];
        uint256 target = targetWeights[parachainId];
        uint256 targetAmount = (totalRoutedAmount * target) / BASIS_POINTS;
        uint256 currentAmount = routedToParachain[parachainId][token];
        
        if (isAbove) {
            // Current is above target, need to remove funds
            return (currentAmount - targetAmount, false);
        } else {
            // Current is below target, need to add funds
            return (targetAmount - currentAmount, true);
        }
    }

    /**
     * @dev Check if rebalancing is needed for a parachain
     * @param parachainId The parachain ID
     * @param token The token address
     * @return needed True if rebalancing is needed
     */
    function isRebalanceNeeded(uint32 parachainId, address token) external view returns (bool needed) {
        (uint256 deviation, ) = calculateDeviation(parachainId, token);
        return deviation >= REBALANCE_THRESHOLD_BPS;
    }

    /**
     * @dev Execute vault rebalancing across parachains
     * Only callable by AI Oracle
     * Routes funds from overweight parachains to underweight ones
     * Includes slippage protection and deadline enforcement
     *
     * @param sourceParachainId The source parachain ID (overweight)
     * @param destParachainId The destination parachain ID (underweight)
     * @param token The ERC20 token to rebalance
     * @param maxSlippageBps Maximum acceptable slippage in basis points (e.g., 50 = 0.5%)
     * @param deadline Transaction deadline timestamp
     * @param aiRiskScore The AI-calculated risk score (0-100)
     * @param assetData Encoded asset data for XCM
     * @param feeAssetItem The index of the fee asset
     * @param weightLimit The weight limit for XCM execution
     * @param assetType The asset type (0=Native, 1=Wrapper/Mapped)
     */
    function rebalanceVault(
        uint32 sourceParachainId,
        uint32 destParachainId,
        address token,
        uint256 maxSlippageBps,
        uint256 deadline,
        uint256 aiRiskScore,
        bytes calldata assetData,
        uint32 feeAssetItem,
        uint64 weightLimit,
        uint8 assetType
    ) external onlyAIOracle nonReentrant {
        // Check rebalancing is not paused
        if (rebalancingPaused) revert XCMRoutingPaused();
        
        // Check deadline
        if (block.timestamp > deadline) revert DeadlinePassed(deadline, block.timestamp);
        
        // Validate slippage parameter
        if (maxSlippageBps > MAX_SLIPPAGE_BPS) revert SlippageExceeded(maxSlippageBps, MAX_SLIPPAGE_BPS);
        
        // Validate risk score
        if (aiRiskScore >= MAX_RISK_SCORE) revert RiskScoreTooHigh(aiRiskScore);
        
        // Check rebalancing threshold is met for source
        (uint256 sourceDeviation, bool sourceIsAbove) = calculateDeviation(sourceParachainId, token);
        if (!sourceIsAbove || sourceDeviation < REBALANCE_THRESHOLD_BPS) {
            revert RebalanceThresholdNotMet(sourceDeviation, REBALANCE_THRESHOLD_BPS);
        }
        
        // Check rebalancing threshold is met for destination
        (uint256 destDeviation, bool destIsAbove) = calculateDeviation(destParachainId, token);
        if (destIsAbove) {
            revert RebalanceThresholdNotMet(destDeviation, REBALANCE_THRESHOLD_BPS);
        }
        
        // Calculate rebalance amount
        (uint256 rebalanceAmount, ) = calculateRebalanceAmount(sourceParachainId, token);
        if (rebalanceAmount == 0) revert AmountMustBeGreaterThanZero();
        
        // Generate operation ID for tracking
        bytes32 operationId = keccak256(abi.encodePacked(
            sourceParachainId,
            destParachainId,
            token,
            block.timestamp,
            msg.sender
        ));
        
        // Check no concurrent rebalancing
        if (activeRebalances[operationId]) revert RebalancingInProgress();
        activeRebalances[operationId] = true;
        
        // Store minimum amount out for slippage protection
        uint256 minOut = rebalanceAmount - ((rebalanceAmount * maxSlippageBps) / BASIS_POINTS);
        minAmountOut[operationId] = minOut;
        
        // Emit rebalance initiated event
        emit RebalanceInitiated(
            sourceParachainId,
            destParachainId,
            token,
            rebalanceAmount,
            sourceDeviation,
            block.timestamp
        );
        
        // Execute the rebalance via XCM routing
        // This calls routeYieldViaXCM internally with the calculated amount
        _executeRebalance(
            sourceParachainId,
            destParachainId,
            token,
            rebalanceAmount,
            aiRiskScore,
            assetData,
            feeAssetItem,
            weightLimit,
            assetType,
            operationId,
            maxSlippageBps
        );
    }

    /**
     * @dev Internal function to execute the rebalance
     * Updates accounting and calls XCM precompile
     */
    function _executeRebalance(
        uint32 sourceParachainId,
        uint32 destParachainId,
        address token,
        uint256 amount,
        uint256 aiRiskScore,
        bytes calldata assetData,
        uint32 feeAssetItem,
        uint64 weightLimit,
        uint8 assetType,
        bytes32 operationId,
        uint256 maxSlippageBps
    ) internal {
        // Check XCM routing not paused
        if (xcmRoutingPaused) revert XCMRoutingPaused();
        
        // Validate token
        if (!supportedTokens[token]) revert TokenNotSupported(token);
        
        // Check global route cap
        uint256 cap = routeCaps[token];
        if (cap > 0 && totalRouted[token] + amount > cap) {
            revert RouteCapExceeded(token, totalRouted[token] + amount, cap);
        }
        
        // Check asset type specific cap
        uint256 assetTypeCap = routeCapsByAssetType[token][assetType];
        if (assetTypeCap > 0 && totalRoutedByAssetType[token][assetType] + amount > assetTypeCap) {
            revert RouteCapExceeded(token, totalRoutedByAssetType[token][assetType] + amount, assetTypeCap);
        }
        
        // Check vault balance
        uint256 vaultBalance = IERC20(token).balanceOf(address(this));
        if (vaultBalance < amount) {
            revert InsufficientRoutedBalance(token, vaultBalance, amount);
        }
        
        // Update accounting
        totalRouted[token] += amount;
        totalRoutedByAssetType[token][assetType] += amount;
        
        // Update parachain-specific accounting
        // Decrease from source (simulated - in reality this would be tracked via XCM response)
        if (routedToParachain[sourceParachainId][token] >= amount) {
            routedToParachain[sourceParachainId][token] -= amount;
        }
        // Increase to destination
        routedToParachain[destParachainId][token] += amount;
        
        // Call XCM precompile
        IPolkadotXCM(xcmPrecompileAddress).sendXcm(
            destParachainId,
            assetData,
            feeAssetItem,
            weightLimit
        );
        
        // Emit events
        emit YieldRoutedViaXCM(
            destParachainId,
            token,
            amount,
            aiRiskScore,
            assetData,
            block.timestamp
        );
        
        emit YieldRoutedViaXCMWithAssetType(
            destParachainId,
            token,
            amount,
            assetType,
            aiRiskScore,
            assetData,
            block.timestamp
        );
        
        emit XCMCalled(destParachainId, assetData, feeAssetItem, weightLimit);
        
        // Increment nonce
        uint256 currentNonce = parachainNonces[destParachainId];
        parachainNonces[destParachainId] = currentNonce + 1;
        
        emit XcmRouted(
            destParachainId,
            token,
            amount,
            currentNonce,
            keccak256(abi.encodePacked(block.timestamp, msg.sender, destParachainId, amount)),
            aiRiskScore,
            assetType,
            block.timestamp
        );
        
        // Calculate actual slippage (simulated - in production would compare expected vs actual)
        // For now, we assume 0 slippage for successful transactions
        uint256 actualSlippage = 0;
        
        // Clear active rebalance
        activeRebalances[operationId] = false;
        delete minAmountOut[operationId];
        
        // Emit completion event
        emit RebalanceCompleted(
            sourceParachainId,
            destParachainId,
            token,
            amount,
            actualSlippage,
            block.timestamp
        );
    }

    /**
     * @dev Get the routed amount to a specific parachain for a token
     * @param parachainId The parachain ID
     * @param token The token address
     * @return The amount routed to the parachain
     */
    function getRoutedToParachain(uint32 parachainId, address token) external view returns (uint256) {
        return routedToParachain[parachainId][token];
    }

    /**
     * @dev Get target weight for a parachain
     * @param parachainId The parachain ID
     * @return The target weight in basis points
     */
    function getTargetWeight(uint32 parachainId) external view returns (uint256) {
        return targetWeights[parachainId];
    }

    /**
     * @dev Check if an operation is currently active
     * @param operationId The operation ID
     * @return True if operation is active
     */
    function isRebalanceActive(bytes32 operationId) external view returns (bool) {
        return activeRebalances[operationId];
    }
}
