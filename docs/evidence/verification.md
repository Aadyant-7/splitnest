# Verification record

Initial verification: 18 October 2026; later releases: 19 and 22 October 2026 (India).
Record observed results, not inferred completion.

The original sections below preserve the backend/local delivery baseline.
Later sections record full-stack application checks against their source commits
and image digests. These are dated observations, not continuous monitoring.

## Backend

This section records the original 75-test backend release. Subsequent sections
record the expanded full-stack and interface-refinement verification.

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
- Local app Secret created from ignored `.env` without exposing its values;
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

This release combines the browser application and Java API in one local image.

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
  GitOps promotion fixtures.
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

## Interface refinement — 22–23 October 2026

[Release checks](frontend-overhaul.json) distinguish local verification from the
subsequent published-image and Kubernetes observations.

- Maven `verify`: **94 tests**, zero failures/errors/skips, **BUILD SUCCESS**.
  The additional routing test proves only the exact public CSV example is
  permitted; adjacent paths and unauthenticated writes remain protected.
- Frontend: **107 unit/component tests**, strict TypeScript and Vite build pass.
  npm audit reports zero vulnerabilities at the recorded observation.
- **10 Chromium scenarios** pass against the packaged Compose image. Nine use
  actual API/database workflows; one supplies a deterministic large-decimal
  response. Browser coverage includes the downloaded CSV's real import/category
  results, completed-result restoration across tab changes, exact shares,
  permissions, multi-tab sessions, accessible tabs and all workspace sections at
  **320, 390, 768 and 1440 pixels**. The packaged run reports **20.0 seconds**.
- The real-HTTP smoke script passes financial, import, access-isolation and
  refresh-replay checks. App/PostgreSQL/Redis are healthy; the database volume
  was preserved. All **23 delivery-helper fixture scenarios** pass.
- Updated captures use synthetic accounts and real API data:
  [sign-in](workspace-login.png), [groups](workspace-groups.png),
  [expenses](workspace-expenses.png), [phone expenses](workspace-mobile.png),
  [overview](workspace-overview.png), [members](workspace-members.png),
  [phone members](workspace-members-mobile.png), [imports](workspace-imports.png)
  and [budgets](workspace-budgets.png). The earlier `frontend-*.png` captures are
  retained for the dated release above.

