# Implementation reading guide

Navigation: [documentation index](README.md) · [project status](project-status.md) ·
[approved frontend plan](frontend-extension-plan.md).

This inventory maps the implemented and verified backend, tests and local
delivery files. The browser frontend is approved but not implemented; there are
no frontend source files or browser-test results to inventory yet. The project
remains a free, local academic and placement app, with public/cloud hosting and
paid services excluded. Existing evidence describes the backend baseline, not a
completed full-stack application.

Finish the full local app first, then use this guide for the detailed learning
walkthrough. Runbooks remain available now through the
[documentation index](README.md).

Use this as a map from behavior to files. Start with [architecture.md](architecture.md),
then read a controller, its service and its repository together. Java records are
immutable API messages; entities represent database-managed state. Constructor
injection makes each class's collaborators explicit without Lombok.

## Application and shared infrastructure

| Files | Purpose and concept to notice |
|---|---|
| [SplitNestApplication.java](../src/main/java/com/splitnest/SplitNestApplication.java) | Starts Boot and scans the feature packages. |
| [ApplicationConfiguration.java](../src/main/java/com/splitnest/common/config/ApplicationConfiguration.java) | Supplies a UTC `Clock`, making time an injectable dependency. |
| [SecurityConfiguration.java](../src/main/java/com/splitnest/common/security/SecurityConfiguration.java), [CurrentUser.java](../src/main/java/com/splitnest/common/security/CurrentUser.java) | Stateless bearer validation, required signing key, safe filter errors and authenticated UUID lookup. |
| [ApiException.java](../src/main/java/com/splitnest/common/error/ApiException.java), [GlobalExceptionHandler.java](../src/main/java/com/splitnest/common/error/GlobalExceptionHandler.java) | Domain failures become consistent HTTP problems; unexpected details remain private. |
| [CacheConfiguration.java](../src/main/java/com/splitnest/common/config/CacheConfiguration.java) | Typed JSON balance cache, thirty-second TTL and PostgreSQL fallback after Redis cache errors. |
| [SchedulingConfiguration.java](../src/main/java/com/splitnest/common/config/SchedulingConfiguration.java), [SchedulerLockConfiguration.java](../src/main/java/com/splitnest/common/config/SchedulerLockConfiguration.java) | Enables scheduled work and JDBC ShedLock using database time. Scheduling can be disabled explicitly for controlled tests. |
| [RequestContextFilter.java](../src/main/java/com/splitnest/common/config/RequestContextFilter.java) | Adds request/user/group MDC context, logs completion status and removes its thread-local values in `finally`. |

## Authentication and users

| Files | Purpose and concept to notice |
|---|---|
| [AuthController.java](../src/main/java/com/splitnest/auth/AuthController.java), [AuthService.java](../src/main/java/com/splitnest/auth/AuthService.java) | Registration/login/refresh/logout HTTP contracts; password verification and service orchestration. Login invokes the Redis limiter with actual client IP. |
| [RegisterRequest.java](../src/main/java/com/splitnest/auth/RegisterRequest.java), [LoginRequest.java](../src/main/java/com/splitnest/auth/LoginRequest.java), [RefreshRequest.java](../src/main/java/com/splitnest/auth/RefreshRequest.java), [TokenResponse.java](../src/main/java/com/splitnest/auth/TokenResponse.java) | DTO records separate untrusted requests from stored state; registration/login normalize emails. |
| [ValidPassword.java](../src/main/java/com/splitnest/auth/ValidPassword.java), [PasswordValidator.java](../src/main/java/com/splitnest/auth/PasswordValidator.java) | A custom Jakarta validation constraint enforces Unicode character and BCrypt byte limits. |
| [JwtService.java](../src/main/java/com/splitnest/auth/JwtService.java) | Creates fifteen-minute HS256 access tokens with UUID subject and explicit issuer/audience. |
| [RefreshToken.java](../src/main/java/com/splitnest/auth/RefreshToken.java), [RefreshTokenRepository.java](../src/main/java/com/splitnest/auth/RefreshTokenRepository.java), [RefreshTokenService.java](../src/main/java/com/splitnest/auth/RefreshTokenService.java) | Hashed opaque tokens, families, user-row locking and committed replay revocation. |
| [OpenApiConfiguration.java](../src/main/java/com/splitnest/auth/OpenApiConfiguration.java) | Swagger advertises bearer authentication; public auth operations override the security requirement. |
| [User.java](../src/main/java/com/splitnest/user/User.java), [UserRepository.java](../src/main/java/com/splitnest/user/UserRepository.java) | JPA mapping and unique-email lookup; the pessimistic user lock coordinates refresh changes. |
| [UserController.java](../src/main/java/com/splitnest/user/UserController.java), [UserService.java](../src/main/java/com/splitnest/user/UserService.java), [UserResponse.java](../src/main/java/com/splitnest/user/UserResponse.java) | `/users/me` returns a safe DTO, never the password-bearing entity. |

