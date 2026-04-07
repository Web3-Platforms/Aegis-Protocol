# Aegis Protocol Technical Delivery Roadmap

**Prepared on:** March 24, 2026  
**Planning assumption:** two-week sprints starting **March 30, 2026**  
**Owner model:** role-based owners; replace with named individuals as needed

## Team Roles

| Role                      | Scope                                                    |
| ------------------------- | -------------------------------------------------------- |
| Tech Lead / Product Owner | scope, prioritization, architecture, launch decisions    |
| Smart Contract Engineer   | vault changes, deployment scripts, audit support         |
| Backend / AI Engineer     | oracle service, API layer, execution engine              |
| Data Engineer             | indexer, data pipelines, portfolio/history aggregation   |
| Frontend Engineer         | wallet UX, dashboard, activity/history, chat integration |
| DevOps / SRE              | CI/CD, environments, secrets, monitoring                 |
| QA Engineer               | e2e coverage, release checks, regression testing         |

## Delivery Principles

- Keep MVP wallet-first
- Build only one real routed strategy before expanding scope
- Remove mock data from decision-critical UI before launch
- Treat audit and operational readiness as launch gates, not optional extras

## Critical Path

The roadmap only works if these items happen in order:

1. scope lock
2. supported asset and config cleanup
3. live data/indexer
4. oracle/relay backend
5. real routed execution decision
6. CI/CD and staging
7. audit and remediation

## Sprint Plan

## Sprint 1: Scope Lock and Prototype Stabilization

**Dates:** March 30, 2026 to April 10, 2026  
**Primary owners:** Tech Lead, Frontend Engineer, Smart Contract Engineer, QA Engineer

### Goals

- define the real MVP boundary
- eliminate misleading demo behavior
- make asset configuration deterministic
- restore QA credibility

### Deliverables

- MVP scope decision document
- feature-flag plan for unsupported features
- supported asset registry
- admin/bootstrap script for token whitelisting
- UI cleanup for fake metrics and unsupported claims
- repaired Playwright baseline for smoke coverage

### Work breakdown by owner

**Tech Lead / Product Owner**

- approve MVP scope
- decide whether routed execution is included in MVP
- approve copy changes and feature gating

**Smart Contract Engineer**

- add or update token bootstrap/admin script
- verify deployed vault ownership/oracle assumptions
- confirm production contract gap list

**Frontend Engineer**

- remove/relabel hardcoded metrics
- add network/config guardrails
- disable or gate unsupported route actions if backend is not ready

**QA Engineer**

- repair stale e2e selectors and assertions
- restore minimum smoke coverage
- define release checklists

### Exit criteria

- no unsupported feature is exposed as live
- supported assets are clearly defined
- smoke tests reflect current UI behavior
- MVP scope is frozen for Sprint 2

## Sprint 2: Live Data Foundation

**Dates:** April 13, 2026 to April 24, 2026  
**Primary owners:** Data Engineer, Backend / AI Engineer, Frontend Engineer

### Goals

- replace mock-driven analytics with live indexed data
- establish the read model for portfolio, history, and protocol metrics

### Deliverables

- event indexer for vault activity
- portfolio and history API
- frontend integration for live transaction history
- frontend integration for live portfolio summary

### Work breakdown by owner

**Data Engineer**

- implement indexer for deposit/withdraw/routed events
- define recovery and re-sync process

**Backend / AI Engineer**

- expose API endpoints for user history and summary metrics
- document contracts between frontend and API

**Frontend Engineer**

- remove `mockData.ts` dependencies from activity/history/yield surfaces
- add loading, empty, and retry states

**QA Engineer**

- validate live data behavior in staging
- add regression checks for no-data and lagged-data cases

### Exit criteria

- dashboard and history views use live data
- no core screen depends on `mockData.ts`
- staging data can be validated from chain events

## Sprint 3: Transaction Engine and Route Execution

**Dates:** April 27, 2026 to May 8, 2026  
**Primary owners:** Backend / AI Engineer, Smart Contract Engineer, Frontend Engineer

### Goals

- build the oracle/relay service required by the `aiOracle` model
- make route execution real or explicitly defer it

### Deliverables

- oracle/relay backend
- idempotent request tracking
- transaction status model
- frontend integration for routed execution requests
- route-execution feature decision implemented

### Work breakdown by owner

**Backend / AI Engineer**

- build secure route-execution service
- add request validation and tx submission flow
- implement retry and failure handling

**Smart Contract Engineer**

- support backend integration testing
- finalize minimal contract changes if required

**Frontend Engineer**

- connect chat confirm flow to real backend or disable it
- show pending/confirmed/failed route states
- add explorer links and transaction feedback

