# Aegis Protocol Copilot Instructions

Start with these repo docs before making cross-cutting changes:

- `AGENTS.md` as the current repo-level agent guide.
- `GUIDE.md` for the updated project walkthrough and deployment/testing notes.
- `README.md` for the current quickstart, architecture diagram, and command surface.
- `AEGIS_INSTRUCTIONS.md` for the original product constraints: Polkadot/XCM framing, AI-gated routing, and the rule to avoid `SELFDESTRUCT` and `PUSH0`.
- `AEGIS_MVP_PRODUCTION_REPORT.md` before treating routing, AI scoring, or analytics paths as production-ready.

## Ownership mode

When the user says `Init`, initialize the project-owner operating system for this repo:

- review `AGENTS.md`, `README.md`, `GUIDE.md`, `AEGIS_MVP_SCOPE_STATEMENT.md`, `AEGIS_MVP_PRODUCTION_REPORT.md`, `AEGIS_TECHNICAL_DELIVERY_ROADMAP.md`, relevant workflow files, and any existing `docs/project-management/*` files;
- create or refresh the active session `plan.md`;
- ensure `docs/project-management/OPERATING_MODEL.md`, `docs/project-management/AEGIS_PROJECT_WORKBOOK.md`, and `docs/project-management/PROJECT_MANAGEMENT.xlsx` exist;
- sync SQL todos/dependencies from the workbook and identify the highest-value ready work.

When the user says `Take the ownership`, switch from ticket mode to owner mode:

- run the loop `Think -> Plan -> Organize -> Implement -> Review -> Report -> Document -> Maintain`;
- treat `docs/project-management/AEGIS_PROJECT_WORKBOOK.md` as the editable roadmap source of truth;
- keep `docs/project-management/PROJECT_MANAGEMENT.xlsx` synchronized by running `.github/scripts/sync_project_management_xlsx.py` after meaningful workbook updates;
- keep working autonomously on the highest-value ready item until blocked by a real business, product, legal, or security decision that requires the user.

## Build, test, and lint commands

This repository is split into two separate Node projects: `contracts/` and `frontend/`.

### `contracts/`

- `cd contracts && npm run compile`
- `cd contracts && npm test`
- `cd contracts && npx hardhat test test/AegisVault.test.js`
- `cd contracts && npx hardhat test test/AegisVault.rebalance.test.js`
- `cd contracts && npm run gas`
- `cd contracts && npm run coverage`
- `cd contracts && npm run setup`
- `cd contracts && npm run mint`
- `cd contracts && npm run deploy`

`npm test` now runs the passing prototype regression suite (`test/AegisVault.test.js` + `test/AegisVault.rebalance.test.js`). Use `npm run gas` for the separate prototype gas profile; launch gating remains reserved for the future reduced-surface vault-only contract plus `launch:verify` and `launch:prove`.

### `frontend/`

- `cd frontend && npm run dev`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd frontend && npm run test:e2e`
- `cd frontend && npx playwright test tests/e2e/chat-cancel.spec.ts`

Playwright uses `frontend/playwright.config.ts` to boot `next start` on port `3010`, so run a fresh build before e2e if `.next` may be stale or missing.

Frontend linting is checked in via `frontend/eslint.config.mjs` and `npm run lint`.

## High-level architecture

- `contracts/contracts/AegisVault.sol` is the core vault. It handles ERC20 deposits and withdrawals, exposes `routeYieldViaXCM(...)`, gates routing with `onlyAIOracle`, enforces `MAX_RISK_SCORE = 75`, and hands off to the Polkadot XCM precompile at `0x0000000000000000000000000000000000000801`. Rebalancing logic lives in the same contract.
- `frontend/` is a Next.js App Router app with the main user surfaces at `/vault`, `/chat`, and `/activity`. `frontend/app/layout.tsx` wraps the app in `Web3Provider` and `Navbar`.
- The experimental route path is `frontend/components/ChatInterface.tsx` or `frontend/components/XcmRoutePanel.tsx` -> `POST /api/risk-oracle` -> safe response shows confirm UI -> `POST /api/execute-route`.
- `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING` only controls whether the UI exposes experimental routing.
- Server-side route execution requires `AI_ORACLE_RELAY_ENABLED=true` plus `AI_ORACLE_PRIVATE_KEY`.
- Activity data is now server-owned, not direct client log scanning. `frontend/lib/useVaultActivityData.ts` fetches `/api/activity`, which is backed by `frontend/lib/server/activity-indexer.ts`.
- XCM payload building is centralized in `frontend/lib/xcm-encoder.ts`; `frontend/app/api/execute-route/route.ts` depends on that helper instead of hand-encoding bytes inline.

## Key conventions

- Keep the risk gate aligned everywhere. The contract is the source of truth: routing must use `aiRiskScore < 75`. Update the contract, API routes, UI copy, and tests together if that threshold ever changes.
- Preserve the current MVP scope unless the task explicitly expands it. The destination parachain defaults to Asset Hub (`DEST_PARACHAIN_ID` default `1000`), and `frontend/app/api/risk-oracle/route.ts` is still a keyword-based stub, not a real model integration.
- Keep project-management artifacts under `docs/project-management/`. The `docs/` workspace is intentionally gitignored for local operating use.
- `frontend/lib/contracts.ts` is manually maintained. It contains the ABI used by wagmi/viem and the frontend contract addresses. If contract functions or events change, update that file and any dependent event parsing in `frontend/lib/useVaultActivityData.ts`.
- Frontend addresses are resolved through `resolveAddress()` and intentionally fall back to the zero address for local UI boot. Preserve that pattern instead of assuming `NEXT_PUBLIC_*` variables are always set.
- Supported frontend tokens are defined once in `frontend/lib/contracts.ts`; today that means `wPAS` (10 decimals) and `USDC` (6 decimals). Reuse that list instead of duplicating token metadata in components.
- The Paseo chain config is duplicated in `frontend/components/Web3Provider.tsx` and `frontend/app/api/execute-route/route.ts`. If chain ID or RPC URL changes, update both places together.
- New contract tests should keep using `MockERC20` plus `contracts/test/MockXCM.sol:MockXCM`, then override the vault XCM precompile with `setXCMPrecompileAddress()`. Existing tests do not hit the real precompile.
- Server-side route execution depends on `AI_ORACLE_RELAY_ENABLED`, `AI_ORACLE_PRIVATE_KEY`, and Postgres-backed storage for hosted use. The relay verifies it is running on Paseo and that the signer matches the vault's `aiOracleAddress` before submission.
- Playwright wallet tests depend on the mock-connector path in `frontend/components/Web3Provider.tsx`: use `?e2eMockWallet=1` or `NEXT_PUBLIC_E2E_MOCK_WALLET=true`.
- The cancel path in `frontend/tests/e2e/chat-cancel.spec.ts` is a protected behavior: canceling a safe route must not submit `eth_sendTransaction`, `eth_sendRawTransaction`, or `wallet_sendCalls`.
- `frontend/components/XcmRoutePanel.tsx` calls `/api/rebalance-status`, but that API route does not exist in the current repo. Treat the rebalancing UI as incomplete unless you are explicitly implementing that backend.
