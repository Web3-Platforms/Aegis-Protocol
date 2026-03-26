# AegisVault XCM Integration - Next Actions & Jira Issues

**Date:** March 26, 2026  
**Project:** Aegis Protocol - Cross-Chain Yield Vault  
**Status:** MVP Complete → Production Readiness

---

## Overview

This document outlines the remaining work required to transition the AegisVault XCM integration from MVP to production-ready status. All items are formatted as Jira-ready issues with clear acceptance criteria.

---

## Jira Issue Templates

---

### 🔴 Issue: AEGIS-101 - Implement Production XCM MultiAsset Encoding

**Type:** Story  
**Priority:** High  
**Component:** Smart Contract / API  
**Assignee:** TBD  
**Sprint:** Next

#### Description
Replace the current MVP asset data encoding with proper XCM MultiAsset encoding compliant with Polkadot's XCM specification. The current implementation uses a simplified format (token address + amount), which is insufficient for production cross-chain transfers.

#### Current State (MVP)
```typescript
// MVP Encoding - Insufficient for production
function encodeAssetData(tokenAddress: string, amount: bigint): `0x${string}` {
  const tokenPadded = tokenAddress.toLowerCase().slice(2).padStart(64, "0");
  const amountHex = amount.toString(16).padStart(64, "0");
  return `0x${tokenPadded}${amountHex}`;
}
```

#### Required Changes
1. Implement SCALE-encoded MultiAsset format
2. Support AssetId enumeration (Concrete vs Abstract)
3. Handle Fungible asset classification
4. Support Junctions for location specification

#### Acceptance Criteria
- [ ] Asset data encoding follows XCM v3 specification
- [ ] Encoding supports AssetHub asset IDs
- [ ] Unit tests validate encoding against known good values
- [ ] API endpoint updated to use new encoding
- [ ] Backward compatibility maintained for existing routes

#### Technical Notes
```solidity
// Target XCM MultiAsset structure
MultiAsset {
  id: AssetId::Concrete(MultiLocation {
    parents: 1,
    interior: X2(Parachain(1000), PalletInstance(50))
  }),
  fun: Fungibility::Fungible(amount)
}
```

#### Estimated Effort
- **Development:** 3 days
- **Testing:** 2 days
- **Documentation:** 1 day

---

### 🔴 Issue: AEGIS-102 - Replace MockXCM with Live Parachain Testing

**Type:** Story  
**Priority:** High  
**Component:** Testing Infrastructure  
**Assignee:** TBD  
**Sprint:** Next

#### Description
Transition from MockXCM-based unit tests to integration tests against live Polkadot testnet parachains. This validates actual XCM message transmission and receipt.

#### Current State
- Tests use `MockXCM.sol` contract
- XCM calls are simulated and recorded
- No actual cross-chain message transmission

#### Required Changes
1. Deploy AegisVault to Paseo Testnet
2. Configure XCM precompile address to production value
3. Set up Asset Hub (parachain 1000) as destination
4. Implement XCM message monitoring/verification

#### Acceptance Criteria
- [ ] Integration tests run against Paseo Testnet
- [ ] XCM messages successfully transmitted to Asset Hub
- [ ] Tests verify message receipt on destination parachain
- [ ] CI/CD pipeline updated for testnet integration tests
- [ ] Documentation updated with testnet setup instructions

#### Test Scenarios
```javascript
// Target integration test structure
describe("Live XCM Integration", function () {
  it("transfers assets to Asset Hub and verifies receipt", async function () {
    // 1. Route yield via XCM
    // 2. Wait for XCM message inclusion
    // 3. Query Asset Hub for asset receipt
    // 4. Verify balances updated correctly
  });
});
```

#### Estimated Effort
- **Development:** 4 days
- **Testnet Setup:** 2 days
- **Testing:** 3 days

---

### 🟡 Issue: AEGIS-103 - Refine routeYieldViaXCM Function Signature

**Type:** Task  
**Priority:** Medium  
**Component:** Smart Contract  
**Assignee:** TBD  
**Sprint:** Next

#### Description
Review and potentially refine the `routeYieldViaXCM` function signature to ensure optimal gas efficiency and parameter clarity.

#### Current Signature
```solidity
function routeYieldViaXCM(
    uint32 destParachainId,
    address token,
    uint256 amount,
    uint256 aiRiskScore,
    bytes calldata assetData,
    uint32 feeAssetItem,
    uint64 weightLimit
)
```

#### Considerations
1. **Parameter Ordering:** Group related parameters (destination, asset, execution)
2. **Gas Optimization:** Consider packing smaller types
3. **Future Extensibility:** Leave room for version parameter

#### Proposed Refinement Options

**Option A: Grouped Parameters**
```solidity
function routeYieldViaXCM(
    uint32 destParachainId,      // Destination
    address token,                // Asset
    uint256 amount,
    bytes calldata assetData,
    uint256 aiRiskScore,          // Validation
    uint32 feeAssetItem,          // Execution config
    uint64 weightLimit
)
```

**Option B: Struct-Based (Gas Efficient)**
```solidity
struct RouteParams {
    uint32 destParachainId;
    address token;
    uint256 amount;
    uint256 aiRiskScore;
    bytes assetData;
    uint32 feeAssetItem;
    uint64 weightLimit;
}

function routeYieldViaXCM(RouteParams calldata params)
```

