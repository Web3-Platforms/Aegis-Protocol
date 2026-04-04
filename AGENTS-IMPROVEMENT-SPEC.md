# AGENTS.md Improvement Specification

Audit date: 2025  
Auditor: Ona (AI agent)

This document records what was found in the repository's agent-guidance files,
rates each finding, and specifies the concrete changes needed.

---

## 1. Audit Scope

Files examined:

| File | Role |
|------|------|
| `AGENTS.md` | **Did not exist** — created during this audit |
| `AEGIS_INSTRUCTIONS.md` | Original hackathon execution prompt |
| `DEPLOYMENT_STATUS.md` | Pre-deployment checklist (generated artifact) |
| `FRONTEND_SKILLS_COMPLETE.md` | Learning-reference index (not agent guidance) |
| `.ona/review/comments.json` | Empty review store |
| `.cursor/rules/` | Does not exist |
| `.ona/skills/` | Does not exist |
| `README.md` | User-facing project readme |

---

## 2. What Is Good

### 2.1 README.md is accurate and complete
The README correctly describes the architecture, stack, setup steps, and
deployment flow. The text-based architecture diagram matches the actual code.
The "Paseo Testnet Contract Addresses" table honestly states that no committed
deployment exists rather than fabricating addresses.

### 2.2 AEGIS_INSTRUCTIONS.md captures intent clearly
The original hackathon prompt is preserved verbatim. It gives any agent the
full product vision, the four-step execution plan, and the hard constraints
(no SELFDESTRUCT/PUSH0, risk gate at 75, XCM precompile address). This is
useful historical context.

### 2.3 Contract test suite is thorough
27 unit tests cover deployment, access control, deposit/withdraw, reentrancy,
risk gating, XCM routing, and gas limits. `deployFixture()` is reused
consistently. MockXCM is wired in so tests are self-contained.

### 2.4 `.env.example` contains real Paseo addresses
The example file ships with actual deployed addresses for the Paseo testnet,
making local setup concrete rather than purely instructional.

### 2.5 E2E test verifies the security-critical cancel path
`chat-cancel.spec.ts` asserts that dismissing the intent modal does not emit
`eth_sendTransaction`. This is the right thing to test for a financial UI.

### 2.6 `lib/contracts.ts` uses safe address resolution
`resolveAddress()` validates the env-var format before using it, falling back
to the zero address. This prevents silent misconfiguration.

---

## 3. What Is Missing

### 3.1 No AGENTS.md existed
**Severity: High**  
There was no file telling an AI agent how to work in this repository. An agent
starting fresh would have to reverse-engineer conventions from source files.

**Fix:** Created `AGENTS.md` during this audit. See §5 for remaining gaps.

### 3.2 No agent skill files
**Severity: Medium**  
Neither `.ona/skills/` nor `.cursor/rules/` contain any files. Reusable
workflows (deploy, test, add a token, update the oracle) are not captured
anywhere an agent can load them on demand.

**Fix:** See §5.2 — create at minimum a `deploy` skill and a `add-token` skill.

### 3.3 No CI/CD configuration
**Severity: Medium**  
`DEPLOYMENT_STATUS.md` includes a sample GitHub Actions workflow but it is
not committed. There is no `.github/workflows/` directory. An agent asked to
"set up CI" has no baseline to extend.

**Fix:** See §5.3.

### 3.4 Risk oracle has no real LLM integration
**Severity: Medium (product gap, agent confusion risk)**  
`AEGIS_INSTRUCTIONS.md` says to integrate an LLM (Nvidia Nemotron / Gemini /
OpenAI). The actual oracle uses keyword matching only. An agent reading the
instructions will attempt to add an LLM call without knowing the current state.

**Fix:** Document the current state explicitly in `AGENTS.md` and add a
`TODO` comment in `route.ts`. See §5.4.

### 3.5 Hardhat config targets Moonbeam networks, not Paseo
**Severity: Medium (agent confusion risk)**  
`hardhat.config.js` defines `moonbaseAlpha`, `moonbeam`, and `moonriver`
networks. The README and all other docs say the target is Paseo Testnet. The
`localhost` network uses Moonbeam's chain ID (1281). An agent adding a new
network or debugging a deploy failure will be confused.

