# SplitNest documentation

Start with [project status](project-status.md). The backend/local delivery
baseline is verified; the browser app is implemented and browser-tested, with
combined-image delivery verification underway.
The project is a free local academic and placement demo. The detailed learning
phase follows completion and verification of the full app.

## Current work and repository navigation

| Document | Read it for |
|---|---|
| [Project README](../README.md) | Overview, repository map and current run/test commands |
| [Project status](project-status.md) | Completion by scope, next milestones and evidence rules |
| [Repository instructions](../agents.md) | Approved stack, scope and autonomous working agreement |
| [Frontend execution plan](frontend-extension-plan.md) | Accepted design, screens, authentication changes and acceptance gates |
| [Frontend directory](../frontend/README.md) | Actual source organization, commands and build/runtime boundary |
| [Development plan](development-plan.md) | Original review, implemented backend milestones and current execution order |

## Run and demonstrate the application

| Document | Read it for |
|---|---|
| [Setup](setup.md) | Installed baseline, Windows prerequisites and repository setup |
| [Demo](demo.md) | Browser and Swagger/API walkthroughs using synthetic data |
| [Docker](docker.md) | Image stages, runtime settings, Compose and verification |
| [Kubernetes](kubernetes.md) | kind setup, objects, secrets, probes, autoscaling and failure exercises |
| [GitOps](gitops.md) | Argo CD setup and local pull-based delivery |
| [Promotion and rollback](gitops-promotion.md) | Generated deployment branch, provenance, safeguards and rollback |
| [Operations](operations.md) | Health, migrations, credential handling and recovery limits |
| [Monitoring](monitoring.md) | Prometheus/Grafana configuration and repeatable experiments |
| [Performance observations](performance.md) | Measured cache comparison and HPA results with their limits |

The frontend guide now includes real build/test commands, and the demo uses the
actual interface. Verify the recorded source/image and delivery status before
claiming a packaged deployment. A runbook describing an experiment does not prove
it was executed.

## Understand the completed system

| Document | Read it for |
|---|---|
| [Learning roadmap](learning-roadmap.md) | The later guided sequence from requirements through code and deployment |
| [Architecture](architecture.md) | Current request, background and delivery flows; target frontend boundary |
| [Implementation map](implementation.md) | Feature-by-feature code and test reading order |
| [Learning guide](learning-guide.md) | Beginner-to-advanced explanations of the implemented concepts |
| [Interview preparation](interview-prep.md) | Unanswered questions and evidence-based resume/demo framing |

Architecture decision records capture context, alternatives and consequences:

1. [Modular monolith](decisions/0001-modular-monolith.md)
2. [JWTs and refresh tokens](decisions/0002-jwt-refresh.md)
3. [Redis limiting and caching](decisions/0003-redis-limiting-and-cache.md)
4. [Async processing with persisted jobs](decisions/0004-async-database-dispatch.md)
5. [ShedLock coordination](decisions/0005-shedlock.md)
6. [Generated GitOps deployment branch](decisions/0006-gitops-deployment-branch.md)
7. [Browser frontend in the Spring Boot application](decisions/0007-browser-frontend.md)
   — browser integration implemented; delivery evidence tracked separately.

## Inspect evidence

[Verification record](evidence/verification.md) indexes actual tests, image scans,
CI runs, local deployment checks, rollout/rollback observations and Grafana
captures. JSON and image artifacts stay in `evidence/`. They document observed
results at a point in time. New browser/image results are recorded separately
from the original backend verification so neither is mistaken for the other.

Keep plans, runbooks and evidence distinct. Update the status page and relevant
feature/decision documentation after each verified implementation milestone.
