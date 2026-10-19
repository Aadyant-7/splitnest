# Verification record

Initial verification: 18 October 2026; runtime follow-up: 19 October 2026 (India).
Record observed results, not inferred completion.

The original sections below preserve the backend/local delivery baseline. The
owner subsequently approved the free local browser-app extension, now implemented
and tested. New full-stack checks are recorded separately below and in
[current project status](../project-status.md).

## Backend

This section records the original 75-test backend release; the expanded 93-test
full-stack verification is recorded in the final section below.

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
- The import-duration panel now uses cumulative duration divided by cumulative
  count and is titled **Mean import duration since process start**. This keeps
  completed work visible after the rate window becomes idle. The observed mean
  was **0.087213369 seconds**, not zero; this is a mean, not a p95 estimate.
- Actual Grafana captures: [load and autoscaling](grafana-load.png),
  [API operations](grafana-operations.png), and
  [background imports and alerts](grafana-background.png). These are runtime
  captures rather than dashboard mockups. Process counters can reset on rollout.

- [Pod recovery](pod-recovery.json): app replacement and PostgreSQL replacement
  passed; all 1,000 expenses survived the latter. This does not prove backups.
- [Budget scheduler](budget-scheduler.json): two ready replicas, repeated checks,
  one persisted alert and a PostgreSQL ShedLock row. This counts persisted alerts,
  not scheduler method invocations. The daily schedule was restored afterward.
- Kubernetes API smoke test: PASS, including one valid/one invalid import row,
  exact splits, net zero, outsider 404 and refresh replay 401.

## GitHub delivery

The [final restored-image check](final-runtime.json) passes the real API smoke
scenario, readiness UP, Swagger HTTP 200 and OpenAPI's 17 paths; both current
Prometheus app targets are UP. The Compose app and both data stores also remain
healthy. The running Kubernetes image is the newer `e554a02e...` digest.

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

### Second verified release

