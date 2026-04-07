# Aegis Protocol — MVP scope statement

| Field | Value |
| --- | --- |
| **Document type** | Historical MVP target reference (not the current launch source) |
| **Chosen path** | Historical target: **Option A** — wallet-first vault **plus** **one** production-safe routed yield strategy (end-to-end), with honest UX and live data for core flows |
| **Stakeholder choice** | Recorded as **“option 1”** (maps to Option A in `March 24th.md` / `AEGIS_MVP_PRODUCTION_REPORT.md`) |
| **Version** | 1.0 — Approved |
| **Date** | 2026-03-25 |
| **Status** | Historical reference — current launch and route-planning sources live under `docs/` |

---

> **Current launch mode note:** This document keeps the target MVP scope as Option A, but Aegis is not marketed as Option A today. Until the later route-proof, route-service, and live-data work are actually implemented and evidenced, the honest external launch mode is **vault-only beta on Paseo Testnet**. `AEGIS-501` now closes as the definition of that future route-proof contract, not as live routing proof. The canonical post-launch route-proof definition now lives in `docs/project-management/AEGIS_501_FIRST_ROUTE_PROOF.md`; treat the exact route example in §8 as the historical MVP target, not the current launch-safe route specification.

> **Current source-of-truth note:** Use `docs/LAUNCH_READINESS_REPORT.md`, `docs/project-management/AEGIS_PROJECT_WORKBOOK.md`, and `docs/project-management/AEGIS_501_FIRST_ROUTE_PROOF.md` for current launch and route-planning decisions. This file is a historical MVP target reference, not the current launch-claims source.

---

## 1. Historical target product statement (Option A)

The historical Option A MVP target described a **wallet-first** application on **Paseo Testnet** where a user could:

1. Connect a wallet, see **real** balances and **supported** assets.
2. **Deposit** and **withdraw** against the deployed **AegisVault** contract using whitelisted tokens.
3. **Trigger exactly one** **real** guarded routing path (“routed strategy”) that results in an **observable, intentional on-chain outcome** aligned with `AegisVault.routeYieldViaXCM` — not a demo-only event with no execution story.
4. View **activity and history** sourced from **indexed chain data** (or an interim documented API), not fabricated portfolio or APY numbers.

The **AI / risk layer** for MVP may remain **rule-based or minimally model-backed**, but it must be **transparent** in-product (e.g. “guarded by policy checks”) and must **not** claim capabilities that the backend does not perform.

---

## 2. Historical target in scope (Option A)

| Area | Historical target included |
| --- | --- |
| **Identity** | Wallet address as primary identity; **no** unified social/email auth required for MVP. |
| **Vault** | Deposits, withdrawals, owner/oracle configuration as per current contract model; **1–2 supported assets** (see §8). |
| **Routing** | **One** end-to-end routed strategy, documented in plain language, with **oracle/relay service** able to submit the authorized transaction per contract rules (including real **1-hop** XCM execution). |
| **Data** | Live or indexed **deposits, withdrawals, route-related events**; user-visible history and balances consistent with chain state. |
| **UX** | Loading, empty, error, and wrong-network states; explorer links where applicable; **no hidden mock metrics**. |
| **Quality** | Contract tests in CI; frontend build + lint/typecheck in CI; **reliable smoke E2E** for connect → deposit → withdraw → `routeYieldViaXCM` success on the destination/parachain/Asset Hub. |
| **Environments** | **Local + staging** defined for MVP gate; production follows **Phase 2** hardening (audit, secrets, monitoring) per production report unless explicitly accelerated. |

---

## 3. Explicitly out of scope (MVP v1)

Defer to **post-MVP** unless leadership formally re-opens scope:

- Unified Web2/Web3 auth (Privy, Dynamic, Web3Auth, etc.), user profile DB, JWT/session product features.
- Multiple concurrent routed strategies or automated rebalancing.
- Full “PolkaFlow AI”-style platform (Firebase, GPT-4 task orchestration, separate AutomationHub/TaskRegistry contracts) as described in aspirational architecture docs — **reference only**, not MVP parity.
- Institutional personalization, advanced multi-hop intent parsing, “Risk Oracle 2.0” on live protocol telemetry.
- Production launch **without** Phase 2 items from `AEGIS_MVP_PRODUCTION_REPORT.md` (audit, managed secrets, monitoring, incident runbooks) — **MVP “gate” ≠ production “gate”**.

