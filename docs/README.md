# Documentation

Start with the [user guide](user-guide.md) to use SplitNest, or [setup](setup.md)
to run it. The application and its supporting services run locally; no public
hosting, paid API or managed database is required for the local lab. An optional
[free public résumé demo](public-demo.md) uses Render and Neon.

## Use and run

| Guide | Contents |
|---|---|
| [Project overview](../README.md) | Features, quick start, architecture and repository map |
| [User guide](user-guide.md) | Plain-language manual for accounts, groups, expenses, imports and budgets |
| [Interface design](interface-design.md) | Page map, desktop/mobile wireframes and useful empty states |
| [Setup](setup.md) | Requirements, fresh checkout, host development and tests |
| [Public demo](public-demo.md) | Free hosting, HTTPS settings, quotas and deployment checks |
| [Demo](demo.md) | A reproducible browser/API scenario with synthetic data |
| [Frontend](../frontend/README.md) | UI structure, build tools, development and browser checks |

## Develop and operate

| Guide | Contents |
|---|---|
| [Architecture](architecture.md) | Request/session flows, exact money, transactions, jobs and delivery |
| [Implementation map](implementation.md) | Source files, migrations, tests and responsibilities |
| [Repository conventions](../agents.md) | Scope, coding, testing and credential-handling rules |
| [Docker](docker.md) | Image stages, Compose, runtime settings and CI publication |
| [Kubernetes](kubernetes.md) | kind, Secrets, probes, persistent storage, HPA and failure experiments |
| [GitOps](gitops.md) | Argo CD setup and pull-based local delivery |
| [Promotion and rollback](gitops-promotion.md) | Generated branch, provenance and rollback safeguards |
| [Operations](operations.md) | Health, migrations, secrets, job recovery and backup limitations |
| [Monitoring](monitoring.md) | Prometheus/Grafana setup and repeatable workloads |
| [Performance](performance.md) | Controlled cache comparison and autoscaling observations |

## Architecture decisions

1. [Modular monolith](decisions/0001-modular-monolith.md)
2. [JWTs and rotating refresh tokens](decisions/0002-jwt-refresh.md)
3. [Redis limiting and caching](decisions/0003-redis-limiting-and-cache.md)
4. [Async processing with persisted jobs](decisions/0004-async-database-dispatch.md)
5. [ShedLock coordination](decisions/0005-shedlock.md)
6. [Generated GitOps deployment branch](decisions/0006-gitops-deployment-branch.md)
7. [Browser frontend in Spring Boot](decisions/0007-browser-frontend.md)

## Verification evidence

The [verification record](evidence/verification.md) links observed test results,
image scans, CI runs, local deployment checks, rollback and monitoring captures.
JSON and screenshot artifacts in `evidence/` identify a specific source/image
and observation time. A runbook explains how to perform a check; the evidence
records whether it was actually performed. Older results remain dated to the
release they measured.
