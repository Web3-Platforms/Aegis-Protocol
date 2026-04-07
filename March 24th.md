# March 24, 2026 — Next implementation task (from MVP production report)

## Scope decision (updated 2026-03-25)

- **Chosen:** **Option A** (recorded as stakeholder **“option 1”**) — wallet-first vault **plus** **one** real, production-honest routed strategy.
- **MVP scope statement (draft):** [`AEGIS_MVP_SCOPE_STATEMENT.md`](./AEGIS_MVP_SCOPE_STATEMENT.md) — complete **§8** and **§7** sign-off to move from v0.1 draft to **Approved**.
- **Next focus:** Phase 0 / Sprint 1 engineering from `AEGIS_MVP_PRODUCTION_REPORT.md` (honest UI, token bootstrap, oracle/relay, indexer plan, chat execution or real path, Playwright/CI).

---

## Next step to implement (single priority) — completed as decision; execution follows scope doc

**~~Lock MVP product scope~~ → Done (Option A).** Implement **Phase 0 stabilization** and **Sprint 1** backlog items under the boundaries in `AEGIS_MVP_SCOPE_STATEMENT.md`.

This was **task 1** under *Immediate Next 10 Tasks* and the first item in **Phase 0: Scope Lock and Prototype Stabilization** in `AEGIS_MVP_PRODUCTION_REPORT.md`. Further work should follow **§5 exit criteria** and **§9 companion deliverables** in the scope statement.

### Decision required

| Option | MVP claim | Engineering implication |
|--------|-----------|-------------------------|
| **A** | Real vault **plus** one real routed strategy | Must plan/build minimal production-safe routed execution, oracle/relay service, and honest UX for that path. |
| **B** | Real vault **only**; AI route assistant as **beta / disabled** | Defer XCM execution; UI and chat must not imply live routing; smaller backend scope for MVP. |

**Deliverable:** A short, signed-off **MVP scope statement** (1–2 pages or equivalent) that states: chosen option, supported networks, asset count (report suggests 1–2), what is explicitly **out** of MVP, and **exit criteria** aligned with the report’s MVP gate.

---

## Full task specification

### Objective

Remove ambiguity between product promise and codebase so engineering can execute **Phase 0** and **Sprint 1** without rework.

### Scope (in)

- Facilitate and document the **Option A vs B** decision with product/leadership.
- Translate the decision into **concrete backlog ordering** (what ships in MVP v1 vs deferred).
- Produce **acceptance criteria** that map to report exit criteria (no hidden mock metrics, real assets, chat real or disabled, tests stable).

### Scope (out)

- Implementing the relay/oracle service (comes **after** scope lock if Option A).
- Full indexer build (Phase 1; may start planning in parallel only if resourced).

### Preconditions

- Stakeholders who can commit to MVP boundaries (product, tech lead, any investor-facing comms owner).
- Current report and repo facts: `AEGIS_MVP_PRODUCTION_REPORT.md`, deployed Paseo vault metadata, frontend mock usage.

### Tools and inputs

| Tool / artifact | Use |
|-----------------|-----|
| `AEGIS_MVP_PRODUCTION_REPORT.md` | Source of gaps, phased plan, backlog priorities |
| `Aegis_Protocol_Roadmap.docx` | Align deferrals (auth, advanced AI) with documented roadmap |
| `Aegis_Protocol_Jira_Project.xlsx` / Jira | Re-sequence epics and stories after scope lock |
| Repo: `frontend`, contracts, `mockData` usage | Ground truth for what “mock” means post-decision |
| Meeting notes or ADR template | Record decision and rationale |

### Work breakdown (execution)

1. **Workshop or async decision** (half day): Present Option A vs B trade-offs (time, risk, audit surface, Polkadot/XCM complexity).
2. **Write MVP scope statement** including: in-scope flows (deposit, withdraw, history source of truth), routing (live vs disabled), supported chain(s), asset list size, Phase 2+ explicitly listed.
3. **Derive engineering checklist** from scope:
   - If **A:** add epic/stories for minimal routed path + oracle service + observability.
   - If **B:** add stories to **disable or clearly label** route execution and assistant claims; reduce backend MVP to wallet + indexer/API for history only.