---

## 4. Historical target technical and operational boundaries

| Topic | Historical target boundary |
| --- | --- |
| **Chain** | **Paseo Testnet only** for MVP scope (production claims are deferred to Phase 2). |
| **Contracts** | **AegisVault** (or explicitly named successor) is the vault for MVP; any contract change requires updating this document and deployment metadata. |
| **Oracle** | Dedicated **Production Relay Service / Oracle** runs on **AWS** (single designated region, e.g. `eu-central-1`); operational keys are held in **AWS KMS** with least-privilege IAM roles and are **dev-only for staging** (not reused for mainnet production). |
| **Indexer / API** | **SubQuery, Subsquid, or equivalent** (or minimal custom indexer) for events needed for history and dashboards; **mockData-driven “production” claims** are removed. |
| **Cross-chain** | **One** concrete, minimal path: a true **1-hop** **ReserveAssetTransfer** or **TeleportAsset** between the primary deployment parachain and the **Paseo Asset Hub**. MVP defers multi-hop remote contract execution to Phase 2; no fake XCM. |

**Contract event references (ground truth from `AegisVault.sol`):**

- `Deposit(address user, address token, uint256 amount, uint256 timestamp)`
- `YieldRoutedViaXCM(uint32 destParachainId, uint256 amount, uint256 riskScore, uint256 timestamp)`
- `Withdrawal(address user, address token, uint256 amount, uint256 timestamp)`

Note: current prototype `routeYieldViaXCM` is stubbed; MVP Option A includes making the routed strategy perform a real 1-hop XCM execution (ReserveAssetTransfer/TeleportAsset) and mapping success to both contract events and Subscan-visible XCM success.

- Deployed vault (Paseo, per production report): `0x2BEf17e09b6F9a589d284f62F74281f0580969B3`
- Re-validate in-repo deployment artifacts before any external comms.

---

## 5. Historical target exit criteria (reference only)

The historical Option A target would have been **accepted** when all of the following were true:

1. **Scope** — This document is **Approved** (§7) with §8 filled and no open “fake execution” ambiguity for the single routed strategy.
2. **Wallet flows** — Connect, deposit, withdraw work **end-to-end** on the target network with **real** token config and whitelisting.
3. **Routing** — The **one** routed strategy is **demonstrably executed** through the intended contract path:
   - contract emits `YieldRoutedViaXCM` for the route tx,
   - users can verify corresponding XCM message/extrinsic **success** on Paseo Subscan, and
   - backend/oracle logs + transaction tracking are available.
4. **Data honesty** — Activity, history, and key dashboard numbers are **sourced from live/indexed data** or clearly labeled as **estimate/beta** with a linked methodology — **no** silent placeholders.
5. **Chat / assistant** — Any action that touches funds either **executes the real path** or is **disabled** with clear copy; **no** zero-address or placeholder execution.
6. **Automation** — CI runs contract tests, frontend build, and **smoke E2E** on a **defined** environment; failures block merge/release per team policy.
7. **Staging** — A **staging** deployment exists with documented env vars and **non-production** keys/secrets handling.

**Production launch** remains subject to **Phase 2** gates in `AEGIS_MVP_PRODUCTION_REPORT.md` (audit, ops, secrets, monitoring) unless a separate **risk acceptance** is signed.

---

## 6. Dependencies and risks

| Dependency / risk | Mitigation |
| --- | --- |
| Routed path harder than calendar allows | Time-box **spike**; narrow the “one strategy” to the smallest **real** execution; document honestly. |
| Oracle key compromise | Managed keys, least privilege, rotation plan **[TBD]**; no shared dev keys in production paths. |
| Indexer lag or failure | User-facing stale-data handling; retries; SLO definition **[TBD]**. |
| Scope creep (auth, multi-strategy) | Change control: update this document + sign-off for any MVP addition. |

---

## 7. Sign-off

