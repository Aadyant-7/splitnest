# Render public-demo adapter

This directory is the public Render delivery target. The full architecture,
free limits and live-verification checklist are in
[docs/public-demo.md](../../docs/public-demo.md). Local Kubernetes manifests and
the Argo CD branch keep their existing purpose.

## Image delivery

Render uses a **Git-backed Docker web service** from this repository's `main`
branch, with Dockerfile path `deploy/render/Dockerfile` and repository-root Docker
context. Set the non-secret `SPLITNEST_IMAGE` service variable to the complete
immutable GHCR digest. Render passes that value to the adapter's `ARG`/`FROM`.
The app is compiled, tested and scanned in GitHub Actions; this thin
Render build pulls that artifact and does not compile Java or React again.

Keep **Auto-Deploy Off** (`autoDeploy: no`). Updating the linked branch alone
must not publish an unverified application. For each release:

1. Verify the application's CI and image scan have succeeded.
2. Set `SPLITNEST_IMAGE` to that tested `ghcr.io/...@sha256:...` value in Render.
3. Save the environment change without scheduling a second deployment if the
   API has already started one. Keep application source committed on `main`.
4. Trigger one Render deploy when none has already been scheduled, and monitor its ID
   until it becomes `live`.
5. Check the public URL and `/readyz`, then run the browser/API demo checks.

A successful deploy trigger or image pull does not establish a working service.
Do not substitute a mutable `latest` tag for the selected digest. An application
rollback must also remain compatible with the current database migrations;
changing an image does not undo database records or schema changes.

## Service settings

| Setting | Value |
|---|---|
| Workspace plan | Hobby |
| Service type/runtime | Web service / Docker |
| Compute plan | Free, one instance |
| Region | Singapore |
| Branch | `main` |
| Dockerfile path | `deploy/render/Dockerfile` |
| Docker context | Repository root |
| Auto-Deploy | Off |
| HTTP health-check path | `/readyz` |
| Persistent disk | None |
| Public address | Provider-assigned HTTPS `onrender.com` URL |

Render provides `PORT`; the public profile listens on that port on all
interfaces. Configure the HTTP path in the Dashboard's service Settings if the
creation tool does not expose a health-check field. Leave the inherited Java
entrypoint in place so graceful shutdown reaches the JVM.

## Runtime environment

Set secrets as Render environment values, not referenced Docker build arguments, Git files,
screenshots or frontend variables. The entries below are templates, not working
credentials or identifiers.

| Key | Value or source |
|---|---|
| `SPRING_PROFILES_ACTIVE` | `public-demo` |
| `SPLITNEST_IMAGE` | Immutable `ghcr.io/aadyant-7/splitnest@sha256:...` selected from successful CI |
| `DB_URL` | Direct Neon JDBC URL with certificate/hostname verification; example below |
| `DB_USER` | Dedicated public-demo database role |
| `DB_PASSWORD` | That role's private password |
| `JWT_SECRET` | Fresh Base64 random key of at least 32 decoded bytes |
| `REDIS_HOST` | Render Key Value internal hostname in the same region |
| `REDIS_PORT` | Internal connection port, normally `6379` |
| `SPRING_DATA_REDIS_PASSWORD` | Internal password only if internal authentication is enabled |
| `JAVA_TOOL_OPTIONS` | `-XX:MaxRAMPercentage=50.0 -XX:ActiveProcessorCount=2 -XX:+ExitOnOutOfMemoryError` |

The public JVM flags reserve more memory outside the heap than the root image's
local default. A 512 MB rehearsal and real service observation are still needed:
heap size is only part of JVM memory, and XLSX processing also needs headroom.

Example non-secret URL shape:

```text
jdbc:postgresql://<neon-direct-host>:5432/<database>?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory&connectTimeout=15&socketTimeout=30&tcpKeepAlive=true
```

Keep the username and password in their separate environment fields. The direct
hostname must not contain Neon's pooler suffix. Do not weaken TLS verification
to solve a connection failure. Verify the hostname, role, database, password,
driver and provider status instead.

`public-demo` forces Secure cookies even if a local `.env` contains
`BROWSER_COOKIE_SECURE=false`. Do not carry local HTTP overrides to the public
service. Health details stay hidden, and management listens only on loopback
port9090; the public health path is `/readyz`.

## Data services and cost controls

Use an empty Neon Free PostgreSQL18 project in AWS Singapore, with the endpoint's
minimum and maximum compute set to 0.25 CU. Leave Free-plan
autosuspend policy to Neon; do not try to force paid-plan suspension settings
through the creation API. A rejected configuration request is not a created
database. The app runs Flyway on startup, using its small direct-connection pool.

Use one Render Free Key Value instance in Singapore with:

- `noeviction`, so memory pressure does not silently remove rate-limit counters.
- Persistence off, as required by this free plan.
- External access disabled; use the internal address.

The same cache contains balance entries and limits. At capacity, operations can
fail rather than evict a counter; login/uploads must retain their documented
503 behavior when rate limiting is unavailable. PostgreSQL data does not live
in this cache.

Free-plan quotas are shared with other services in the account/workspace. Do not
modify, replace or upgrade unrelated existing services. Keep no payment method,
a zero build-pipeline spend limit, no extra disks/workers/cron services and no
custom domain. See the [free-plan boundaries](../../docs/public-demo.md#free-plan-boundaries)
before making resource changes.