**QA Engineer**

- validate blocked, successful, and cancelled route scenarios

### Exit criteria

- route execution is either live for one supported flow or intentionally removed from MVP
- all route requests are traceable by request ID and tx hash
- no placeholder execution path remains

## Sprint 4: Release Engineering and Staging

**Dates:** May 11, 2026 to May 22, 2026  
**Primary owners:** DevOps / SRE, QA Engineer, Frontend Engineer, Backend / AI Engineer

### Goals

- create a reliable pre-production environment
- automate release checks
- establish secrets and environment management

### Deliverables

- CI pipeline
- staging environment
- managed secrets flow
- environment promotion checklist
- smoke test suite in pipeline

### Work breakdown by owner

**DevOps / SRE**

- implement CI for contracts, frontend build, and smoke tests
- stand up staging environment
- configure secrets management

**Backend / AI Engineer**

- ensure backend deployability in staging
- validate config separation across environments

**Frontend Engineer**

- verify staging config compatibility
- test build/runtime behavior against staging APIs

**QA Engineer**

- formalize smoke suite
- run release candidate validation in staging

### Exit criteria

- every release candidate runs through CI
- staging is the required pre-production validation step
- secrets are not manually handled in source-controlled files

## Sprint 5: Security Hardening and Launch Readiness

**Dates:** May 25, 2026 to June 5, 2026  
**Primary owners:** Smart Contract Engineer, DevOps / SRE, Tech Lead, QA Engineer

### Goals

- complete audit readiness
- add operational controls
- define production go-live gates

### Deliverables

- audit package
- monitoring and alerting
- runbooks for tx failures and deployment rollback
- launch gate checklist

### Work breakdown by owner

**Smart Contract Engineer**

- freeze audit scope
- support auditor questions
- remediate critical findings

**DevOps / SRE**

- configure monitoring and alerts
- document rollback and incident response

**Tech Lead / Product Owner**

- run go/no-go review
- confirm production scope matches technical reality

**QA Engineer**

- validate fixes after remediation
- sign off on launch checklist evidence

### Exit criteria

- audit is complete or critical scope is cleared for launch
- monitoring and runbooks exist
- launch decision is evidence-based

## Optional Sprint 6: Post-MVP Expansion

**Dates:** June 8, 2026 to June 19, 2026  
**Primary owners:** Backend / AI Engineer, Frontend Engineer, Tech Lead

### Goals

- start next-phase features after MVP is stable

### Candidate deliverables

- unified auth provider selection
- user profile schema
- Risk Oracle 2.0 discovery
- personalized dashboard enhancements

## Ownership Matrix

| Workstream | Accountable owner | Supporting owners |
| --- | --- | --- |
| MVP scope and feature flags | Tech Lead / Product Owner | Frontend Engineer, Backend / AI Engineer |
| Asset configuration and bootstrap | Smart Contract Engineer | Tech Lead |
| Indexer and live data | Data Engineer | Backend / AI Engineer |
| Oracle/relay backend | Backend / AI Engineer | Smart Contract Engineer, DevOps / SRE |
| Frontend live integration | Frontend Engineer | Backend / AI Engineer |
| CI/CD and environments | DevOps / SRE | QA Engineer |
| Audit and remediation | Smart Contract Engineer | Tech Lead, QA Engineer |
| Launch readiness | Tech Lead / Product Owner | DevOps / SRE, QA Engineer |

## Sprint-Level Risks

| Sprint | Main risk | Mitigation |
| --- | --- | --- |
| Sprint 1 | Scope remains fuzzy | Freeze scope before Sprint 2 |
| Sprint 2 | Indexer complexity slows frontend progress | Start with minimal event coverage first |
| Sprint 3 | Route execution is harder than expected | Limit MVP to one route or disable feature |
| Sprint 4 | Environment/secrets delays | Assign DevOps ownership early |
| Sprint 5 | Audit reveals deeper contract changes | Keep contingency time for remediation |

## Definition of Done by Stage

### MVP done

- wallet-based user flow works end-to-end
- no fabricated metrics remain in core decision UX
- supported assets are real and configured
- history and summary data are live
- route execution is either real or deliberately excluded

### Production done

- audit complete
- staging and production environments managed
- monitoring and alerting live
- release pipeline green
- rollback and incident runbooks approved

## Recommended Weekly Cadence

- **Monday:** sprint planning / status review
- **Wednesday:** technical risk review
- **Friday:** demo and release-readiness checkpoint

If the project is executed by a very small team, do not add more features until the current sprint exit criteria are met. The main risk now is not lack of ideas. The main risk is shipping a prototype that still behaves like a demo.
