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

Aegis Protocol is currently a **pilot-first, vault-only beta** on the Polkadot
Hub (Paseo testnet). Users can deposit and withdraw supported ERC-20 assets in
the vault. A risk-oracle workflow and route-submission path exist for
experimental evaluation, but they are **not** part of the default public beta
launch surface.

**Core value propositions:**

| Value | What it means |
|-------|---------------|
| **Vault-only beta** | The default launch surface is wallet connect plus supported deposit/withdraw flows on Paseo. |
| **Risk assessment beta** | The assistant can score routing ideas and return a prototype risk result without claiming live production execution. |
| **Non-custodial** | Users hold their own keys. The vault holds tokens only while they are deposited. Withdrawals are instant. |
| **XCM evaluation path** | The contract and UI keep an experimental XCM-related workflow for pilot environments, but launch-safe tooling keeps routing paused until a real target-chain path is proven. |
| **Intent-based UX** | Users can describe what they want in plain English and receive a prototype risk assessment for planning or pilot review. |

---

## 2. How the System Works End-to-End

```
User connects wallet
        │
        ├── Vault flow (default beta)
        │      ▼
        │   ERC-20 approve(vault, amount)
        │      ▼
        │   AegisVault.deposit(token, amount)
        │      • Vault pulls tokens from user wallet
        │      • Emits Deposit event
        │      ▼
        │   User can later call AegisVault.withdraw(token, amount)
        │      • Emits Withdrawal event
        │
        └── Assistant flow (assessment by default)
               ▼
            POST /api/risk-oracle  { intent: "earn yield safely" }
               ▼
            Risk Oracle scores intent (0–100)
              • OpenAI / Gemini if API key is set
              • Keyword fallback otherwise
               ▼
            Returns { parachainId: 1000, riskScore: 42, safeToRoute: true }
               ▼
            If experimental routing is explicitly enabled:
              • user can review a testnet route submission
              • /api/execute-route signs and submits routeYieldViaXCM(...)
              • route-related events may be emitted for evaluation, but this is
                still not proof of a live cross-chain message
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
cd contracts
cp .env.example .env.paseo-local
cp .env.paseo-local .env.local
# Edit .env.paseo-local (or the active .env.local copy) and set PRIVATE_KEY
# before running setup. Keep separate env files for protected Moonbase/Moonbeam work.
npm run setup
# This runs scripts/setup-paseo.js which:
#   - Deploys the current demo vault flow for Paseo only
#   - Deploys mock tokens and registers them
#   - Prints the .env.local block to copy
```

For protected Moonbase / Moonbeam launch work, do **not** treat `npm run setup`
as a canonical bootstrap path. Use the checked-in launch profiles under
`config/launch/` plus `launch:deploy` / `launch:prepare` / `launch:verify` described
in the deployment reference below.

The script prints something like:

```
=== Paste this into frontend/.env.local ===

NEXT_PUBLIC_PASEO_RPC_URL=https://eth-rpc-testnet.polkadot.io
NEXT_PUBLIC_AEGIS_VAULT_ADDRESS=0x<new-vault>
NEXT_PUBLIC_WPAS_ADDRESS=0x<new-wpas>
NEXT_PUBLIC_TEST_USDC_ADDRESS=0x<new-usdc>
NEXT_PUBLIC_USDC_TOKEN_ADDRESS=0x<new-usdc>
DEST_PARACHAIN_ID=1000
NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=false
AI_ORACLE_RELAY_ENABLED=false
NEXT_PUBLIC_E2E_MOCK_WALLET=false
AI_ORACLE_PRIVATE_KEY=0x<your-private-key-here>
# Optional rotation metadata for operator checks:
# AI_ORACLE_KEY_VERSION=oracle-paseo-local-001
# AI_ORACLE_KEY_ROTATED_AT=2026-04-06T00:00:00Z
# AI_ORACLE_RELAY_DATABASE_URL=postgresql://...
# AI_ORACLE_RELAY_ALERT_WEBHOOK_URL=https://...
# AI_ORACLE_ALERT_WEBHOOK_AUTH_TOKEN=<optional-bearer-token>
# AI_ORACLE_ALERT_SOURCE=aegis-paseo-relay
# AI_ORACLE_ALERT_TIMEOUT_MS=3000
# AI_ORACLE_RELAY_ALERT_ENVIRONMENT=railway-staging
# AEGIS_LAUNCH_KPI_DASHBOARD_AUTH_TOKEN=<strong-random-token>
```

