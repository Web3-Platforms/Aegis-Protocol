# Aegis Protocol — Complete Guide

This guide explains every part of the project: what it is, how each piece works,
how to get real transactions running on Paseo testnet, and what to do next.
Read it top to bottom the first time, then use the section links as a reference.

---

## Table of Contents

1. [What Aegis Protocol Is](#1-what-aegis-protocol-is)
2. [How the System Works End-to-End](#2-how-the-system-works-end-to-end)
3. [Getting Real Transactions Running](#3-getting-real-transactions-running)
4. [The Smart Contract](#4-the-smart-contract)
5. [The AI Risk Oracle](#5-the-ai-risk-oracle)
6. [The Frontend](#6-the-frontend)
7. [XCM Cross-Chain Routing](#7-xcm-cross-chain-routing)
8. [Testing](#8-testing)
9. [Deployment Reference](#9-deployment-reference)
10. [What Is Real vs. Simulated](#10-what-is-real-vs-simulated)
11. [Troubleshooting](#11-troubleshooting)
12. [Roadmap and Next Steps](#12-roadmap-and-next-steps)

---

## 1. What Aegis Protocol Is

Aegis Protocol is a **yield vault** on the Polkadot Hub (Paseo testnet). Users
deposit ERC-20 tokens into the vault. An AI oracle scores the risk of routing
those tokens to yield strategies on other parachains. If the risk score is below
75, the vault executes the cross-chain transfer via XCM.

**Core value propositions:**

| Value | What it means |
|-------|---------------|
| **AI-gated routing** | No capital moves cross-chain unless an AI oracle approves it (score < 75). This is enforced on-chain — the contract reverts if the score is too high. |
| **Non-custodial** | Users hold their own keys. The vault holds tokens only while they are deposited. Withdrawals are instant. |
| **XCM-native** | Built on Polkadot's native cross-chain messaging protocol, not a bridge. When the XCM precompile is live on Paseo, routes execute natively. |
| **Intent-based UX** | Users describe what they want in plain English ("earn yield on Acala"). The AI translates that into a risk score and a routing decision. |

---

## 2. How the System Works End-to-End

```
User types intent in chat
        │
        ▼
POST /api/risk-oracle  { intent: "earn yield safely" }
        │
        ▼
Risk Oracle scores intent (0–100)
  • OpenAI / Gemini if API key is set
  • Keyword fallback otherwise
        │
        ▼
Returns { parachainId: 1000, riskScore: 42, safeToRoute: true }
        │
        ▼  (only if safeToRoute)
User clicks "Confirm Transaction"
        │
        ▼
wagmi → ERC-20 approve(vault, amount)
        │
        ▼
wagmi → AegisVault.deposit(token, amount)
  • Vault pulls tokens from user wallet
  • Emits Deposit event
        │
        ▼
DepositForm calls POST /api/execute-route  { userAddress, intent }
        │
        ▼
execute-route API (server-side, signed by AI oracle wallet):
  1. Reads user's deposited balance from vault
  2. Encodes XCM asset data
  3. Calls AegisVault.routeYieldViaXCM(...)
        │
        ▼
AegisVault.routeYieldViaXCM checks:
  • caller == aiOracleAddress
  • aiRiskScore < 75
  • token is supported
  • amount <= vault balance
  • XCM routing not paused
  • route cap not exceeded
        │
        ▼
Calls IPolkadotXCM(xcmPrecompileAddress).sendXcm(...)
  • On Paseo today: xcmPrecompileAddress = address(0) → no-op, tx succeeds
  • When precompile ships: real XCM message dispatched to parachain 1000
        │
        ▼
Emits YieldRoutedViaXCM + XcmRouted events
Activity page reads these events and displays them
```

---

## 3. Getting Real Transactions Running

This is the step-by-step checklist to go from zero to live transactions on Paseo.

### Step 1 — Get a funded Paseo wallet

1. Install MetaMask (or any EVM wallet).
2. Add Paseo Testnet manually:
   - Network name: `Paseo Testnet`
   - RPC URL: `https://eth-rpc-testnet.polkadot.io`
   - Chain ID: `420420417`
   - Currency symbol: `PAS`
3. Get testnet PAS from the faucet: https://faucet.polkadot.io/
   - Select "Paseo" and paste your EVM address.
   - You need at least 1 PAS for gas.

### Step 2 — Deploy the contracts

The contract currently on-chain (`0x2BEf...`) is an **outdated version** (2982 bytes
vs 8782 bytes in the current source). You must redeploy.

```bash
# In the contracts/ directory:
echo "PRIVATE_KEY=0x<your-private-key>" > contracts/.env.local

cd contracts
npm run setup
# This runs scripts/setup-paseo.js which:
#   - Deploys AegisVault (current version)
#   - Deploys wPAS and test-USDC mock tokens
#   - Registers both tokens as supported
#   - Sets xcmPrecompileAddress to address(0) (graceful no-op)
#   - Prints the .env.local block to copy
```

The script prints something like:

```
=== Paste this into frontend/.env.local ===

NEXT_PUBLIC_PASEO_RPC_URL=https://eth-rpc-testnet.polkadot.io
NEXT_PUBLIC_AEGIS_VAULT_ADDRESS=0x<new-vault>
NEXT_PUBLIC_WPAS_ADDRESS=0x<new-wpas>
NEXT_PUBLIC_TEST_USDC_ADDRESS=0x<new-usdc>
NEXT_PUBLIC_USDC_TOKEN_ADDRESS=0x<new-usdc>
DEST_PARACHAIN_ID=1000
NEXT_PUBLIC_E2E_MOCK_WALLET=false
AI_ORACLE_PRIVATE_KEY=0x<your-private-key-here>
```

### Step 3 — Configure the frontend

```bash
cp frontend/.env.example frontend/.env.local
# Paste the block printed by setup-paseo.js
# Set AI_ORACLE_PRIVATE_KEY to the same private key used for deployment
```

`AI_ORACLE_PRIVATE_KEY` is a **server-side secret** — it is never sent to the
browser. It is the private key of the wallet that was set as `aiOracleAddress`
during deployment (same as the deployer by default).

### Step 4 — Mint test tokens to your wallet

```bash
cd contracts
PRIVATE_KEY=0x<deployer-key> RECIPIENT=0x<your-wallet> npm run mint
# Mints 1,000 wPAS and 1,000 test-USDC to your wallet
```

### Step 5 — Start the frontend

```bash
cd frontend
npm run dev
# Open the preview URL shown in your terminal
```

### Step 6 — Make your first deposit

1. Open the app and connect your wallet (MetaMask on Paseo Testnet).
2. Go to **Vault** → select test-USDC → enter an amount → click **Deposit**.
3. MetaMask will ask you to approve two transactions:
   - First: ERC-20 `approve` (allows the vault to pull your tokens)
   - Second: `deposit` (vault pulls the tokens)
4. After both confirm, your balance appears in the vault stats.

### Step 7 — Route yield via the AI oracle

After depositing, the UI automatically calls `/api/execute-route`. You can also
trigger it manually from the **XCM Route Panel** on the vault page.

The transaction will:
- Call `routeYieldViaXCM` on-chain as the AI oracle
- Succeed (the vault logic runs, events are emitted)
- The XCM call itself is a no-op (address(0)) until Polkadot Hub ships the precompile

You will see the route appear in the **Activity** page.

### Step 8 — Use the chat interface

Go to **Chat** → type something like "Earn yield safely on Acala" → the AI oracle
scores it → if safe, click **Confirm Transaction**.

---

## 4. The Smart Contract

**File:** `contracts/contracts/AegisVault.sol`
**Deployed at:** set by `npm run setup` → written to `contracts/deployments/paseo.json`

### Key functions

| Function | Who can call | What it does |
|----------|-------------|--------------|
| `deposit(token, amount)` | Anyone | Pulls ERC-20 from user, records balance |
| `withdraw(token, amount)` | Anyone | Returns ERC-20 to user |
| `routeYieldViaXCM(...)` | AI oracle only | Validates risk score, calls XCM precompile |
| `rebalanceVault(...)` | AI oracle only | Rebalances allocation across parachains |
| `addSupportedToken(token)` | Owner only | Whitelist a token for deposit |
| `setAIOracleAddress(addr)` | Owner only | Change the oracle wallet |
| `setXCMPrecompileAddress(addr)` | Owner only | Point to the real XCM precompile when live |
| `toggleXcmRoute()` | Owner only | Pause/unpause XCM routing (circuit breaker) |
| `setRouteCap(token, cap)` | Owner only | Limit how much of a token can be routed |

### Safety mechanisms

- **Risk gate:** `aiRiskScore >= 75` reverts with `RiskScoreTooHigh`. This is
  enforced on-chain — the oracle cannot bypass it.
- **Reentrancy guard:** All state-changing user functions use OpenZeppelin's
  `ReentrancyGuard`.
- **SafeERC20:** All token transfers use `SafeERC20` to handle non-standard tokens.
- **Route caps:** Owner can set a maximum amount that can be routed per token.
- **Circuit breaker:** `toggleXcmRoute()` pauses all XCM routing instantly.
- **Access control:** `onlyOwner` and `onlyAIOracle` modifiers on all privileged functions.

### Reading vault state

```javascript
// Using ethers.js or viem — replace with your deployed address
const vault = new ethers.Contract(VAULT_ADDRESS, ABI, provider);

await vault.getUserDeposit(userAddress, tokenAddress);  // user's deposited balance
await vault.totalDeposits(tokenAddress);                // total vault TVL for a token
await vault.getVaultBalance(tokenAddress);              // vault's actual token balance
await vault.supportedTokens(tokenAddress);              // true/false
await vault.aiOracleAddress();                          // current oracle wallet
await vault.xcmPrecompileAddress();                     // current XCM precompile
await vault.xcmRoutingPaused();                         // circuit breaker state
```

### Events to watch

| Event | When emitted | Key fields |
|-------|-------------|------------|
| `Deposit` | User deposits | `user`, `token`, `amount`, `timestamp` |
| `Withdrawal` | User withdraws | `user`, `token`, `amount`, `timestamp` |
| `YieldRoutedViaXCM` | Route executed | `destParachainId`, `amount`, `riskScore`, `timestamp` |
| `XcmRouted` | Same route, audit record | `parachainNonce`, `txHash` |
| `AIOracleUpdated` | Oracle address changed | `newOracleAddress` |
| `TokenSupported` | Token whitelisted | `token` |

---

## 5. The AI Risk Oracle

The oracle is a two-part system:

### Part A — Intent scoring (`/api/risk-oracle`)

**File:** `frontend/app/api/risk-oracle/route.ts`

Accepts a plain-English intent string and returns a risk score.

```bash
curl -X POST http://localhost:3000/api/risk-oracle \
  -H "Content-Type: application/json" \
  -d '{"intent": "earn yield safely on Acala"}'

# Response:
{
  "parachainId": 1000,
  "riskScore": 42,
  "safeToRoute": true,
  "scoringMethod": "keyword"   # or "openai" / "gemini"
}
```

**Scoring methods (in priority order):**

1. **OpenAI** — set `OPENAI_API_KEY` in `frontend/.env.local`. Uses `gpt-4o-mini`.
2. **Gemini** — set `GEMINI_API_KEY` in `frontend/.env.local`. Uses `gemini-1.5-flash`.
3. **Keyword fallback** — always available, no API key needed.

The keyword fallback scores:
- `leverage`, `unsafe`, `degen`, `100x`, `flash loan`, `rug`, `ponzi` → **85** (blocked)
- `high yield`, `aggressive`, `speculative` → **55** (allowed but flagged)
- `safe`, `stable`, `stablecoin`, `usdc` → **30** (safe)
- Everything else → **42** (default safe)

**To add a real LLM:** The scoring functions are isolated in `route.ts`. Add your
provider's API call inside `scoreWithOpenAI` or `scoreWithGemini`, or add a new
function following the same pattern.

### Part B — On-chain execution (`/api/execute-route`)

**File:** `frontend/app/api/execute-route/route.ts`

This is the server-side oracle relay. It:
1. Reads the user's deposited balance from the vault
2. Encodes XCM asset data
3. Signs and submits `routeYieldViaXCM` as the AI oracle wallet

**Required env var:** `AI_ORACLE_PRIVATE_KEY=0x<64-hex-chars>`

This key must match the `aiOracleAddress` stored in the vault. After running
`npm run setup`, the deployer address is the oracle — use the same private key.

**Error responses and what they mean:**

| HTTP | Error | Fix |
|------|-------|-----|
| 400 | Missing userAddress | Pass `userAddress` in the request body |
| 400 | No deposited balance | User must deposit first |
| 400 | Token not supported | Run `addSupportedToken` from owner wallet |
| 403 | Route blocked by risk gate | Score >= 75; use a safer intent |
| 403 | Oracle address mismatch | `AI_ORACLE_PRIVATE_KEY` doesn't match vault's `aiOracleAddress` |
| 501 | AI_ORACLE_PRIVATE_KEY not set | Add it to `frontend/.env.local` |
| 503 | XCM routing paused | Call `vault.toggleXcmRoute()` from owner wallet |

---

## 6. The Frontend

**Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4, wagmi 3, viem 2

### Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Landing page with hero, features, CTA |
| `/vault` | `app/vault/page.tsx` | Deposit, withdraw, XCM route panel |
| `/chat` | `app/chat/page.tsx` | Intent chat interface |
| `/activity` | `app/activity/page.tsx` | Transaction history, yield stats |

### Key components

| Component | What it does |
|-----------|-------------|
| `Web3Provider` | Configures wagmi for Paseo Testnet (chainId 420420417) |
| `Navbar` | Wallet connect button, navigation |
| `DepositForm` | ERC-20 approve → vault deposit flow |
| `WithdrawalForm` | Vault withdraw flow |
| `VaultStats` | Reads `totalDeposits` and `getUserDeposit` live from chain |
| `ChatInterface` | Intent input → risk oracle → confirm/cancel flow |
| `XcmRoutePanel` | Manual XCM route trigger with configurable params |
| `TransactionHistory` | Paginated table of on-chain events, CSV export |
| `YieldStatistics` | Yield route summary cards |

### Wallet connection

The app uses `wagmi` with the `injected()` connector (MetaMask, Rabby, etc.).
For E2E tests, set `NEXT_PUBLIC_E2E_MOCK_WALLET=true` or pass `?e2eMockWallet=1`
in the URL to use a mock wallet.

### Contract addresses

All addresses are resolved from `NEXT_PUBLIC_*` env vars in `frontend/lib/contracts.ts`.
Zero-address fallbacks keep the UI renderable without a deployment, but all
contract reads will return zero values.

### Adding a new page

1. Create `frontend/app/<route>/page.tsx` with `"use client"` if it uses hooks.
2. Add a link in `Navbar.tsx`.
3. No routing config needed — Next.js App Router uses the filesystem.

---

## 7. XCM Cross-Chain Routing

### What XCM is

XCM (Cross-Consensus Messaging) is Polkadot's native protocol for sending
messages between parachains and the relay chain. It is not a bridge — it is
built into the protocol. An XCM message can transfer assets, execute calls,
or do both.

### How Aegis uses XCM

The vault calls `IPolkadotXCM(xcmPrecompileAddress).sendXcm(parachainId, assets, feeAssetItem, weightLimit)`.

The XCM precompile is a special contract address that translates EVM calls into
XCM messages. On Moonbeam it lives at `0x0000000000000000000000000000000000000800`.

### Current status on Paseo

The XCM precompile **does not yet exist** on Paseo's EVM layer. The vault's
`xcmPrecompileAddress` is set to `address(0)` by `setup-paseo.js`. Calling
`address(0).sendXcm(...)` is a no-op on EVM — the transaction succeeds, all
vault logic runs, events are emitted, but no cross-chain message is dispatched.

This means:
- Deposits, withdrawals, and route events all work today
- The actual cross-chain transfer is pending the precompile going live
- When it does, call `vault.setXCMPrecompileAddress(realAddress)` from the owner wallet

### XCM asset encoding

**File:** `frontend/lib/xcm-encoder.ts`

The encoder produces the `bytes` argument for `sendXcm`. It supports:

| Asset type | Use case | Encoding |
|-----------|----------|----------|
| `NATIVE` (0) | DOT/PAS on relay chain | `parents=1, interior=Here` |
| `WRAPPER_MAPPED` (1) | Statemine/Statemint assets | `parents=1, interior=X2(Parachain, GeneralIndex)` |

The encoding is hand-rolled (not using `@polkadot/api` SCALE codec). It follows
the XCM MultiAsset spec but has not been validated against a live precompile.
When the Paseo precompile ships, test with a small amount first.

### Destination parachain

Currently fixed to `DEST_PARACHAIN_ID=1000` (Paseo Asset Hub). To route to
other parachains, change this env var and ensure the target parachain is
registered on Paseo.

---

## 8. Testing

### Contract tests

```bash
cd contracts
npm test                          # All tests (excludes gas profile)
npm run coverage                  # Coverage report → coverage/index.html
npm run gas                       # Gas profiling (AegisVault.gas.test.js)
```

**Test files:**

| File | What it covers |
|------|---------------|
| `test/AegisVault.test.js` | Deployment, access control, deposit/withdraw, reentrancy, risk gate, XCM routing, views |
| `test/AegisVault.rebalance.test.js` | Rebalancing logic, deviation checks, deadlines |
| `test/AegisVault.gas.test.js` | Gas budgets per function (currently failing for `routeYieldViaXCM` due to MockXCM overhead) |

All tests use `MockXCM.sol` as the XCM precompile so they never hit a real network.

### Frontend E2E tests

```bash
cd frontend
npx playwright install chromium   # First time only
npm run test:e2e
```

The current suite (`tests/e2e/chat-cancel.spec.ts`) verifies that cancelling
a routing intent does not submit a wallet transaction.

### Adding a new contract test

```javascript
// In contracts/test/AegisVault.test.js
it("does something new", async function () {
  const { aegisVault, mockToken, aiOracle, user1 } = await deployFixture();
  // ... your test
});
```

Always use `deployFixture()` — it deploys a fresh vault with MockXCM wired in.

### Adding a new E2E test

```typescript
// In frontend/tests/e2e/your-test.spec.ts
import { test, expect } from "@playwright/test";

test("description", async ({ page }) => {
  await page.goto("/vault?e2eMockWallet=1");
  // ... your assertions
});
```

---

## 9. Deployment Reference

### Contract deployment

```bash
cd contracts

# Full setup (recommended — deploys vault + tokens + configures everything)
PRIVATE_KEY=0x... npm run setup

# Vault only (if tokens already exist)
PRIVATE_KEY=0x... npm run deploy

# Mint tokens to a wallet
PRIVATE_KEY=0x... RECIPIENT=0x<wallet> npm run mint
```

After deployment, `contracts/deployments/paseo.json` contains all addresses.

### Frontend deployment (Vercel)

1. Push to GitHub.
2. Connect the repo to Vercel.
3. Set root directory to `frontend`.
4. Add all `NEXT_PUBLIC_*` env vars from your `.env.local`.
5. Add `AI_ORACLE_PRIVATE_KEY` as a **server-side** env var (not `NEXT_PUBLIC_`).
6. Deploy.

The `frontend/vercel.json` file is already configured.

### Environment variables reference

| Variable | Where used | Required | Description |
|----------|-----------|----------|-------------|
| `NEXT_PUBLIC_PASEO_RPC_URL` | Frontend + API | Yes | Paseo EVM RPC endpoint |
| `NEXT_PUBLIC_AEGIS_VAULT_ADDRESS` | Frontend + API | Yes | Deployed vault address |
| `NEXT_PUBLIC_WPAS_ADDRESS` | Frontend | Yes | wPAS token address |
| `NEXT_PUBLIC_TEST_USDC_ADDRESS` | Frontend + API | Yes | test-USDC token address |
| `DEST_PARACHAIN_ID` | API | No | Destination parachain (default: 1000) |
| `AI_ORACLE_PRIVATE_KEY` | API only | Yes | Oracle wallet private key (server-side secret) |
| `OPENAI_API_KEY` | API only | No | Enables OpenAI risk scoring |
| `GEMINI_API_KEY` | API only | No | Enables Gemini risk scoring |
| `NEXT_PUBLIC_E2E_MOCK_WALLET` | Frontend | No | Set `true` for E2E tests |

---

## 10. What Is Real vs. Simulated

Be honest about this when presenting the project.

| Feature | Status | Notes |
|---------|--------|-------|
| Smart contract | ✅ Real | Deployed on Paseo, enforces all rules on-chain |
| ERC-20 deposit / withdraw | ✅ Real | Real token transfers, real wallet signatures |
| Risk gate enforcement | ✅ Real | On-chain revert if score >= 75 |
| AI risk scoring (LLM) | 🟡 Optional | Works if `OPENAI_API_KEY` or `GEMINI_API_KEY` is set; keyword fallback otherwise |
| On-chain route events | ✅ Real | `YieldRoutedViaXCM` and `XcmRouted` events are emitted |
| XCM cross-chain transfer | ⏳ Pending | `xcmPrecompileAddress = address(0)` — no-op until Paseo ships the precompile |
| APY / yield data | ❌ Simulated | Hardcoded to 0; real APY requires an off-chain indexer + price feeds |
| Token prices | ❌ Simulated | Mock tokens have no market price |
| Destination vault | ❌ Simulated | `DESTINATION_VAULT_ADDRESS` is a placeholder |

---

## 11. Troubleshooting

### "No signers available" when running deploy script
Set `PRIVATE_KEY=0x<64-hex-chars>` in `contracts/.env.local`.

### MetaMask shows wrong network
Add Paseo Testnet manually: RPC `https://eth-rpc-testnet.polkadot.io`, chain ID `420420417`.

### Deposit transaction reverts with "TokenNotSupported"
The token is not whitelisted. Run `npm run setup` (which calls `addSupportedToken`)
or call it manually from the owner wallet.

### execute-route returns 403 "Oracle address mismatch"
The `AI_ORACLE_PRIVATE_KEY` in `.env.local` does not match the `aiOracleAddress`
stored in the vault. Either:
- Use the same private key that was used to deploy (the deployer is set as oracle by default)
- Or call `vault.setAIOracleAddress(newAddress)` from the owner wallet

### execute-route returns 501 "AI_ORACLE_PRIVATE_KEY not set"
Add `AI_ORACLE_PRIVATE_KEY=0x<key>` to `frontend/.env.local` and restart the dev server.

### VaultStats shows 0 for everything
The vault address in `.env.local` is wrong or the contract is the old version.
Re-run `npm run setup` and update `.env.local` with the new address.

### Build fails with "Too many re-renders"
This was a pre-existing bug in `TransactionHistory.tsx` — fixed in this session.
Run `npm run build` again.

### Contract tests fail
Run `cd contracts && npm install` first. The gas test for `routeYieldViaXCM`
is expected to fail (MockXCM overhead exceeds the 200k budget) — this is tracked
separately and does not affect functionality.

### XCM routing reverts on-chain
Check `xcmPrecompileAddress` — if it is not `address(0)` and the precompile
doesn't exist at that address, the call will revert. Run:
```bash
# From owner wallet — set back to address(0) for graceful no-op
cast send <VAULT_ADDRESS> "setXCMPrecompileAddress(address)" \
  0x0000000000000000000000000000000000000000 \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key $PRIVATE_KEY
```

---

## 12. Roadmap and Next Steps

### Immediate (unblocked today)

- [ ] Run `npm run setup` to redeploy the current contract version
- [ ] Set `AI_ORACLE_PRIVATE_KEY` in `frontend/.env.local`
- [ ] Make your first real deposit and route transaction
- [ ] Add `OPENAI_API_KEY` or `GEMINI_API_KEY` for real AI scoring

### Short term

- [ ] **Verify XCM precompile address** — monitor Polkadot Hub release notes for
  when the XCM precompile goes live on Paseo. When it does, call
  `vault.setXCMPrecompileAddress(realAddress)`.
- [ ] **Validate XCM encoding** — test `xcm-encoder.ts` output against the live
  precompile with a small amount. The encoding follows the spec but has not been
  validated against a real precompile call.
- [ ] **Deploy to Vercel** — push to GitHub, connect to Vercel, set env vars.
- [ ] **Add more E2E tests** — deposit flow, withdrawal flow, risk gate rejection.

### Medium term

- [ ] **Real APY data** — integrate an on-chain indexer (SubQuery, Subsquid) or
  a price feed (Chainlink, DIA) to show real yield percentages.
- [ ] **Multiple destination parachains** — allow the oracle to route to Acala,
  Astar, Moonbeam, etc. based on the intent. Currently fixed to parachain 1000.
- [ ] **Separate oracle wallet** — the deployer and oracle are the same address.
  Generate a dedicated oracle wallet, fund it with PAS for gas, and call
  `vault.setAIOracleAddress(oracleAddress)` from the owner wallet.
- [ ] **Route cap configuration UI** — let the owner set per-token route caps
  from the frontend instead of requiring a direct contract call.

### Long term

- [ ] **Mainnet deployment** — when Polkadot Hub launches on mainnet with the
  XCM precompile, redeploy with real tokens (DOT, USDC).
- [ ] **Governance** — replace `onlyOwner` with a multisig or DAO for parameter
  changes.
- [ ] **Yield strategy registry** — let parachain teams register their yield
  strategies so the oracle can route to the best one dynamically.
