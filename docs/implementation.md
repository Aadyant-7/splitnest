# Implementation reading guide

Navigation: [documentation index](README.md) · [project status](project-status.md) ·
[approved frontend plan](frontend-extension-plan.md).

This inventory maps the implemented Java backend, React frontend, tests and
delivery sources. The frontend strict build, 82 unit/component tests, seven
real-backend Vite/Chromium scenarios and 92 Java tests have passed. Combined-image
delivery has a separate evidence gate in [project status](project-status.md).
The project remains a free local academic and placement app; public/cloud hosting
and paid services are excluded.

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
| [SpaRoutes.java](../src/main/java/com/splitnest/common/config/SpaRoutes.java), [SpaController.java](../src/main/java/com/splitnest/common/config/SpaController.java) | Explicit page/resource allowlists; canonical UUID group routes forward to the bundled index without swallowing API, actuator or unknown-asset errors. |

## Authentication and users

| Files | Purpose and concept to notice |
|---|---|
| [AuthController.java](../src/main/java/com/splitnest/auth/AuthController.java), [AuthService.java](../src/main/java/com/splitnest/auth/AuthService.java) | Registration/login/refresh/logout HTTP contracts; password verification and service orchestration. Login invokes the Redis limiter with actual client IP. |
| [BrowserAuthController.java](../src/main/java/com/splitnest/auth/BrowserAuthController.java), [BrowserSessionCookies.java](../src/main/java/com/splitnest/auth/BrowserSessionCookies.java) | CSRF bootstrap, access-only browser login/refresh, owned logout and host-only HttpOnly Strict cookies. Confirmed401/successful logout clear refresh state; transient failures and owner403 preserve retryable cookies. |
| [BrowserAccessResponse.java](../src/main/java/com/splitnest/auth/BrowserAccessResponse.java), [BrowserCsrfResponse.java](../src/main/java/com/splitnest/auth/BrowserCsrfResponse.java) | Browser DTOs expose access credentials or the masked CSRF/header pair without returning a refresh secret in JSON. |
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
| [BrowserAuthIntegrationTest.java](../src/test/java/com/splitnest/auth/BrowserAuthIntegrationTest.java), [BrowserSessionCookiesTest.java](../src/test/java/com/splitnest/auth/BrowserSessionCookiesTest.java), [BrowserAuthControllerTest.java](../src/test/java/com/splitnest/auth/BrowserAuthControllerTest.java) | Cookie scope/security, masked CSRF and statelessness, bearer logout still requiring CSRF, rotation/replay, shared login limit, local HTTP override and preservation on500/owner403. |
| [SpaRoutingIntegrationTest.java](../src/test/java/com/splitnest/common/SpaRoutingIntegrationTest.java), [index.html](../src/test/resources/static/index.html) | Explicit browser-route forwarding, restrictive UI CSP, Swagger compatibility and unknown resource/API/actuator errors. The test index is a fixture, not a production frontend substitute. |
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
| [compose.yaml](../compose.yaml), [Dockerfile](../Dockerfile) | Health-gated dependencies, durable PostgreSQL volume, a pinned Node asset-build stage, JDK packaging and a non-root JRE runtime. Compose explicitly selects local HTTP cookie settings. Read [docker.md](docker.md) for delivery details and the status ledger for actual image verification. |
| [Initialize-Local.ps1](../scripts/Initialize-Local.ps1), [Start-Local.ps1](../scripts/Start-Local.ps1), [Validate-Manifests.ps1](../scripts/Validate-Manifests.ps1), [Smoke-Test.ps1](../scripts/Smoke-Test.ps1) | Generate ignored random secrets, run the local app, render/check Kubernetes sources and demonstrate real HTTP financial/auth/import invariants without printing credentials. |
| [Test-ValidateManifests.ps1](../scripts/Test-ValidateManifests.ps1) | Mock-based PowerShell checks prove render-only mode avoids cluster calls, server validation explicitly selects its default/override context, and validation/JSON failures stop the script. Server mode defaults to `kind-splitnest`; it uses a dry run. |
| [Create-LocalClusterSecret.ps1](../scripts/Create-LocalClusterSecret.ps1) | Creates only the two required Secret keys from ignored `.env`, explicitly targets `kind-splitnest`, and preserves an existing Secret. It streams the object to kubectl without a secret manifest file or printed values. |
| [Prepare-LoadTest.ps1](../scripts/Prepare-LoadTest.ps1), [Test-PrepareLoadTest.ps1](../scripts/Test-PrepareLoadTest.ps1) | Creates three synthetic users, one group and a bounded expense dataset, then stores only the needed credentials in ignored `.work/loadtest.env`. The fixture suite checks setup behavior and sensitive-error handling without a real API. |
| [promote-deployment.sh](../scripts/promote-deployment.sh), [test-promotion.sh](../scripts/test-promotion.sh) | Generate deployment-branch state with immutable image provenance and stale-run checks; local temporary-Git tests exercise the promotion protocol without claiming a remote rollout. |
| [ci.yml](../.github/workflows/ci.yml), [dependabot.yml](../.github/dependabot.yml), [pull_request_template.md](../.github/pull_request_template.md) | Configures frontend dependency audit/tests/build, Java and packaged Chromium checks, PowerShell/GitOps fixtures, main-only SHA image scan/publication, dependency updates and review context. Remote success requires actual CI evidence. |
| [kind-config.yaml](../deploy/kind/kind-config.yaml), [kind-config-cgroup-v1.yaml](../deploy/kind/kind-config-cgroup-v1.yaml), [namespace.yaml](../deploy/base/namespace.yaml) | Pins the local Kubernetes node and namespace. The separate cgroup v1 file is an explicit temporary compatibility option for older Docker/WSL hosts. |
| [postgres.yaml](../deploy/base/postgres.yaml), [redis.yaml](../deploy/base/redis.yaml) | Handwritten data-store workloads/Services; PostgreSQL retains a PVC. |
| [app.yaml](../deploy/base/app.yaml), [configmap.yaml](../deploy/base/configmap.yaml), [hpa.yaml](../deploy/base/hpa.yaml) | App security/resources/probes, non-secret settings and CPU-driven replica target. |
| [base/kustomization.yaml](../deploy/base/kustomization.yaml), [local/kustomization.yaml](../deploy/overlays/local/kustomization.yaml) | Compose reusable resource definitions into the local deployment. |
| [application.yaml](../deploy/argocd/application.yaml) | Argo CD watches `deploy/local`, self-heals and respects the HPA-owned replica count. |
| [values.yaml](../deploy/monitoring/values.yaml), [servicemonitor.yaml](../deploy/monitoring/servicemonitor.yaml), [monitoring/kustomization.yaml](../deploy/monitoring/kustomization.yaml), [splitnest.json](../deploy/monitoring/dashboards/splitnest.json) | Monitoring chart settings, app discovery and dashboard source. A JSON file is not a screenshot or evidence of an installed dashboard. |
| [balances.js](../loadtest/balances.js), [job.yaml](../loadtest/job.yaml), [loadtest/kustomization.yaml](../loadtest/kustomization.yaml) | k6 workload and in-cluster Job sources; measurement procedure is in [monitoring.md](monitoring.md). |

