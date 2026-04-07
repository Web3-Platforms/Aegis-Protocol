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

## Project Ownership Protocol

This repository supports a long-running project-owner workflow for moving Aegis from prototype to real operations and revenue.

### Trigger: `Init`

When the user asks to initialize the project owner:

1. Review `AGENTS.md`, `README.md`, `GUIDE.md`, `AEGIS_MVP_SCOPE_STATEMENT.md`, `AEGIS_MVP_PRODUCTION_REPORT.md`, `AEGIS_TECHNICAL_DELIVERY_ROADMAP.md`, package manifests, workflows, and key runtime code.
2. Create or refresh the active session `plan.md`.
3. Ensure the local project-management workspace exists under `docs/project-management/`.
4. Ensure these artifacts exist and are current:
   - `OPERATING_MODEL.md`
   - `AEGIS_PROJECT_WORKBOOK.md`
   - `PROJECT_MANAGEMENT.xlsx`
5. Seed or refresh structured todos and dependencies from the workbook.

### Trigger: `Take the ownership`

When the user says `Take the ownership`, act as the project owner until blocked or the project is complete.

Follow this loop for every meaningful slice of work:

1. Think
2. Plan
3. Organize
4. Implement
5. Review
6. Report
7. Document
8. Maintain

#### Ownership rules

- Optimize for a real-world, revenue-capable product, not demo breadth.
- Query ready todos first and advance the highest-value ready work.
- Keep `docs/project-management/AEGIS_PROJECT_WORKBOOK.md` as the editable source of truth.
- Keep `docs/project-management/PROJECT_MANAGEMENT.xlsx` synchronized with `.github/scripts/sync_project_management_xlsx.py`.
- Update the session `plan.md`, workbook status, weekly update section, and related guides after meaningful progress.
- Continue autonomously unless blocked by a strategic business, legal, security, or product decision that only the user can make.
- Keep project-management files in `docs/`, which is intentionally gitignored for local operating use.

---

## Repository Layout

```
Aegis-Protocol/
├── contracts/
│   ├── contracts/
│   │   ├── AegisVault.sol          # Prototype vault with route/rebalance surfaces
│   │   ├── AegisVaultLaunch.sol    # Reduced-surface launch contract
│   │   ├── MockERC20.sol           # Test token
│   │   ├── MockXCM.sol             # XCM precompile stub for tests
│   │   └── ReentrantERC20.sol      # Reentrancy attack fixture
│   ├── .env.example                # Contract-side launch/proof env template
│   ├── scripts/
│   │   ├── deploy.js               # Hardhat deploy → deployments/<network>.json
│   │   └── launch/deploy-launch-contract.js # Profile-driven AegisVaultLaunch deploy
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
| **Prototype AI oracle address is privileged** | Only `aiOracleAddress` may call `routeYieldViaXCM` on `AegisVault.sol`. Never remove this check from the prototype contract. |
| **Prototype XCM precompile address** | `AegisVault.sol` defaults to `0x0000000000000000000000000000000000000801` and can override it via `setXCMPrecompileAddress` (owner only). |
| **Chain ID** | Paseo Testnet = `420420417`. Do not hardcode other chain IDs in frontend config. |
| **No zero-address inputs** | Contract validates all address arguments. |

---

## Development Commands

### Contracts

```bash
cd contracts
npm install
npm test                        # Default prototype regression suite
npm run test:launch             # Reduced-surface launch-contract suite
npm run coverage                # Solidity coverage report
npm run gas                     # Prototype gas profile
npm run compile                 # Compile only
npm run launch:check            # Static launch-profile validation used by CI
npm run launch:deploy -- --profile moonbase-staging
npm run launch:check-key-posture -- --profile moonbase-staging
npm run launch:check-key-posture -- --profile moonbeam-pilot
npm run setup                   # Full deploy: vault + mock tokens + config (recommended)
npm run deploy                  # Vault only (use setup instead)
npm run mint                    # Mint test tokens to RECIPIENT wallet
npm run deploy                  # Deploy to Paseo (requires PRIVATE_KEY env var)
```

`npm test` runs the passing prototype regression suite
(`AegisVault.test.js` + `AegisVault.rebalance.test.js`). `npm run test:launch`
runs the reduced-surface `AegisVaultLaunch` suite. Use `npm run gas` for the
separate prototype gas profile; live launch approval still requires
`launch:verify` and `launch:prove` against a deployed `AegisVaultLaunch`.

### Frontend

```bash
cd frontend
npm install
npx playwright install chromium  # First-time only
npm run dev                      # Dev server (default port 3000)
npm run build                    # Production build
npm run test:e2e                 # Playwright E2E suite
npm run test:e2e:ci              # CI-oriented Playwright config (separate build/start on port 3110)
npm run relay:check-secrets      # Relay secret posture / hosted-env validation
```

### Environment Setup

```bash
cp contracts/.env.example contracts/.env.local
cp frontend/.env.example frontend/.env.local
# Edit the contract env with protected launch values and the frontend env with the
# active runtime addresses after deployment.
```

Required env vars (see `.env.example` for current Paseo values):

```
NEXT_PUBLIC_PASEO_RPC_URL
NEXT_PUBLIC_AEGIS_VAULT_ADDRESS
NEXT_PUBLIC_WPAS_ADDRESS
NEXT_PUBLIC_TEST_USDC_ADDRESS
DEST_PARACHAIN_ID
AI_ORACLE_RELAY_ENABLED       # server-private gate for POST /api/execute-route
AI_ORACLE_PRIVATE_KEY          # server-side only — never NEXT_PUBLIC_
AI_ORACLE_KEY_VERSION          # relay signer metadata for operator validation
AI_ORACLE_KEY_ROTATED_AT       # relay signer rotation timestamp (ISO-8601)
AI_ORACLE_RELAY_DATABASE_URL  # preferred hosted relay database URL
DATABASE_URL                  # alternate hosted relay database URL
AEGIS_LAUNCH_KPI_DASHBOARD_AUTH_TOKEN  # bearer token for GET /api/launch-kpi
OPENAI_API_KEY                 # optional — enables real LLM risk scoring
GEMINI_API_KEY                 # optional — alternative LLM provider
DESTINATION_VAULT_ADDRESS
DEST_PARACHAIN_ID
```

`NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING` is UI-only. `AI_ORACLE_RELAY_ENABLED`
is the server-private gate for `POST /api/execute-route`. Hosted relay execution
is pinned to Paseo and expects Postgres-backed storage plus a dedicated signer
key that matches the vault's on-chain `aiOracleAddress`. Do not put
`PRIVATE_KEY`, `BOOTSTRAP_OWNER_PRIVATE_KEY`, or `PROOF_WALLET_PRIVATE_KEY` in
the frontend/Railway service env.

---

## Architecture Notes

### Risk Oracle Flow

```
User intent (text)
  → POST /api/risk-oracle  { intent }
  ← { parachainId, riskScore, safeToRoute, scoringMethod }
  ← { parachainId, riskScore, safeToRoute }
  → UI shows risk score
  → if safeToRoute and route eligibility is truthful for the current wallet/runtime: show "Confirm Transaction" button
  → wagmi write → AegisVault.routeYieldViaXCM(...)
  → contract checks aiRiskScore < 75, else reverts
