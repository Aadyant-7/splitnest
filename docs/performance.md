# Controlled balances performance experiment

The experiment compares Redis-cached and PostgreSQL-calculated balances using
the same application image, group, users and expense dataset. It keeps exactly
two application replicas during the comparison. Autoscaling is a separate
experiment because changing replica count would change the comparison itself.

The workload calls the Kubernetes Service from an in-cluster k6 Job. A local
port-forward is suitable for preparing data, but selects one backing Pod and
does not demonstrate traffic distribution across both application replicas.

## Prepare synthetic data

Start a local forward if one is not already running:

```powershell
kubectl --context kind-splitnest -n splitnest port-forward --address 127.0.0.1 service/splitnest 18080:8080
```

In a separate PowerShell terminal, from the repository root:

```powershell
./scripts/Test-PrepareLoadTest.ps1
./scripts/Prepare-LoadTest.ps1 -BaseUrl http://127.0.0.1:18080 -SeedExpenseCount 1000
kubectl --context kind-splitnest -n splitnest create secret generic splitnest-loadtest-credentials --from-env-file=.work/loadtest.env
```

The preparation script creates three unique `example.invalid` users with random
passwords, one group and 1,000 expenses. Payments rotate among the three users;
categories and dates vary. Amounts start as integer paise and use PowerShell
`decimal`, so the fixture does not introduce binary floating-point rounding.
The script verifies the stored row count, three current members and zero-sum
balances before publishing its output file.

`SeedExpenseCount` accepts 0–2,000. The only console output is the group ID and
member/expense counts. Credentials are written as minified JSON into the
Git-ignored `.work/loadtest.env`, using UTF-8 without a BOM so both Windows
PowerShell and PowerShell 7 produce a valid `kubectl --from-env-file` input.
The script refuses to run if Git would track that file. Access/refresh tokens
are never written there. Do not display or commit the env file or its Secret.

Each execution creates a new synthetic fixture and replaces the local credential
file. If the Kubernetes Secret already exists, reuse it for the existing
fixture, or deliberately replace only that synthetic Secret after preparing a
new fixture. A failed preparation can leave partial synthetic data in the local
database; it does not write a new credential file until all checks succeed.

The plain PowerShell test script requires no Pester dependency. It mocks the API
and covers exact money, synthetic identities, categories/dates, safe output,
UTF-8/env formatting, zero expenses, nested API arrays, sanitized failures,
inconsistent balances, input bounds and the Git-ignore guard. Mock tests cannot
prove actual persistence or endpoint behavior; real preparation additionally
checks those properties against the running API.

## Fixed comparison conditions

| Condition | Setting |
|---|---|
| Current group members | Same three synthetic users in both modes |
| Expenses | Same 1,000 expenses, with three persisted shares each |
| Application replicas | Exactly two, HPA temporarily removed |
| Workload | 10 constant virtual users |
| Per-user think time | 50 ms after a balance request |
| Warm-up | 15 seconds, excluded from custom latency/failure metrics |
| Gap before measurement | 5 seconds |
| Measured duration | 60 seconds |
| Path | In-cluster HTTP Service DNS, authenticated balances endpoint |
| Credentials | Login once per user in k6 setup, outside measured requests |

The run report records the tested commit/image digest, JVM/runtime/container
resources, node/host resources and actual results. The k6 global `http_reqs`
counter includes setup and warm-up traffic; custom `balance_latency` and
`balance_failures` apply only to the measured scenario. Do not present the global
counter as an exact measured-only throughput value.

## Run the comparison

Coordinate with active builds and GitOps before changing the live Deployment.
During the initial measurement Argo CD must not own/self-heal the app, or its
automatic sync must be deliberately suspended. Avoid concurrent Docker builds,
test suites, image loads and unrelated load tests on the same laptop.