The application change is `05941ee`; the published release source is `23bb368`.
[CI run39781563124](https://github.com/Aadyant-7/splitnest/actions/runs/39781563124)
passed verification, image publication and deployment promotion. Its Trivy
CRITICAL gate includes unfixed vulnerabilities and passed. This is a dated
policy result, not an all-severity guarantee: the scanner also warned that
details were unavailable for CVE-2026-107891.

- Exact published image:
  `ghcr.io/aadyant-7/splitnest@sha256:b1fe109e47e9ca15d5ca99544d1cf4028e028789a93911a0cea45a6404da03a7`.
  Pulled size: **474,148,982 bytes**; runtime UID **10001:10001**.
- On23October, all **10 Chromium scenarios** passed again against that image in
  Compose (**20.9 seconds**) and kind (**23.3 seconds**). The distinction between
  nine real API journeys and one decimal-display fixture still applies.
  Compose app/PostgreSQL/Redis remain healthy, with the original database volume.
- Normal Argo CD reconciliation reached **Healthy/Synced**, revision `b4cc7aa`,
  without a manual refresh, apply or rollout restart. The served JavaScript is
  `/assets/index-wmKhVMwo.js`. Two app replicas were ready before browser testing;
  five updated replicas were ready afterward, within the configured HPA range
  of two to five. This observation is separate from the earlier controlled
  load/HPA experiment.
- All **five Prometheus app scrape targets were UP** after the browser run.
  The [release JSON](frontend-overhaul.json) records the runtime observations
  separately from the initial local build and screenshots.

## Navigation and onboarding — 23 October 2026

The [local navigation checks](frontend-navigation.json) cover the public
introduction, signed-in Home, My groups, in-app Guide and shareable group-section
URLs. The [wireframes](../interface-design.md) describe the page hierarchy.

- **94 Java tests** pass, with no failures/errors/skips and `BUILD SUCCESS`.
  Both the security allowlist and explicit Spring mappings serve the new pages;
  unknown adjacent paths still return errors.
- **141 frontend unit/component tests** in sixteen files pass, along with strict
  TypeScript and the Vite build. Coverage includes account-scoped Home requests,
  real group counts, failure/retry states, onboarding focus, task anchors and
  URL-owned tabs with keyboard and browser-history behavior.
- **13 Chromium scenarios** pass against Vite (**26.3 seconds**) and the packaged
  Compose app (**23.9 seconds**): eleven real API/database journeys, one public
  introduction/responsiveness scenario and one deterministic decimal-display
  fixture. Home, Guide, introduction and existing group sections fit **320,
  390, 768 and 1440 pixels**. Earlier scenario counts remain dated above.
- The local non-root image is **474,171,055 bytes**, UID **10001:10001**.
  Compose app/PostgreSQL/Redis are healthy; the existing database volume remains.
  Direct `/`, `/app/home` and `/app/guide` requests return the HTML shell.
- Reviewed synthetic-data captures: [introduction](navigation-landing.png),
  [phone introduction](navigation-landing-mobile.png),
  [empty Home](navigation-home-empty.png), [Home](navigation-home.png),
  [phone Home](navigation-home-mobile.png),
  [empty groups](navigation-groups-empty.png), [groups](navigation-groups.png),
  [Guide](navigation-guide.png) and [phone Guide](navigation-guide-mobile.png).

This snapshot records local checks. The CI run for its containing source commit
records remote test/image-scan results, and generated `deploy/local` provenance
identifies the selected registry image. These local browser results do not by
themselves establish a newer published-image or Kubernetes check.

## Free public-demo preflight — 30 October 2026

The [preflight record](public-demo-preflight.json) covers the opt-in public
profile. These are local configuration/rehearsal results, not a live URL claim.

- Maven verification: **107 tests**, zero failures/errors/skips, `BUILD SUCCESS`.
  Thirteen new tests cover status-only public readiness, 503 readiness states,
  controlled database-health failure, private management paths, Secure cookies,
  native Tomcat proxy handling and bounded import-worker configuration.
- **141 frontend tests**, TypeScript/Vite build and npm audit pass; the audit
  reported zero vulnerabilities at this observation.
- A separate non-root container enforced a **512 MiB memory/swap limit**, using
  the public JVM settings and real Neon PostgreSQL over verified TLS. The API
  smoke passed exact shares, zero-sum balances, outsider404, refresh-replay401,
  and a CSV import with one valid/one invalid row. The repository's small XLSX
  fixture completed with two stored rows and an even one-member balance.
- Post-run memory observations were **347.5 MiB** after the API smoke and
  **362.1 MiB** after XLSX. The container remained healthy with `OOMKilled=false`.
  This run used one local CPU and local Redis; it does not measure Render's
  0.1CPU performance, the private hosted cache, worst-case memory or capacity.
- Provider metadata confirms the dedicated Neon organization/project and Render
  cache use free plans. Render's dashboard showed Hobby with no card on file.
  No local financial records were copied to the public database.

The [public runbook](../public-demo.md) describes the remaining live HTTPS,
cookie, isolation, rate-limit and deployment checks. Only a successful live
check establishes the public deployment's result.

## Public HTTPS deployment — 31 October 2026

[SplitNest is live](https://splitnest-expenses.onrender.com/) on Render Free,
with Neon Free PostgreSQL and a private Render Free Valkey cache. The
[live record](public-demo-live.json) identifies the deployed source, immutable
image, deploy ID, checks and boundaries; the [capture](public-demo-landing.png)
shows the public introduction. Earlier naming endpoints are suspended.

- Source `895a1dc` passed [CI41175134566](https://github.com/Aadyant-7/splitnest/actions/runs/41175134566):
  **107 Java tests**, **141 frontend tests**, build, **13 packaged browser
  scenarios**, and the unchanged critical OS/library image gate.
- The initial CI image was blocked by a critical Brotli finding. The
  [runtime-refresh record](public-image-security.json) identifies the patched
  pinned base. No scanner exception or policy relaxation was introduced.
- **13 Chromium scenarios pass against the final public HTTPS address** in
  **2.9 minutes**: eleven real API/database journeys, one introduction/layout
  case and one deterministic large-decimal fixture. They cover registration,
  saved financial records, exact splits, isolation/roles, CSV imports, budgets,
  Secure/HttpOnly cookies, CSRF rejection, multi-tab rotation/logout, responsive
  layouts, keyboard use and real Retry-After behavior.
- The initial public attempt hit the local **10-second** sign-in expectation
  while the request remained pending. The explicit public test configuration
  permits **30-second expectations/180-second scenarios**, keeps TLS validation,
  one worker, zero retries and the original assertions, and aligns the rate
  test with the server's minute. Local/CI budgets remain unchanged.
- The repository's synthetic **XLSX fixture imported two rows**. Public readiness
  returned only `{"status":"UP"}`; HEAD returned200. Authenticated public
  `/actuator/health` and `/actuator/prometheus` returned404.
- Render's one-minute memory samples reached **412,983,300 bytes** during the
  startup/browser observation, below the **512 MiB** instance limit. These are
  coarse samples, not a peak-memory, capacity or load result.

No real local financial records were migrated. Free hosting can sleep or hit
quotas, and scheduled work requires the app to be awake. This public container
deployment does not establish cloud Kubernetes, HPA, high availability, backups
or an actual daily alert firing. The local lab's dated evidence remains separate.
