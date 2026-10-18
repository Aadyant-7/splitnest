# Running SplitNest on local Kubernetes

These sources describe a local learning environment. A successful Kustomize render
does not prove that a cluster, image pull, database or rollout works. Record actual
results in `docs/evidence/` when running the commands below.

## The objects and why they exist

| Object | SplitNest example |
|---|---|
| Pod | One running app container, its network identity, and its temporary `/tmp` volume. A replacement Pod has a new identity. |
| Deployment | Keeps app replicas running and gradually replaces them when the image changes. We start with two app replicas. Redis also uses a Deployment because its data is replaceable. |
| Service | Gives Pods a stable DNS name. The app connects to `postgres:5432` and `redis:6379`; clients inside the cluster call `splitnest:8080`. |
| ConfigMap | Stores non-secret configuration such as database URL, Redis host and JVM memory settings. |
| Secret | Holds the database password and JWT signing secret. Base64 in a Secret is encoding, not encryption. Values are created locally and never committed. |
| StatefulSet | Gives the single PostgreSQL instance a stable name and associated disk claim. It does not make PostgreSQL highly available. |
| PersistentVolumeClaim | Requests 2 GiB of storage for PostgreSQL. Replacing a Pod reuses the claim. Deleting the kind cluster can still destroy it. |
| Namespace | Groups SplitNest resources under `splitnest`, separate from `argocd` and `monitoring`. |
| Probes | Startup allows Java to warm up; readiness removes an unready replica from traffic; liveness restarts a stuck process. |
| HPA | Adjusts app replicas between two and five using CPU utilization relative to CPU requests. |

The app's readiness includes PostgreSQL. Its liveness checks the process, so a
database outage does not create endless app restarts. Redis is excluded from
readiness: balance reads can fall back to PostgreSQL while rate-limited operations
return 503. Actuator uses a separate management port, 9090. Swagger/API uses 8080.

The app runs as UID 10001, drops Linux capabilities, cannot elevate privileges,
and has a read-only root filesystem with a bounded writable temporary directory.
Resource requests reserve scheduling capacity; limits bound runtime consumption.
The 70% CPU HPA threshold refers to the 200m CPU request, approximately 140m per
replica, rather than 70% of the whole laptop.

## Prerequisites and versions

Keep Docker Desktop running with Linux containers. Around 8 GiB of Docker memory
and four CPUs is a practical starting point for the complete local demonstration.
Run Compose and Kubernetes separately when laptop resources are constrained.

```powershell
winget install --exact --id Kubernetes.kind
winget install --exact --id Helm.Helm
# Docker Desktop may already provide kubectl. Install only if missing:
winget install --exact --id Kubernetes.kubectl
kind version
kubectl version --client
helm version
docker info
```

The checked-in kind config pins Kubernetes 1.37.0 and its image digest, as published
with [kind v0.33.0](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0).
Use a kubectl version within one minor version of the API server. Docker's
kubectl 1.36.1 is within that range. Upgrade tools deliberately and revalidate the
manifests when changing these versions.

Kubernetes 1.37 rejects cgroup v1 by default. Check
`docker info --format '{{.CgroupVersion}}'`: prefer cgroup v2. If an older local
Docker/WSL runtime reports `1`, the separate
`deploy/kind/kind-config-cgroup-v1.yaml` sets the official temporary
`failCgroupV1: false` compatibility override. Use that file in the cluster-create
command only for this local compatibility case. The default config continues to
require cgroup v2; upgrade the Docker/WSL runtime when practical. See the
[Kubernetes 1.37 release explanation](https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/).

## Create the cluster and its Secret

From the repository root:

```powershell
kind create cluster --config deploy/kind/kind-config.yaml --wait 120s
kubectl config current-context
kubectl get nodes
kubectl create namespace splitnest
./scripts/Initialize-Local.ps1
./scripts/Create-LocalClusterSecret.ps1
```

Check that the active context is `kind-splitnest` before modifying resources.
The Secret helper consumes only `DB_PASSWORD` and `JWT_SECRET` from the ignored
`.env`, explicitly targets `kind-splitnest`, and preserves an existing Secret.
It prints no values and writes no secret manifest to disk. Do not print or commit
Secret YAML. Changing
`POSTGRES_PASSWORD` after database initialization does not change the existing
database user's password; coordinate password rotation with PostgreSQL itself.