- [Run 39156608544](https://github.com/Aadyant-7/splitnest/actions/runs/39156608544):
  all three jobs succeeded for `3d92be1f319e3ea9bb2837d10b5cdfa383ec946f`.
  Verification, non-root image inspection, the Trivy CRITICAL gate, GHCR push,
  generated-manifest validation and deployment-branch promotion all passed.
- Published digest:
  `sha256:e554a02e01429c47356c67714ce75b2ae4306c256ffc69d18e80605323e24972`.
- Manifest synchronization commit: `a192fb6`. Image-only promotion: `b458b37`.
  Separating those commits allows an image rollback to retain updated manifests.
- The temporary CI validation cluster was deleted successfully. This CI cluster
  is separate from the persistent local `kind-splitnest` application cluster.

## Live GitOps rollback and restoration

[The recorded observation](gitops-rollback.json) verifies both directions against
the actual `kind-splitnest` application. Every stage reached **Synced**, **Healthy**
and **two ready replicas**:

| Stage | Deployment Git revision | Observed image digest prefix | Recorded elapsed time |
|---|---|---|---:|
| Second release | `b458b37` | `e554a02e…` | 61.0 seconds |
| Revert image promotion | `ce8556f` | `76091d74…` | 192.9 seconds |
| Revert the rollback | `3fbf070` | `e554a02e…` | 284.1 seconds |

The full revisions and exact image digests are retained in the JSON record.
Automatic Argo polling performed reconciliation; no manual Argo refresh was used.
The recorded elapsed values include polling, rollout and observation delays;
they are not isolated controller-response benchmarks.

The two scanned images differ in OCI repository metadata; the API implementation
is unchanged. This verifies the backward/forward image deployment mechanism,
not rollback of a business change or database schema. The image-only revert
preserved the separate manifest synchronization commit. Flyway migrations were
not reversed.

## Scope and recovery limits

Backup/restore rehearsal, off-machine backup retention, a highly available
PostgreSQL service and production/cloud deployment are not claimed. The runbooks
document additional failure and recovery procedures; a documented command alone
does not establish that every optional experiment was executed.

## Initial browser implementation — 19 October 2026

These initial observations preceded the frontend-only decimal correction.
[Full-stack verification](frontend-verification.json) records the final expanded
checks separately from the original release:

- Complete Maven verification: **93 tests, no failures/errors/skips; BUILD SUCCESS**.
  The temporary host test server was stopped before packaging to release its
  Windows JAR lock. No test or packaging failure was ignored.
- **82 frontend unit/component tests**, strict TypeScript build and Vite build
  pass. The locked npm installation/audit reports zero vulnerabilities.
- **8 real Chromium scenarios** pass against Vite plus the Java API, then pass
  again against the actual Compose image (**19.6 seconds**). They cover sessions,
  exact three-user splits and historical balances, permissions, actual imports,
  budgets, two-tab rotation/logout, mobile layout, rate limiting and keyboard use.
  The multi-tab case simulates access expiry with one 401 per tab; refresh-cookie
  rotations and subsequent API requests are real.
- Combined-image build passes: runtime UID **10001:10001**, **474,146,183 bytes**.
  The [Trivy 0.70.0 scan summary](frontend-image-scan.json) records **0 CRITICAL**
  findings for operating-system/library packages. Other severities and future
  vulnerability status are not implied.
- Compose app/PostgreSQL/Redis are healthy; app root returns HTML200, Swagger
  exposes **21 paths**, and the existing financial/auth/import smoke script passes.
  Database volumes were preserved.
- Actual packaged-app captures: [sign-in](frontend-login.png),
  [groups](frontend-groups.png), [expenses](frontend-expenses.png) and
  [mobile](frontend-mobile.png). All shown accounts and expenses are synthetic.
- The delivery source now includes frontend verification, a Node build stage and
  frontend-aware GitOps fingerprints. **11 local promotion fixtures** pass,
  including frontend-only source/lockfile promotion and README-only preservation
  after an intentional rollback. Remote CI and reconciliation were verified in
  the later full-stack delivery below.

## Final full-stack delivery — 19 October 2026

All six browser-extension acceptance milestones are complete. The application
remains a free local academic/placement demonstration.

- **93 Java tests** pass with zero failures/errors/skips and `BUILD SUCCESS`.
  A final full verification also passes with inherited local
  `BROWSER_COOKIE_SECURE=false`: integration cookie-contract tests explicitly
  select Secure mode, while browser tests verify the deliberate local HTTP mode.
- **90 frontend unit/component tests** and strict TypeScript/Vite builds pass.
  npm audit reports zero vulnerabilities at this observation.
- **9 Chromium scenarios** pass against the published image in Compose and kind.
  Eight use real API/database journeys. One supplies a deterministic large
  numeric JSON balance response to check that the last paisa is displayed
  exactly; it does not claim a huge stored ledger. The kind test run reports
  **18.1 seconds**. Multi-tab access expiry alone is simulated with one401 per tab;
  cookie rotation, logout and subsequent requests are real.
- **23 script scenarios** pass: six load-data, six manifest-context and eleven
  GitOps promotion fixtures. The original twenty interview questions remain
  unchanged and unanswered.
- Full-stack source `2cb1796`, encoded-path CSRF correction `51129c8`, and actual
  frontend-only source `6b67a01` each passed remote CI. Final release:
  [CI run39269576460](https://github.com/Aadyant-7/splitnest/actions/runs/39269576460).
  Verify, image publication and deployment promotion all succeeded.
- Final published image:
  `ghcr.io/aadyant-7/splitnest@sha256:7920278f61224392c61aa6985a6e4c40bf46a594d0c48dd8ddccadfca726e091`.
  Pulled image size: **474,147,445 bytes**; runtime UID **10001:10001**.
  CI passed its operating-system/library Trivy gate with **0 CRITICAL** findings,
  including unfixed vulnerabilities. This is a dated policy result, not a claim
  that every severity is zero. [Scan record](frontend-image-scan.json).
- [Actual frontend-only GitOps evidence](frontend-gitops.json): all eleven
  changed paths are under `frontend/`, and the backend `src/main` tree is
  unchanged. Normal Argo CD polling changed the registry digest and served JS
  asset from `index-s6tVud0X.js` to `index-ClbWYNDy.js`. No manual refresh, apply
  or rollout restart was used. Revision `de82fc6` reached Healthy/Synced with
  two updated, ready replicas and readiness UP before the browser run.
  HPA may subsequently change the replica count within its configured range.
- Prometheus app targets were UP after the release. Existing cache/load/HPA and
  rollback evidence above remains a separate, dated backend experiment.
- Final screenshots were captured from the published Compose image at port8080
  using synthetic accounts and actual API expenses. The existing database volume
  was preserved. [Machine-readable checks](frontend-verification.json).

No cloud deployment, commercial-capacity claim or paid service was introduced.
The detailed explanation phase follows the [learning roadmap](../learning-roadmap.md).
