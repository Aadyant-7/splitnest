# Learning roadmap: understand the completed application

The detailed guided phase starts **after the full browser app is implemented
and verified, when the owner is ready**. The backend/local delivery baseline is
complete. React screens and browser auth are implemented with passing source and
real-browser checks; combined-image delivery has its own verification gate. Check
[project status](project-status.md) and the [documentation index](README.md)
for current scope, commands and evidence.

The learning sequence explains the finished system in a logical build order;
actual development history remains in Git and verification evidence. It is a
teaching reconstruction that starts from the owner's Java/OOP knowledge.
Development can proceed autonomously while these guides remain available for
reference; study sessions do not block each implementation step.

For each stage: explain the problem simply, draw a small example, trace actual
code, run a synthetic local demo, then explain a failure case and tradeoff in
your own words. Use the [learning guide](learning-guide.md) for concepts and
[implementation map](implementation.md) for file-by-file reading. This is the
later study sequence, not a tutorial session that must start during development.

## 1. Requirements and scope

Read the [project overview](../README.md), [frontend plan](frontend-extension-plan.md)
and [demo](demo.md). Write a three-person trip story from registration through
expenses, import and a budget alert. Mark actor permissions and asynchronous
steps. Keep INR/equal splits and existing-user membership explicit.

Understanding check: which screen uses an existing API, and which idea would
expand scope or imply data the backend does not provide?

## 2. Domain and application boundaries

Read [architecture](architecture.md), [ADR 0001](decisions/0001-modular-monolith.md)
and the [group](../src/main/java/com/splitnest/group/) and
[expense](../src/main/java/com/splitnest/expense/) packages. Draw users, groups,
memberships, expenses and stored shares. Label one controller, service,
repository and DTO; distinguish each from the React view rendering its result.

Understanding check: which responsibilities belong to a component, a service
and the database, and why keep this project one deployable application?

## 3. Database and durable state

Read [migrations](../src/main/resources/db/migration/) and
[BalanceCalculator](../src/main/java/com/splitnest/expense/BalanceCalculator.java).
Learn keys, constraints, indexes, exact numeric types, timestamps and Flyway
history. Draw one expense's rows, calculate two payments and their shares on
paper, and compare with the separate SQL aggregates.

Understanding check: why retain former members' shares, and why can joining
payments to all shares multiply totals? Applied migrations are history, not
scratch files to edit during exercises.

## 4. HTTP, Spring Boot, browser interactions and security

Trace [AuthController](../src/main/java/com/splitnest/auth/AuthController.java),
[SecurityConfiguration](../src/main/java/com/splitnest/common/security/SecurityConfiguration.java)
and [RefreshTokenService](../src/main/java/com/splitnest/auth/RefreshTokenService.java).
Learn requests, DTOs, validation, dependency injection, error responses,
authentication/authorization, JWTs and rotation. Draw one request's complete path.

Trace [App.tsx](../frontend/src/app/App.tsx),
[session.ts](../frontend/src/app/session.ts), the
[typed API client](../frontend/src/shared/api/client.ts) and an expense form's
rendered result. Inspect memory-only access state, cookie/CSRF protection,
Web Locks, BroadcastChannel and generation checks. Compare the browser adapter
with the preserved JSON token API.

Understanding check: why does a valid JWT not authorize every group, and how
does an automatically sent refresh cookie change the browser security boundary?

## 5. Business logic, transactions, locks and Redis

Read [EqualSplitCalculator](../src/main/java/com/splitnest/expense/EqualSplitCalculator.java),
[ExpenseService](../src/main/java/com/splitnest/expense/ExpenseService.java),
[GroupService](../src/main/java/com/splitnest/group/GroupService.java) and
[ADR 0003](decisions/0003-redis-limiting-and-cache.md). Split `100.00` among
three UUID-ordered members, add a payment, then change membership and predict
balances. Draw membership/write interleavings and a cache-fill/eviction race.

Understanding check: what does a transaction guarantee beyond its individual
SQL statements, what needs a lock, and why do limiter/cache outages differ?

## 6. Background work and scheduling

Read [ImportWorker](../src/main/java/com/splitnest/importjob/ImportWorker.java),
[ImportTransactions](../src/main/java/com/splitnest/importjob/ImportTransactions.java),
[ImportRecovery](../src/main/java/com/splitnest/importjob/ImportRecovery.java),
[ADR 0004](decisions/0004-async-database-dispatch.md) and
[ADR 0005](decisions/0005-shedlock.md). Draw job states and crash points before
dispatch, during parsing and before commit. Follow a synthetic valid/invalid
statement and the daily budget calculation.