### Step 3 — Configure the frontend

```bash
cp frontend/.env.example frontend/.env.local
# Paste the block printed by setup-paseo.js
# For local demo-only work, AI_ORACLE_PRIVATE_KEY may match the deployment key.
# For Railway or protected environments, use a dedicated oracle-only key.
```

`AI_ORACLE_PRIVATE_KEY` is a **server-side secret** — it is never sent to the
browser. It is the private key of the wallet that was set as `aiOracleAddress`
during deployment. `setup-paseo.js` still defaults to deployer-equals-oracle for
local/demo work, but Railway or other protected environments should rotate to a
dedicated oracle-only signer, set `AI_ORACLE_KEY_VERSION` plus
`AI_ORACLE_KEY_ROTATED_AT`, and validate with `npm run relay:check-secrets`.
`AI_ORACLE_RELAY_ENABLED` stays `false` for the default public beta posture;
only enable it for explicit operator-controlled Paseo relay workflows.
`AEGIS_LAUNCH_KPI_DASHBOARD_AUTH_TOKEN` is a separate internal-only bearer token
for `GET /api/launch-kpi`; it should never be exposed in the browser or public
docs.
If you enable product instrumentation, treat those funnel counts as same-origin
client-reported directional signals, not CRM or anti-fraud evidence.

For protected Moonbase staging, switch the frontend/runtime to:

```bash
NEXT_PUBLIC_AEGIS_ENV=moonbase-staging
NEXT_PUBLIC_MOONBASE_RPC_URL=https://rpc.api.moonbase.moonbeam.network
NEXT_PUBLIC_MOONBASE_STAGING_VAULT_ADDRESS=0x<moonbase-vault>
NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_ADDRESS=0x<staging-stable>
NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_SYMBOL=mUSDC
NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=false
AI_ORACLE_RELAY_ENABLED=false
```

Use `docs/project-management/AEGIS_701_STAGING_ENVIRONMENT.md` as the manual
operator runbook for that protected staging mode.

### Step 3b — Configure protected launch envs

```bash
cp contracts/.env.example contracts/.env.moonbase-staging.local
cp contracts/.env.moonbase-staging.local contracts/.env.local
# Fill in RPC_URL, PRIVATE_KEY, owner/deployer addresses, and any profile token envs
# in the per-environment file, then copy the active one into contracts/.env.local
# before each launch command.
```

For a protected launch deployment, run:

```bash
cd contracts
npm run compile
npm run launch:deploy -- --profile moonbase-staging
```

This deploys `AegisVaultLaunch`, verifies the paused defaults on-chain, and
writes deployment metadata to `contracts/deployments/<profile>.json`. After that,
set `AEGIS_VAULT_ADDRESS` in `contracts/.env.local` to the deployed address and
continue with:

```bash
npm run launch:check-key-posture -- --profile moonbase-staging
npm run launch:prepare -- --profile moonbase-staging --mode plan
# Execute the emitted owner/multisig actions here.
npm run launch:verify -- --profile moonbase-staging --frontend-env ../frontend/.env.local
npm run launch:prove -- --profile moonbase-staging
```

Keep the same profile through deploy, prepare, verify, and prove. Keep separate
env files per protected environment and copy the active one to
`contracts/.env.local` before running launch commands. Only move to
`moonbeam-pilot` after the Moonbase staging packet and proof outputs are retained.
When `--frontend-env ../frontend/.env.local` is supplied, `launch:verify` treats
that file as the source of truth for `NEXT_PUBLIC_*` checks and fails if the
experimental-routing flag is missing there.

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

### Step 7 — Optional: enable experimental route submission

The default beta keeps route submission **off**. If you are running an
operator-assisted pilot or local evaluation environment, explicitly opt in:

```bash
# frontend/.env.local
NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true
```

After restarting the frontend, the **XCM Route Panel** and assistant can expose
the experimental submission path again.

The submission flow will:
- Call `routeYieldViaXCM` on-chain as the AI oracle
- Succeed only if the vault/oracle config is correct
- Emit route-related events on Paseo
- Still remain a beta evaluation path rather than a launch-safe XCM proof

