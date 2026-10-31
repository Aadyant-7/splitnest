# ADR 0008: Free public résumé demonstration

Status: accepted, 31 October 2026. Deployment and runtime observations belong in
the [verification ledger](../evidence/verification.md); this decision is not a
claim that a public service is live.

## Context

SplitNest needs a public URL for an academic and résumé demonstration, with no
paid hosting or commercial availability requirement. The application already
packages its React assets and Java API together. Its local Compose, Kubernetes,
GitOps and monitoring lab demonstrates the broader delivery architecture.

## Decision

Use one **Render Free** web container, **Neon Free PostgreSQL 18** and a private
**Render Free Key Value** instance running Redis-compatible Valkey 8. Keep the
app and cache in Singapore and use Neon's AWS Singapore region. Financial
records belong in PostgreSQL; cache entries and rate-limit counters remain
ephemeral in-memory state. Choose `noeviction` so memory pressure cannot
silently discard rate-limit counters, and disable external cache access.

Keep the browser and API on the same HTTPS origin. Preserve the existing
in-memory access tokens, HttpOnly refresh cookies and CSRF protection. An opt-in
`public-demo` profile forces Secure cookies, bounds HTTP/database/import pools,
serves status-only readiness at `/readyz` and binds the management listener to
loopback. Local configurations retain their existing settings.

Connect to Neon's direct endpoint using JDBC `sslmode=verify-full` and the JVM
trust store through `DefaultJavaSSLFactory`. A small direct pool preserves the
session settings and migration behavior used by Flyway and the application's
UTC connection initialization. Keep passwords and signing keys in private
provider environment values; never migrate personal local records or real bank
statements into the public demonstration.

Build, test and scan the complete image in GitHub Actions. A thin Git-backed
Render Docker adapter selects that image through the non-secret
`SPLITNEST_IMAGE` variable, containing an immutable GHCR digest. It compiles no
application code on Render. Disable automatic branch deployments and deliberately
rebuild/deploy after choosing a successful CI artifact. Image selection is
separate from the local `deploy/local` and Argo CD promotion flow.

## Consequences

- The public target needs no second frontend runtime, cross-origin cookie setup,
  domain purchase, paid worker, cron service or persistent Render disk.
- Free services have cold starts, quotas and possible suspension. Do not promise
  continuous availability, commercial capacity or a backup guarantee.
- Java imports and scheduled budget checks run only while the app is awake.
  Sleeping hosting can delay work; no artificial keep-alive service is added.
- Cache restarts lose counters and cached balances. Database records are separate,
  and unavailable rate limiting retains its fail-closed behavior.
- Runtime/security updates require a new verified image and an explicit digest
  selection. A previously scanned digest is not a permanent security guarantee.
- The public URL demonstrates a container deployment. Kubernetes, Argo CD, HPA,
  Prometheus and Grafana remain the separate local lab; public hosting does not
  turn those local observations into cloud Kubernetes claims.

See the [public-demo runbook](../public-demo.md) and
[Render adapter guide](../../deploy/render/README.md) for current limits,
configuration and verification steps.