## Groups, expenses and balances

| Files | Purpose and concept to notice |
|---|---|
| [GroupController.java](../src/main/java/com/splitnest/group/GroupController.java), [GroupService.java](../src/main/java/com/splitnest/group/GroupService.java), [GroupRepository.java](../src/main/java/com/splitnest/group/GroupRepository.java) | Group creation, current memberships, last-admin protection and explicit SQL/group locks. |
| [GroupAccessService.java](../src/main/java/com/splitnest/group/GroupAccessService.java) | Reusable membership/admin checks, including explicit user IDs for background work. |
| [GroupDtos.java](../src/main/java/com/splitnest/group/GroupDtos.java), [GroupRole.java](../src/main/java/com/splitnest/group/GroupRole.java) | Group/member request-response records and bounded role values. |
| [ExpenseController.java](../src/main/java/com/splitnest/expense/ExpenseController.java), [ExpenseService.java](../src/main/java/com/splitnest/expense/ExpenseService.java) | Creation/list/deletion/balances routes; permission checks and atomic expense/split writes. The import method captures one roster per statement. |
| [ExpenseRepository.java](../src/main/java/com/splitnest/expense/ExpenseRepository.java) | Inserts snapshots, scopes child queries to a group, paginates deterministically and calculates balances with SQL CTEs. |
| [ExpenseDtos.java](../src/main/java/com/splitnest/expense/ExpenseDtos.java), [ExpenseDraft.java](../src/main/java/com/splitnest/expense/ExpenseDraft.java), [Category.java](../src/main/java/com/splitnest/expense/Category.java) | Validated API records, internal parsed-expense data and category enum. |
| [EqualSplitCalculator.java](../src/main/java/com/splitnest/expense/EqualSplitCalculator.java) | Pure deterministic paise arithmetic; canonical UUID ordering assigns the remainder. |
| [BalanceService.java](../src/main/java/com/splitnest/expense/BalanceService.java), [BalanceCalculator.java](../src/main/java/com/splitnest/expense/BalanceCalculator.java), [BalanceResponse.java](../src/main/java/com/splitnest/expense/BalanceResponse.java) | Authorization precedes a separate cache-proxied calculator; balances preserve former participants. |
| [ExpenseChanged.java](../src/main/java/com/splitnest/expense/ExpenseChanged.java), [BalanceCacheInvalidation.java](../src/main/java/com/splitnest/expense/BalanceCacheInvalidation.java) | A transaction event evicts only after committed financial or membership changes. |

## Imports, budgets and limiting

