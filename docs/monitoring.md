# Monitoring and repeatable load tests

Prometheus scrapes the app's internal management endpoint every 15 seconds.
Grafana queries those time series and displays the checked-in dashboard. Metrics
Server has a different job: it serves CPU/memory measurements to Kubernetes and
the HPA. Installing Prometheus does not replace Metrics Server.

## Install the monitoring stack

The pinned version is
[kube-prometheus-stack 92.10.1](https://github.com/prometheus-community/helm-charts/releases/tag/kube-prometheus-stack-92.10.1).
The values disable optional control-plane scrapers that are unsuitable for this
kind setup, use modest resources and keep only one hour of local metrics. Grafana
and Prometheus storage are ephemeral in this demonstration.

```powershell
helm upgrade --install splitnest-monitoring oci://ghcr.io/prometheus-community/charts/kube-prometheus-stack --version 92.10.1 --namespace monitoring --create-namespace --values deploy/monitoring/values.yaml --wait --timeout 5m
kubectl apply -k deploy/monitoring
./scripts/Validate-Manifests.ps1 -Server
kubectl -n monitoring get pods
kubectl -n splitnest get servicemonitor splitnest
kubectl -n monitoring port-forward service/splitnest-monitoring-grafana 3000:80
```

Visit [Grafana](http://localhost:3000). Retrieve the chart-generated admin password
privately from its Kubernetes Secret; do not commit or paste it into reports.
Open **SplitNest - API and background work**, provisioned from
`deploy/monitoring/dashboards/splitnest.json`. For Prometheus troubleshooting,
find its Service with `kubectl -n monitoring get svc`, port-forward it to 9091,
then inspect Targets. Both app replicas should appear as healthy targets.

The ServiceMonitor selects the `splitnest` Service and its named `management`
port. Its `release: splitnest-monitoring` label matches the chart's selector.
Prometheus is configured to discover monitors in the `monitoring` and `splitnest`
namespaces. A label or namespace mismatch gives an empty dashboard despite a
healthy app.

The management port stays cluster-internal. Publicly exposing detailed metrics or
health information is unnecessary for Swagger usage. User/group IDs are useful
in structured logs, but never belong in metric labels because they create an
unbounded number of time series.

## What the dashboard explains

| Panel | Interpretation |
|---|---|
| API requests per second | Rate of completed API requests across app replicas. |
| API 5xx fraction | Server-error rate divided by total request rate. Authentication/validation 4xx responses are a different category. |
| API p95 latency | Estimate from request-duration histogram buckets, aggregated across replicas. It requires the app's histogram configuration. |
| JVM heap per Pod | Memory used by Java objects in each replica; it is different from the container's full memory footprint. |
| Imports processed | Terminal outcomes, tagged only by COMPLETED or FAILED. Counters reset when a process restarts. |
| Mean import duration | Total observed import time divided by completed observations; unlike p95, a mean can hide outliers. |
| Budget alerts | Number of alerts successfully created by running processes. PostgreSQL remains the durable history. |
| Desired replicas | Deployment size, useful alongside `kubectl get hpa -w`. |

Custom metrics are `splitnest.imports.processed`, `splitnest.imports.duration`
and `splitnest.budget.alerts`. Prometheus normalizes dots to underscores
and adds counter/timer suffixes. A missing import series before the first import
is expected; perform an import to create it. Capture actual dashboard screenshots
only after generating representative traffic; no screenshots or performance
results are implied by these source files.

## Run the balances workload through the Service

Use a group with multiple current members and a realistic fixed expense dataset.
All supplied users must belong to that group. Keep test duration below the
15-minute access-token lifetime. The script logs in once per user before the
measurement, warms up for 15 seconds, waits five seconds, then measures for 60
seconds by default. Custom balance latency/failure metrics exclude warm-up.

For an installed k6 binary:

```powershell
# Set these privately in your shell; never save real credentials in a tracked file.
$env:GROUP_ID = '<group UUID>'
$env:USERS_JSON = '<JSON array of email/password objects>'
$env:RUN_LABEL = 'cache-enabled'
$env:CACHE_MODE = 'enabled'
k6 run loadtest/balances.js
```

`ACCESS_TOKENS_JSON` can instead contain a JSON array of already issued bearer
tokens. It takes precedence over `USERS_JSON`. No token is emitted by the script's
summary. Login is itself rate limited: do not repeatedly rerun bad credentials or
perform login inside every measured iteration.

For the actual replica-distribution experiment, run k6 **inside Kubernetes**:

Prepare a reproducible synthetic group through a separate port-forward. Keep the
first command running in another terminal, then run the remaining commands from
the repository root. Preparation creates three new users and 1,000 expenses;
rerunning it creates a new dataset rather than modifying a previous one.

```powershell
kubectl --context kind-splitnest -n splitnest port-forward service/splitnest 18080:8080
# In a second terminal:
./scripts/Prepare-LoadTest.ps1 -BaseUrl http://127.0.0.1:18080 -SeedExpenseCount 1000
kubectl --context kind-splitnest -n splitnest create secret generic splitnest-loadtest-credentials --from-env-file=.work/loadtest.env
kubectl apply -k loadtest
kubectl -n splitnest logs -f job/splitnest-balances-load
kubectl -n splitnest get job splitnest-balances-load
```

The preparation script checks `.work/loadtest.env` is Git-ignored before API
writes, verifies the group/count/balance invariants, and prints only identifiers
and counts. Credentials remain in that ignored file and the local Secret.
`scripts/Test-PrepareLoadTest.ps1` exercises its sensitive-data handling using
fixtures without making real API requests. Delete the old load-test Secret before
creating one for a different prepared dataset; do not overwrite it silently while
a Job is using it.

This Job calls `http://splitnest.splitnest.svc.cluster.local:8080`, so normal
Service routing distributes connections among ready replicas. Verify request
activity per Pod rather than assuming an even split. Port-forwarding a Service
selects one backing Pod and cannot establish that traffic reached both replicas.
After recording logs, delete only the completed Job before rerunning it:
`kubectl -n splitnest delete job splitnest-balances-load`. The workload's script
ConfigMap and credential Secret can be reused. Remove the credential Secret when
the experiment is finished.

## Compare cache enabled and disabled fairly

1. Keep the same image, dataset, users, request rate/VUs, warm-up, duration and
   laptop resources. Record the source SHA and image digest.
2. Suspend Argo self-heal for the controlled run or change the experimental
   deployment branch. Temporarily remove the HPA and set exactly two app replicas.
3. Run once with `splitnest.cache.enabled=true` (the default), then with
   `SPLITNEST_CACHE_ENABLED=false` set on the app Deployment. Roll out both replicas
   and warm up again before measuring. `CACHE_MODE` labels the report; it does not
   change app caching by itself.
4. Record successful requests, failures, p50/p95/p99, per-Pod CPU and database
   load, not just the fastest response. Repeat runs and report variability.
5. Restore the cache configuration, HPA and GitOps self-heal after the comparison.

An example live-only change while self-heal is deliberately suspended is
`kubectl -n splitnest set env deployment/splitnest SPLITNEST_CACHE_ENABLED=false`.
Restore the default with `kubectl -n splitnest set env deployment/splitnest SPLITNEST_CACHE_ENABLED-`.
Apply `deploy/base/hpa.yaml` again to restore autoscaling. Use a throwaway
experiment branch when demonstrating this under continuous GitOps control.

Run a separate HPA experiment with autoscaling restored and progressively higher
load. Watch `kubectl -n splitnest get hpa -w`, `kubectl top pods -n splitnest` and
Grafana. A cached balance endpoint may use too little CPU to trigger scaling.
Report what actually happens. Do not disable the cache secretly or claim a
scaling result that was not observed.

## Evidence to retain

Save a short report under `docs/evidence/` containing hardware/Docker resources,
tested commit/digest, dataset size, replica count, cache setting, VUs, duration,
numeric k6 output and screenshots of both traffic and resource panels. Summaries
must contain no credentials or bearer tokens. The k6 threshold of p95 under one
second is a local test target, not a measured claim or a production SLA.

## Questions to check understanding

1. Why must cache comparison keep replica count fixed while HPA behavior is tested separately?
2. Why can a mean import duration look healthy even when some imports are slow?
3. Why does a dashboard counter reset on restart while the database alert history remains?
