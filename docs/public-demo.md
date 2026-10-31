# Free public demo

Last reviewed: **31 October 2026**.

SplitNest can be published as a small, public résumé demonstration using free
hosting plans. This adds a public target alongside the existing local setup;
it does not replace the [Compose](docker.md) or [Kubernetes](kubernetes.md) lab.
Use synthetic names, expenses and statement files. Do not migrate personal local
records or upload real bank-account information to the public demo.

This page is a deployment runbook. A configured resource or an accepted deploy
request is not proof that the app is live. Dated runtime observations belong in
the [verification record](evidence/verification.md).

## What runs where

| Part | Public demo target | Purpose |
|---|---|---|
| Java app and compiled React assets | One Render Free web service, Singapore | Serves the browser and API from the same HTTPS origin |
| PostgreSQL 18 | Neon Free, AWS Singapore | Stores accounts, groups, expenses, imports and alerts |
| Redis-compatible cache | Render Free Key Value, Singapore | Holds balance-cache entries and shared rate-limit counters |

New Render Key Value instances use **Valkey 8**, which supports the Redis
protocol used by Spring Data Redis. Local Compose/kind retain their pinned
Redis image. The public cache uses `noeviction`, persistence off and internal
network access only. Losing a cache instance loses its cache and counters;
PostgreSQL remains the source of financial records.

The public service runs a Docker container. Kubernetes, Argo CD, the HPA,
Prometheus and Grafana remain the separately verified local delivery lab.
Do not describe the public Render URL as a cloud Kubernetes deployment.

## Free-plan boundaries

The selected plans have no subscription cost. Stay on **Render Hobby with Free
compute** and **Neon Free**; do not add a payment method, paid worker, cron
service, disk or custom domain. Keep the Render build-pipeline spend limit at
zero. Free limits are shared with any other resources in the same account or
workspace, so inspect existing usage before creating or changing resources.

| Limit | Current documented allowance or behavior |
|---|---|
| Render web instance | 512 MB RAM, 0.1 CPU, one instance |
| Render running hours | 750 Free web-service hours per workspace/month |
| Render Hobby traffic/builds | 5 GB outbound bandwidth and 500 Starter build minutes/month |
| Render idle behavior | Sleeps after 15 minutes without inbound traffic; a later visit wakes it, often taking about a minute |
| Render Key Value | One Free instance/workspace, 25 MB RAM, 50 connections; contents are lost on restart |
| Neon Free | 100 CU-hours/project/month, 1 GB PostgreSQL storage/project and 5 GB public network transfer/project/month |
| Neon idle behavior | Free-plan compute scales to zero after five minutes of inactivity |

With no payment method, Render suspends services or builds when billable usage
would be required. Neon Free suspends compute on compute/transfer exhaustion;
storage growth fails at its storage limit. These limits do not provide an
always-on availability guarantee. Review current dashboard usage and provider
policies rather than assuming these allowances never change.

The import dispatcher and recovery job query PostgreSQL while the app is awake.
Reducing idle connection counts does not make those scheduled queries disappear.
When Render sleeps, Java workers and the daily budget check are not running.
A budget alert therefore requires the app to be awake for its scheduled check;
this deployment does not add a paid scheduler or artificial keep-alive pinger.

## Accounts and deployment configuration

Sign in to [Render](https://dashboard.render.com/) and
[Neon](https://console.neon.tech/) directly or through their connected tools.
Never paste provider passwords, API keys, JWT secrets or database connection
strings into public documentation or chat.

Create a separate empty Neon PostgreSQL 18 project for the public demo, using a
**direct endpoint** in AWS Singapore with minimum and maximum compute both set
to **0.25 CU**. A small Hikari pool is sufficient for this
single app. The direct endpoint preserves the session settings and migration
behavior used by Flyway and `SET TIME ZONE`; a transaction-pooling endpoint is
not interchangeable with this configuration.

Use Render's internal Key Value connection in the same workspace and Singapore
region, with external access disabled. Keep other existing services unchanged.
The exact web-service settings and non-secret environment template are in the
[Render deployment directory](../deploy/render/README.md).

The opt-in `public-demo` Spring profile:

- Binds the application to `0.0.0.0:$PORT` and requires Secure browser cookies.
- Uses Render's proxy headers through Tomcat's native proxy handling, including
  the edge-provided client address; it does not trust caller-supplied forwarding
  values as an application-level identity.
- Exposes `/readyz` on the public application port, returning status without
  component or database details.
- Keeps the management listener on `127.0.0.1:9090`, including Prometheus metrics.
- Bounds database connections, HTTP threads and import workers for a small host.

The React app and API share one HTTPS origin, so no separate frontend host or
cross-origin authentication configuration is needed. Use a fresh public JWT key;
keep database user/password in separate secret environment values, and verify
the Neon TLS certificate and hostname.

## Deploy, update and verify

The root Dockerfile builds and packages the app in CI. The Render adapter's
Dockerfile references the exact GHCR digest supplied in the non-secret
`SPLITNEST_IMAGE` service variable after CI succeeds, using a small
Git-backed Docker build without rerunning Maven or Node on Render.

Automatic Render deployments are disabled. After a tested application release,
update that pinned image variable and rebuild the adapter for the selected
revision. The Render MCP environment-update operation itself requests a new
deploy; monitor that deployment instead of triggering a duplicate. In the
Dashboard, select **Save, rebuild, and deploy** when changing the image variable:
**Save and deploy** reuses the previous build and cannot change its `FROM` image.
The raw REST environment-update endpoint saves values without deploying, so that
access path requires a separate deploy request. See the
[adapter runbook](../deploy/render/README.md#image-delivery) for the exact flow.
This is separate from the local `deploy/local`/Argo CD promotion loop.
Wait for Render's deploy to report `live`, then verify behavior at the public URL.

Before calling the deployment complete:

1. Run the relevant Java/frontend checks and CI image scan.
2. Rehearse the public profile within a 512 MB container limit; record the result
   instead of assuming the JVM's heap percentage is a complete memory budget.
3. Confirm the selected service and cache plans remain Free and no paid resource
   was introduced. Set Render's HTTP health-check path to `/readyz`.
4. Verify HTTPS, public page/deep-link loading, Secure/HttpOnly refresh cookies
   and rejected browser-auth requests without CSRF protection.
5. Register synthetic users, create a group, add an expense, check exact splits,
   upload the sample CSV and verify role/isolation behavior against the live API.
6. Confirm `/readyz` returns only readiness status and management endpoints are
   not reachable through the public URL. Check startup/runtime logs for errors
   without copying credential-bearing output into evidence.

For a live demo, open the URL before the presentation to allow a normal cold
start. Accounts and expenses are stored in Neon, not the Render filesystem.
Keep demonstrations small and synthetic, and inspect usage periodically.

## Current provider references

- [Render Free limits](https://render.com/docs/free),
  [compute plans](https://render.com/docs/compute-plans) and
  [Hobby plan allowances](https://render.com/docs/new-workspace-plans)
- [Render Key Value](https://render.com/docs/key-value),
  [private networking](https://render.com/docs/private-network) and
  [HTTP health checks](https://render.com/docs/health-checks)
- [Render deploy lifecycle](https://render.com/docs/deploys) and
  [Docker image deployment](https://render.com/docs/deploying-an-image)
- [Neon Free plan and quota behavior](https://neon.com/docs/introduction/plans),
  [PostgreSQL versions](https://neon.com/docs/reference/compatibility),
  [direct versus pooled connections](https://neon.com/docs/connect/connection-pooling)
  and [Java connections](https://neon.com/docs/guides/java)
- [Render data restrictions](https://render.com/terms)
