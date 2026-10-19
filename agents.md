# AGENTS.md — SplitNest

## 1. Who I am and how you must work with me

I am a beginner learning backend development and DevOps by building this project.
I know Java, OOP, and data structures, but I am new to Spring Boot, databases in
production, Docker, CI/CD, Kubernetes, and monitoring. Understanding matters more
than speed.

Rules for every task:

1. Current workflow (updated 2026-10-19): the backend/local deployment baseline
   is complete. The owner approved the frontend extension described in
   `docs/frontend-extension-plan.md` for a free academic and placement project.
   The full browser app and local delivery are implemented and verified.
   Begin the detailed understanding phase from scratch when the owner is ready.
   Work autonomously across coherent milestones without stopping after every
   numbered task. Keep the existing business features; do not expand the scope.
2. Before writing code, explain in a few sentences what you will build and why,
   and which files you will create or change.
3. Keep changes small and focused on the task. Do not refactor unrelated code.
4. Use the stack in Section 3 and make routine implementation decisions
   independently. Explain version updates and their compatibility. Ask before
   introducing an additional technology outside this stack.
5. Every task that adds behaviour must include tests. Run the tests and tell me
   the result.
6. Document each completed milestone as you work, without pausing for approval.
   At the final handoff, give me:
   - a summary of what changed, file by file
   - the key concepts this task used, explained simply
   - exact commands to run and verify it myself
   - understanding questions in the learning/interview guide (do not answer
     the interview question list)
7. Prefer clear, explicit code over clever code. Add short comments explaining
   WHY, not WHAT, where the reason is not obvious.
8. If something in this plan is outdated (a library version, an API, a tool),
   tell me and propose the current equivalent instead of silently changing it.
9. Never commit secrets. Secrets come from environment variables.
10. Keep implemented, tested, and externally blocked work distinct. Do not
    claim a Docker/Kubernetes deployment, passing integration tests, image
    size, or performance improvement without actual evidence.
11. Once the owner creates the GitHub repository and supplies its URL,
    commit and push meaningful, verified milestones using existing authorized
    authentication. Do not invent an identity or request tokens in chat.
12. Include a one-line completion update in every response. State its scope:
    the original backend/local baseline is complete; frontend completion must
    follow its own acceptance gates. Planning is not implemented functionality.
13. Keep the project free to build and demonstrate locally. Do not provision
    public hosting, paid services, a domain, or commercial infrastructure.
14. Record decisions, implementation details and evidence while building. After
    the full app is verified, teach the project from requirements and data design
    through implementation, tests and delivery using `docs/learning-roadmap.md`.
    Do not make the owner complete tutorials or quizzes between build milestones.

Start with `docs/README.md` and `docs/project-status.md`. The updated execution
order and design clarifications are in `docs/development-plan.md` and
`docs/frontend-extension-plan.md`. Section 7 preserves the original backend
syllabus and task references; it no longer requires a stop after every task.

## 2. Project summary

SplitNest is an academic expense-sharing application for flatmates, families,
or trip groups. Its Java backend and local delivery lab are verified. The React
frontend and combined Compose/kind delivery are verified; dated results are
tracked in `docs/project-status.md`.

- Users register and log in.
- A user creates a group and becomes its ADMIN. The admin adds existing users
  as MEMBERS by email and can remove them.
- Members add shared expenses. Each expense is split equally among all current
  group members.
- The app shows each member's net balance (positive = is owed, negative = owes).
- Members can upload a bank statement (CSV or XLSX). It is processed in the
  background, rows are auto-categorized by keywords, and saved as expenses.
- Admins set a monthly budget per category. A daily scheduled job creates an
  alert when spending crosses the budget.
- Login and uploads are rate limited.
- The React frontend provides registration, sign-in and the existing
  expense-sharing workflows. The API is also usable through Swagger UI.
  Keep Swagger available for API exploration and developer verification.

Explicitly OUT of scope (do not build): microservices, Kafka/RabbitMQ, public or
cloud deployment, paid services, Terraform, invitation emails, unequal splits,
payment processing, settle-up optimization, Ingress/Gateway, and Helm charts for
the app itself. A large-scale commercial service is not the objective.

## 3. Tech stack

- Java 21 (LTS), Maven
- Spring Boot 4.1.1 (verified baseline; review updates explicitly):
  Web, Validation, Data JPA, Security, OAuth2 Resource Server (for JWT),
  Actuator, Data Redis, Cache
