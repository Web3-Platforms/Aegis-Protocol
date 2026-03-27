// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockXCM
 * @dev Mock implementation of the Polkadot XCM precompile for testing
 * Simulates the behavior of IPolkadotXCM interface at address 0x0000000000000000000000000000000000000801
 */
contract MockXCM {
    error XCMCallFailed(uint32 parachainId, string reason);
    error InvalidAssetData();
    error WeightLimitExceeded();

    struct XCMCall {
        uint32 parachainId;
        bytes assetData;
        uint32 feeAssetItem;
        uint64 weightLimit;
        address caller;
        uint256 timestamp;
    }

    // Storage for tracking XCM calls
    XCMCall[] public calls;
    
    // Mapping to track calls per parachain
    mapping(uint32 => uint256) public callsToParachain;
    
    // Toggle to simulate failures
    bool public shouldFail;
    string public failureReason;
    
    // Track last call for easy access
    XCMCall public lastCall;

    /**
     * @dev Emitted when an XCM message is sent
     */
    event XcmSent(
        uint32 indexed parachainId,
        bytes assetData,
        uint32 feeAssetItem,
        uint64 weightLimit,
        address indexed caller
    );

    /**
     * @dev Emitted when XCM execution is simulated
     */
    event XcmExecuted(
        bytes message,
        uint64 maxWeight,
        bool success
    );

    /**
     * @dev Simulate sending XCM to a parachain
     * Mirrors the IPolkadotXCM.sendXcm interface
     */
    function sendXcm(
        uint32 parachainId,
        bytes memory assetData,
        uint32 feeAssetItem,
        uint64 weightLimit
    ) external {
        if (shouldFail) {
            revert XCMCallFailed(parachainId, failureReason);
        }

        if (assetData.length == 0) {
            revert InvalidAssetData();
        }

        if (weightLimit == 0) {
            revert WeightLimitExceeded();
        }

        XCMCall memory newCall = XCMCall({
            parachainId: parachainId,
            assetData: assetData,
            feeAssetItem: feeAssetItem,
            weightLimit: weightLimit,
            caller: msg.sender,
            timestamp: block.timestamp
        });

        calls.push(newCall);
        lastCall = newCall;
        callsToParachain[parachainId]++;

        emit XcmSent(parachainId, assetData, feeAssetItem, weightLimit, msg.sender);
    }

    /**
     * @dev Simulate executing an XCM program
     * Mirrors the IPolkadotXCM.executeXcm interface
     */
    function executeXcm(bytes memory message, uint64 maxWeight) 
        external 
        returns (bool) 
    {
        if (shouldFail) {
            emit XcmExecuted(message, maxWeight, false);
            return false;
        }

        emit XcmExecuted(message, maxWeight, true);
        return true;
    }

    /**
     * @dev Get the total number of XCM calls made
     */
    function getCallCount() external view returns (uint256) {
        return calls.length;
    }

    /**
     * @dev Get a specific call by index
     */
    function getCall(uint256 index) external view returns (XCMCall memory) {
        require(index < calls.length, "Index out of bounds");
        return calls[index];
    }

    /**
     * @dev Check if any calls were made to a specific parachain
     */
    function hasCallsToParachain(uint32 parachainId) external view returns (bool) {
        return callsToParachain[parachainId] > 0;
    }

    /**
     * @dev Get the number of calls to a specific parachain
     */
    function getCallCountToParachain(uint32 parachainId) external view returns (uint256) {
        return callsToParachain[parachainId];
    }

    /**
     * @dev Get all calls (useful for testing)
     */
    function getAllCalls() external view returns (XCMCall[] memory) {
        return calls;
    }

    /**
     * @dev Toggle failure mode for testing error scenarios
     */
    function setShouldFail(bool _shouldFail, string calldata _reason) external {
        shouldFail = _shouldFail;
        failureReason = _reason;
    }

    /**
     * @dev Clear all recorded calls
     */
    function clearCalls() external {
        delete calls;
        delete lastCall;
    }

    /**
     * @dev Reset parachain call counts
     */
    function resetParachainCounts() external {
        // Note: This is a simplified reset - in production would need to track keys
        // For testing purposes, we just clear the calls array
        delete calls;
    }
}