```powershell
kubectl --context kind-splitnest -n splitnest delete hpa splitnest
kubectl --context kind-splitnest -n splitnest scale deployment splitnest --replicas=2
kubectl --context kind-splitnest -n splitnest set env deployment/splitnest SPLITNEST_CACHE_ENABLED=true
kubectl --context kind-splitnest -n splitnest rollout status deployment/splitnest --timeout=180s
kubectl --context kind-splitnest apply -k loadtest
kubectl --context kind-splitnest -n splitnest wait --for=condition=complete job/splitnest-balances-load --timeout=240s
kubectl --context kind-splitnest -n splitnest logs job/splitnest-balances-load
```

For a repeated run, capture the finished Job's numeric summary, then delete that
Job before reapplying it. `RUN_LABEL` and `CACHE_MODE` in the Job are report labels;
`CACHE_MODE` does not control application behavior. For the disabled run use a
temporary copy of the Job manifest with an accurate run label/cache label, then:

```powershell
kubectl --context kind-splitnest -n splitnest delete job splitnest-balances-load
kubectl --context kind-splitnest -n splitnest set env deployment/splitnest SPLITNEST_CACHE_ENABLED=false
kubectl --context kind-splitnest -n splitnest rollout status deployment/splitnest --timeout=180s
# Apply the temporary Job with CACHE_MODE=disabled and RUN_LABEL=cache-disabled.
```

Use the same script, VUs, duration and Secret for both runs. Wait for both app Pods
to become ready after each rollout. Check per-Pod request counters to establish
that the Service workload reached both replicas. Record CPU/memory and failure
rates alongside latency. A single pair is an exploratory measurement; repeat
pairs and compare variability before making a general performance claim.

Always restore configuration, including after a failed run:

```powershell
kubectl --context kind-splitnest -n splitnest set env deployment/splitnest SPLITNEST_CACHE_ENABLED-
kubectl --context kind-splitnest -n splitnest rollout status deployment/splitnest --timeout=180s
kubectl --context kind-splitnest -n splitnest apply -f deploy/base/hpa.yaml
kubectl --context kind-splitnest -n splitnest get hpa splitnest
```

Restore GitOps synchronization if it was suspended. Keep or remove the synthetic
credential Secret deliberately after the experiment; never copy its contents
into the evidence report.

## Observed local results — 2026-10-18

The completed comparison used the conditions above, on Docker Desktop with 20
logical CPUs and 8,250,568,704 bytes of available VM memory (about 7.68 GiB).
Each application Pod requested 200m CPU/256 MiB and was limited to 1 CPU/768 MiB.
PostgreSQL, Redis, Prometheus, Grafana and the load generator shared this kind
node. Grafana's 768 MiB limit was configured and its Pod was stable before either
measured run; browser work and builds were paused during both measurements.

| Measured metric | Cache enabled | Cache disabled |
|---|---:|---:|
| Requests in measured scenario | 11,035 | 10,593 |
| Measured requests/second | 183.92 | 176.55 |
| Errors | 0 | 0 |
| Mean latency | 3.596 ms | 5.847 ms |
| Median latency | 2.879 ms | 5.718 ms |
| p95 latency | 7.262 ms | 9.938 ms |
| p99 latency | 8.885 ms | 13.296 ms |

In this single ordered pair, cached p95 was about 26.9% lower. This is a local
observation, not a repeatability or production-capacity claim. Both modes passed
the configured error-rate and p95 targets. The fixed 10-VU workload included a
50 ms think time and did not attempt to find maximum sustainable throughput.

Direct per-Pod management counters confirmed Service traffic reached both
replicas: 7,504/6,014 balance requests with caching and 7,286/5,645 without it.
Those counter deltas include setup and warm-up, unlike the measured-only request
counts in the table. Persistent HTTP connections can produce an uneven split;
these observations establish that both Pods handled traffic, not equal routing
on every request.

Both runs used `ghcr.io/aadyant-7/splitnest:verified-local` and the same observed
container-runtime image digest:
`sha256:05c75006d736c2ce5f17e6b42bfe959d82ae270f76287549a62c0cd9f8b0b6ae`.
The source checkout was at `5c302fb7a7f5971eff176a8daed88a6f0abb45eb`
when the environment record was taken. This was the locally verified image,
including Tomcat 11.0.27; the experiment is not evidence of a GHCR pull or GitOps
rollout. The full runtime image identifiers and numeric summaries are retained:

- [Environment and resource limits](evidence/balances-ab-environment.json)
- [Cache-enabled run](evidence/balances-cache-enabled.json)
- [Cache-disabled run](evidence/balances-cache-disabled.json)
- [Separate HPA observation](evidence/balances-hpa-observation.json)

After the comparison, the cache override was removed and the HPA was restored in
the `splitnest` namespace. A pre-measurement instrumentation attempt encountered
a terminating old Pod and produced no k6 run; filtering to ready, nonterminating
Pods corrected it. Those aborted setup steps are excluded from the results.

## Observed autoscaling — separate 50-VU experiment

The autoscaling Job completed successfully with the same three-user,
1,000-expense fixture and caching enabled. It used 50 constant VUs, the same
15-second warm-up and five-second gap, then 120 measured seconds. The original
HPA was active with a two-Pod minimum, five-Pod maximum and CPU target of 70%
of each Pod's 200m CPU request. This is a different workload from the fixed
10-VU comparison; its latency is not another cache A/B result.

| Measured metric | Autoscaling run |
|---|---:|
| Requests in measured scenario | 91,050 |
| Measured requests/second | 758.75 |
| Errors | 0 |
| Median latency | 2.150 ms |
| Mean latency | 15.236 ms |
| p95 latency | 55.069 ms |
| p99 latency | 147.718 ms |
| Maximum desired replicas observed | 5 |
| Maximum ready replicas observed | 5 |

The recorded samples establish an actual transition from two ready replicas to
five. At the first sample, current/desired/ready replicas were all two and CPU
was 4% of the request. Desired replicas first reached five at 31.4 seconds;
current replicas first reached five at 47.2 seconds; all five were first
observed ready at 57.7 seconds. These elapsed times start at Job creation and
include load-generator startup/warm-up. They are sampled observations, not an
isolated measurement of the controller's reaction time.

The highest reported CPU utilization was 454%. Its denominator is the requested
200m, so 454% corresponds to 908m CPU, or about 0.908 of one core; it does not
mean a Pod used 454% of the whole machine. The configured per-Pod CPU limit was
one core. The HPA reached its five-replica ceiling, and the last recorded CPU
reading was still 156% against the 70% target. Reaching the configured maximum
therefore does not establish that the workload met the desired CPU target or
that five replicas are sufficient for every load.

The numeric report's `jobSucceeded` field is true and both configured k6
thresholds passed. The observation ends with five ready replicas; it does not
capture post-load scale-down timing. Default cache behavior and the original
HPA remained enabled after the Job. Subsequent operational checks restored the
two-replica baseline separately; that later state is not evidence of a timed
automatic scale-down in this sample log. The [HPA manifest](../deploy/base/hpa.yaml)
uses a 180-second scale-down stabilization window.

## Limits of the experiment

Repeat alternating enabled/disabled pairs before making a broader performance
claim. An inexpensive SQL aggregate or local Redis overhead can make a smaller
test show little benefit. Resource snapshots in the reports are observations,
not proof that caching reduced CPU or database load by a particular percentage.

The load script's p95-under-one-second threshold is a local demonstration target,
not a production SLA. This single-node kind environment includes the application,
PostgreSQL, Redis and the load generator on the same laptop; its results do not
establish production capacity or high availability.

The overview dashboard's API p95 covers every `/api/` endpoint, including BCrypt
registration/login, over a rolling histogram window. The k6 table measures only
balance requests in its stated scenario and excludes setup/warm-up. Different
request populations, windows and histogram buckets mean those p95 values need
not match; do not substitute one for the other when reporting results.

For a repeat experiment, observe desired/current replicas and per-Pod CPU rather
than assuming this transition will recur on another machine. A cached balances
workload may not exceed the CPU target with a different dataset, request rate,
resource request or hardware configuration.