The route CTA is still intentionally strict. Even in an enabled pilot
environment, submission only unlocks when:

- the connected wallet is on the active Aegis runtime
- the wallet has a non-zero deposited route-asset balance in the beta vault
- no tracked request is still pending for that wallet/runtime
- the latest failed request has been reviewed and dismissed
- the scoped portfolio snapshot is healthy

### Step 8 — Use the chat interface

Go to **Chat** → type something like "Earn yield safely on Acala" → the AI oracle
scores it. In the default beta, this stops at assessment. In an explicitly
enabled pilot environment, a confirmable experimental submission step appears
only when the current wallet also satisfies the route-eligibility checks above.

---

## 4. The Smart Contract

**Prototype file:** `contracts/contracts/AegisVault.sol`
**Launch file:** `contracts/contracts/AegisVaultLaunch.sol`
**Prototype deployment:** set by `npm run setup` → written to `contracts/deployments/paseo.json`

`AegisVault.sol` remains the current Paseo beta prototype with route and
rebalancing surfaces. `AegisVaultLaunch.sol` is the reduced-surface Moonbeam
launch target with single-token vault-only scope and explicit deposit/withdraw
pause controls.

### Prototype key functions

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
| `toggleRebalancing()` | Owner only | Pause/unpause rebalancing |
| `setRouteCap(token, cap)` | Owner only | Limit how much of a token can be routed |
| `setRouteCapByAssetType(token, assetType, cap)` | Owner only | Limit routed amount per asset type |
| `transferOwnership(addr)` | Owner only | Hand ownership to the intended multisig/admin |

### Launch-contract key functions

| Function | Who can call | What it does |
|----------|-------------|--------------|
| `deposit(token, amount)` | Anyone | Pulls the fixed launch token from the user |
| `withdraw(token, amount)` | Anyone | Returns the fixed launch token to the depositor |
| `setDepositsPaused(bool)` | Owner only | Independently pause/unpause deposits |
| `setWithdrawalsPaused(bool)` | Owner only | Independently pause/unpause withdrawals |
| `transferOwnership(addr)` | Owner only | Hand ownership to the intended multisig/admin |

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

**Required for server-side route submission**

- `AI_ORACLE_RELAY_ENABLED=true`
- `AI_ORACLE_PRIVATE_KEY=0x<64-hex-chars>`
- `AI_ORACLE_RELAY_DATABASE_URL=postgresql://...` or `DATABASE_URL=postgresql://...` for hosted/operator deployments
- `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true` only if you want the UI to expose the experimental route flow
- Optional: `AI_ORACLE_RELAY_ALERT_WEBHOOK_URL=https://...` for best-effort operator alerts on material relay failures

`NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING` affects the UI only. `POST /api/execute-route`
remains disabled unless `AI_ORACLE_RELAY_ENABLED=true`.

This key must match the `aiOracleAddress` stored in the vault. After running
`npm run setup`, the deployer address is the oracle — use the same private key.

Before signing, the relay:

1. verifies it is running against **Paseo**
2. verifies the configured signer matches the vault's `aiOracleAddress`
3. refuses hosted operation without Postgres-backed storage
4. returns structured failure metadata (`failureCategory`, `retryDisposition`, `operatorAction`, `operatorAlertStatus`) for operator handling

The experimental UI now also keeps a wallet-scoped recent-request view:

- chat and vault routing surfaces render a shared `Recent Route Requests` panel
- the panel shows `requested -> validated -> submitted -> source_confirmed / failed`
- source-chain proof links only appear when `txHash` exists
- browser persistence is scoped by runtime + wallet
- status polling now calls `GET /api/execute-route?requestId=<id>&userAddress=<wallet>`

**Error responses and what they mean:**