**Fix:** See §5.5.

### 3.6 No linting or formatting tooling
**Severity: Low**  
Neither `contracts/` nor `frontend/` has ESLint, Prettier, or Solhint
configured. An agent cannot run `npm run lint` to verify its edits conform to
project style.

**Fix:** See §5.6.

### 3.7 `frontend-skills/` and `web3-skills/` are in the repo root
**Severity: Low (agent confusion risk)**  
These directories contain generic learning guides unrelated to the application.
An agent scanning the repo tree may treat them as application code or attempt
to import from them.

**Fix:** Document their purpose in `AGENTS.md` (done) and consider moving them
to a `docs/` subdirectory or a separate repo.

### 3.8 `DEPLOYMENT_STATUS.md` has a fabricated date
**Severity: Low**  
The file is dated "March 19, 2026" — a future date at time of writing. This
erodes trust in the document and may confuse agents that use dates to determine
recency.

**Fix:** Remove or correct the date. Consider replacing the file with a
`CHANGELOG.md` that records real events.

---

## 4. What Is Wrong

### 4.1 `AEGIS_INSTRUCTIONS.md` contradicts the codebase on the risk threshold
**Severity: High**  
The instructions say "revert if `aiRiskScore > 75`". The contract uses
`>= MAX_RISK_SCORE` (i.e., `>= 75`), meaning a score of exactly 75 is
rejected. The oracle returns `safeToRoute: riskScore < 75`, which is
consistent with the contract but inconsistent with the instructions. An agent
following the instructions literally would introduce a one-off bug.

**Fix:** `AGENTS.md` now documents the correct threshold (`>= 75` rejects).
`AEGIS_INSTRUCTIONS.md` should be annotated with a correction note.

### 4.2 `DEPLOYMENT_STATUS.md` references `localhost:3010` but `package.json` runs on 3000
**Severity: Low**  
The deployment doc says the dev server runs on port 3010. `next dev` without
`-p` uses 3000. This will mislead an agent trying to verify a running server.

**Fix:** Remove the port reference or align it with the actual `dev` script.

### 4.3 `hardhat.config.js` exports `config.xcmPrecompiles` after `module.exports`
**Severity: Low (latent bug)**  
```js
config.xcmPrecompiles = XCM_PRECOMPILE_ADDRESSES;
module.exports = config;
```
The assignment happens before `module.exports`, so the property is present.
However, Hardhat ignores unknown top-level config keys, and no script actually
reads `config.xcmPrecompiles`. The variable is dead code that misleads agents
into thinking XCM addresses are centrally managed through config.

**Fix:** Remove `config.xcmPrecompiles` or move the addresses to a shared
constants file that scripts can import.

### 4.4 `FRONTEND_SKILLS_COMPLETE.md` embeds an absolute local path
**Severity: Low**  
Line: `Project Root: /Users/ekf/Downloads/Projects/Polka Agent/Aegis-Protocol/`  
This leaks a developer's local filesystem path. It has no effect on the
application but is noise in a shared repository.

**Fix:** Remove the path or replace it with a relative reference.

---

## 5. Concrete Improvement Spec

Each item below is a discrete, actionable task.

---

### 5.1 Annotate `AEGIS_INSTRUCTIONS.md` with a correction block

**File:** `AEGIS_INSTRUCTIONS.md`  
**Change:** Prepend a short correction block at the top.

```markdown
> **Agent note (added post-hackathon):** The risk threshold in Step 1 says
> "revert if aiRiskScore > 75". The deployed contract uses `>= 75` (score of
> 75 is rejected). The oracle returns `safeToRoute: riskScore < 75`. Use the
> contract and oracle as the source of truth, not this document.
> The oracle currently uses keyword matching, not a live LLM call.
```

---

### 5.2 Create `.ona/skills/` with two skill files

**File:** `.ona/skills/deploy-paseo.md`

