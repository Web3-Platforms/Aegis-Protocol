// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AegisVaultLaunch
 * @dev Reduced-surface vault-only launch contract for the first Moonbeam pilot.
 * The contract intentionally excludes routing, oracle, and rebalancing surfaces.
 */
contract AegisVaultLaunch is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidTokenAddress();
    error TokenNotSupported(address token);
    error AmountMustBeGreaterThanZero();
    error InsufficientDepositBalance(
        address account,
        address token,
        uint256 available,
        uint256 requested
    );
    error DepositsPaused();
    error WithdrawalsPaused();

    /// @dev Fixed first-launch asset for this vault deployment.
    address public immutable launchToken;

    // Single-asset launch whitelist retained in the same shape as the prototype getters.
    mapping(address => bool) public supportedTokens;

    // User deposit tracking by token address.
    mapping(address => mapping(address => uint256)) public userDeposits;

    // Total deposits per token address.
    mapping(address => uint256) public totalDeposits;

    bool public depositsPaused;
    bool public withdrawalsPaused;

    event Deposit(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    event Withdrawal(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    event TokenSupported(address indexed token);
    event DepositsPauseUpdated(bool paused, address indexed updatedBy);
    event WithdrawalsPauseUpdated(bool paused, address indexed updatedBy);

    /**
     * @dev Constructor to initialize the launch vault in a safe default posture.
     * @param initialOwner The address that will own the vault
     * @param initialLaunchToken The single supported launch token
     */
    constructor(address initialOwner, address initialLaunchToken) Ownable(initialOwner) {
        if (initialLaunchToken == address(0)) revert InvalidTokenAddress();

        launchToken = initialLaunchToken;
        supportedTokens[initialLaunchToken] = true;
        depositsPaused = true;
        withdrawalsPaused = true;

        emit TokenSupported(initialLaunchToken);
    }

    /**
     * @dev Update deposit pause state.
     * @param paused Whether deposits should be paused
     */
    function setDepositsPaused(bool paused) external onlyOwner {
        depositsPaused = paused;
        emit DepositsPauseUpdated(paused, _msgSender());
    }

    /**
     * @dev Update withdrawal pause state.
     * @param paused Whether withdrawals should be paused
     */
    function setWithdrawalsPaused(bool paused) external onlyOwner {
        withdrawalsPaused = paused;
        emit WithdrawalsPauseUpdated(paused, _msgSender());
    }

    /**
     * @dev Deposit the supported launch token into the vault.
     * @param token The ERC20 token to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        if (depositsPaused) revert DepositsPaused();
        _validateSupportedToken(token);
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        address sender = _msgSender();

        IERC20(token).safeTransferFrom(sender, address(this), amount);

        userDeposits[sender][token] += amount;
        totalDeposits[token] += amount;

        emit Deposit(sender, token, amount, block.timestamp);
    }

    /**
     * @dev Withdraw the caller's deposited launch token.
     * @param token The ERC20 token to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (withdrawalsPaused) revert WithdrawalsPaused();
        _validateSupportedToken(token);
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        address sender = _msgSender();
        uint256 available = userDeposits[sender][token];
        if (available < amount) {
            revert InsufficientDepositBalance(sender, token, available, amount);
        }

        userDeposits[sender][token] -= amount;
        totalDeposits[token] -= amount;

        IERC20(token).safeTransfer(sender, amount);

        emit Withdrawal(sender, token, amount, block.timestamp);
    }

    /**
     * @dev Get the vault balance for a specific token.
     * @param token The ERC20 token address
     * @return The balance of the token in the vault
     */
    function getVaultBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Get user's deposit balance for a specific token.
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

    function _validateSupportedToken(address token) private view {
        if (!supportedTokens[token]) revert TokenNotSupported(token);
    }
}
