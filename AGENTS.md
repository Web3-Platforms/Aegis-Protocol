# Aegis Protocol — Agent Guide

This file is the authoritative reference for any AI agent working in this repository.
Read it before touching any file.

---

## Project Summary

Aegis Protocol is an intent-based, AI-gated cross-chain yield vault targeting the
Polkadot Hub / Paseo Testnet (chain ID `420420417`). The system has three layers:

1. **Smart contracts** (`contracts/`) — Solidity 0.8.20, Hardhat, OpenZeppelin v5.
2. **Frontend** (`frontend/`) — Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4, wagmi 3 / viem 2.
3. **AI risk oracle** (`frontend/app/api/risk-oracle/route.ts`) — Next.js API route that scores routing intents and returns `{ parachainId, riskScore, safeToRoute }`.

---

## Repository Layout

```
Aegis-Protocol/
├── contracts/
│   ├── contracts/
│   │   ├── AegisVault.sol          # Main vault contract
│   │   ├── MockERC20.sol           # Test token
│   │   ├── MockXCM.sol             # XCM precompile stub for tests
│   │   └── ReentrantERC20.sol      # Reentrancy attack fixture
│   ├── scripts/
│   │   └── deploy.js               # Hardhat deploy → deployments/<network>.json
│   ├── test/
│   │   ├── AegisVault.test.js      # Main unit suite (27 tests)
│   │   ├── AegisVault.gas.test.js  # Gas profiling
│   │   └── AegisVault.rebalance.test.js
│   └── hardhat.config.js
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Landing page
│   │   ├── vault/page.tsx          # Deposit / withdraw UI
│   │   ├── chat/page.tsx           # Intent chat UI
│   │   ├── activity/page.tsx       # Transaction history
│   │   └── api/risk-oracle/route.ts
│   ├── components/                 # React components (ChatInterface, DepositForm, …)
│   ├── lib/
│   │   ├── contracts.ts            # ABI + address resolution
│   │   ├── mockData.ts
│   │   ├── useVaultActivityData.ts
│   │   └── xcm-encoder.ts
│   ├── tests/e2e/
│   │   └── chat-cancel.spec.ts     # Playwright cancel-flow test
│   └── .env.example                # Required env vars with real Paseo addresses
└── AEGIS_INSTRUCTIONS.md           # Original hackathon execution prompt (read-only reference)
```

---

## Critical Constraints — Never Bypass

| Rule | Detail |
|------|--------|
| **No SELFDESTRUCT / PUSH0** | PolkaVM does not support these opcodes. |
| **Risk gate is ≥ 75, not > 75** | `AegisVault.sol` reverts when `aiRiskScore >= MAX_RISK_SCORE` (75). The oracle returns `safeToRoute: riskScore < 75`. Keep these consistent. |
| **AI oracle address is privileged** | Only `aiOracleAddress` may call `routeYieldViaXCM`. Never remove this check. |
| **XCM precompile address** | Default is `0x0000000000000000000000000000000000000801`. Overridable via `setXCMPrecompileAddress` (owner only). |
| **Chain ID** | Paseo Testnet = `420420417`. Do not hardcode other chain IDs in frontend config. |
| **No zero-address inputs** | Contract validates all address arguments. |

---

## Development Commands

### Contracts

```bash
cd contracts
npm install
npm test                        # Run all unit tests (Hardhat)
npm run coverage                # Solidity coverage report
npm run gas                     # Gas profiling (AegisVault.gas.test.js)
npm run compile                 # Compile only
npm run setup                   # Full deploy: vault + mock tokens + config (recommended)
npm run deploy                  # Vault only (use setup instead)
npm run mint                    # Mint test tokens to RECIPIENT wallet
npm run deploy                  # Deploy to Paseo (requires PRIVATE_KEY env var)
```

### Frontend

```bash
cd frontend
npm install
npx playwright install chromium  # First-time only
npm run dev                      # Dev server (default port 3000)
npm run build                    # Production build
npm run test:e2e                 # Playwright E2E suite
```

### Environment Setup

```bash
cp frontend/.env.example frontend/.env.local
# Edit .env.local with real Paseo addresses after deployment
```

Required env vars (see `.env.example` for current Paseo values):