| HTTP | Error | Fix |
|------|-------|-----|
| 400 | Missing userAddress | Pass `userAddress` in the query string alongside `requestId` |
| 400 | No deposited balance | User must deposit first |
| 400 | Token not supported | Run `addSupportedToken` from owner wallet |
| 403 | Route blocked by risk gate | Score >= 75; use a safer intent |
| 403 | Oracle address mismatch | `AI_ORACLE_PRIVATE_KEY` doesn't match vault's `aiOracleAddress` |
| 503 | Experimental route relay disabled | Set `AI_ORACLE_RELAY_ENABLED=true` for an explicit operator-controlled Paseo deployment |
| 503 | Durable relay storage is not configured | Set `AI_ORACLE_RELAY_DATABASE_URL` or `DATABASE_URL`, or use `AI_ORACLE_RELAY_ALLOW_FILE_STORE=true` only for single-instance local work |
| 503 | Route relay is pinned to Paseo only | Point the relay back to Paseo or leave it disabled |
| 503 | Route cap exceeded | Raise the relevant route cap before retrying |
| 501 | AI_ORACLE_PRIVATE_KEY not set | Add it to `frontend/.env.local` or the hosted server env |
| 503 | XCM routing paused | Call `vault.toggleXcmRoute()` from owner wallet |

---

## 6. The Frontend

**Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4, wagmi 3, viem 2

### Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Landing page with hero, features, CTA |
| `/vault` | `app/vault/page.tsx` | Deposit, withdraw, inspect current supported-asset positions, recent wallet history, and a gated experimental route panel |
| `/chat` | `app/chat/page.tsx` | Intent chat interface |
| `/activity` | `app/activity/page.tsx` | Transaction history and route-event summaries |

### Key components

| Component | What it does |
|-----------|-------------|
| `Web3Provider` | Configures wagmi from the shared runtime registry for `paseo-beta` or `moonbase-staging` |
| `Navbar` | Wallet connect button, navigation |
| `DepositForm` | ERC-20 approve → vault deposit flow |
| `WithdrawalForm` | Vault withdraw flow |
| `VaultStats` | Reads the server-owned `/api/portfolio` snapshot for supported-asset positions |
| `ChatInterface` | Intent input → risk oracle → optional confirm/cancel flow when experimental routing is enabled |
| `XcmRoutePanel` | Manual experimental route trigger when enabled for a pilot environment |
| `WalletHistoryTable` | Recent wallet deposits and withdrawals from the bounded wallet-history API |
| `TransactionHistory` | Activity-page table of normalized on-chain events and vault-wide route visibility |
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
XCM messages. In the current repo/tooling truth, the Polkadot-style precompile
address is `0x0000000000000000000000000000000000000801`.

### Current status on Paseo

The XCM precompile path is **not yet proven as a launch-safe workflow** on
Paseo's EVM layer. The truthful operator posture is to keep routing paused in
protected launch environments and treat any route-related Paseo activity as beta
evaluation, not as proof of live cross-chain delivery.

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
npm test                          # Default prototype regression suite
npm run test:launch               # Reduced-surface launch-contract suite
npm run test:all                  # Full prototype sweep, including gas profile
npm run coverage                  # Coverage report → coverage/index.html
npm run gas                       # Prototype gas profile
```

**Test files:**

| File | What it covers |
|------|---------------|
| `test/AegisVault.test.js` | Mixed prototype regression: vault-core behavior plus prototype-only routing coverage |
| `test/AegisVault.rebalance.test.js` | Prototype-only rebalancing coverage kept for regression reference |
| `test/AegisVault.gas.test.js` | Prototype gas profile: vault flows keep regression ceilings, route path is profiled separately |
| `test/AegisVaultLaunch.test.js` | Reduced-surface launch contract coverage for ABI removal, one-token scope, pause controls, liability safety, and reentrancy |

All prototype tests use `MockXCM.sol` as the XCM precompile so they never hit a
real network. Treat the prototype suites as prototype evidence and the launch
suite as launch-contract source evidence. Final launch approval still requires
`launch:verify` and `launch:prove` against a deployed `AegisVaultLaunch`.

### Frontend E2E tests

```bash
cd frontend
npx playwright install chromium   # First time only
npm run test:e2e
npm run test:e2e:ci   # CI-oriented config; expects a separate build and uses port 3110
```

The current suite verifies that cancelling a routing intent does not submit a
wallet transaction and that activity/history/routing surfaces render explicit
unavailable states instead of zero-like fallback data when their APIs fail.

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

# Paseo demo setup only
PRIVATE_KEY=0x... npm run setup

# Paseo vault-only deploy helper
PRIVATE_KEY=0x... npm run deploy

# Mint tokens to a wallet
PRIVATE_KEY=0x... RECIPIENT=0x<wallet> npm run mint

# Protected launch bootstrap plan (multisig/operator use)
npm run launch:prepare -- --profile moonbase-staging --mode plan

# Static launch-profile gate used by CI
npm run launch:check

# Protected launch deployment
npm run launch:deploy -- --profile moonbase-staging

# Execute the emitted owner/multisig actions here.

# Protected launch bootstrap verification
npm run launch:verify -- --profile moonbase-staging --frontend-env ../frontend/.env.local

# Protected launch deposit/withdraw proof
npm run launch:prove -- --profile moonbase-staging
```