```markdown
# Deploy to Paseo Testnet

## Prerequisites
- `PRIVATE_KEY` set in `contracts/.env.local` (testnet wallet only)
- Wallet funded via https://faucet.polkadot.io/

## Steps
1. `cd contracts && npm test` — all tests must pass first.
2. `npm run deploy` — deploys AegisVault, writes `deployments/paseo.json`.
3. Copy `aegisVault` address from `deployments/paseo.json`.
4. Update `frontend/.env.local`: set `NEXT_PUBLIC_AEGIS_VAULT_ADDRESS`.
5. `cd frontend && npm run build` — verify build succeeds with new address.
6. Commit `deployments/paseo.json` and the updated `.env.local` (never commit
   `.env.local` containing `PRIVATE_KEY`).
```

**File:** `.ona/skills/add-supported-token.md`

```markdown
# Add a Supported Token

## Contract side
1. Deploy or locate the ERC-20 token on Paseo.
2. Call `AegisVault.addSupportedToken(tokenAddress)` from the owner wallet.

## Frontend side
1. Add the token to `SUPPORTED_TOKENS` in `frontend/lib/contracts.ts`.
2. Add the address env var to `frontend/.env.example` and `.env.local`.
3. Update `Web3Provider.tsx` if the token needs a custom decimal display.

## Tests
- Add a test case in `AegisVault.test.js` that deposits and withdraws the
  new token.
```

---

### 5.3 Add a minimal GitHub Actions CI workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  contracts:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: contracts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: contracts/package-lock.json
      - run: npm ci
      - run: npm test

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run build
```

---

### 5.4 Document oracle state in `route.ts`

**File:** `frontend/app/api/risk-oracle/route.ts`  
**Change:** Add a comment block before the handler.

```typescript
// Risk oracle — current implementation: keyword-based scoring (no LLM call).
// To add a real LLM: call the provider API here, parse the numeric score from
// the response, and return it in the same shape: { parachainId, riskScore, safeToRoute }.
// The risk gate threshold is riskScore < 75 (scores of 75 and above are blocked).
// DEST_PARACHAIN_ID is fixed to Paseo Asset Hub (1000) for MVP Option A.
```

---

### 5.5 Clean up `hardhat.config.js`

**Changes:**

1. Remove `moonbaseAlpha`, `moonbeam`, `moonriver` network entries — they are
   not the target network and add confusion.
2. Change `localhost.chainId` from `1281` (Moonbeam) to `31337` (Hardhat
   default) or remove the localhost override entirely.
3. Remove `config.xcmPrecompiles` — it is dead code. If the addresses are
   needed in scripts, import them from a `constants.js` file instead.
4. Remove the `etherscan` block (Moonscan keys) since the target is Paseo,
   which uses Subscan.

---

### 5.6 Add ESLint to the frontend

**File:** `frontend/package.json` — add to `devDependencies`:

```json
"eslint": "^9",
"eslint-config-next": "^16"
```

**File:** `frontend/eslint.config.mjs`:

```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [...compat.extends("next/core-web-vitals")];
```

Add `"lint": "next lint"` to `frontend/package.json` scripts.  
Add `npm run lint` as a step in the CI `frontend` job.

---

### 5.7 Fix `DEPLOYMENT_STATUS.md`

**Option A (preferred):** Delete the file. Its content is superseded by
`README.md` and `AGENTS.md`. The fabricated date and mixed port references
make it unreliable.

**Option B:** Replace with a `CHANGELOG.md` that records real deployment
events with accurate dates.

---

### 5.8 Remove the local filesystem path from `FRONTEND_SKILLS_COMPLETE.md`

**File:** `FRONTEND_SKILLS_COMPLETE.md`  
**Change:** Delete or redact the line:
```
Project Root: /Users/ekf/Downloads/Projects/Polka Agent/Aegis-Protocol/
```

---

## 6. Priority Order

| Priority | Item | Effort |
|----------|------|--------|
| 1 | §5.1 — Annotate `AEGIS_INSTRUCTIONS.md` (risk threshold correction) | 5 min |
| 2 | §5.4 — Document oracle state in `route.ts` | 5 min |
| 3 | §5.5 — Clean up `hardhat.config.js` | 15 min |
| 4 | §5.3 — Add CI workflow | 20 min |
| 5 | §5.2 — Create `.ona/skills/` files | 20 min |
| 6 | §5.6 — Add ESLint to frontend | 20 min |
| 7 | §5.7 — Fix or delete `DEPLOYMENT_STATUS.md` | 5 min |
| 8 | §5.8 — Remove local path from skills doc | 2 min |
