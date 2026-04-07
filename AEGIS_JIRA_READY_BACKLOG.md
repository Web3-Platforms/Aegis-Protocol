# Aegis Protocol Jira-Ready Backlog

**Prepared on:** March 24, 2026  
**Purpose:** Convert the prototype into an executable backlog for MVP delivery and production readiness.

## Recommended Epics

- `EPIC-1` Product Scope and MVP Readiness
- `EPIC-2` Transaction Engine
- `EPIC-3` User Portal and Data Layer
- `EPIC-4` QA, Security, and Release Engineering
- `EPIC-5` Post-MVP Growth

## Priority Legend

- `Highest`: blocks MVP or production credibility
- `High`: required for MVP completeness
- `Medium`: post-MVP or optimization work

## Ticket List

## EPIC-1: Product Scope and MVP Readiness

### AEGIS-MVP-01

**Summary:** Lock MVP scope and define launch feature flags  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 2 days  
**Dependencies:** None

**Description**

Define the exact MVP boundary so the product does not market features that the system cannot yet execute safely. Decide whether routed cross-chain execution is included in MVP or deferred behind a beta/disabled flag.

**Acceptance Criteria**

- MVP scope is documented and approved
- Each user-facing feature is marked as `live`, `beta`, or `post-MVP`
- Route execution has a clear go/no-go decision
- Feature flags or equivalent gating plan is documented

### AEGIS-MVP-02

**Summary:** Remove or relabel mock and hardcoded metrics in production-facing UI  
**Type:** Task  
**Priority:** Highest  
**Estimate:** 2 days  
**Dependencies:** `AEGIS-MVP-01`

**Description**

Audit all frontend screens and remove fabricated APY, TVL, yield, and activity metrics unless they are explicitly labeled as demo data.

**Acceptance Criteria**

- No core decision screen shows fake data as live data
- Marketing copy matches the actual shipped feature set
- Placeholder metrics are removed or clearly tagged as demo/beta
- Product owner signoff completed

### AEGIS-MVP-03

**Summary:** Create supported asset registry and admin bootstrap flow  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-01`

**Description**

Create a single source of truth for supported assets, network addresses, decimals, and display metadata. Add an admin/bootstrap script to whitelist supported tokens on the deployed vault.

**Acceptance Criteria**

- Supported asset config exists in one canonical location
- Admin script can add supported tokens to the vault
- Token decimals, symbols, and addresses are validated before bootstrap
- Frontend config consumes the same asset registry

### AEGIS-MVP-04

**Summary:** Add environment validation and wallet/network guardrails  
**Type:** Task  
**Priority:** High  
**Estimate:** 2 days  
**Dependencies:** `AEGIS-MVP-03`

**Description**

Prevent invalid deployments and broken frontend flows caused by missing env vars, wrong network, or placeholder addresses.

**Acceptance Criteria**

- Startup validation fails fast on invalid config
- Frontend blocks interaction on unsupported network
- Zero-address and placeholder-address configs are rejected
- Clear user messaging exists for misconfiguration states

## EPIC-2: Transaction Engine

### AEGIS-MVP-05

**Summary:** Build oracle/relay service for `aiOracle` transaction execution  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 5 days  
**Dependencies:** `AEGIS-MVP-01`

**Description**

Create the backend service that owns the AI oracle key and can validate, sign, submit, and track authorized routed transactions.

**Acceptance Criteria**

- Service exposes a secure route-execution API
- Service signs and sends authorized transactions in staging
- All execution requests are logged with request ID and tx hash
- Failures are persisted and visible to operators

### AEGIS-MVP-06

**Summary:** Implement transaction retries, idempotency, and execution state tracking  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-05`

**Description**

Make the transaction engine operationally safe by preventing duplicate sends and supporting retries for transient failures.

**Acceptance Criteria**

- Duplicate execution requests do not create duplicate transactions
- Retry policy exists for recoverable failures
- Execution status can be queried by request ID
- Terminal states include `submitted`, `confirmed`, `failed`, and `blocked`

### AEGIS-MVP-07