| Files | Purpose and concept to notice |
|---|---|
| [ImportController.java](../src/main/java/com/splitnest/importjob/ImportController.java), [ImportService.java](../src/main/java/com/splitnest/importjob/ImportService.java) | Membership/rate checks, multipart validation, safe filename and durable upload before 202. |
| [ImportRepository.java](../src/main/java/com/splitnest/importjob/ImportRepository.java), [ImportTransactions.java](../src/main/java/com/splitnest/importjob/ImportTransactions.java) | Atomic claims, row-locked completion, stale recovery and transaction boundaries. |
| [ImportJob.java](../src/main/java/com/splitnest/importjob/ImportJob.java), [ImportResponse.java](../src/main/java/com/splitnest/importjob/ImportResponse.java), [ImportStatus.java](../src/main/java/com/splitnest/importjob/ImportStatus.java) | Internal persisted job snapshot, public status DTO and state enum. File bytes never enter the response. |
| [ImportQueued.java](../src/main/java/com/splitnest/importjob/ImportQueued.java), [ImportDispatcher.java](../src/main/java/com/splitnest/importjob/ImportDispatcher.java), [ImportWorker.java](../src/main/java/com/splitnest/importjob/ImportWorker.java), [ImportRecovery.java](../src/main/java/com/splitnest/importjob/ImportRecovery.java) | After-commit fast path plus durable redispatch, bounded async execution and stale-worker fencing. |
| [ImportConfiguration.java](../src/main/java/com/splitnest/importjob/ImportConfiguration.java), [ImportProperties.java](../src/main/java/com/splitnest/importjob/ImportProperties.java) | Explicit thread/queue bounds and validated parser limits/keyword settings. |
| [StatementParser.java](../src/main/java/com/splitnest/importjob/StatementParser.java), [CsvStatementParser.java](../src/main/java/com/splitnest/importjob/CsvStatementParser.java), [XlsxStatementParser.java](../src/main/java/com/splitnest/importjob/XlsxStatementParser.java) | One parsing contract, two implementations; strict UTF-8, ZIP/XML structural preflight and bounded workbook conversion without formula evaluation. StAX is part of the JDK, not another dependency. |
| [StatementRows.java](../src/main/java/com/splitnest/importjob/StatementRows.java), [ParsedStatement.java](../src/main/java/com/splitnest/importjob/ParsedStatement.java), [StatementParseException.java](../src/main/java/com/splitnest/importjob/StatementParseException.java) | Shared row validation/category rules, valid/invalid counts and sanitized parse failures. |
| [ImportMetrics.java](../src/main/java/com/splitnest/importjob/ImportMetrics.java) | Terminal-state counter and processing timer tagged by bounded status. |
| [BudgetController.java](../src/main/java/com/splitnest/budget/BudgetController.java), [BudgetService.java](../src/main/java/com/splitnest/budget/BudgetService.java), [BudgetRepository.java](../src/main/java/com/splitnest/budget/BudgetRepository.java) | Admin upserts, member reads, UTC monthly aggregates and conflict-safe alert insertion. Oversized snapshot totals are detected explicitly. |
| [BudgetRequest.java](../src/main/java/com/splitnest/budget/BudgetRequest.java), [BudgetResponse.java](../src/main/java/com/splitnest/budget/BudgetResponse.java), [BudgetAlertResponse.java](../src/main/java/com/splitnest/budget/BudgetAlertResponse.java) | Budget validation and public limit/alert snapshots. |
| [BudgetScheduler.java](../src/main/java/com/splitnest/budget/BudgetScheduler.java) | Daily UTC trigger with a shared JDBC scheduler lock. |
| [RateLimiter.java](../src/main/java/com/splitnest/ratelimit/RateLimiter.java), [RateLimitExceededException.java](../src/main/java/com/splitnest/ratelimit/RateLimitExceededException.java) | Atomic Redis Lua fixed windows and retry metadata; Redis outages reject affected operations with 503. |

## Database evolution

Flyway runs these ordered, forward-only migrations during startup. Hibernate
validates mapped tables rather than inventing a production schema. Do not edit an
already applied migration; add another version when the model changes.

