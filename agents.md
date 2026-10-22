# Repository guide

SplitNest is a local expense-sharing application: one Java/Spring Boot backend,
a React browser interface, PostgreSQL, Redis and a reproducible delivery lab.
Start with [README.md](README.md), the [documentation index](docs/README.md),
and [architecture](docs/architecture.md).

## Scope and stack

Keep the existing product scope: accounts, groups and roles, INR equal-split
expenses, balances, CSV/XLSX imports, category budgets and scheduled alerts.
Public hosting, payments, invitation email, unequal splits, microservices and
new infrastructure services are outside the current scope.

- Java 21, Maven wrapper, Spring Boot 4.1.1, Spring Security, JPA and JDBC.
- PostgreSQL/Flyway, Redis/Spring Cache, Commons CSV, Apache POI and ShedLock.
- React, TypeScript, Vite, React Router and plain CSS. Node 24.22.0 and
  npm 11.19.1 are build/test tools; the runtime is the existing Java image.
- JUnit Jupiter, Mockito, AssertJ, Testcontainers, Vitest, React Testing Library
  and Playwright. Use the exact versions pinned by Maven and npm.
- Docker/Compose, GitHub Actions/GHCR/Trivy, kind/Kustomize/Argo CD,
  Prometheus/Grafana and k6.

Review dependency/version changes deliberately. Do not add a technology to solve
a problem already covered by the existing stack. Never suppress a security
check merely to make a build pass.

## Structure and coding conventions

Keep the Maven root and `src/` in place. Java packages are organized by feature
under `com.splitnest`; controllers call services, and services call repositories.
Controllers never access repositories directly. Return Java record DTOs rather
than managed entities. Prefer explicit constructor injection; do not add Lombok.
Organize React source by feature in `frontend/src/features`, with shared API,
presentation and session code in their existing directories.

- Store individual amounts as `NUMERIC(12,2)`/`BigDecimal`, never `double`.
  Split in integer paise and assign remainders by canonical UUID text order.
  Browser code preserves exact decimal text and displays server-owned totals.
- Store timestamps as `TIMESTAMPTZ`/`Instant`; use UTC for scheduler/month rules.
- Save expenses and split snapshots atomically. Membership changes and financial
  mutations share the group-row lock. Retain former members' financial history.
- Apply `GroupAccessService` checks to every group operation. Outsiders receive
  404; members without the required admin role receive 403.
- Use consistent `ProblemDetail` errors with field-level validation details.
  Never expose stack traces, password hashes, tokens or uploaded file content.
- Keep access tokens in memory. Browser refresh cookies require CSRF protection;
  the existing JSON-token API remains available for Swagger/API clients.
- Add Flyway migrations instead of changing migrations already applied.
- Keep changes focused and explain non-obvious reasons with short comments.

## Verification and documentation

Every behavior change needs meaningful tests at the appropriate layer. Run the
relevant checks and report actual results, including environmental blockers.

```powershell
.\mvnw.cmd verify
cd frontend
npm ci --ignore-scripts
npm test
npm run build
npm run test:e2e
```

Java integration tests need a running Docker engine. Browser tests need the
real backend/data stores; see [frontend/README.md](frontend/README.md). Linux
equivalents use `./mvnw verify`. Delivery helper checks include
`bash scripts/test-promotion.sh`, `scripts/Test-PrepareLoadTest.ps1` and
`scripts/Test-ValidateManifests.ps1`.

Update the relevant public user/developer guide and architecture decision when
behavior changes. Put dated, reproducible test/deployment observations in
`docs/evidence/`. A manifest render is not a running deployment; a passing
application test is not a performance or rollout result. Avoid unsupported
claims about capacity, high availability or backups.

## Secrets and local operations

Secrets come from environment variables, ignored `.env` files or Kubernetes
Secrets. Never commit credentials, real statements, database dumps or browser
storage/network recordings. Local credentials, generated dependencies, reports
and personal study notes remain ignored. Docker context is an allowlist.

All cluster commands must explicitly select `--context kind-splitnest`.
`scripts/Create-LocalClusterSecret.ps1` creates initial credentials from ignored
`.env` and preserves an existing Secret; it is not a rotation procedure.
Do not delete persistent volumes or the cluster to perform an app restart.

Application source belongs on `main`; generated deployment state belongs on
`deploy/local`. CI builds/scans a source image, validates promotion and updates
that branch. Do not hand-edit generated provenance on `main` or rewrite Git
history as part of routine cleanup. Use existing authorized Git authentication.
The [GitOps guide](docs/gitops-promotion.md) explains provenance and rollback.