## Frontend source and configuration

See [frontend/README.md](../frontend/README.md) for commands. Source types document
the actual DTOs; runtime HTTP validation and backend permissions remain decisive.

| Files | Purpose and concept to notice |
|---|---|
| [package.json](../frontend/package.json), [package-lock.json](../frontend/package-lock.json), [.npmrc](../frontend/.npmrc), [.nvmrc](../frontend/.nvmrc) | Exact dependency lock, npm11.19.1 package manager, Node24.22.0 pin, engine enforcement and installations without lifecycle scripts. Type-only `@types/node`24.19.2 is distinct from the runtime. |
| [index.html](../frontend/index.html), [main.tsx](../frontend/src/main.tsx), [favicon.svg](../frontend/public/favicon.svg) | Vite HTML entry, React mount and bundled local branding. |
| [vite.config.ts](../frontend/vite.config.ts), [tsconfig.json](../frontend/tsconfig.json), [playwright.config.ts](../frontend/playwright.config.ts) | Loopback development/API proxy, strict no-emit typecheck, Vitest environment and real Chromium execution against Vite or `SPLITNEST_WEB_URL`. |
| [App.tsx](../frontend/src/app/App.tsx), [SessionContext.tsx](../frontend/src/app/SessionContext.tsx) | Browser routes, protected shell/account-keyed workspace, and React subscription to the session store. |
| [session.ts](../frontend/src/app/session.ts) | Memory-only access token, single-flight refresh, shared Web Lock, non-secret BroadcastChannel events, generation guards and raw logout refresh inside one lock. |
| [client.ts](../frontend/src/shared/api/client.ts), [types.ts](../frontend/src/shared/api/types.ts) | Typed DTOs, same-origin/no-store requests, ProblemDetail/Retry-After parsing, one401 retry and cancellation of responses from an older account. FormData retains its browser-generated boundary. |
| [AuthPage.tsx](../frontend/src/features/auth/AuthPage.tsx) | Registration/login forms, password visibility, pending/failure states and safe local post-login navigation. |
| [GroupsPage.tsx](../frontend/src/features/groups/GroupsPage.tsx), [GroupPage.tsx](../frontend/src/features/groups/GroupPage.tsx) | Group list/create, concurrent workspace reads, request cleanup and paginated expense refresh after mutations. |
| [MembersPanel.tsx](../frontend/src/features/groups/MembersPanel.tsx) | Registered-user membership forms, admin controls and explicit removal confirmation; the server enforces permissions. |
| [ExpenseForm.tsx](../frontend/src/features/expenses/ExpenseForm.tsx), [ExpensesPanel.tsx](../frontend/src/features/expenses/ExpensesPanel.tsx), [BalancePanel.tsx](../frontend/src/features/expenses/BalancePanel.tsx) | Decimal-text validation, payer/category/date fields, pagination, stored split details, creator/admin deletion and current/former-member balance display. |
| [ImportsPanel.tsx](../frontend/src/features/imports/ImportsPanel.tsx) | Bounded upload validation, real status polling every2seconds for up to2minutes, manual recheck, upload Retry-After and account/group-keyed non-secret job UUID persistence. |
| [BudgetsPanel.tsx](../frontend/src/features/budgets/BudgetsPanel.tsx) | Admin category-limit upsert, member reads and actual immutable alert snapshots; no invented live monthly-spending calculation. |
| [Feedback.tsx](../frontend/src/shared/ui/Feedback.tsx), [format.ts](../frontend/src/shared/ui/format.ts) | Accessible loading/empty/error announcements, field errors and INR/UTC-date presentation. |
| [tokens.css](../frontend/src/styles/tokens.css), [app.css](../frontend/src/styles/app.css) | Shared colors/spacing and responsive plain CSS with focus states and local assets. |