After prototype deployment, `contracts/deployments/paseo.json` contains the
Paseo addresses. Protected launch deploys write `contracts/deployments/<profile>.json`.

The protected launch configs live under `config/launch/`. They are the
checked-in source of truth for Moonbase staging and Moonbeam pilot bootstrap
inputs. The new launch scripts are intentionally limited to `AegisVaultLaunch`
safety checks: launch token match, deposit/withdraw pause state, token metadata,
token whitelist, owner/deployer separation, experimental-routing flag posture,
and small deposit/withdraw smoke proofs through the live vault interface.

### Frontend deployment (Vercel)

1. Push to GitHub.
2. Connect the repo to Vercel.
3. Set root directory to `frontend`.
4. Add all `NEXT_PUBLIC_*` env vars from your `.env.local`.
5. Add `AI_ORACLE_PRIVATE_KEY` as a **server-side** env var (not `NEXT_PUBLIC_`).
6. Deploy.

The `frontend/vercel.json` file is already configured.

### Operator relay deployment (Railway)

Use Railway when you need hosted server-side relay execution for the current
Paseo operator workflow. Protected Moonbase staging still keeps hosted relay
execution off until the route runtime is generalized beyond Paseo.

1. Create a Railway service rooted at `frontend/`.
2. Attach Railway Postgres.
3. Set `AI_ORACLE_RELAY_ENABLED=true`.
4. Set `AI_ORACLE_PRIVATE_KEY` as a dedicated server-side oracle secret.
5. Set `AI_ORACLE_KEY_VERSION` and `AI_ORACLE_KEY_ROTATED_AT`.
6. Set `AI_ORACLE_RELAY_DATABASE_URL` from Railway Postgres or rely on `DATABASE_URL`.
7. Do **not** put `PRIVATE_KEY`, `BOOTSTRAP_OWNER_PRIVATE_KEY`, or `PROOF_WALLET_PRIVATE_KEY` in the frontend/Railway service env.
8. Run `npm run relay:check-secrets`.
9. Only set `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true` if this deployment should expose the route UI.

Railway-managed secrets plus Railway Postgres are acceptable for Paseo/lower
environments. Moonbeam paid-pilot routing still needs HSM/KMS-class custody.

### Operator key posture checks

Use these before protected operator work or after any key rotation:

```bash
cd frontend
npm run relay:check-secrets

cd ../contracts
npm run launch:check-key-posture -- --profile moonbase-staging
npm run launch:check-key-posture -- --profile moonbeam-pilot
```

`relay:check-secrets` validates the active frontend/service env for forbidden key
placement, relay metadata, storage posture, and on-chain signer/vault
alignment. `launch:check-key-posture` validates deployer/owner separation plus
metadata for launch-tooling keys against the checked-in launch profiles.

### Operator monitoring baseline

The repo now exposes:

```bash
curl http://127.0.0.1:3000/api/relay-health
curl 'http://127.0.0.1:3000/api/relay-health?strict=1'
```

Use the default path for uptime/read-plane health. Use `?strict=1` when a
monitor should treat degraded states as failures. The endpoint reports:

- relay posture (`disabled`, `ok`, `degraded`, `failed`)
- relay storage backend
- Paseo signer/vault preflight when the relay is enabled
- activity and portfolio read-path health
- recent relay incident counts for submitted, failed, and alert-delivery states

The canonical manual response guide for tx failure, rollback, paused routing,
and key compromise is now
`docs/project-management/AEGIS_705_RELEASE_SAFETY_RUNBOOKS.md`.
The recurring contracts / infra / dependency / incident maintenance cadence is
now `docs/project-management/AEGIS_903_MAINTENANCE_CHECKLIST.md`.