- PostgreSQL + Flyway for schema migrations
- Redis for caching and rate limiting
- springdoc-openapi for Swagger UI (version compatible with the Boot version)
- Apache Commons CSV and Apache POI for statement parsing
- ShedLock (added in Phase 7)
- Micrometer Prometheus registry (added in Phase 9)
- JUnit Jupiter 6 (Boot-managed and verified),
  Mockito, AssertJ, Testcontainers (PostgreSQL, Redis)
- No Lombok. Use Java records for DTOs.
- Docker, Docker Compose
- GitHub Actions, GitHub Container Registry (GHCR), Trivy
- kind (local Kubernetes), kubectl, Kustomize, metrics-server
- Argo CD
- kube-prometheus-stack (Prometheus + Grafana) via Helm
- k6 for load testing
- Approved frontend: React, TypeScript, Vite, React Router, plain CSS
- Frontend testing: Vitest, React Testing Library, Playwright
- Node.js 24.22.0 LTS and npm 11.19.1 for frontend build/tests only; runtime and
  dependencies are pinned in `frontend/`. Node.js
  is not an additional production runtime. Package compiled UI assets in the
  existing Spring Boot image.

## 4. Repository layout

```
splitnest/
├── agents.md
├── README.md
├── pom.xml
├── compose.yaml
├── Dockerfile
├── .dockerignore
├── .github/workflows/ci.yml
├── src/main/java/com/splitnest/
│   ├── SplitNestApplication.java
│   ├── common/        # config, exception handling, security helpers
│   ├── auth/          # register, login, refresh, logout, JWT
│   ├── user/
│   ├── group/         # groups, membership, roles, access checks
│   ├── expense/       # expenses, splits, balances
│   ├── budget/        # budgets, alerts, scheduled check
│   ├── importjob/     # statement upload and background processing
│   └── ratelimit/
├── src/main/resources/
│   ├── application.yml
│   └── db/migration/  # Flyway: V1__..., V2__...
├── src/test/java/com/splitnest/...
├── frontend/          # React app, typed API, component tests and Playwright
├── deploy/
│   ├── kind/kind-config.yaml
│   ├── base/          # app, postgres, redis manifests + kustomization.yaml
│   ├── overlays/local/
│   ├── argocd/application.yaml
│   └── monitoring/    # Helm values, ServiceMonitor
├── loadtest/balances.js
├── scripts/           # setup, verification and delivery helpers
└── docs/
    ├── README.md      # documentation index
    ├── project-status.md
    ├── frontend-extension-plan.md
    ├── architecture.md
    ├── learning-roadmap.md
    ├── evidence/      # measured results and runtime captures
    └── decisions/     # short architecture decision records
```

Code organization: package by feature (as above). Inside each feature use
`Controller -> Service -> Repository`. Controllers never touch repositories
directly. Entities are never returned from controllers; map to DTO records.
Keep the Maven root and `src/` in place. Organize frontend code by feature
inside `frontend/`; its structure is documented in `frontend/README.md`.
Generated dependencies, assets, test reports and local credentials are ignored.

## 5. Data model

All IDs are UUIDs. All money uses `NUMERIC(12,2)` in the database and
`BigDecimal` in Java (never `double`). All timestamps are `TIMESTAMPTZ` / `Instant`.

- `users`: id, email (unique, lowercase), password_hash, display_name, created_at
- `expense_groups` (not `groups`, which is a reserved word): id, name,
  created_by, created_at
- `group_members`: group_id, user_id, role (`ADMIN` | `MEMBER`), joined_at;
  primary key (group_id, user_id)
- `expenses`: id, group_id, paid_by, amount, description, category,
  expense_date, created_by, import_job_id (nullable), created_at
- `expense_splits`: expense_id, user_id, share_amount;
  primary key (expense_id, user_id)
- `budgets`: id, group_id, category, monthly_limit; unique (group_id, category)
- `budget_alerts`: id, group_id, category, month (first day of month), spent,
  monthly_limit, created_at; unique (group_id, category, month)
- `import_jobs`: id, group_id, uploaded_by, status
  (`PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`), file_name, file_content
  (bytea, max 5 MB), total_rows, imported_rows, error_message, created_at,
  completed_at
- `refresh_tokens`: id, user_id, token_hash, expires_at, revoked, created_at

Category is a Java enum stored as text: `FOOD, GROCERIES, RENT, UTILITIES,
TRAVEL, ENTERTAINMENT, SHOPPING, OTHER`.