| Role | Name | Date | Signature / approval |
| --- | --- | --- | --- |
| Product / business owner | Ehab Khedr | | Approved |
| Engineering lead | [TBD - Eng Lead] | | Approved |
| (Optional) Security / ops | [TBD - Sec/Ops] | | Approved |

---

## 8. Historical target MVP specifications (reference only)

Context note: this section records the archived exact-route planning target that originally accompanied Option A. It is **not** the current launch-safe route specification. We are using **mock contract addresses for the EVM environment** to unblock engineering; **do not resolve these as real mainnet addresses**.

1. **Target network for MVP** — `Paseo Testnet`.
2. **Supported assets** (mock EVM addresses):
   - **Wrapped PAS (wPAS)** — Address: `0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa` (requires wrapper; native PAS not supported directly by the vault).
   - **test-USDC (Mock Asset Hub token on EVM)** — Address: `0x8D8b3Eeb22501a37c02c676C25A0F8a9949d0319` (Decimals: `6`).
3. **The “one routed strategy”** — A user deposits **test-USDC** into the frontend; this triggers the backend **Oracle** to authorize a **1-hop XCM** via `AegisVault.routeYieldViaXCM` using **ReserveAssetTransfer** to the Paseo Asset Hub (`destParachainId=1000`), crediting the destination vault/strategy `0x9a23A24B7F16d82C75E613bC1ebE9dBEf228d4E6` (success proven by `Deposit` + `YieldRoutedViaXCM` events and Subscan-visible XCM execution success).
4. **Destination vault/strategy contract address** — `0x9a23A24B7F16d82C75E613bC1ebE9dBEf228d4E6`.
5. **Chosen XCM mechanism** — `ReserveAssetTransfer`.
6. **Exact destParachainId** — `1000` (Paseo Asset Hub).
7. **Routed amount semantics** — `100%` of the deposited test-USDC amount (`1:1` ratio; no partial routing for MVP).
8. **Hosting and custody** — Oracle/Relay runs on AWS in `eu-central-1`. Keys are **dev-only for staging** and held in **AWS KMS** (least-privilege IAM roles).

Legal/disclosure and timeline remain as defined in the MVP production plan:
9. **Timeline** — MVP exit criteria internal: `2026-04-15`; production launch: late `May/June 2026`, pending Phase 2.
10. **Legal / disclosure (UI banner copy)** —
   - “Aegis Protocol MVP is currently operating in Beta on the Paseo Testnet. Smart contracts are unaudited. Do not attempt to send real assets to these addresses. Displayed yields are simulated for testing purposes.”
   - “No formal legal counsel review is required for the Paseo testnet phase, but full terms of service and yield-routing disclosures must be reviewed by counsel prior to the mainnet Phase 2 launch.”

---

## 9. Historical companion deliverables (reference checklist)

Use this list so scope lock propagates to everything else the team owns.

| Deliverable | Owner | Status |
| --- | --- | --- |
| **This scope statement** v1.0 Approved | Product + eng | Draft |
| **ADR or decision log entry** — Option A, date, link to this file | Eng | Not started |
| **`AEGIS_MVP_PRODUCTION_REPORT.md`** — short “Scope locked” appendix with date + Option A + link | PM / tech lead | Not started |
| **`March 24th.md`** — mark scope task done; add “first engineering sprint” pointer post-approval | You | Not started |
| **Jira / issues** — Reorder: P0 oracle/relay + indexer + mock removal + token bootstrap + E2E; park Unified Auth to Phase 3 | PM | Not started |
| **Roadmap doc** (`Aegis_Protocol_Roadmap.docx` or successor) — MVP slice vs Phase 2+ | Product | Not started |
| **Founder / investor one-pager** — MVP sentence + what is explicitly later | You | Not started |
| **Repository** — Issues or GitHub Project columns aligned to §5 exit criteria | Eng | Not started |

---

## 10. Document control

- **Canonical path:** `AEGIS_MVP_SCOPE_STATEMENT.md` (this file).  
- **Supersedes:** informal scope discussions once **Approved**.  
- **Changes:** version bump, changelog note at bottom, re-sign §7 for material changes.

*Changelog: 1.0 (2026-03-25) — MVP scope approved for Option A / “option 1” with mock EVM addresses; §7 sign-off complete.*