### Environment variables reference

| Variable | Where used | Required | Description |
|----------|-----------|----------|-------------|
| `NEXT_PUBLIC_AEGIS_ENV` | Frontend + API | Yes | Runtime selector: `paseo-beta` or `moonbase-staging` |
| `NEXT_PUBLIC_PASEO_RPC_URL` | Frontend + API | Paseo only | Paseo EVM RPC endpoint |
| `NEXT_PUBLIC_MOONBASE_RPC_URL` | Frontend + API | Moonbase staging only | Moonbase Alpha RPC endpoint |
| `NEXT_PUBLIC_AEGIS_VAULT_ADDRESS` | Frontend + API | Yes | Deployed vault address |
| `NEXT_PUBLIC_MOONBASE_STAGING_VAULT_ADDRESS` | Frontend + API | Moonbase staging only | Protected staging vault address override |
| `NEXT_PUBLIC_WPAS_ADDRESS` | Frontend | Paseo only | wPAS token address |
| `NEXT_PUBLIC_TEST_USDC_ADDRESS` | Frontend + API | Paseo only | test-USDC token address |
| `NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_ADDRESS` | Frontend + API | Moonbase staging only | Protected staging token address |
| `NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_SYMBOL` | Frontend | Moonbase staging only | Display symbol for the staging stable |
| `DEST_PARACHAIN_ID` | API | No | Destination parachain (default: 1000) |
| `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING` | Frontend + API | No | Enables the experimental routing UI; pass `--frontend-env ../frontend/.env.local` to `launch:verify` when you want the launch check to verify the real frontend flag |
| `AI_ORACLE_RELAY_ENABLED` | API only | No | Server-private gate for `POST /api/execute-route` |
| `AI_ORACLE_PRIVATE_KEY` | API only | Yes | Oracle wallet private key (server-side secret) |
| `AI_ORACLE_KEY_VERSION` | API/scripts only | Relay-enabled envs | Rotation label for the hosted oracle signer |
| `AI_ORACLE_KEY_ROTATED_AT` | API/scripts only | Relay-enabled envs | ISO-8601 rotation timestamp for the hosted oracle signer |
| `AI_ORACLE_RELAY_DATABASE_URL` | API only | No | Preferred Postgres-backed relay state store for hosted/operator deployments |
| `DATABASE_URL` | API only | No | Alternate Postgres URL if `AI_ORACLE_RELAY_DATABASE_URL` is not set |
| `AI_ORACLE_RELAY_ALLOW_FILE_STORE` | API only | No | Set `true` only for single-instance local prototype work |
| `AI_ORACLE_RELAY_ALERT_WEBHOOK_URL` | API only | No | Generic webhook sink for best-effort relay failure alerts |
| `AI_ORACLE_ALERT_WEBHOOK_AUTH_TOKEN` | API only | No | Optional bearer token added to the relay alert webhook request |
| `AI_ORACLE_ALERT_SOURCE` | API only | No | Optional source label included in alert payloads |
| `AI_ORACLE_ALERT_TIMEOUT_MS` | API only | No | Alert webhook timeout in milliseconds; defaults to 3000 |
| `AI_ORACLE_RELAY_ALERT_ENVIRONMENT` | API only | No | Optional environment label for alert payloads |
| `NEXT_PUBLIC_AEGIS_PRODUCT_INSTRUMENTATION_ENABLED` | Frontend + API | No | Enables first-party anonymous funnel instrumentation via `/api/instrumentation` |
| `OPENAI_API_KEY` | API only | No | Enables OpenAI risk scoring |
| `GEMINI_API_KEY` | API only | No | Enables Gemini risk scoring |
| `NEXT_PUBLIC_E2E_MOCK_WALLET` | Frontend | No | Set `true` for E2E tests |
| `RPC_URL` | Contract launch scripts | Protected launch only | Active Moonbase/Moonbeam RPC used by `launch:deploy`, `launch:prepare`, `launch:verify`, and `launch:prove` |
| `PRIVATE_KEY` | Contract launch scripts | Protected launch only | Deployer private key; must match `AEGIS_DEPLOYER_ADDRESS` for `launch:deploy` |
| `AEGIS_OWNER_ADDRESS` | Contract launch scripts | Protected launch only | Final launch-contract owner or multisig address |
| `AEGIS_DEPLOYER_ADDRESS` | Contract launch scripts | Protected launch only | Expected deployer address derived from `PRIVATE_KEY` |
| `AEGIS_VAULT_ADDRESS` | Contract launch scripts | After launch deploy | Deployed `AegisVaultLaunch` address used by `launch:prepare`, `launch:verify`, and `launch:prove` |
| `BOOTSTRAP_OWNER_PRIVATE_KEY` | Contract launch scripts | Execute-mode only | Transitional owner key used only when `launch:prepare --mode execute` is intentionally allowed |
| `PROOF_WALLET_PRIVATE_KEY` | Contract launch scripts | Launch proof only | Proof wallet used by `launch:prove` deposit/withdraw smoke flow |
| `MOONBASE_STAGING_TOKEN_ADDRESS` | Contract launch scripts + frontend | Moonbase staging only | Protected staging launch token address |
| `MOONBASE_STAGING_TOKEN_SYMBOL` | Contract launch scripts + frontend | Moonbase staging only | Protected staging launch token symbol |
| `DEPLOYER_KEY_VERSION` | Contract launch scripts | When `PRIVATE_KEY` is loaded | Rotation label required by `launch:check-key-posture` for the deployer key |
| `DEPLOYER_KEY_ROTATED_AT` | Contract launch scripts | When `PRIVATE_KEY` is loaded | ISO-8601 rotation timestamp required by `launch:check-key-posture` for the deployer key |
| `BOOTSTRAP_OWNER_KEY_VERSION` | Contract launch scripts | When bootstrap key is loaded | Rotation label required by `launch:check-key-posture` for the transitional owner key |
| `BOOTSTRAP_OWNER_KEY_ROTATED_AT` | Contract launch scripts | When bootstrap key is loaded | ISO-8601 rotation timestamp required by `launch:check-key-posture` for the transitional owner key |
| `PROOF_WALLET_KEY_VERSION` | Contract launch scripts | When proof key is loaded | Rotation label required by `launch:check-key-posture` for the proof wallet key |
| `PROOF_WALLET_KEY_ROTATED_AT` | Contract launch scripts | When proof key is loaded | ISO-8601 rotation timestamp required by `launch:check-key-posture` for the proof wallet key |