**Summary:** Replace chat route placeholder with real route-execution flow or disable it  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-05`

**Description**

The current chat confirm path is still a placeholder. Connect it to the real execution flow or disable the confirm action until the backend is ready.

**Acceptance Criteria**

- Chat confirm action never points to a zero-address placeholder
- Confirm flow either triggers a real backend execution request or is disabled behind a feature flag
- User receives clear success/failure/pending feedback
- QA signoff covers both safe and blocked intent flows

### AEGIS-MVP-08

**Summary:** Implement one production-safe routed strategy or cut routing from MVP  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 5 days  
**Dependencies:** `AEGIS-MVP-05`, `AEGIS-MVP-07`

**Description**

Resolve the biggest product gap by either implementing one real end-to-end routed action or explicitly shipping MVP without live routed execution.

**Acceptance Criteria**

- Product decision is documented
- If included: one routed strategy executes end-to-end in staging
- If excluded: all route execution UI is feature-gated and messaging is updated
- Launch checklist reflects the final product posture

### AEGIS-MVP-09

**Summary:** Add explorer links and user-visible transaction status handling  
**Type:** Task  
**Priority:** High  
**Estimate:** 2 days  
**Dependencies:** `AEGIS-MVP-06`

**Description**

Improve user trust by exposing submitted transaction hashes, confirmations, and failure states consistently across deposit, withdrawal, and routed flows.

**Acceptance Criteria**

- All submitted transactions display a tx hash
- Explorer links are available where applicable
- Pending, confirmed, and failed states are visible in UI
- Error copy is understandable by end users

## EPIC-3: User Portal and Data Layer

### AEGIS-MVP-10

**Summary:** Build event indexer for deposits, withdrawals, and routed yield events  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 5 days  
**Dependencies:** `AEGIS-MVP-03`

**Description**

Implement SubQuery, SubSquid, or equivalent indexing so user-facing dashboards can rely on real on-chain event history instead of static mocks.

**Acceptance Criteria**

- Indexer ingests `Deposit`, `Withdrawal`, and `YieldRoutedViaXCM` events
- User and protocol aggregates are queryable
- Reindex/recovery procedure is documented
- Staging indexer is populated from deployed contract events

### AEGIS-MVP-11

**Summary:** Expose portfolio and transaction-history API  
**Type:** Story  
**Priority:** High  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-10`

**Description**

Create a minimal API layer that serves the frontend with live portfolio, ledger, and summary data sourced from the indexer.

**Acceptance Criteria**

- API returns user transaction history with filters
- API returns protocol and user summary metrics
- API uses indexed/live data rather than local mock data
- API error responses are documented and handled

### AEGIS-MVP-12

**Summary:** Replace `mockData.ts` usage across activity, yield, and history views  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 4 days  
**Dependencies:** `AEGIS-MVP-11`

**Description**

Switch the frontend from mock services to live backend/indexer data for the activity page, yield statistics, and transaction history.

**Acceptance Criteria**

- `mockData.ts` is no longer used in core user flows
- Activity page shows live indexed data
- Transaction history shows live indexed data
- Loading and empty states are implemented for all converted views

### AEGIS-MVP-13

**Summary:** Add wallet-first portfolio dashboard with live balances and user history  
**Type:** Story  
**Priority:** High  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-12`

**Description**

Deliver a wallet-first personalized dashboard using the connected wallet as the initial identity system for MVP.

**Acceptance Criteria**

- Connected users can see live deposit balances
- Connected users can see recent history for their address
- Dashboard reflects real protocol/user metrics
- Empty-state UX exists for first-time users

## EPIC-4: QA, Security, and Release Engineering

### AEGIS-MVP-14

**Summary:** Repair Playwright suite and align e2e coverage with current UI  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 2 days  
**Dependencies:** `AEGIS-MVP-07`, `AEGIS-MVP-12`

**Description**

The current end-to-end suite is stale and should not be used as a release signal until fixed.

**Acceptance Criteria**

- Playwright config starts the app reliably in CI/staging
- Existing stale selectors/assertions are updated
- Core smoke coverage includes chat cancel and one wallet flow
- `npm run test:e2e` is green in the release pipeline

### AEGIS-MVP-15

**Summary:** Add CI pipeline for contracts, frontend build, and smoke checks  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-14`

**Description**

Create an automated release gate to prevent regressions across contracts and frontend.

**Acceptance Criteria**

- CI runs contract tests on every main branch change
- CI runs frontend build/type validation on every main branch change
- CI runs smoke-level e2e coverage
- Pipeline status is visible and documented

### AEGIS-MVP-16

**Summary:** Create staging deployment, managed secrets, and env promotion flow  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 4 days  
**Dependencies:** `AEGIS-MVP-15`

