// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockXCM
 * @dev Mock implementation of Polkadot's XCM precompile for testing purposes.
 * This contract simulates the XCM messaging interface without actual cross-chain calls.
 */
contract MockXCM {
    // Struct to store call details for verification
    struct XcmCall {
        uint32 parachainId;
        bytes assets;
        uint32 feeAssetItem;
        uint64 weightLimit;
        uint256 timestamp;
        address caller;
    }

    // Array to store all XCM calls made
    XcmCall[] public calls;

    // Mapping to track calls by parachain ID for easier lookup
    mapping(uint32 => uint256[]) public callsByParachain;

    // Event emitted when sendXcm is called
    event XcmSent(
        uint32 indexed parachainId,
        bytes assets,
        uint32 feeAssetItem,
        uint64 weightLimit,
        address indexed caller,
        uint256 timestamp
    );

    /**
     * @dev Mock implementation of sendXcm
     * Records the call details for testing verification
     * @param parachainId The destination parachain ID
     * @param assets Array of assets to send (encoded as bytes)
     * @param feeAssetItem The index of the fee asset
     * @param weightLimit The weight limit for execution
     */
    function sendXcm(
        uint32 parachainId,
        bytes memory assets,
        uint32 feeAssetItem,
        uint64 weightLimit
    ) external {
        XcmCall memory newCall = XcmCall({
            parachainId: parachainId,
            assets: assets,
            feeAssetItem: feeAssetItem,
            weightLimit: weightLimit,
            timestamp: block.timestamp,
            caller: msg.sender
        });

        uint256 callIndex = calls.length;
        calls.push(newCall);
        callsByParachain[parachainId].push(callIndex);

        emit XcmSent(
            parachainId,
            assets,
            feeAssetItem,
            weightLimit,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @dev Mock implementation of executeXcm
     * @param message The XCM program to execute
     * @param maxWeight Maximum weight to consume
     * @return success Always returns true for mock
     */
    function executeXcm(bytes memory message, uint64 maxWeight)
        external
        returns (bool)
    {
        // Mock implementation - just emit an event
        emit XcmSent(0, message, 0, maxWeight, msg.sender, block.timestamp);
        return true;
    }

    /**
     * @dev Get the total number of XCM calls made
     * @return The count of calls
     */
    function getCallCount() external view returns (uint256) {
        return calls.length;
    }

    /**
     * @dev Get a specific call by index
     * @param index The index of the call
     * @return The XcmCall struct
     */
    function getCall(uint256 index) external view returns (XcmCall memory) {
        require(index < calls.length, "MockXCM: index out of bounds");
        return calls[index];
    }

    /**
     * @dev Get the last call made
     * @return The most recent XcmCall struct
     */
    function getLastCall() external view returns (XcmCall memory) {
        require(calls.length > 0, "MockXCM: no calls made");
        return calls[calls.length - 1];
    }

    /**
     * @dev Get all calls made to a specific parachain
     * @param parachainId The parachain ID to query
     * @return Array of call indices
     */
    function getCallsByParachain(uint32 parachainId)
        external
        view
        returns (uint256[] memory)
    {
        return callsByParachain[parachainId];
    }

    /**
     * @dev Check if any calls were made to a specific parachain
     * @param parachainId The parachain ID to check
     * @return True if calls exist
     */
    function hasCallsToParachain(uint32 parachainId)
        external
        view
        returns (bool)
    {
        return callsByParachain[parachainId].length > 0;
    }

    /**
     * @dev Reset all calls (useful for test isolation)
     */
    function resetCalls() external {
        // Clear the calls array
        delete calls;

        // Note: We don't clear callsByParachain mapping for gas efficiency
        // In production tests, deploy a fresh MockXCM for each test
    }
}