---

## 10. What Is Real vs. Simulated

Be honest about this when presenting the project.

| Feature | Status | Notes |
|---------|--------|-------|
| Smart contract | ✅ Real | Deployed on Paseo, enforces all rules on-chain |
| ERC-20 deposit / withdraw | ✅ Real | Real token transfers, real wallet signatures |
| Risk gate enforcement | ✅ Real | On-chain revert if score >= 75 |
| AI risk scoring (LLM) | 🟡 Optional | Works if `OPENAI_API_KEY` or `GEMINI_API_KEY` is set; keyword fallback otherwise |
| Experimental route submission | 🟡 Gated | Disabled by default; UI requires `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true`, server execution also requires `AI_ORACLE_RELAY_ENABLED=true` plus relay storage/signer config |
| On-chain route events | ✅ Real | Route-related events can be emitted when experimental routing is enabled |
| XCM cross-chain transfer | ⏳ Pending | Protected launch tooling keeps routing paused; the repo does not yet prove a live Moonbeam-safe XCM path |
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

### execute-route returns 503 "Experimental route relay is disabled"
The deployment is running with the server-side relay off. Set
`AI_ORACLE_RELAY_ENABLED=true` only for an explicit operator-controlled Paseo
deployment. `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true` only affects the UI.

### execute-route returns 503 "Durable relay storage is not configured"
Set `AI_ORACLE_RELAY_DATABASE_URL=postgresql://...` or `DATABASE_URL=postgresql://...`
for hosted/operator deployments. Only use `AI_ORACLE_RELAY_ALLOW_FILE_STORE=true`
for single-instance local prototype work.

### execute-route returns 501 "AI_ORACLE_PRIVATE_KEY not set"
Add `AI_ORACLE_PRIVATE_KEY=0x<key>` to `frontend/.env.local` or the hosted server
env and restart the app.

