# Project status

Updated: 19 October 2026 (India).

SplitNest is a free, local academic and placement project. The objective is a
working application that demonstrates backend engineering and delivery with
evidence the owner can explain in interviews. Public hosting, paid services and
commercial operation are outside the scope.

## Completion and evidence

| Workstream | Status | Evidence or completion rule |
|---|---|---|
| Original backend and local delivery | **100% of the original acceptance scope** | [Verification record](evidence/verification.md): 75 Java tests, 20 script scenarios, actual Compose/kind smoke tests, CI, GitOps rollback/restoration and monitoring/load observations |
| Full-stack preparation | **Complete** | Approved scope/stack, [execution plan](frontend-extension-plan.md), [repository map](../README.md#repository-map), documentation index, frontend directory notes and learning sequence |
| Full-stack application | **6 of 6 milestones complete (100%)** | 93 Java tests, 90 frontend tests, 9 Chromium scenarios, 23 script scenarios; [automatic frontend-only rollout](evidence/frontend-gitops.json), image scan and Compose/kind verified |
| Detailed understanding phase | **Next, when the owner is ready** | [Learning roadmap](learning-roadmap.md), code walkthrough, exercises and unanswered interview questions |

The full-stack percentage follows the six acceptance milestones below. It
includes implementation and verification; the later guided learning phase is
tracked separately. Eight browser journeys use the real API/database; the ninth
uses a deterministic large-decimal response to verify exact display.

Existing observations are dated evidence, not continuous monitoring of the
owner's machine. Test counts must be updated when new tests are actually run.

## Completed implementation milestones

| # | Milestone | State |
|---|---|---|
| 1 | Interface foundation: compatible versions, actual DTO contracts, screen layout/routes and typed API errors | Verified |
| 2 | Browser authentication and app shell: cookie/CSRF adapter, session restoration and refresh coordination | Verified: Java security and browser-session tests |
| 3 | Groups, membership, expenses and balances | Verified: actual three-user browser scenario, historical balances and permissions |
| 4 | Statement uploads, real job polling, budgets and alerts | Verified: actual mixed CSV processing and budget changes; snapshot rendering/component tests |
| 5 | Responsive/accessibility polish, error states, component and browser reliability tests | Verified: desktop/mobile capture, keyboard navigation and multi-tab regressions |
| 6 | Packaged frontend build, CI/GitOps promotion, Compose/kind verification and complete demo documentation | Verified: published image, automatic frontend-only rollout, two ready replicas, all 9 browser scenarios passing |

Acceptance evidence for every milestone is in the
[frontend execution plan](frontend-extension-plan.md#5-focused-execution-milestones).
Work proceeds autonomously across coherent milestones. Record results as they
happen; ask the owner only for an indispensable decision, access or constraint.

## Scope that stays fixed

- Existing features: authentication, groups/roles, INR equal-split expenses,
  balances, CSV/XLSX imports, category budgets and scheduled alerts.
- One modular Java application. The compiled React interface joins the same
  Spring Boot image; PostgreSQL and Redis remain its data services.
- Current Swagger and API-client contracts remain available. Browser session
  integration has dedicated Java, component and real-browser tests.
- Use the existing free local environments and authorized GitHub setup. No paid
  account upgrade, cloud runtime, hosted database, external authentication
  provider, payment integration or invitation-email service is planned.
- Demonstrate with synthetic users and statements. No claim of commercial
  operations, production capacity, highly available PostgreSQL or tested backups.

## Workflow and handoff

1. **Preparation:** organize instructions, scope, repository map and docs. Complete.
2. **Build:** frontend features and browser integration are implemented; preserve
   tests, decisions and meaningful verified Git commits throughout.
3. **Verify:** complete: full browser journeys, the published image in Compose
   and kind, remote CI and automatic frontend-only GitOps rollout are recorded.
4. **Understand:** explain the completed system from requirements and data design
   onward, with code references and small exercises. Keep interview questions
   unanswered in the question list.
5. **Demonstrate:** use a complete local demo, architecture explanation and resume
   wording grounded in the final evidence.

The [documentation index](README.md) separates current runbooks, accepted plans,
architecture decisions and measured evidence so they can be read in context.

## Preparation file inventory

Preparation commit `90d459e` changed documentation and generated-file exclusions
only. Its file inventory is retained below; the current implementation inventory
is maintained in [implementation.md](implementation.md).

| File | Change |
|---|---|
| [README.md](../README.md) | Current/target status, repository map and learning-phase sequence |
| [agents.md](../agents.md) | Approved frontend stack, free local scope, workflow and honest progress reporting |
| [.gitignore](../.gitignore) | Exclude frontend dependencies, generated builds and test artifacts |
| [docs/README.md](README.md) | Central documentation navigation |
| [project-status.md](project-status.md) | Completion by scope, acceptance milestones and preparation inventory |
| [frontend-extension-plan.md](frontend-extension-plan.md) | Accepted stack/design, screen/API mapping, browser security and delivery gates |
| [frontend/README.md](../frontend/README.md) | Planned feature directories and frontend build/runtime responsibilities |
| [development-plan.md](development-plan.md) | Current scope/order while preserving the original backend plan and evidence |
| [architecture.md](architecture.md) | Distinguish implemented backend flows from the accepted frontend target |
| [setup.md](setup.md) | Current backend setup and explicitly pending frontend tool setup |
| [demo.md](demo.md) | Preserve the current API demo and define the future browser demonstration |
| [implementation.md](implementation.md) | Preserve the code map and mark future browser/security/build work |
| [learning-roadmap.md](learning-roadmap.md) | Later guided explanation and exercises from requirements through deployment |
| [learning-guide.md](learning-guide.md) | Connect the existing explanations to the later guided sequence |
| [interview-prep.md](interview-prep.md) | Preserve unanswered questions and accurate current/future interview framing |
| [0007-browser-frontend.md](decisions/0007-browser-frontend.md) | Record the accepted frontend decision with implementation pending |
| [evidence/verification.md](evidence/verification.md) | Clarify the scope of existing evidence without changing measured results |

The operational guides and first six ADRs were reviewed for scope consistency.
The later frontend implementation adds source/security/tests and updates the
delivery pipeline; those changes are separate from this preparation record.

Review the preparation commit and ignored frontend artifacts from PowerShell in
the repository root:

```powershell
git status --short
git show --stat --oneline 90d459e
git diff --check
git check-ignore -- frontend/node_modules/react/index.js frontend/dist/index.html frontend/coverage/index.html frontend/test-results/results.json frontend/.env
```

The last command should list every supplied path as ignored. Frontend source and
`package-lock.json` must remain trackable. Documentation checks cover local file
links, heading-fragment links, balanced fenced blocks, preserved demo commands
and unchanged original interview questions. The preparation record does not
claim runtime results for the later frontend implementation.
