# SplitNest execution plan

Reviewed: 18 October 2026. This is the current execution plan. The original
feature specification and numbered learning tasks remain in `agents.md`.

## 1. Review outcome

The initial repository contained only `agents.md`. There was no source code,
build file, Maven wrapper, Docker configuration, or Git repository to preserve.
This is a new implementation, rather than a partially completed application.

The proposed modular monolith is appropriate: one deployable application with
packages for auth, users, groups, expenses, budgets, imports, and rate limiting.
Its strongest interview material will be financial correctness, authorization,
transactions, background-job reliability, and reproducible delivery.

Keep all the original product features. Keep the original exclusions, including
no frontend, microservices, message broker, cloud deployment, Terraform, unequal
splits, or settlement optimization. Do not add infrastructure just to lengthen
the technology list.

Execute six milestones rather than pausing at every original task. Start CI
early, implement tests with behavior, and update explanations alongside code.
The milestones are execution order and acceptance gates, not requests for
repeated permission. Setup and GitHub instructions are collected in
[setup.md](setup.md).

## 2. Environment and baseline

Observed locally during this review:

| Item | Observation | Consequence |
|---|---|---|
| Git | 2.53.0.windows.2 available | Local version control can be initialized later |
| Java | Direct JDK executable reports 23.0.2; JAVA_HOME points to JDK 23 | Install/select JDK 21 to match development, CI, and containers |
| IDE | VS Code installation found | Can use the existing IDE |
| Maven | Not found on PATH | Generate and commit Maven wrapper scripts |
| Docker | CLI not found on PATH or in checked install directories | Docker Desktop setup is needed for integration tests and deployments |
| Kubernetes tooling | kubectl, kind, Helm not found on PATH | Install before the Kubernetes milestone |
| Other tooling | gh and k6 not found on PATH | gh is optional; k6 can run in a container |
| PostgreSQL | Version 18 client binaries found | Does not establish server health; avoid assuming port 5432 is free |
| GitHub | No local repository or remote configured | Owner creates repository; authenticate through normal Git tools |

These observations are not a complete inventory of every installation on the
computer. Missing PATH entries are reported as observations, not proof that a
program cannot exist elsewhere. No installers or global settings were changed.

### Version decisions

