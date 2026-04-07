# Aegis Protocol

Aegis Protocol is a pilot-first, vault-only beta with a public Paseo surface and a protected Moonbase staging runtime. Today the product supports wallet connection plus supported vault deposit and withdraw flows. Cross-chain routed strategies, AI-assisted route execution, and production-safe XCM routing remain experimental evaluation paths and are not live launch features.

## What This Repository Contains

- `contracts/`: Solidity contracts, Hardhat tests, coverage, gas profiling, plus demo and launch-bootstrap scripts.
- `frontend/`: Next.js app for beta vault actions, activity visibility, and experimental routing evaluation.
- `frontend/app/api/risk-oracle/route.ts`: local risk-oracle endpoint used by the chat UI to classify routing intent.

## Current Launch Mode

**Aegis is currently a pilot-first, vault-only beta on Paseo Testnet, with protected Moonbase Alpha staging wiring now available for internal and partner-preview environments.** Users can connect a wallet and use supported vault deposit/withdraw flows. Routing assessment, route submission, and XCM-related workflows remain experimental beta tools and should not be marketed as live cross-chain yield execution.

Experimental route submission now has two separate controls:

- `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true` exposes the experimental routing UI.
- `AI_ORACLE_RELAY_ENABLED=true` enables server-side `POST /api/execute-route`.
- Experimental status refreshes now require both the issued `requestId` and the matching wallet `userAddress`.

When that workflow is enabled, the submit CTA only unlocks for the currently
connected wallet after the active runtime matches, the deposited route-asset
balance is non-zero, no tracked request is still open, the most recent failed
request has been reviewed/dismissed, and the scoped portfolio snapshot is
healthy.

Keep both disabled for the default public beta posture.

Before protected operator work, validate the active secret posture with
`npm run relay:check-secrets` and `npm run launch:check-key-posture -- --profile <profile>`.

Protected staging setup now lives in
`docs/project-management/AEGIS_701_STAGING_ENVIRONMENT.md`.

## Core Capabilities

- Vault operations: users can deposit and withdraw supported ERC20 assets.
- Risk assessment beta: intents can be scored before an experimental route submission is offered.
- Experimental XCM path: the vault exposes a `routeYieldViaXCM` path, but the truthful launch posture keeps routing paused and experimental routing opt-in disabled by default.
- Recent route tracking: when experimental routing is enabled, chat and vault routing surfaces show recent request lifecycle states plus source-chain proof links scoped to the current wallet, and they block new submissions when wallet/runtime/deposit/request truth says the route is not actionable yet.
- Browser-level verification: Playwright covers the chat cancel flow plus unavailable-state behavior for activity, history, and routing surfaces.
- Operator key posture checks: relay and launch tooling now have repo-owned commands for signer separation, metadata, and hosted-env secret placement.
- Operator health baseline: `GET /api/relay-health` reports relay posture, read-path health, and recent relay incident counts for the current deployment.
- Operator release-safety runbooks: the repo now carries a canonical lower-environment manual response pack for tx failure, rollback, paused routing, and key compromise.
- Product instrumentation baseline: `/api/instrumentation` now records anonymous same-origin client-reported pre-chain funnel events to Postgres when explicitly enabled.
- Internal launch KPI dashboard: `GET /api/launch-kpi` is token-gated and summarizes bounded funnel, relay, and beta-activity signals for operator review; the funnel section is directional product-interest data, not CRM or anti-fraud proof.

## Architecture

### Text-Based Diagram

```text
User + Wallet
   |
   | enter vault action or describe an experimental routing intent
   v
Next.js Frontend (frontend/)
   |
   | chat intent
   v
AI Intent Layer
frontend/app/api/risk-oracle/route.ts
   |
   | returns { parachainId, riskScore, safeToRoute }
   v
Beta Risk Assessment UI
   |
   | prototype threshold if riskScore < 75
   v
wagmi + viem transaction client
   |
   | optional experimental testnet submission
   v
AegisVault.sol
Paseo Testnet / Polkadot Hub EVM endpoint
chainId 420420417
   |
   | routeYieldViaXCM(destParachainId, amount, aiRiskScore)
   v
Polkadot XCM precompile
0x0000000000000000000000000000000000000801
   |
   | current Paseo beta setup keeps this as a no-op handoff
   v
Experimental / future target route
Asset Hub / Acala / Astar / Moonbeam / others
```

### How The Layers Work Together

1. A user connects a wallet and either interacts with the vault UI or submits a natural-language routing intent for beta assessment.
2. The frontend sends the chat intent to the local AI intent layer at `frontend/app/api/risk-oracle/route.ts`.
3. The intent layer maps the destination parachain and returns a risk score.
4. If the score is below the `MAX_RISK_SCORE` threshold of `75`, the UI can present an experimental testnet submission step.
5. On-chain routing is exposed through `AegisVault.routeYieldViaXCM(...)`, which is restricted to the configured AI oracle address.
6. The contract defaults to the Polkadot XCM precompile address `0x0000000000000000000000000000000000000801`, but the current protected-launch tooling uses the reduced-surface `AegisVaultLaunch` path and verifies owner/launch-token/pause-state invariants instead of treating a no-op XCM story as launch proof.