Equal split rule: split in paise (cents). If the amount does not divide evenly,
give the leftover paise one each to members ordered by user id, so the splits
always sum exactly to the amount.

## 6. API (all under /api/v1)

| Method | Path | Who |
|---|---|---|
| POST | /auth/register | public |
| POST | /auth/login | public, rate limited |
| POST | /auth/refresh | public |
| POST | /auth/logout | logged in |
| GET | /users/me | logged in |
| POST | /groups | logged in (creator becomes ADMIN) |
| GET | /groups | logged in (only my groups) |
| GET | /groups/{groupId} | member |
| POST | /groups/{groupId}/members | admin (body: email) |
| DELETE | /groups/{groupId}/members/{userId} | admin |
| POST | /groups/{groupId}/expenses | member |
| GET | /groups/{groupId}/expenses | member (paginated, newest first) |
| DELETE | /groups/{groupId}/expenses/{expenseId} | creator or admin |
| GET | /groups/{groupId}/balances | member |
| PUT | /groups/{groupId}/budgets/{category} | admin |
| GET | /groups/{groupId}/budgets | member |
| GET | /groups/{groupId}/alerts | member |
| POST | /groups/{groupId}/imports | member (multipart file), rate limited |
| GET | /groups/{groupId}/imports/{jobId} | member |

Conventions:
- Errors use RFC 7807 `ProblemDetail` from one `@RestControllerAdvice`.
- If a user is not a member of a group, return 404 (not 403), so group
  existence is not leaked.
- Validation errors return 400 with field-level messages.

---

## 7. Plan

The phases below preserve the original backend syllabus. They are not a current
pending-work checklist: see `docs/evidence/verification.md` for completed checks
and `docs/project-status.md` for the approved frontend extension. Older task
wording is interpreted using the implemented decisions in
`docs/development-plan.md` (including the separate `deploy/local` GitOps branch).
The owner subsequently authorized creating the local cluster Secret from the
ignored `.env`; it was created without committing or printing its values.

Each original task lists what to build and how we know it is done.

### Phase 0 — Setup

**Task 0.1 — Tooling check.** Give me a checklist to install and verify:
JDK 21, Maven (or the Maven wrapper), Git, Docker Desktop, an IDE. Give
the verification command for each.

**Task 0.2 — Generate the project.** Create the Spring Boot project with the
Section 3 dependencies (not ShedLock or Prometheus yet), the package layout
from Section 4, `.gitignore`, and an empty README.
Done when: `./mvnw verify` passes.

**Task 0.3 — Local dependencies.** Create `compose.yaml` that runs only
PostgreSQL and Redis (the app itself runs from the IDE for now), with health
checks and a named volume for Postgres. Configure `application.yml` to connect
using environment variables with local defaults. Briefly explain what Docker
Compose is doing; I will learn Docker properly in Phase 5.
Done when: the app starts and connects to Postgres.

### Phase 1 — Foundation and authentication

**Task 1.1 — Global error handling.** `@RestControllerAdvice` returning
`ProblemDetail` for validation errors, not-found, forbidden, conflict, and
unexpected errors (no stack traces in responses).

**Task 1.2 — Users table and registration.** Flyway `V1` migration for `users`.
`POST /auth/register` with validation (valid email, password at least 8
characters), BCrypt hashing, 409 on duplicate email.
Tests: integration test with Testcontainers Postgres.

**Task 1.3 — JWT login.** `POST /auth/login` returns a short-lived access token
(15 minutes) signed with HS256 using a secret from an environment variable.
Configure Spring Security as stateless, using the OAuth2 Resource Server
support to validate tokens. `GET /users/me` returns the current user.
Explain: authentication vs authorization, why stateless, what is inside a JWT.

**Task 1.4 — Refresh tokens and logout.** Refresh token is a random opaque
string; store only its SHA-256 hash. `/auth/refresh` rotates it (old one
revoked, new one issued). `/auth/logout` revokes it.
Tests: reused refresh token is rejected.

**Task 1.5 — Swagger UI.** Configure springdoc with a bearer-token security
scheme so I can log in and call protected endpoints from Swagger UI.

### Phase 2 — Groups, expenses, balances

**Task 2.1 — Groups and membership.** Migration for `expense_groups` and
`group_members`. Create group (creator becomes ADMIN), list my groups, get one
group.