| File | Schema responsibility |
|---|---|
| [V1__users.sql](../src/main/resources/db/migration/V1__users.sql) | UUID users, normalized unique email, password hash and display name. |
| [V2__refresh_tokens.sql](../src/main/resources/db/migration/V2__refresh_tokens.sql) | Hashed refresh tokens and indexed token families. |
| [V3__groups.sql](../src/main/resources/db/migration/V3__groups.sql) | Groups and composite-key memberships. |
| [V4__expenses.sql](../src/main/resources/db/migration/V4__expenses.sql) | Expenses, immutable split snapshots and query indexes; splits cascade on expense deletion. |
| [V5__imports.sql](../src/main/resources/db/migration/V5__imports.sql) | Persisted job/file limits, lifecycle counts/times and expense-to-job foreign key. |
| [V6__budgets.sql](../src/main/resources/db/migration/V6__budgets.sql) | Group/category limits and unique monthly alert snapshots. |
| [V7__scheduler_lock.sql](../src/main/resources/db/migration/V7__scheduler_lock.sql) | Shared scheduler lease state. |

## Tests and what they establish

Run `./mvnw.cmd verify` on Windows or `./mvnw verify` on Linux/macOS with Docker
available. Surefire explicitly includes `*Test`, `*Tests` and `*IT`; integration
tests are part of this command. The command is not a proof of an installed
Kubernetes cluster, a published image or measured performance. Current counts and
actual execution results are recorded separately by the verification ledger.

| Files | Evidence provided when the test passes |
|---|---|
| [IntegrationTestSupport.java](../src/test/java/com/splitnest/IntegrationTestSupport.java), [TestcontainersConfiguration.java](../src/test/java/com/splitnest/TestcontainersConfiguration.java) | Shared full application/MockMvc helpers, random test signing key and real PostgreSQL/Redis containers. |
| [SplitNestApplicationTests.java](../src/test/java/com/splitnest/SplitNestApplicationTests.java), [TestSplitNestApplication.java](../src/test/java/com/splitnest/TestSplitNestApplication.java) | Database/Redis connectivity assertion and optional test-container-backed app launcher. |
| [AuthenticationIntegrationTest.java](../src/test/java/com/splitnest/auth/AuthenticationIntegrationTest.java), [PasswordValidatorTest.java](../src/test/java/com/splitnest/auth/PasswordValidatorTest.java) | Real bearer validation, registration/hash protection, replay revocation, concurrent refresh/logout ownership and password boundaries. |
| [FinancialApiIntegrationTests.java](../src/test/java/com/splitnest/expense/FinancialApiIntegrationTests.java), [EqualSplitCalculatorTests.java](../src/test/java/com/splitnest/expense/EqualSplitCalculatorTests.java) | Exact amounts, SQL totals, group isolation, roles/history, pagination, rollback and roster/admin concurrency invariants. |
| [DateRangeIntegrationTest.java](../src/test/java/com/splitnest/expense/DateRangeIntegrationTest.java) | Unsupported calendar years are rejected before reaching PostgreSQL. |
| [BalanceCacheIntegrationTest.java](../src/test/java/com/splitnest/expense/BalanceCacheIntegrationTest.java) | Redis serialization/TTL and committed mutation invalidation; cached values cannot bypass current membership. |
| [RateLimiterTest.java](../src/test/java/com/splitnest/ratelimit/RateLimiterTest.java) | Concurrent Redis counter enforcement, bucket reset/expiry and explicit 503 policy. |
| [CommonApiIntegrationTest.java](../src/test/java/com/splitnest/common/CommonApiIntegrationTest.java) | Public 429/Retry-After, validation/malformed-body errors and standard authenticated 404/405 behavior. |
| [StatementParserTest.java](../src/test/java/com/splitnest/importjob/StatementParserTest.java) | CSV/XLSX fixtures, skipped invalid rows, unsafe/oversized inputs, exact numeric amounts and formula policy. |
| [XlsxPreflightTest.java](../src/test/java/com/splitnest/importjob/XlsxPreflightTest.java) | Adversarial ZIP/XML fixtures verify sparse row/cell, style, shared-string, depth/text/entity and disguised-binary bounds before POI allocation. |
| [ImportProcessingIT.java](../src/test/java/com/splitnest/importjob/ImportProcessingIT.java), [ImportDispatcherTest.java](../src/test/java/com/splitnest/importjob/ImportDispatcherTest.java) | Actual async upload, one claim, lost-event redispatch, stale-worker fencing, rollback, removal recheck and overload behavior. |
| [BudgetIT.java](../src/test/java/com/splitnest/budget/BudgetIT.java), [BudgetServiceTest.java](../src/test/java/com/splitnest/budget/BudgetServiceTest.java) | Admin/member boundaries, UTC month/strict threshold, duplicate-safe concurrent alerts and oversized-snapshot policy. |
| [OperationalIntegrationTest.java](../src/test/java/com/splitnest/common/OperationalIntegrationTest.java) | Independent JDBC providers contend for one lock; real import/budget work emits Prometheus metrics. Registry scraping does not claim separate-port HTTP verification. |
| [RequestContextFilterTest.java](../src/test/java/com/splitnest/common/RequestContextFilterTest.java) | Request MDC lifetime, cleanup on failure and absence of credentials/body contents in completion logs. |
| [mixed.csv](../src/test/resources/statements/mixed.csv), [invalid.csv](../src/test/resources/statements/invalid.csv), [missing-columns.csv](../src/test/resources/statements/missing-columns.csv), [sample.xlsx](../src/test/resources/statements/sample.xlsx) | Reusable parser fixtures, including readable-invalid and unreadable-header distinctions. |