The live [Spring Initializr metadata](https://start.spring.io/metadata/client)
returned `4.1.1.RELEASE` as its default stable Boot version during this review;
its Java choices included 21. Use Spring Boot 4.1.1 as the proposed starting
baseline, not a milestone, release candidate, or snapshot. Confirm artifact
resolution and a complete application startup when generating the project.

Retain Java 21. The [Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html)
support this choice. Prefer Boot's dependency management over manually pinning
every transitive library.

The original JUnit 5 wording needs an update. Use the JUnit Jupiter test support
managed by Boot 4.1, whose current testing documentation describes JUnit 6.
This is a version update within the existing test stack, not an additional
testing framework. See [Boot testing](https://docs.spring.io/spring-boot/reference/testing/index.html).

Use springdoc's Boot 4 generation, with 3.1.1 as the candidate version from its
[current documentation](https://springdoc.org/). Its published matrix explicitly
lists Boot 4.0 with springdoc 3.0; a Boot 4.1.1 + springdoc 3.1.1 smoke test is
still required before calling the combination verified.

Use Spring's `ProblemDetail` with the current Problem Details standard,
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), which supersedes the
plan's RFC 7807 reference. The error-response intent stays the same.

Resolve and pin remaining container tags, Helm charts, external library
versions, and CI action revisions when their milestones begin. Record the
selected versions and verification result; do not silently switch technologies
to make a build pass. No application dependencies have been added yet.

## 3. Proposed architecture

```mermaid
flowchart LR
    U[Swagger UI or API client] --> S[Spring Security: JWT]
    S --> C[Feature controllers: validate and map DTOs]
    C --> B[Feature services: access rules and transactions]
    B --> P[(PostgreSQL: source of truth)]
    B --> R[(Redis: limiter and balance cache)]
    B --> J[Persisted import job]
    J --> W[Bounded async worker and recovery dispatcher]
    W --> P
    D[Daily budget job with ShedLock] --> P
    B --> M[Actuator and application metrics]
    M --> G[Prometheus and Grafana]
```

Each feature follows Controller -> Service -> Repository. Controllers accept
and return record DTOs. They never expose JPA entities or call repositories
directly. Shared infrastructure stays in `common`; business rules stay in their
feature packages. Use one Maven module and one application image.

PostgreSQL owns durable business state. Redis contains replaceable cached
results and shared rate-limit counters. Background work uses the existing
database and bounded executor; no message broker is needed for this scope.

The diagram is a target design, not evidence of an implemented deployment.

## 4. Contracts to settle before feature implementation

### Money and membership

- All groups use INR in this version; there is no foreign-exchange conversion.
  State this in the API documentation so unrelated currencies cannot be mixed.
- Store money as NUMERIC(12,2), use BigDecimal, and reject nonpositive expenses,
  excess precision, and values outside the database range.
- Split integer paise. Sort members by canonical UUID text and allocate each
  remaining paisa to the next member. Document the ordering and test it.
- Capture the member roster when creating the expense. Later membership changes
  never recalculate historical splits.
- Membership changes and expense creation take the same group-row lock, giving
  concurrent operations a definite order. Check permissions again within the
  mutation transaction, including the last-admin rule.
- Removing a member removes current access, not their historical financial
  records. Balance output includes former participants with a `currentMember`
  flag, as well as current members. Former members cannot query the group.
- Calculate total paid and total share in separate SQL aggregates before joining
  them. Joining every payment to every split would multiply payment totals.
- Persist an expense and all its splits in one transaction. Deletion also removes
  its splits atomically. Every group's net balances must sum to exactly zero.

### Authentication and access control

- Lowercase/normalize emails consistently; enforce uniqueness in PostgreSQL.
- Use BCrypt and validate its input byte limit explicitly, including Unicode
  passwords. Do not silently truncate passwords.
- Issue HS256 access tokens valid for 15 minutes. Require a sufficiently strong
  secret from the environment, with no committed or built-in signing secret.
  Validate signature, expiry, issuer, and audience.
- Generate opaque refresh tokens using SecureRandom; store only SHA-256 hashes.
  Use a seven-day refresh lifetime as the initial documented policy.
- Lock and rotate refresh tokens in one transaction. Retain a token-family link
  so reuse can revoke the remaining family, rather than just rejecting the
  already-revoked row. Commit replay-triggered family revocation before returning
  401; an exception must not roll it back. Test A -> B, replay A, then rejection
  of B. Clients serialize refresh calls, because concurrent refreshes can be
  indistinguishable from replay and revoke the family.
- Logout checks ownership and revokes refresh capability. Already-issued access
  tokens remain usable until expiry; immediate access-token revocation is outside
  this version's scope.
- Apply GroupAccessService to every group operation. Outsiders receive 404;
  members attempting an admin action receive 403. Nested queries constrain both
  group ID and child-resource ID.
- Return consistent ProblemDetail responses from controller advice and Spring
  Security's filter-chain error handlers. Do not return stack traces.

### Imports and scheduled work

- Support documented UTF-8 CSV and XLSX columns: date, description, amount.
  Define accepted date/number formats and reject unsupported spreadsheet types.
- Enforce the 5 MB upload limit plus row and expanded-workbook limits. Bound
  memory and executor queues; do not evaluate spreadsheet formulas or external
  links. Include malformed and oversized fixtures in tests.
- Persist PENDING before returning 202. The after-commit async event is a fast
  dispatch path; a periodic pending-job dispatcher closes the crash/rejection
  gap. Both paths use an atomic PENDING -> PROCESSING claim.
- Add `started_at` for processing age. Recover stale PROCESSING jobs periodically
  and at startup, rather than comparing upload creation time to ten minutes.
- Parse outside a long database transaction. A separate worker service saves all
  valid rows and COMPLETED status in a fresh transaction; if persistence fails,
  none of that job's expenses are committed. Invalid rows are counted and skipped.
  A readable file with zero valid rows is FAILED with zero imported rows and a
  sanitized explanation; test this separately from an unreadable file.
- Capture one member roster for each imported statement at persistence time.
  Recheck the uploader's membership; removal before persistence fails the job.
- The final persistence transaction locks the job row and checks it is still
  PROCESSING before saving expenses and marking COMPLETED. Recovery changes stale
  jobs to FAILED; a worker that finds that status aborts its whole transaction.
  This nonretrying protocol needs no additional lease/fencing framework. Do not
  automatically retry FAILED jobs. Test recovery racing final persistence.
- Configure parsing and categorization limits and keywords in application.yml.
  Clear stored file bytes on terminal completion/failure; retain status and counts.
- Budget month boundaries and the daily schedule use UTC. An alert means spending
  is strictly greater than the limit. Keep a unique group/category/month key;
  use conflict-safe inserts rather than leaving a transaction rollback-only.
- Add ShedLock before running two app replicas. Row claiming remains necessary
  for imports even with a scheduler lock.

### Redis and operational behavior

- Implement fixed calendar-minute/hour buckets. A Redis Lua script combines
  INCR, initial expiry, and TTL lookup atomically. Return 429 and Retry-After.
- Login uses a key for normalized email plus actual client IP; uploads use user
  ID. Hash key components to avoid storing raw email addresses in Redis keys.
  Do not trust arbitrary X-Forwarded-For headers in this local deployment.
- If rate limiting cannot reach Redis, reject the affected operation with 503.
  Cache failures fall back to PostgreSQL so balances remain available.
- Check membership before any cache lookup. Evict balances after committed
  expense writes, imports, and membership changes; use a short TTL.
- Treat the cache as bounded eventual consistency. A concurrent stale fill can
  race an eviction; document and test the boundary. PostgreSQL remains the
  authority for writes and financial invariants. Do not claim the cache makes
  all reads linearizable.
- Liveness checks the app process, not database availability. Readiness includes
  PostgreSQL but excludes Redis, so the stated degraded balance-read behavior
  remains reachable through the Service. Rate-limited operations return 503
  during that Redis outage. Use startup probes for Java warm-up, graceful shutdown,
  bounded pools, and explicit resource requests/limits.
- Expose metrics through an internal management path/port. User and group IDs
  belong in structured logs, never high-cardinality metric labels.

These are implementation decisions to validate, not completed features.

## 5. Milestones and acceptance gates

| Milestone | Original task references | Deliverable | Acceptance evidence | Status |
|---|---|---|---|---|
| 1. Reproducible foundation | 0.1-0.3, 1.1, 6.1 | Wrapper, Boot project, feature packages, Compose data services, configuration, errors, initial test CI | Java 21 build; PostgreSQL/Redis connectivity; migration startup; Windows verify and Linux CI results | Planned |
| 2. Complete financial API | 1.2-1.5, 2.1-2.4, 3.1 | Registration/login/refresh/logout, Swagger, membership, expenses, SQL balances, isolation suite | Three-user API demo; uneven splits; rollback; history after removal; 404/403 matrix; refresh replay/concurrency tests | Planned |
| 3. Reliability and background work | 3.2-3.4, 4.1-4.5, 9.1-9.2 | Limiting/cache, imports/recovery, budgets/alerts, metrics/log context, initial ADRs | Real Redis tests; file fixtures; one claim across workers; recovery of lost events; duplicate-alert prevention; secret-free logs | Planned |
| 4. Reproducible delivery | 5.1-5.2, 6.2 | Non-root multistage image, full Compose, scan, GHCR image publishing | Clean Compose startup; smoke scenario; measured image size; required test job and critical-vulnerability scan pass | Planned |
| 5. Kubernetes and GitOps | 7.1-7.6, 8.1-8.4 | kind, handwritten manifests, two replicas, ShedLock, HPA, Argo CD, promotion and rollback | Healthy rollouts; persistence observation; single scheduled execution; commit-to-cluster reconciliation; Git rollback; failure experiments | Planned |
| 6. Evidence and interview handoff | 9.3-9.4, 10.1-10.3 | Dashboard, controlled k6 runs, complete README/runbooks/ADRs/demo | Actual screenshots and test artifacts; reproducible performance report; clean-checkout walkthrough; explainable decisions and limitations | Planned |

Every behavior change includes appropriate tests in its milestone. No gate is
complete merely because the files exist. Docker-dependent tests that cannot run
are recorded as blocked, not silently skipped and reported as passing.

Use subagents for independent implementation/review where interfaces are stable.
Coordinate shared schema, pom.xml, security, and configuration centrally to avoid
conflicting edits. Review and integrate every delegated change before a commit.

## 6. Test strategy

| Layer | What it proves |
|---|---|
| Unit: Jupiter, AssertJ, Mockito where useful | Exact splitting, categorization, parser edge cases, small deterministic service rules |
| PostgreSQL integration: Testcontainers | Flyway schema, SQL aggregates, database constraints, transaction rollback, refresh races, import claims |
| Redis integration: Testcontainers GenericContainer | Shared counters/expiry, concurrency, cache invalidation, failure policies |
| Full HTTP/security integration | Actual bearer validation, filter errors, DTO validation, roles, foreign-group and mismatched child IDs |
| Delivery validation | Compose configuration, clean startup, smoke script, Kustomize rendering, cluster-side validation and rollout |
| Controlled performance/failure exercises | Measured cache impact, latency/errors, HPA behavior, pod/data-store failures and Git rollback |

Maven's unit tests and integration tests will both be included in `verify`.
CI uses Docker-capable Linux runners. A Dockerfile build packages the already
verified application; it does not pretend to run Testcontainers inside a normal
Docker build. CI must require the separate verification job before publication.

Tests use a controlled clock where time matters and test realistic failures.
Avoid brittle tests that only mirror method implementations or use an in-memory
database as proof of PostgreSQL behavior.

## 7. GitHub and delivery design

Recommend repository name `splitnest`, default branch `main`, a short descriptive
README, relevant topics, pull-request template, dependency update configuration,
and protected main after the first CI checks exist. Do not choose a license on
the owner's behalf. Public visibility is useful for portfolio review.

Commit coherent changes with tests and explanation, such as `feat(auth): rotate
refresh tokens atomically` or `ci: verify and scan application image`. Push each
meaningful verified milestone once the owner supplies the repository URL and
working authentication. Never force-push, rewrite unrelated history, or record
secrets. Repository-local Git identity must reflect the owner or an explicitly
configured identity; do not fabricate one.

Keep required verification workflows running for code and manifest changes.
Use job conditions to avoid unnecessary image builds for documentation/deployment
changes. Do not ignore all deploy/** changes at workflow level: skipped required
checks can remain pending. See [GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Publish only tested and scanned images from main, tagged with the source commit
SHA, and include source/revision labels. Use read-only permissions by default,
packages:write only for publishing, and contents:write only for promotion.
Never expose publishing credentials to untrusted pull-request code.

**Proposed improvement to original Task 8.3:** protect application source on main
and have the promotion job update image references on a dedicated `deploy/local`
branch in the same repository. Argo CD watches that branch's local overlay.
This preserves automatic deployment without requiring a bot to bypass main's
pull-request protections. The branch is generated deployment state; application
code and manifest source remain on main. Limit the branch to deployment files
and provenance; preserve its history without force pushes. Keep manifest-sync
commits separate from image-reference promotions, so reverting a promotion cannot
also undo unrelated manifest changes. Record the source SHA and exact image digest.
Define regenerated files, preserve the promoted image during manifest-only changes,
and reject stale promotion runs so an older build cannot overwrite a newer one.
Render and validate the final generated overlay before every push; main's checks
alone do not validate that final combination. Test manifest-only updates, stale
runs, and rollback explicitly. Bootstrap this branch only when the Kubernetes
milestone is ready; it is not another application.

This replaces the original direct-to-main tag commit for a concrete reason:
strict protected-main rules and unrestricted bot pushes conflict. It adds no
service or dependency. A deployment-tag Git revert on deploy/local will be the
rollback demonstration; a bad source change must also be reverted on main.
GitHub documents the ordinary GITHUB_TOKEN push recursion behavior in its
[workflow-trigger guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

After the first image publish, explicitly confirm GHCR package visibility; a
public repository does not establish that the package is publicly pullable.
Otherwise configure an image pull secret. No registry token goes into Git.

Argo CD must ignore /spec/replicas for the HPA-managed Deployment and respect that
ignore rule during sync. Keep storage pruning/deletion effects explicit. Git
rollback changes the desired image; it does not undo database migrations.
Use backward-compatible, forward-only schema evolution.

## 8. Documentation and learning workflow

Keep README concise. Maintain this plan as an implementation ledger, updating
each milestone with files changed, behavior, exact commands, results, and open
limitations. Do not invent results or add badges before their checks exist.

Current learning material:

- [learning-guide.md](learning-guide.md): concepts and the reasoning to revisit
  while reading implementation.
- [interview-prep.md](interview-prep.md): twenty unanswered questions, basic to
  advanced.
- [setup.md](setup.md): grouped Windows prerequisites and GitHub setup.

Create these additional artifacts as their subject is implemented:

- docs/architecture.md: actual request, import, deployment, and data flows.
- docs/decisions/: concise ADRs for monolith, JWT/refresh, Redis limiting,
  async/database dispatch, ShedLock, and GitOps promotion branch.
- docs/operations.md: startup, shutdown, secrets, health, logs, migrations,
  recovery, backup/restore limitations, rollout and rollback.
- docs/demo.md: exact Swagger/API scenario, sample CSV/XLSX, failure exercises,
  and a short interview walkthrough.
- docs/evidence/: actual verification output summaries, dashboard screenshots,
  measured image size and load-test results with tested commit and environment.

At each milestone explain the concepts, point to the relevant files, and add
two or three unanswered understanding questions. Explanations must describe the
actual code, not only generic tutorials. This documentation allows uninterrupted
development while the owner studies at a separate pace.

## 9. Demonstration and completion criteria

The final demonstration will register three users, create a group, add members,
log in through Swagger, add a 100.00 expense, show exact 33.34/33.33/33.33 shares,
and show balances that sum to zero. It will reject cross-group access, retain
history after removal, reject reused refresh tokens, process a statement with
invalid rows, and demonstrate budget/limiter behavior.

Delivery evidence will include a clean-checkout run, real CI results and image
scan, two local app replicas, recovery after pod deletion, one scheduled budget
execution, Git-driven rollout and rollback, and a Grafana dashboard.

Use port-forward for Swagger. Run replica/load demonstrations through the actual
Kubernetes Service, preferably with a k6 Job inside the cluster. Port-forwarding
a Service selects a backing pod and is unsuitable as proof of distributed load.

Measure cached/uncached performance with the same dataset, warm-up, duration,
concurrency, and fixed replica count. Demonstrate HPA separately. A cached endpoint
may not create enough CPU demand to scale; report observation instead of forcing
or inventing a scaling result. Record hardware/resources and errors alongside p95.

Completion means all feature gates are verified, documentation can reproduce
the demo, external repository/image/cluster steps have actually succeeded, and
remaining limitations are explicit. A kind cluster with one PostgreSQL instance
demonstrates deployment skills; it is not a highly available production service.
PVC survival is not a backup strategy, and deleting kind can delete local data.

Candidate resume wording, to use only after implementation and verification:

> Built a Java/Spring Boot expense-sharing API with transactional equal splits,
> JWT authentication, PostgreSQL, Redis caching/rate limiting, and background
> statement imports; automated testing, image scanning, and local Kubernetes
> delivery with GitHub Actions, Argo CD, and Prometheus/Grafana.

Add performance numbers only after repeatable measurements exist.

## 10. Current verification record

- Completed: read the full original plan, inspected the folder and Git state,
  checked tool availability, directly verified installed JDK/Git versions,
  checked live Initializr metadata and primary documentation, and reviewed
  architecture/delivery risks independently.
- Created: the revised execution plan, setup guide, learning guide, interview
  questions, README, and updated working instructions.
- Documentation checks passed: six Markdown files, eleven resolving local links,
  balanced code fences, and twenty sequentially numbered interview questions.
- Not started: application code, Maven build, automated application tests,
  Docker images, cluster creation, CI runs, Git commits, or remote pushes.
- External prerequisites: select JDK 21, install/start Docker Desktop, and create
  the empty GitHub repository. These instructions are collected in setup.md.