**Task 2.2 — Access control.** A reusable `GroupAccessService` with
`requireMember(groupId)` and `requireAdmin(groupId)`, used by every group
endpoint. Add/remove members (admin only; an admin cannot remove themselves if
they are the last admin).
Tests: a non-member gets 404, a member gets 403 on admin actions.

**Task 2.3 — Expenses with equal splits.** Migration for `expenses` and
`expense_splits`. Create, list (paginated), delete. Splitting logic in its own
class with unit tests covering uneven division (e.g. 100.00 / 3).
The expense and its splits must be saved in one transaction. Explain why.

**Task 2.4 — Balances.** `GET /balances` returns each member's total paid,
total share, and net balance, computed with a SQL aggregate query, not by
loading all expenses into memory.
Tests: known scenario with expected numbers.

### Phase 3 — Hardening

**Task 3.1 — Data isolation test suite.** Integration tests proving that a
user in group A cannot read, create, or delete anything in group B through
any endpoint.

**Task 3.2 — Rate limiting.** Implement a fixed-window rate limiter myself
using Redis `INCR` + `EXPIRE` (do not use a library), applied to login
(5 per minute per email + IP) and imports (10 per hour per user). Return 429
with a `Retry-After` header.
Explain: fixed window vs token bucket, and why the counter lives in Redis
rather than in memory (multiple app instances later).

**Task 3.3 — Caching.** Cache group balances in Redis with Spring Cache
(`@Cacheable`), evicted whenever an expense in that group is created or
deleted. Explain cache invalidation and what could go wrong.

**Task 3.4 — ADR.** Write `docs/decisions/0001-modular-monolith.md` explaining
why this is one application instead of microservices. Short: context,
decision, consequences.

### Phase 4 — Background work

**Task 4.1 — Upload endpoint.** Migration for `import_jobs`. `POST /imports`
accepts a CSV or XLSX up to 5 MB, validates the type, stores it with status
`PENDING`, and returns 202 Accepted with the job id. `GET /imports/{jobId}`
returns status and counts.

**Task 4.2 — Async processing.** Configure a bounded `ThreadPoolTaskExecutor`.
Publish an event after the upload is saved and process it with
`@TransactionalEventListener(phase = AFTER_COMMIT)` + `@Async`. Explain why
processing must start only after the transaction commits.

**Task 4.3 — Parsing and categorization.** Expected columns: `date`,
`description`, `amount`. Parse CSV (Commons CSV) and XLSX (POI) behind one
`StatementParser` interface. Categorize using keyword rules from
`application.yml` (e.g. SWIGGY, ZOMATO -> FOOD; BLINKIT, BIGBASKET ->
GROCERIES; UBER, OLA -> TRAVEL). Imported rows become expenses paid by the
uploader, split equally. Invalid rows are counted and skipped; a fully
unreadable file sets the job to `FAILED` with a message.
Tests: parser unit tests with sample files in `src/test/resources`.

**Task 4.4 — Stuck job recovery.** On startup, mark jobs stuck in
`PROCESSING` for more than 10 minutes as `FAILED`. Explain why this is needed
(the app can be killed mid-job, which will happen in Kubernetes).

**Task 4.5 — Budgets and alerts.** Migrations for `budgets` and
`budget_alerts`. Budget endpoints. A `@Scheduled` daily job computes each
group's spending per category for the current month and inserts an alert when
it exceeds the limit. The unique constraint prevents duplicate alerts; handle
the conflict gracefully.

### Phase 5 — Docker

**Task 5.1 — Dockerfile.** Multi-stage build: JDK image to build, JRE image to
run, non-root user, `.dockerignore`. Explain each line, image layers, and
why the final image does not contain Maven or source code. Report the final
image size.

**Task 5.2 — Full Compose stack.** Add the app service to `compose.yaml`,
depending on healthy Postgres and Redis. Secrets come from a `.env` file
that is git-ignored; commit a `.env.example`.
Done when: `docker compose up` starts everything and Swagger works.

### Phase 6 — Continuous integration