```
NEXT_PUBLIC_PASEO_RPC_URL
NEXT_PUBLIC_AEGIS_VAULT_ADDRESS
NEXT_PUBLIC_WPAS_ADDRESS
NEXT_PUBLIC_TEST_USDC_ADDRESS
DEST_PARACHAIN_ID
AI_ORACLE_PRIVATE_KEY          # server-side only — never NEXT_PUBLIC_
OPENAI_API_KEY                 # optional — enables real LLM risk scoring
GEMINI_API_KEY                 # optional — alternative LLM provider
DESTINATION_VAULT_ADDRESS
DEST_PARACHAIN_ID
```

---

## Architecture Notes

### Risk Oracle Flow

```
User intent (text)
  → POST /api/risk-oracle  { intent }
  ← { parachainId, riskScore, safeToRoute, scoringMethod }
  ← { parachainId, riskScore, safeToRoute }
  → UI shows risk score
  → if safeToRoute: show "Confirm Transaction" button
  → wagmi write → AegisVault.routeYieldViaXCM(...)
  → contract checks aiRiskScore < 75, else reverts
```

The oracle tries LLM providers in order: OpenAI → Gemini → keyword fallback.
Set `OPENAI_API_KEY` or `GEMINI_API_KEY` in `.env.local` to enable real scoring.
The response shape `{ parachainId, riskScore, safeToRoute, scoringMethod }` must
not change — the frontend and execute-route API both depend on it.

### XCM Precompile Status

The XCM precompile at `0x0000000000000000000000000000000000000801` does **not**
exist on Paseo's EVM layer. `setup-paseo.js` sets `xcmPrecompileAddress` to
`address(0)` so `routeYieldViaXCM` calls succeed as a no-op. When Polkadot Hub
ships the precompile, call `vault.setXCMPrecompileAddress(realAddr)` from the
owner wallet.

### Deployed Contract Version

The contract at `0x2BEf17e09b6F9a589d284f62F74281f0580969B3` is an **outdated
version** (2982 bytes vs 8782 bytes in current source). Always run `npm run setup`
to deploy the current version before testing real transactions.
The oracle currently uses keyword matching (no external LLM call). Any LLM
integration must keep the response shape identical.

### Contract Access Control

- `owner` — can add supported tokens, set oracle address, set XCM precompile, set route caps, pause XCM routing.
- `aiOracleAddress` — the only address that can call `routeYieldViaXCM`.
- Users — can `deposit` and `withdraw` supported tokens.

### Token Support

MVP supports two tokens: `wPAS` (decimals 10) and `test-USDC` (decimals 6).
Addresses are resolved from env vars with zero-address fallbacks for local UI dev.

---

## Testing Conventions

- Contract tests use Hardhat + Chai. All tests must pass before any contract PR.
- The Playwright suite (`chat-cancel.spec.ts`) verifies the cancel path does not
  emit `eth_sendTransaction`. Add new E2E specs to `frontend/tests/e2e/`.
- Use `deployFixture()` in contract tests — it deploys MockXCM and wires it as
  the XCM precompile so tests never hit a real precompile.

---

## Code Style

- **Solidity**: NatDoc comments on public functions and events. Custom errors (not
  `require` strings). `SafeERC20` for all token transfers.
- **TypeScript**: Strict mode. No `any` except where wagmi chain config requires it.
  Resolve contract addresses through `resolveAddress()` in `lib/contracts.ts`.
- **React**: App Router only. No Pages Router patterns. Client components are
  explicitly marked `"use client"`.
- **CSS**: Tailwind utility classes. Custom design tokens live in `globals.css`.
  Class names use the `aegis-*` prefix for layout primitives.

---

## Key Files Added in This Session

| File | Purpose |
|------|---------|
| `contracts/scripts/setup-paseo.js` | Full deploy: vault + tokens + config. Use instead of `deploy.js`. |
| `contracts/scripts/mint-tokens.js` | Mint test tokens to a wallet after setup. |
| `GUIDE.md` | Complete project guide — read this before asking questions. |

## What Agents Should Not Do

- Do not commit `contracts/.env.local` or any file containing `PRIVATE_KEY`.
- Do not change `MAX_RISK_SCORE` in the contract without updating the oracle and
  all tests that assert the threshold.
- Do not add new npm dependencies without checking `package.json` first.
- Do not create new top-level markdown files for documentation — update existing
  docs or add inline comments instead.
- Do not run `npm run deploy` unless explicitly asked; it costs testnet gas.
- Do not modify `AEGIS_INSTRUCTIONS.md` — it is a read-only historical reference.
- Do not add `frontend-skills/` or `web3-skills/` content to the application;
  those directories are learning references, not application code.
