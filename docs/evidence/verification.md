# Verification record

Initial verification: 18 October 2026; runtime follow-up: 19 October 2026 (India).
Record observed results, not inferred completion.

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
- The later repository-label build measures **473,933,679 bytes** and retains
  runtime user `10001:10001`; source-label inspection passed. Its remote scan
  is a separate CI gate.
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
- Argo CD 3.5.5 installed; all seven pods Ready. The Application reached both
  Synced and Healthy on the real generated deployment branch, using the exact
  published digest. See [first rollout](argocd-first-rollout.json).
- kube-prometheus-stack 92.10.1 installed with Helm 4.3.1: deployed.
- Grafana, Prometheus and supporting monitoring pods are running.
- App ServiceMonitor and eight-panel dashboard ConfigMap applied. Grafana's API
  confirms the provisioned dashboard; Prometheus reports both app targets UP.
  See [performance results](../performance.md) for completed cache and HPA tests.
  Grafana's original 384 MiB limit caused restarts on dashboard load; the recorded
  768 MiB limit has remained stable. The error-rate query returns zero when API
  counters exist without 5xx events, and no data when request metrics are absent;
  both conditions were checked against Prometheus.

- [Pod recovery](pod-recovery.json): app replacement and PostgreSQL replacement
  passed; all 1,000 expenses survived the latter. This does not prove backups.
- [Budget scheduler](budget-scheduler.json): two ready replicas, repeated checks,
  one persisted alert and a PostgreSQL ShedLock row. This counts persisted alerts,
  not scheduler method invocations. The daily schedule was restored afterward.
- Kubernetes API smoke test: PASS, including one valid/one invalid import row,
  exact splits, net zero, outsider 404 and refresh replay 401.

## GitHub delivery

- [Run 39131104288](https://github.com/Aadyant-7/splitnest/actions/runs/39131104288):
  SUCCESS for `9d095d4984170d9df891e59164794c88eb2c8b65`. All 75 Java tests,
  six load-data, six manifest-context and eight GitOps fixture scenarios passed.
- Runtime UID check, Trivy CRITICAL gate, GHCR publication and isolated kind
  manifest-validation/promotion jobs all passed.
- Published digest: `sha256:76091d746a6438430600af27a6b533455822f45d8d16148b4f5e7dd339bfbcf1`.
  Anonymous manifest retrieval returned HTTP 200 with that exact digest.
- `deploy/local` image promotion: `fa03f6d`; manifest synchronization: `66feb28`.
- The first delivery run stopped safely after Java tests because an expected
  negative Git check left a stale native exit status in a PowerShell fixture.
  The harness now resets status only after every assertion and cleanup succeeds;
  the complete rerun passed. The image gate was never bypassed.

## Remaining live checks

Git-driven rollback is being verified with a second scanned release.
Backup/restore rehearsal and production/cloud deployment are not claimed.