**Task 6.1 — Test workflow.** `.github/workflows/ci.yml`: on every pull request
and push to `main`, set up Java with Maven caching and run `./mvnw verify`
(Testcontainers works on GitHub's Ubuntu runners).

**Task 6.2 — Build, scan, push.** On push to `main` only: build the image, scan
it with Trivy (fail on CRITICAL vulnerabilities), push to GHCR tagged with the
git commit SHA. Use the minimum workflow `permissions` needed. Explain why we
tag with the SHA and not `latest`.

### Phase 7 — Kubernetes (local, kind)

**Task 7.1 — Concepts first.** Before any YAML, explain Pod, Deployment,
Service, ConfigMap, Secret, StatefulSet, PersistentVolumeClaim, Namespace,
and probes, using this app as the example. Give me install steps for kind
and kubectl.

**Task 7.2 — Cluster and data stores.** `deploy/kind/kind-config.yaml`.
Manifests in `deploy/base` for a `splitnest` namespace, Postgres as a
StatefulSet with a PVC, and Redis as a Deployment, each with a Service.
Write these by hand (no third-party Helm charts) so I learn the objects.

**Task 7.3 — App deployment.** Deployment (2 replicas), Service, ConfigMap.
The Secret is created with a `kubectl create secret` command that I run
manually and is never committed. Resource requests and limits. Liveness and
readiness probes using Actuator's `/actuator/health/liveness` and
`/readiness`. Graceful shutdown enabled. Access via `kubectl port-forward`.
Use Kustomize: `deploy/base` plus `deploy/overlays/local`.

**Task 7.4 — The two-replica problem.** With 2 replicas the daily budget job
runs twice. Add ShedLock (JDBC provider, with its table created by a Flyway
migration) so only one instance runs it. Explain why this problem did not
exist before Kubernetes.

**Task 7.5 — Autoscaling.** Install metrics-server on kind (it needs the
`--kubelet-insecure-tls` flag locally; explain why). Add an HPA (2–5 replicas,
70% CPU).

**Task 7.6 — Break things on purpose.** Give me a list of experiments to run
and observe: delete a pod, kill Postgres, deploy a broken image tag, make the
readiness probe fail. For each, tell me what to expect and what it teaches.

### Phase 8 — Continuous delivery (GitOps with Argo CD)

**Task 8.1 — Concepts.** Explain push-based vs pull-based (GitOps) deployment
and why Argo CD solves the problem that GitHub Actions cannot reach a cluster
running on my laptop.

**Task 8.2 — Install and connect.** Install Argo CD into the cluster. Create
`deploy/argocd/application.yaml` pointing to `deploy/overlays/local` with
automated sync, prune, and self-heal. The GHCR package must be public, or an
image pull secret is needed; explain both options.

**Task 8.3 — Close the loop.** Extend CI: after pushing the image, update the
image tag in `deploy/overlays/local` using `kustomize edit set image` and
commit it back to `main`. Prevent the commit from re-triggering the build
(ignore changes under `deploy/**`).
Done when: merging a code change to `main` results in the new version running
in my local cluster with no manual commands.

**Task 8.4 — Rollback.** Show me how to roll back with a git revert and
explain why that is the GitOps way.

### Phase 9 — Observability

**Task 9.1 — Metrics.** Add the Micrometer Prometheus registry and expose
`/actuator/prometheus`. Add custom metrics: imports processed (counter, tagged
by status), import duration (timer), budget alerts created (counter).

**Task 9.2 — Structured logs.** JSON logs using Spring Boot's structured
logging support. Include the request path and, where available, the user id
and group id. Never log passwords, tokens, or file contents.

**Task 9.3 — Prometheus and Grafana.** Install kube-prometheus-stack with
Helm (values in `deploy/monitoring/`). Add a ServiceMonitor for the app.
Build a Grafana dashboard: request rate, error rate, p95 latency, JVM memory,
import jobs. Export the dashboard JSON into the repo.

**Task 9.4 — Load test.** A k6 script hitting `/balances` with logged-in users.
Run it, watch the HPA scale up in Grafana and with `kubectl get hpa -w`, and
compare latency with and without the Redis cache.

### Phase 10 — Documentation

**Task 10.1 — README.** What the project is, an architecture diagram (Mermaid),
tech stack, how to run it locally with Compose, how to run it on kind with
Argo CD, how CI/CD works, and screenshots of Grafana.

**Task 10.2 — Architecture and decisions.** `docs/architecture.md` describing
request flow, async import flow, and deployment flow. ADRs for: JWT with
refresh tokens, Redis rate limiting, `@Async` instead of a message queue (and
when a queue would be needed), and ShedLock.

**Task 10.3 — Interview prep.** Give me 20 questions an interviewer could ask
about this project, ordered from basic to advanced. Do not answer them.