```

The oracle tries LLM providers in order: OpenAI → Gemini → keyword fallback.
Set `OPENAI_API_KEY` or `GEMINI_API_KEY` in `.env.local` to enable real scoring.
The response shape `{ parachainId, riskScore, safeToRoute, scoringMethod }` must
not change — the frontend and execute-route API both depend on it.

`frontend/components/ChatInterface.tsx` and
`frontend/components/XcmRoutePanel.tsx` now gate the experimental submit CTA on
current-wallet-scoped portfolio truth: correct runtime, non-zero deposited route
balance, no active tracked request, no undismissed latest failed request, and a
healthy `/api/portfolio` snapshot. Preserve that behavior when changing routing
UX.

### XCM Precompile Status

The contract defaults `xcmPrecompileAddress` to
`0x0000000000000000000000000000000000000801`, and the current code rejects
`address(0)` as an override. On Paseo, keep routing disabled or paused until
the target precompile/runtime path is proven. When the supported precompile is
available, call `vault.setXCMPrecompileAddress(realAddr)` from the owner wallet.

### Deployed Contract Version

The contract at `0x2BEf17e09b6F9a589d284f62F74281f0580969B3` is an **outdated
version** (2982 bytes vs 8782 bytes in current source). Always run `npm run setup`
to deploy the current version before testing real transactions.
The oracle currently uses keyword matching (no external LLM call). Any LLM
integration must keep the response shape identical.

### Contract Access Control

- **Prototype `AegisVault` owner** — can add supported tokens, set oracle/XCM config, set route caps, pause routing/rebalancing, and transfer ownership.
- **Prototype `aiOracleAddress`** — the only address that can call `routeYieldViaXCM`.
- **Launch `AegisVaultLaunch` owner** — can pause/unpause deposits, pause/unpause withdrawals, and transfer ownership.
- **Users** — can `deposit` and `withdraw` supported tokens on whichever contract surface is deployed for that environment.

### Token Support

MVP supports two tokens: `wPAS` (decimals 10) and `test-USDC` (decimals 6).
Addresses are resolved from env vars with zero-address fallbacks for local UI dev.

---

## Testing Conventions

- Contract tests use Hardhat + Chai. All tests must pass before any contract PR.
- The Playwright suite verifies the chat cancel path plus truthful unavailable
  and route-eligibility states. Add new E2E specs to `frontend/tests/e2e/` when
  changing route CTA truthfulness.
- Use `deployFixture()` in contract tests — it deploys MockXCM and wires it as
  the XCM precompile so tests never hit a real precompile.
- `npm run launch:deploy -- --profile <profile>` is the canonical repo-owned
  deployment path for `AegisVaultLaunch`; it writes `contracts/deployments/<profile>.json`
  and still requires protected-env values before `launch:verify` / `launch:prove`.

---

## Code Style

- **Solidity**: NatDoc comments on public functions and events. Custom errors (not
  `require` strings). `SafeERC20` for all token transfers.
- **TypeScript**: Strict mode. No `any` except where wagmi chain config requires it.
  Resolve contract addresses through `resolveAddress()` in `lib/contracts.ts`.
- `frontend/app/api/relay-health/route.ts` is the current operator monitoring endpoint. It reports relay posture plus activity/portfolio read health and supports `?strict=1` for degraded-as-failure monitoring.
- `frontend/app/api/instrumentation/route.ts` plus `docs/project-management/AEGIS_605_PRODUCT_INSTRUMENTATION.md` are the canonical first-party product instrumentation layer; keep it anonymous, Postgres-backed, same-origin session-bound, and limited to directional pre-chain funnel visibility.
- `frontend/app/api/launch-kpi/route.ts` plus `docs/project-management/AEGIS_902_LAUNCH_KPI_DASHBOARD.md` are the canonical internal dashboard surface; keep it token-gated, internal-only, and limited to repo-owned signals, with product-event counts framed as directional client-reported interest rather than CRM or revenue proof.
- `docs/project-management/AEGIS_705_RELEASE_SAFETY_RUNBOOKS.md` is the canonical manual source for tx failure, rollback, paused routing, and key-compromise response on the current lower-environment operator path.
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
