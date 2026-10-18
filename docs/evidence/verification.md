# Verification record

Date: 18 October 2026. Record observed results, not inferred completion.

## Backend

- Java: Temurin 21.0.12.1; Maven wrapper: 3.10.0; Spring Boot: 4.1.1.
- `mvnw.cmd verify`: **75 tests, 0 failures, 0 errors, 0 skipped**.
- Tests start actual PostgreSQL 18 and Redis 8 containers. The complete source
  and test inventory is in [implementation.md](../implementation.md).
- Core implementation commit: `b044488`.
- `scripts/Smoke-Test.ps1`: PASS. Four synthetic users, three group members,
  33.33/33.33/33.34 shares, net sum 0.00, one imported and one invalid row,
  outsider 404 and refresh replay 401. No credentials were printed.
- Operational regressions caught and fixed UTC JDBC-session handling for
  TIMESTAMPTZ ShedLock records and the Prometheus reserved `created` suffix.
- XLSX regressions include hostile numeric exponents, numeric dates, bounded
  preflight before POI allocation, DTD/external relationships and archive limits.

## Docker

- Docker Desktop engine 29.8.2, Linux containers; Compose 5.6.0.
- `docker compose config --quiet`: PASS.
- Image build: PASS; configured runtime user `10001:10001`.
- Patched local image: **473,933,312 bytes**, approximately 451.98 MiB.
- Full Compose startup with health checks: PASS.
- Swagger HTTP 200, OpenAPI 17 paths, readiness UP, Prometheus HTTP 200.
- Initial Trivy scan rejected Tomcat 11.0.24 with three CRITICAL-rated findings:
  CVE-2026-65182, CVE-2026-65905 and CVE-2026-68525. Apache's ratings differ from
  the scanner's policy classification; the gate was not suppressed.
- Added a compatible Tomcat 11.0.27 property override to Boot 4.1.1. The fixed
  11.x artifact is published on Maven Central. See [Apache's security record](https://tomcat.apache.org/security-11.html).
  Full verification passed again: **75 tests, no failures/errors/skips**. A fresh
  Trivy 0.70.0 scan of the rebuilt image found **0 CRITICAL vulnerabilities**
  across OS packages and Java dependencies. This is a dated policy result, not
  a claim that every severity or future vulnerability is absent.

## GitOps generation

Eight local fixture scenarios passed: bootstrap, no-op, separate manifest/image
commits, manifest-only preservation, stale source rejection, rendering failure,
client-validation failure, and Git revert followed by a documentation-only push.
These tests use local Git repositories and a mock kubectl; actual API validation
is a separate check below.

## Kubernetes and monitoring

- kind 0.33.0, Kubernetes 1.37.0, kubectl 1.36.1/Kustomize 5.8.1.
- Docker reports cgroup v1. Default cluster startup failed; the documented local
  `failCgroupV1: false` compatibility configuration produced a Ready node.
- Base/local manifests accepted by server-side dry-run against the actual API.
- Local app Secret created from ignored `.env` after the owner's explicit approval;
  no secret manifest was committed or printed.
- App/datastore rollout: PASS. Two patched app replicas, PostgreSQL and Redis Ready;
  image loaded locally for bootstrap before the first registry publication.
- metrics-server installed and reporting node CPU/memory.
- Argo CD 3.5.5 installed; all seven pods Ready. Application reconciliation still
  awaits the first generated deployment branch.
- kube-prometheus-stack 92.10.1 installed with Helm 4.3.1: deployed.
- Grafana, Prometheus and supporting monitoring pods are running.
- App ServiceMonitor and eight-panel dashboard ConfigMap applied. Grafana's API
  confirms the provisioned dashboard; Prometheus reports both app targets UP.
  Controlled performance measurements are running separately.

## External delivery still to verify

- GitHub Actions run and CRITICAL scan result.
- GHCR publication, package pull visibility and exact published digest.
- Generated deployment branch and Argo synchronization of the published image.
- Actual Git rollback, pod-failure recovery, controlled cache comparison and HPA
  observations. Do not use numerical resume performance claims before these run.
