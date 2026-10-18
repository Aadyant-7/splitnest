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
kubectl --context kind-splitnest apply -f deploy/base/hpa.yaml
kubectl --context kind-splitnest -n splitnest get hpa splitnest
```

Restore GitOps synchronization if it was suspended. Keep or remove the synthetic
credential Secret deliberately after the experiment; never copy its contents
into the evidence report.

## Results and limits

Numeric results belong in `docs/evidence/` only after completed runs. This guide
does not assert a latency improvement, request rate, HPA scaling event or passed
threshold before measurements exist. An inexpensive SQL aggregate or local Redis
overhead can make a small test show little benefit; report that result directly.

The load script's p95-under-one-second threshold is a local demonstration target,
not a production SLA. This single-node kind environment includes the application,
PostgreSQL, Redis and the load generator on the same laptop; its results do not
establish production capacity or high availability.

After the fixed-replica A/B comparison, restore the HPA and test autoscaling
separately with documented load. Observe desired/current replicas and per-Pod CPU.
A cached balances workload may not exceed the CPU target. Record the actual
behavior rather than claiming that scaling from two to five is guaranteed.

## Questions to check understanding

1. Why must both modes use the same dataset and fixed replica count, and why
   should builds stop during the measurement?
2. Why is calling a port-forward insufficient proof that both replicas handled
   traffic, even if the port-forward targets a Service?
3. Which k6 metrics exclude warm-up, and why might Redis add overhead for a small
   dataset despite preventing repeated aggregate queries?