Understanding check: how do stored jobs recover a lost event, and why do atomic
claims, ShedLock and unique alert constraints solve different problems? A 202
response is not completion, and saving a budget does not run the daily check.

## 7. Tests and evidence

Read [financial integration tests](../src/test/java/com/splitnest/expense/FinancialApiIntegrationTests.java),
[authentication tests](../src/test/java/com/splitnest/auth/AuthenticationIntegrationTest.java)
and [verification evidence](evidence/verification.md). Compare unit,
PostgreSQL/Redis, HTTP/security and component/browser tests. Predict an
assertion before running it; explain a rollback, access-isolation and race case.

With Docker available, run `./mvnw.cmd verify` from the root; use the current
README for scripts. From `frontend/`, use the pinned Node/npm versions and run
`npm ci --ignore-scripts`, `npm test`, `npm run build` and `npm run test:e2e`
with the API running. Current source evidence includes 93 Java tests, 82 frontend
tests and eight real-backend Vite/Chromium scenarios; the status/evidence pages
record later runs. Original 75-test backend evidence belongs to its dated release.
Understanding check: what can a real-browser test catch that a controller test cannot?

## 8. Docker and Compose

Read the [Docker guide](docker.md), [Dockerfile](../Dockerfile),
[compose.yaml](../compose.yaml) and [.dockerignore](../.dockerignore). Explain
images/containers, layers, build context, stages, non-root execution, networking
and volumes. Follow the documented local commands and inspect health. Compare a
browser journey through the packaged Compose app with the Vite development flow,
using its actual verification record.

Understanding check: why does container-local `localhost` differ from the host,
and why does a persistent volume not establish a tested backup? Explain the
Node asset-build stage separately from the final Java runtime.

## 9. Kubernetes and local operations

Read [Kubernetes](kubernetes.md), [operations](operations.md) and the
[base](../deploy/base/) / [overlay](../deploy/overlays/local/) manifests.
Explain each object before its YAML: Namespace, Pod, Deployment, Service,
ConfigMap, Secret, StatefulSet, PVC, probes, resources and HPA. Trace a Service
request to a ready pod and its database connection.

Inspect `kubectl --context kind-splitnest -n splitnest get pods,deploy,svc,hpa`
and `kubectl kustomize deploy/overlays/local`. Run failure experiments only using
the local runbook, coordinating with Argo ownership. Understanding check: how do
readiness/liveness differ, and why are CPU requests the HPA percentage denominator?

## 10. CI, image provenance and GitOps

Read the [workflow](../.github/workflows/ci.yml),
[promotion script](../scripts/promote-deployment.sh),
[promotion runbook](gitops-promotion.md) and [GitOps guide](gitops.md). Trace
one real source SHA through tests/scan, registry digest, generated deployment
commit and Argo observation. Explain permissions, stale-run rejection and
manual rollback preservation and the frontend source profile. Trace a
frontend-only commit only when its real publication/promotion record exists.

Understanding check: why can a cluster on the laptop pull desired state while a
hosted runner cannot reach it directly, and what does Git image rollback leave
unchanged in the database?

## 11. Monitoring, measurements and interview explanation

Read [monitoring](monitoring.md), the
[dashboard](../deploy/monitoring/dashboards/splitnest.json),
[k6 scenario](../loadtest/balances.js) and [performance report](performance.md).
Trace one metric into a panel. Explain logs/metrics/probes, labels, counters,
timers, percentiles and errors. Compare the fixed-replica cache experiment
separately from the HPA run, stating dataset, load, hardware and measurement limits.

Understanding check: why does one controlled cache pair not prove repeatable
production improvement, and why does scaling app pods not make PostgreSQL highly
available? The HPA evidence does not time post-load scale-down.

Practice a short demo and a five-minute architecture explanation. Use the original
20 unanswered [interview questions](interview-prep.md), then its browser questions
against the implemented code. Cover problem, decision, alternative, tradeoff and
evidence. Describe public-production concerns as limits to understand, not work
to add to this free local academic/placement project.

## Understanding-phase completion check

Trace an expense from click to stored splits to cached balance; explain an import
crash/recovery; identify the relevant tests; reproduce the packaged local demo;
and connect a source commit to the running digest. Use logs, tests and SQL to
investigate surprises rather than memorizing every class. Keep notes in your own
words and demonstrate what you can explain.

Use synthetic data and the existing local tooling. Never copy passwords, tokens,
cookies or statement contents into notes, screenshots or Git. No paid service,
public app host or cloud runtime is required.