## Build, local operation and delivery files

| Files | Purpose and concept to notice |
|---|---|
| [pom.xml](../pom.xml) | Java 21, Boot-managed dependencies, explicit parser/springdoc/ShedLock versions and all-test inclusion. A documented Tomcat 11.0.27 override replaces Boot's vulnerable 11.0.24; tests and the rebuilt local Trivy scan pass as separate gates. |
| [mvnw](../mvnw), [mvnw.cmd](../mvnw.cmd), [maven-wrapper.properties](../.mvn/wrapper/maven-wrapper.properties) | Reproducible Maven entry points; global Maven is unnecessary. |
| [application.yml](../src/main/resources/application.yml) | Environment-backed credentials, database/Redis pools, management port, parser rules, histograms and ECS JSON logs. |
| [.gitignore](../.gitignore), [.gitattributes](../.gitattributes), [.dockerignore](../.dockerignore), [.env.example](../.env.example) | Exclude secrets/build output, preserve executable text line endings and document required local settings. The ignored `.env` contains local values and is not a deliverable. |
| [compose.yaml](../compose.yaml), [Dockerfile](../Dockerfile) | Health-gated data dependencies, durable PostgreSQL volume and a non-root multi-stage Java image. Read [docker.md](docker.md) for line-level explanation. |
| [Initialize-Local.ps1](../scripts/Initialize-Local.ps1), [Start-Local.ps1](../scripts/Start-Local.ps1), [Validate-Manifests.ps1](../scripts/Validate-Manifests.ps1), [Smoke-Test.ps1](../scripts/Smoke-Test.ps1) | Generate ignored random secrets, run the local app, render/check Kubernetes sources and demonstrate real HTTP financial/auth/import invariants without printing credentials. |
| [Test-ValidateManifests.ps1](../scripts/Test-ValidateManifests.ps1) | Mock-based PowerShell checks prove render-only mode avoids cluster calls, server validation explicitly selects its default/override context, and validation/JSON failures stop the script. Server mode defaults to `kind-splitnest`; it uses a dry run. |
| [Create-LocalClusterSecret.ps1](../scripts/Create-LocalClusterSecret.ps1) | Creates only the two required Secret keys from ignored `.env`, explicitly targets `kind-splitnest`, and preserves an existing Secret. It streams the object to kubectl without a secret manifest file or printed values. |
| [Prepare-LoadTest.ps1](../scripts/Prepare-LoadTest.ps1), [Test-PrepareLoadTest.ps1](../scripts/Test-PrepareLoadTest.ps1) | Creates three synthetic users, one group and a bounded expense dataset, then stores only the needed credentials in ignored `.work/loadtest.env`. The fixture suite checks setup behavior and sensitive-error handling without a real API. |
| [promote-deployment.sh](../scripts/promote-deployment.sh), [test-promotion.sh](../scripts/test-promotion.sh) | Generate deployment-branch state with immutable image provenance and stale-run checks; local temporary-Git tests exercise the promotion protocol without claiming a remote rollout. |
| [ci.yml](../.github/workflows/ci.yml), [dependabot.yml](../.github/dependabot.yml), [pull_request_template.md](../.github/pull_request_template.md) | Configures application/PowerShell/GitOps fixture verification, main-only SHA-tagged image scan/publication, dependency updates and review context. Remote success requires actual CI evidence. |
| [kind-config.yaml](../deploy/kind/kind-config.yaml), [kind-config-cgroup-v1.yaml](../deploy/kind/kind-config-cgroup-v1.yaml), [namespace.yaml](../deploy/base/namespace.yaml) | Pins the local Kubernetes node and namespace. The separate cgroup v1 file is an explicit temporary compatibility option for older Docker/WSL hosts. |
| [postgres.yaml](../deploy/base/postgres.yaml), [redis.yaml](../deploy/base/redis.yaml) | Handwritten data-store workloads/Services; PostgreSQL retains a PVC. |
| [app.yaml](../deploy/base/app.yaml), [configmap.yaml](../deploy/base/configmap.yaml), [hpa.yaml](../deploy/base/hpa.yaml) | App security/resources/probes, non-secret settings and CPU-driven replica target. |
| [base/kustomization.yaml](../deploy/base/kustomization.yaml), [local/kustomization.yaml](../deploy/overlays/local/kustomization.yaml) | Compose reusable resource definitions into the local deployment. |
| [application.yaml](../deploy/argocd/application.yaml) | Argo CD watches `deploy/local`, self-heals and respects the HPA-owned replica count. |
| [values.yaml](../deploy/monitoring/values.yaml), [servicemonitor.yaml](../deploy/monitoring/servicemonitor.yaml), [monitoring/kustomization.yaml](../deploy/monitoring/kustomization.yaml), [splitnest.json](../deploy/monitoring/dashboards/splitnest.json) | Monitoring chart settings, app discovery and dashboard source. A JSON file is not a screenshot or evidence of an installed dashboard. |
| [balances.js](../loadtest/balances.js), [job.yaml](../loadtest/job.yaml), [loadtest/kustomization.yaml](../loadtest/kustomization.yaml) | k6 workload and in-cluster Job sources; measurement procedure is in [monitoring.md](monitoring.md). |