#### Acceptance Criteria
- [ ] Function signature reviewed for gas efficiency
- [ ] Parameter ordering optimized for clarity
- [ ] ABI backward compatibility maintained OR migration path documented
- [ ] Gas comparison report generated
- [ ] API endpoint updated to match new signature

#### Estimated Effort
- **Analysis:** 1 day
- **Implementation:** 2 days
- **Testing:** 1 day

---

### 🟡 Issue: AEGIS-104 - Implement XCM Message Status Tracking

**Type:** Story  
**Priority:** Medium  
**Component:** Smart Contract / Off-chain  
**Assignee:** TBD  
**Sprint:** Backlog

#### Description
Add on-chain and off-chain tracking for XCM message status (sent, delivered, executed, failed). Currently, the contract emits events but doesn't track delivery confirmation.

#### Requirements
1. Emit unique message ID with each XCM call
2. Off-chain service to monitor XCM delivery status
3. Update vault state based on delivery confirmation
4. Handle failed XCM messages (refund/rollback)

#### Acceptance Criteria
- [ ] Unique message ID generated per XCM call
- [ ] Off-chain listener monitors XCM delivery
- [ ] API endpoint to query message status
- [ ] Failed message handling documented
- [ ] UI updates to show pending/completed routes

#### Estimated Effort
- **Development:** 5 days
- **Integration:** 2 days

---

### 🟢 Issue: AEGIS-105 - Add Multi-Token Support Validation

**Type:** Task  
**Priority:** Low  
**Component:** Smart Contract / API  
**Assignee:** TBD  
**Sprint:** Backlog

#### Description
Extend the vault to support multiple token types for XCM routing. Currently, the MVP focuses on test-USDC.

#### Requirements
1. Validate asset encoding for different token types
2. Test routing for each supported token
3. Update supported token list management
4. Document token-specific considerations

#### Acceptance Criteria
- [ ] At least 3 different token types tested
- [ ] Asset encoding validated per token type
- [ ] Documentation updated with supported tokens
- [ ] UI updated to show token selection

#### Estimated Effort
- **Development:** 2 days
- **Testing:** 2 days

---

### 🟢 Issue: AEGIS-106 - Implement AI Risk Score Oracle Integration

**Type:** Story  
**Priority:** Low  
**Component:** Off-chain / AI  
**Assignee:** TBD  
**Sprint:** Backlog

#### Description
Replace the current simplified risk scoring with a proper AI/ML risk oracle that analyzes yield opportunities and assigns risk scores.

#### Current State
```typescript
function computeRiskScore(intent: string) {
  const looksHighRisk = intent.includes("leverage") || 
                        intent.includes("unsafe");
  return looksHighRisk ? 88 : 42;
}
```

#### Requirements
1. Integrate with external risk assessment API
2. Cache risk scores for efficiency
3. Implement score expiration/refresh logic
4. Add risk score explanation to UI

#### Acceptance Criteria
- [ ] AI oracle API integrated
- [ ] Risk scores fetched from external service
- [ ] Score caching implemented
- [ ] Fallback scoring for API failures
- [ ] Documentation updated

#### Estimated Effort
- **Development:** 4 days
- **Integration:** 2 days

---

## Implementation Roadmap

### Phase 1: Production Encoding (Sprint 1)
- AEGIS-101: Implement Production XCM MultiAsset Encoding
- AEGIS-103: Refine routeYieldViaXCM Function Signature

### Phase 2: Live Testing (Sprint 2)
- AEGIS-102: Replace MockXCM with Live Parachain Testing

### Phase 3: Enhanced Features (Sprint 3+)
- AEGIS-104: Implement XCM Message Status Tracking
- AEGIS-105: Add Multi-Token Support Validation
- AEGIS-106: Implement AI Risk Score Oracle Integration

---

## Dependencies

```
AEGIS-101 (Encoding)
    ↓
AEGIS-103 (Signature Refinement)
    ↓
AEGIS-102 (Live Testing)
    ↓
AEGIS-104 (Status Tracking) → AEGIS-105 (Multi-Token)
    ↓
AEGIS-106 (AI Oracle)
```

---

## Risk Assessment

| Issue | Risk | Mitigation |
|-------|------|------------|
| AEGIS-101 | High - Encoding errors could cause failed XCM | Extensive testing against spec |
| AEGIS-102 | Medium - Testnet instability | Retry logic, local zombienet fallback |
| AEGIS-103 | Low - Breaking change | Maintain backward compatibility |
| AEGIS-104 | Medium - Off-chain complexity | Start with simple polling approach |
| AEGIS-105 | Low - Straightforward extension | Incremental token addition |
| AEGIS-106 | Low - Non-critical feature | Keep simple fallback scoring |

---

## Definition of Done (Global)

For all issues above, the following must be complete:

- [ ] Code reviewed and approved
- [ ] Unit tests passing (>90% coverage)
- [ ] Integration tests passing (where applicable)
- [ ] Documentation updated
- [ ] API documentation updated
- [ ] Changelog updated
- [ ] No breaking changes OR migration guide provided

---

## Contact

**Tech Lead:** TBD  
**Smart Contract Dev:** TBD  
**Frontend/API Dev:** TBD  
**QA:** TBD

---

*Document generated: March 26, 2026*  
*Version: 1.0*  
*Next Review: Post-Sprint 1*