## Frontend tests and their boundaries

| Files | Evidence provided when the test passes |
|---|---|
| [setup.ts](../frontend/src/test/setup.ts) | DOM matchers and cleanup between React tests. |
| [session.test.ts](../frontend/src/app/session.test.ts), [client.test.ts](../frontend/src/shared/api/client.test.ts) |31 focused cases for refresh single flight/cross-tab locking, CSRF under lock, no persistent credentials, failure cleanup, profile races, logout lock safety, JSON/multipart retry and stale-account responses. |
| [AuthPage.test.tsx](../frontend/src/features/auth/AuthPage.test.tsx) | Registration/login interactions, validation, pending/error states and navigation. |
| [GroupsPage.test.tsx](../frontend/src/features/groups/GroupsPage.test.tsx), [GroupPage.test.tsx](../frontend/src/features/groups/GroupPage.test.tsx), [MembersPanel.test.tsx](../frontend/src/features/groups/MembersPanel.test.tsx) | Group list/create/retry, workspace refresh/pagination, member roles and rejected actions. |
| [ExpenseForm.test.tsx](../frontend/src/features/expenses/ExpenseForm.test.tsx), [ExpensesPanel.test.tsx](../frontend/src/features/expenses/ExpensesPanel.test.tsx) | Exact decimal input boundaries, server-owned splits, stored history and permission-aware confirmed deletion. |
| [ImportsPanel.test.tsx](../frontend/src/features/imports/ImportsPanel.test.tsx), [BudgetsPanel.test.tsx](../frontend/src/features/budgets/BudgetsPanel.test.tsx) | Poll/deadline/cleanup/storage guards, real-job response states, rate-limit waiting, budget permissions and snapshot semantics. |
| [helpers.ts](../frontend/e2e/helpers.ts), [workflows.spec.ts](../frontend/e2e/workflows.spec.ts) | Synthetic users and real backend Chromium journeys: registration/restoration, three-user exact splits, permissions, imports/budgets, two-tab rotation/logout, mobile validation and accessible rate-limit messages. Current execution totals belong in project status. |

Unit/component tests use controlled responses to isolate interface states. Chromium
tests use a real API/database; Java tests separately verify transactions and
security. No one layer substitutes for image, Compose/kind or remote CI evidence.

## Reading and interview practice

The practical [operations runbook](operations.md) ties startup, health checks,
secrets, Flyway, job recovery and binary-safe backup procedures together. Backup
and restore commands are documented procedures; their execution is not implied
by this file inventory.

Read [demo.md](demo.md) while calling the API. Then explain one expense's journey
using [architecture.md](architecture.md) without reading the source. Consult the
six backend [ADRs](decisions/0001-modular-monolith.md) to discuss consequences
rather than listing technologies. The seventh
[frontend ADR](decisions/0007-browser-frontend.md) records the implemented source
and remaining delivery evidence. The original twenty interview questions remain
unanswered in [interview-prep.md](interview-prep.md).

1. Which repository APIs use JPA, and why do the JDBC writes still share one service transaction?
2. Which tests would you read before changing member removal or refresh-token rotation?
3. Which files describe deployment intent, and what additional evidence proves that intent worked?