**Description**

Define staging and production environments with proper secrets management and clear promotion criteria.

**Acceptance Criteria**

- Separate staging and production environments exist
- Secrets are not stored in source control
- Environment promotion checklist is documented
- Staging deployment can be validated before production release

### AEGIS-MVP-17

**Summary:** Prepare for external smart contract audit  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-08`, `AEGIS-MVP-15`

**Description**

Package contract scope, architecture notes, deployment details, and test evidence so the project is ready for a professional audit.

**Acceptance Criteria**

- Audit scope is frozen
- Auditor package includes architecture, tests, deployment metadata, and assumptions
- Known limitations are documented
- Audit request can be issued immediately

### AEGIS-MVP-18

**Summary:** Implement audit remediations and launch-blocking security fixes  
**Type:** Story  
**Priority:** Highest  
**Estimate:** 5 days  
**Dependencies:** `AEGIS-MVP-17`

**Description**

Close critical and high-severity issues found during audit before any production launch.

**Acceptance Criteria**

- All critical findings are remediated
- All agreed high findings are remediated
- Re-test evidence is documented
- Final launch go/no-go review includes audit closure status

### AEGIS-MVP-19

**Summary:** Add monitoring, alerting, and operator runbooks  
**Type:** Story  
**Priority:** High  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-MVP-16`

**Description**

Make the backend, frontend, and transaction engine operable in public release conditions.

**Acceptance Criteria**

- Error logging and alerting are configured
- Operators can trace a route request to a chain transaction
- Runbooks exist for deployment failure, tx failure, and indexer lag
- Escalation ownership is documented

### AEGIS-MVP-20

**Summary:** Add API validation, rate limiting, and abuse protection  
**Type:** Task  
**Priority:** High  
**Estimate:** 2 days  
**Dependencies:** `AEGIS-MVP-05`

**Description**

Protect the backend/oracle service from malformed requests and abuse.

**Acceptance Criteria**

- API schema validation exists for all write endpoints
- Rate limiting exists for public-facing endpoints
- Invalid requests are rejected with consistent error codes
- Abuse controls are documented

## EPIC-5: Post-MVP Growth

### AEGIS-GROWTH-01

**Summary:** Research and select unified auth provider  
**Type:** Task  
**Priority:** Medium  
**Estimate:** 2 days  
**Dependencies:** MVP complete

**Description**

Evaluate Privy, Dynamic, and Web3Auth for the next-phase onboarding model.

**Acceptance Criteria**

- Evaluation matrix compares product, UX, security, and pricing
- Recommended provider is documented
- Integration risks and migration plan are documented

### AEGIS-GROWTH-02

**Summary:** Design user profile and identity-linking schema  
**Type:** Story  
**Priority:** Medium  
**Estimate:** 3 days  
**Dependencies:** `AEGIS-GROWTH-01`

**Description**

Design the database and identity model that links wallet addresses with social identities and user preferences.

**Acceptance Criteria**

- Schema design is documented
- Identity-linking rules are defined
- Privacy and security considerations are documented
- Session/auth ownership is defined

### AEGIS-GROWTH-03

**Summary:** Build Risk Oracle 2.0 with live protocol-health inputs  
**Type:** Story  
**Priority:** Medium  
**Estimate:** 5 days  
**Dependencies:** MVP complete

**Description**

Upgrade the current heuristic risk model into a live system that consumes protocol and market-health signals.

**Acceptance Criteria**

- Risk inputs are defined and sourced from live systems
- Scoring model is documented
- Safe/block thresholds are configurable
- Observability exists for score decisions

## Suggested Order for Jira Import

1. Create the five epics above.
2. Add all `AEGIS-MVP-*` tickets first.
3. Put `AEGIS-GROWTH-*` tickets into the backlog, not the active sprint queue.
4. Use `Highest` tickets as the initial MVP critical path.

## Critical Path Tickets

These tickets should be treated as launch-critical:

- `AEGIS-MVP-01`
- `AEGIS-MVP-03`
- `AEGIS-MVP-05`
- `AEGIS-MVP-07`
- `AEGIS-MVP-08`
- `AEGIS-MVP-10`
- `AEGIS-MVP-12`
- `AEGIS-MVP-14`
- `AEGIS-MVP-15`
- `AEGIS-MVP-16`
- `AEGIS-MVP-17`
- `AEGIS-MVP-18`