4. **Hand off to Sprint 1** (report): remove demo-only UX claims, fix asset configuration, fix chat execution placeholder, fix Playwright — **now with frozen assumptions**.

### Definition of done

- [ ] Option A or B is **chosen and written down** with owner and date.
- [ ] MVP scope doc lists **out-of-scope** items (e.g. unified auth, full AI orchestration) matching report Phase 3 deferrals unless explicitly overridden.
- [ ] Jira (or your issue tracker) **top of backlog** reflects the decision (reordered epics/stories).
- [ ] Roadmap or founder-facing doc **one-pager** updated so external messaging matches the code path.

### Consequences

| Area | If ignored |
|------|------------|
| Engineering | Rework on chat, contracts, and API when routing is later cut or added. |
| Trust / compliance | UI continues to imply AI-guarded routing or yields that are not real → reputational and disclosure risk. |
| Estimates | Oracle/relay + indexer work is large; scope lock prevents underestimating MVP. |

### Changes expected after this task (by option)

| Option | Likely follow-on **first** implementation tasks |
|--------|---------------------------------------------------|
| **A** | Token bootstrap + real env assets; skeleton oracle/relay design; relabel until route is real. |
| **B** | UI/copy pass to disable or beta-label routing; fix chat to non-placeholder or disabled; token bootstrap; Playwright repair; then indexer for real history. |

### Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Decision slips → parallel conflicting PRs | Time-box decision; interim rule: no new “production” copy for routing until scope is locked. |
| Option A underestimated | Scope “one real routed strategy” narrowly; spike time-box for XCM/minimal path feasibility. |
| Stakeholders want full roadmap in MVP | Use report *Recommended MVP Definition* and *What I would defer* as the default negotiation baseline. |

---

## What to update for management / docs / issues

Do these **immediately after** the scope decision is recorded (same week).

### Documents

| Document | Update |
|----------|--------|
| `AEGIS_MVP_PRODUCTION_REPORT.md` | Add appendix or “Scope lock” section: date, Option A/B, link to ADR or scope doc. |
| `AEGIS_TECHNICAL_DELIVERY_ROADMAP.md` (if used as living roadmap) | Reconcile phases with chosen option; adjust dates and dependencies. |
| `AEGIS_FOUNDER_INVESTOR_STATUS_REPORT.md` (if maintained) | One paragraph: MVP definition, what ships first, what is explicitly post-MVP. |
| `Aegis_Protocol_Roadmap.docx` | Mark MVP slice vs Phase 2+; avoid implying Firebase/OpenAI platform is current state (per report reality check). |
| `Polkadot AI dapp project.docx` | Optional note: “Aspirational reference — not current repo parity” to prevent scope creep in reviews. |

### Issues / tracker (Jira or GitHub)

| Action | Detail |
|--------|--------|
| **Epic realignment** | **User Portal:** stories for mock removal depend on indexer/API plan. **Transaction Engine:** if Option B, downgrade or park “live XCM execution” to Phase 2. **AI & Security:** align with “real risk service” vs “keyword demo” for MVP honesty. **Unified Auth:** confirm Phase 3 unless business override. |
| **Create or refine** | Single epic or initiative: **“MVP scope lock & honest UX”** with child issues: scope ADR, mock audit checklist, chat execution fix/disabled, token bootstrap, Playwright CI repair. |
| **Labels / priority** | P0 items from report table: scope lock, mock replacement strategy (even if implementation is next sprint), token bootstrap, oracle (if A), Playwright/CI. |

### Reporting / comms

- **Investors / advisors:** MVP is “wallet-first vault on [network] with real balances/history” plus optional one-line on routing (in or beta).
- **Internal sprint goal:** “No misleading production claims; frozen MVP boundary.”

---

## Traceability

- **Report sections:** Executive Summary (Recommendation), Phase 0, Sprint 1, Immediate Next 10 Tasks (#1), Detailed Task Backlog (P0 Product row).
- **This file:** Working task definition for **March 24, 2026**; revise when scope is locked and replace “next step” with the first **post-decision** engineering task (e.g. token bootstrap + mock labeling).