### execute-route returns `failed` with retry guidance or alert status
Inspect `failureCategory`, `retryDisposition`, `operatorAction`, and
`operatorAlertStatus` in the response body. The current relay adds guidance and
best-effort webhook alerting, but it does **not** run automatic retries or a
background job queue.

### VaultStats shows 0 for everything
The vault address in `.env.local` is wrong or the contract is the old version.
Re-run `npm run setup` and update `.env.local` with the new address.

### Wallet history does not show relay requests
This is expected. The wallet-history API is intentionally limited to recent
on-chain deposits and withdrawals. Private relay follow-up stays on the direct
route response and request-status path instead of the generic wallet-history
surface.

### Build fails with "Too many re-renders"
This was a pre-existing bug in `TransactionHistory.tsx` — fixed in this session.
Run `npm run build` again.

### Vercel build fails — framework not detected or wrong output directory
If Vercel can't find the Next.js framework or reports the output directory is wrong:

1. In the Vercel project dashboard → **General → Root Directory** → set to `frontend`.
   This is the preferred path. Vercel then uses `frontend/vercel.json` automatically.
2. If you cannot change the dashboard setting, the repo root `vercel.json` provides a safe
   fallback with explicit `installCommand`, `buildCommand`, `outputDirectory`, and security headers.
3. **Also** ensure `frontend/package-lock.json` pins the Linux native CSS packages (see next entry).

### Railway build fails with missing `lightningcss` or `@tailwindcss/oxide`
If Railway logs show `Cannot find native binding`, `lightningcss.linux-x64-gnu.node`,
or `@tailwindcss/oxide-linux-x64-gnu`, the Linux-native CSS toolchain packages
were not present in the frontend lockfile used by Railway.

Keep these entries in `frontend/package.json` under `optionalDependencies`:

- `lightningcss-linux-x64-gnu`
- `@tailwindcss/oxide-linux-x64-gnu`

Then regenerate `frontend/package-lock.json`, push, and redeploy. This is an npm
optional-dependency lockfile issue that can appear when dependency changes are
made on macOS and later deployed to Railway's Linux environment.

### Contract tests fail
Run `cd contracts && npm install` first. `npm test` is the passing prototype
regression suite, and `npm run gas` profiles the prototype route path
separately. Neither command is launch-contract approval evidence for the future
reduced-surface Moonbeam deployment.

### XCM routing reverts on-chain
Do not treat this as something to "fix" by pointing the vault at `address(0)`.
The current launch-safe posture is to keep routing paused, verify the bootstrap
state, and avoid using route execution as proof until the target-chain path is
adapted and verified. For protected environments, re-run:

```bash
cd contracts
npm run launch:verify -- --profile moonbeam-pilot --frontend-env ../frontend/.env.local
```

---

## 12. Roadmap and Next Steps

### Immediate (unblocked today)

- [ ] Run `npm run setup` to redeploy the current contract version
- [ ] Decide whether this deployment is public beta (`AI_ORACLE_RELAY_ENABLED=false`) or an operator-controlled relay workflow (`AI_ORACLE_RELAY_ENABLED=true`)
- [ ] Set `AI_ORACLE_PRIVATE_KEY` in `frontend/.env.local`
- [ ] Make your first real deposit in the vault-only beta
- [ ] Decide whether you actually need experimental routing enabled for a pilot environment
- [ ] Add `OPENAI_API_KEY` or `GEMINI_API_KEY` for real AI scoring

### Short term

- [ ] **Verify XCM precompile address** — monitor Polkadot Hub release notes for
  when the XCM precompile goes live on Paseo. When it does, call
  `vault.setXCMPrecompileAddress(realAddress)`.
- [ ] **Validate XCM encoding** — test `xcm-encoder.ts` output against the live
  precompile with a small amount. The encoding follows the spec but has not been
  validated against a real precompile call.
- [ ] **Deploy the public beta to Vercel** — push to GitHub, connect to Vercel, set env vars.
- [ ] **Deploy relay-enabled lower environments to Railway** — attach Postgres, set `AI_ORACLE_RELAY_ENABLED`, and keep the signer key server-side only.
- [ ] **Wire operator alert routing if needed** — set `AI_ORACLE_RELAY_ALERT_WEBHOOK_URL` plus optional auth/source envs for best-effort relay failure alerts.
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