## Pending frontend inventory

The [approved extension plan](frontend-extension-plan.md) identifies the future
frontend source/tests, browser-session integration, static-resource routing,
Docker build changes and CI/GitOps checks. Those files will be added to this
inventory only as their milestones are implemented. In particular, the current
security configuration and JSON token DTOs should not be read as an implemented
HttpOnly-cookie browser session flow.

Reusing the backend's API does not make its tests a substitute for interface
tests. The extension must add its own component, session/security and real-browser
checks, then verify the combined image locally. See
[project status](project-status.md) for the separate backend and frontend states.

## Reading and interview practice

The practical [operations runbook](operations.md) ties startup, health checks,
secrets, Flyway, job recovery and binary-safe backup procedures together. Backup
and restore commands are documented procedures; their execution is not implied
by this file inventory.

Read [demo.md](demo.md) while calling the API. Then explain one expense's journey
using [architecture.md](architecture.md) without reading the source. Consult the
six implemented-backend [ADRs](decisions/0001-modular-monolith.md) to discuss
consequences rather than listing technologies. A seventh
[frontend ADR](decisions/0007-browser-frontend.md) records the accepted design,
whose implementation is pending. The original twenty interview questions remain
unanswered in [interview-prep.md](interview-prep.md).

1. Which repository APIs use JPA, and why do the JDBC writes still share one service transaction?
2. Which tests would you read before changing member removal or refresh-token rotation?
3. Which files describe deployment intent, and what additional evidence proves that intent worked?