## Stack

- Smart contracts: Solidity `0.8.20`, Hardhat, OpenZeppelin
- Frontend: Next.js `16`, React `19`, TypeScript `5`, Tailwind `4`
- Web3 client: wagmi, viem
- Test tooling: Hardhat, `solidity-coverage`, `hardhat-gas-reporter`, Playwright
- Active runtimes: Paseo Testnet public beta (`420420417`) and Moonbase Alpha protected staging (`1287`)

## Local Setup In Under 15 Minutes

### Prerequisites

- Node.js `20+`
- npm `10+`
- Git

### 1. Clone The Repository

```bash
git clone <repo-url>
cd Aegis-Protocol
```

### 2. Install Contract Dependencies

```bash
cd contracts
npm install
cd ..
```

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
npx playwright install chromium
cd ..
```

### 4. Create Local Frontend Environment

```bash
cp frontend/.env.example frontend/.env.local
```

The default values boot the public `paseo-beta` runtime for local UI development. For protected staging, switch `NEXT_PUBLIC_AEGIS_ENV=moonbase-staging` and follow `docs/project-management/AEGIS_701_STAGING_ENVIRONMENT.md`.

### 5. Start The Frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

### 6. Run Contract Tests In A Second Terminal

```bash
cd contracts
npm test
npm run test:launch
npm run gas   # optional prototype gas profile
```

### 7. Run Frontend Verification

Production build:

```bash
cd frontend
npm run build
```

Playwright end-to-end suite:

```bash
cd frontend
npm run test:e2e
npm run test:e2e:ci   # CI-oriented config; expects a separate build and uses port 3110
```

The current Playwright suite verifies the chat cancellation path, truthful unavailable-state behavior for activity/history/routing surfaces, and the main route-eligibility blockers for missing deposits, portfolio failures, failed-request review, and duplicate-submit prevention.

## Quality Checks

### Contracts

```bash
cd contracts
npm test
npm run test:launch
npm run gas
npm run coverage
npm run launch:check
```

`npm test` runs the current passing prototype regression suite
(`AegisVault.test.js` + `AegisVault.rebalance.test.js`). `npm run test:launch`
runs the reduced-surface `AegisVaultLaunch` suite. `npm run gas` profiles the
prototype route path separately; it is not launch approval evidence. `npm run
launch:check` statically validates the checked-in launch profiles and
forbidden-field guardrails used by the CI gate.

### Frontend

```bash
cd frontend
npm run build
npm run test:e2e
npm run test:e2e:ci
```

## Repository Layout

```text
Aegis-Protocol/
├── config/
│   └── launch/
│       ├── moonbase-staging.json
│       └── moonbeam-pilot.json
├── contracts/
│   ├── contracts/AegisVault.sol
│   ├── contracts/AegisVaultLaunch.sol
│   ├── scripts/deploy.js
│   ├── scripts/launch/
│   └── test/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/contracts.ts
│   ├── playwright.config.ts
│   ├── playwright.ci.config.ts
│   └── tests/e2e/*.spec.ts
└── README.md
```

## Paseo Testnet Contract Addresses

The repository includes committed testnet deployment metadata in `contracts/deployments/paseo.json` and example frontend wiring in `frontend/.env.example`. Treat these as beta references, not proof of a production launch.

| Contract / Dependency | Address | Status |
| --- | --- | --- |
| AegisVault | `0x2BEf17e09b6F9a589d284f62F74281f0580969B3` | Committed testnet deployment metadata in `contracts/deployments/paseo.json` |
| wPAS | `0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa` | Default frontend example value in `frontend/.env.example` |
| test-USDC | `0x8D8b3Eeb22501a37c02c676C25A0F8a9949d0319` | Default frontend example value in `frontend/.env.example` |
| Destination vault | `0x9a23A24B7F16d82C75E613bC1ebE9dBEf228d4E6` | Default execute-route destination in `frontend/.env.example` |
| Polkadot XCM precompile | `0x0000000000000000000000000000000000000801` | Contract default; protected launch profiles keep routing paused instead of claiming a no-op XCM path |

Frontend env keys used for Paseo wiring:

```bash
NEXT_PUBLIC_AEGIS_ENV=paseo-beta
NEXT_PUBLIC_AEGIS_VAULT_ADDRESS=0x...
NEXT_PUBLIC_WPAS_ADDRESS=0x...
NEXT_PUBLIC_TEST_USDC_ADDRESS=0x...
DESTINATION_VAULT_ADDRESS=0x...
DEST_PARACHAIN_ID=1000
NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=false
AI_ORACLE_RELAY_ENABLED=false
NEXT_PUBLIC_PASEO_RPC_URL=https://eth-rpc-testnet.polkadot.io
AI_ORACLE_PRIVATE_KEY=0x...
# AEGIS_LAUNCH_KPI_DASHBOARD_AUTH_TOKEN=<strong-random-token>
# AI_ORACLE_KEY_VERSION=oracle-paseo-001
# AI_ORACLE_KEY_ROTATED_AT=2026-04-06T00:00:00Z
# AI_ORACLE_RELAY_DATABASE_URL=postgresql://...
# Do not put PRIVATE_KEY, BOOTSTRAP_OWNER_PRIVATE_KEY, or PROOF_WALLET_PRIVATE_KEY in the frontend/Railway service env.
# AI_ORACLE_RELAY_ALERT_WEBHOOK_URL=https://...
# AI_ORACLE_ALERT_WEBHOOK_AUTH_TOKEN=<optional-bearer-token>
# AI_ORACLE_ALERT_SOURCE=aegis-paseo-relay
# AI_ORACLE_ALERT_TIMEOUT_MS=3000
# AI_ORACLE_RELAY_ALERT_ENVIRONMENT=railway-staging
```

Protected Moonbase staging wiring swaps in:

```bash
NEXT_PUBLIC_AEGIS_ENV=moonbase-staging
NEXT_PUBLIC_MOONBASE_RPC_URL=https://rpc.api.moonbase.moonbeam.network
NEXT_PUBLIC_MOONBASE_STAGING_VAULT_ADDRESS=0x...
NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_SYMBOL=mUSDC
NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=false
AI_ORACLE_RELAY_ENABLED=false
```

## Deployment Notes

- Contract deployment command: `cd contracts && npm run deploy`
- Contract launch env template: `cd contracts && cp .env.example .env.local`
- Launch contract deployment command: `cd contracts && npm run launch:deploy -- --profile moonbase-staging`
- Launch config gate command: `cd contracts && npm run launch:check`
- Launch key posture gate commands: `cd contracts && npm run launch:check-key-posture -- --profile moonbase-staging` and `cd contracts && npm run launch:check-key-posture -- --profile moonbeam-pilot`
- Launch bootstrap plan command: `cd contracts && npm run launch:prepare -- --profile moonbase-staging --mode plan`
- Execute the emitted owner/multisig actions before verification/proof
- Launch bootstrap verification command: `cd contracts && npm run launch:verify -- --profile moonbase-staging --frontend-env ../frontend/.env.local`
- Launch deposit/withdraw proof command: `cd contracts && npm run launch:prove -- --profile moonbase-staging`
- Frontend production build command: `cd frontend && npm run build`
- CI-oriented frontend E2E command: `cd frontend && npm run test:e2e:ci`
- Relay secret posture command: `cd frontend && npm run relay:check-secrets`
- Relay health endpoint: `curl http://127.0.0.1:3000/api/relay-health` (append `?strict=1` for degraded-as-failure mode)
- Vercel runtime config lives in `frontend/vercel.json`
- Relay POST execution now requires `AI_ORACLE_RELAY_ENABLED=true`, a signer key via `AI_ORACLE_PRIVATE_KEY`, and Postgres-backed storage via `AI_ORACLE_RELAY_DATABASE_URL` or `DATABASE_URL` for hosted deployments.
- The relay preflights the configured signer against the vault's on-chain `aiOracleAddress` and is pinned to Paseo only.
- Relay failures now return structured `failureCategory`, `retryDisposition`, `operatorAction`, and `operatorAlertStatus` fields; a generic webhook can be configured with `AI_ORACLE_RELAY_ALERT_WEBHOOK_URL` for best-effort operator alerts.
- `/api/relay-health` returns `disabled`, `ok`, `degraded`, or `failed` and also checks the activity/portfolio read plane so operators can distinguish a deliberately disabled relay from a broken deployment.
- `NEXT_PUBLIC_AEGIS_PRODUCT_INSTRUMENTATION_ENABLED=true` enables first-party anonymous funnel instrumentation backed by `DATABASE_URL` or `AI_ORACLE_RELAY_DATABASE_URL`; it is not a route-success source of truth.
- `frontend/app/api/portfolio/route.ts` and `frontend/app/api/history/route.ts` now back the vault stats/history surfaces. The portfolio API is a supported-asset snapshot only, and the wallet-history API intentionally stays limited to recent on-chain deposit/withdraw data.
- Railway-managed secrets plus Railway Postgres are acceptable for current Paseo operator relay deployments when the relay uses a dedicated oracle-only signer plus rotation metadata. The hosted relay remains Paseo-only today, and that posture is not sufficient custody for a Moonbeam paid pilot.
- Canonical protected-launch inputs now live under `config/launch/*.json`; use those profiles instead of treating `setup-paseo.js` or committed Paseo metadata as a mainnet bootstrap path.
- `contracts/.env.example` is now the contract-side starting point for protected launch deploy and proof commands, including the rotation metadata expected by `launch:check-key-posture`; verify the real frontend routing flag with `--frontend-env ../frontend/.env.local` instead of duplicating that flag in the contracts env.