## First local image and rollout

The source overlay's `bootstrap` tag is an explicit placeholder for the first
local build; it is not a published-image claim. Build and load that exact image
into kind before applying the overlay:

```powershell
./mvnw.cmd verify
docker build -t ghcr.io/aadyant-7/splitnest:bootstrap .
kind load docker-image ghcr.io/aadyant-7/splitnest:bootstrap --name splitnest
./scripts/Validate-Manifests.ps1
kubectl apply -k deploy/overlays/local
kubectl -n splitnest rollout status statefulset/postgres --timeout=180s
kubectl -n splitnest rollout status deployment/redis --timeout=120s
kubectl -n splitnest rollout status deployment/splitnest --timeout=240s
kubectl -n splitnest get pods,svc,pvc,hpa
kubectl -n splitnest port-forward service/splitnest 8080:8080
```

Open [Swagger UI](http://localhost:8080/swagger-ui/index.html). Initial Pods may
restart while PostgreSQL initializes; startup probes provide a warm-up allowance.
For troubleshooting use `kubectl -n splitnest describe pod <name>` and
`kubectl -n splitnest logs deployment/splitnest --tail=100`.

`kubectl kustomize` combines reusable `deploy/base` manifests with the local
overlay. The generated deployment branch later replaces the placeholder with a
verified image digest. An image tag identifies a build for humans; the digest
identifies the exact immutable image content.

## Metrics Server and autoscaling

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.9.0/components.yaml
kubectl -n kube-system patch deployment metrics-server --type=json -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl -n kube-system rollout status deployment/metrics-server --timeout=120s
kubectl top pods -n splitnest
kubectl -n splitnest get hpa -w
```

[Metrics Server 0.9.x supports Kubernetes 1.34+](https://github.com/kubernetes-sigs/metrics-server#compatibility-matrix).
The local flag skips verification of kind's kubelet serving certificates, which
do not have a certificate chain trusted by this setup. This is a local-only
adjustment. HPA needs resource metrics and CPU requests; Prometheus alone does
not provide the Kubernetes Metrics API.

The daily budget scheduler uses a PostgreSQL ShedLock row so both app replicas
cannot perform the scheduled check simultaneously. A unique alert key is a
second line of protection. Imports additionally use atomic database row claims;
a scheduler lock alone would not protect fast-path async events.

## Controlled failure experiments

Use throwaway demonstration data. When Argo CD is managing resources, use the
Git-managed change or temporarily disable self-heal for a controlled experiment;
otherwise it will intentionally undo live edits.

| Experiment | Command / change | Expected observation and lesson |
|---|---|---|
| Delete one app Pod | `kubectl -n splitnest delete pod <app-pod>` | Deployment creates a replacement. Another ready replica can keep serving; a client request already in flight can still fail. Pods are replaceable. |
| Restart PostgreSQL Pod | `kubectl -n splitnest delete pod postgres-0` | The replacement reuses its PVC. Readiness can become false during the interruption; app liveness stays healthy. Verify previously created data after recovery. |
| Make PostgreSQL unavailable longer | Temporarily scale `statefulset/postgres` to zero, then restore one replica | App readiness fails and DB-backed requests fail. This shows the single database is a deliberate availability limit. |
| Deploy a nonexistent image | Change the overlay image to a deliberately missing tag in an isolated experiment, then restore it | New Pods show `ImagePullBackOff`. With `maxUnavailable: 0`, old ready replicas remain while the rollout stalls. |
| Break readiness only | Temporarily change the app readiness path to `/actuator/health/does-not-exist` | Pods run but are removed from Service endpoints. Liveness remains separate. Revert the change and watch readiness recover. |
| Stop Redis | Temporarily scale `deployment/redis` to zero, then restore one replica | Balances recompute from PostgreSQL. Login/uploads return 503 because rate limiting cannot safely proceed. |

Namespace, StatefulSet and PVC retention settings prevent ordinary Argo pruning
from silently deleting the database. They are safeguards, not backups. Never use
namespace deletion as an ordinary restart. Export a backup before deleting the
cluster; PVC survival across Pod deletion does not prove disaster recovery.

## Questions to check understanding

1. Why should a PostgreSQL outage fail readiness without failing app liveness?
2. Why can two app replicas run duplicate scheduled work despite a single Service?
3. What survives Pod deletion, and what can disappear when the kind cluster is deleted?
