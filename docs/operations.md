# Operating SplitNest locally

Use the repository root for these PowerShell commands. Keep private credentials
in ignored `.env`/`.work` files or Kubernetes Secrets. This runbook describes
procedures; [verification.md](evidence/verification.md) records which procedures
were actually exercised. Backup and restore rehearsal have not been verified.

## Start, inspect and stop

For the complete Compose stack:

```powershell
./scripts/Initialize-Local.ps1
docker compose up --build -d --wait --wait-timeout 300
docker compose ps
Invoke-RestMethod http://127.0.0.1:9090/actuator/health/readiness
docker compose logs --tail=100 app
./scripts/Smoke-Test.ps1
```

Open the [browser app](http://127.0.0.1:8080/) for normal use or
[Swagger UI](http://127.0.0.1:8080/swagger-ui/index.html) for API exploration. The smoke script
creates synthetic users and expenses. Stop services with `docker compose stop`
and resume them with `docker compose start`. `docker compose down` also removes
the containers/network while preserving the named database volume. Deleting the
volume destroys local records; it is not part of an ordinary restart.

For Java running on the host, stop the Compose app so both processes do not bind
the same ports:

```powershell
docker compose stop app
./scripts/Start-Local.ps1
```

The helper starts only PostgreSQL/Redis, reads the ignored secrets into its child
process and runs the Maven wrapper. Use Ctrl+C to stop Java; data stores remain
running. IDE runs need the same environment configuration. Compose reads `.env`
for containers; it does not automatically export it into an IDE.

Run tests separately with `./mvnw.cmd verify` while Docker is available. For image
and layer details see [docker.md](docker.md); for a complete demonstration see
[demo.md](demo.md).

## Kubernetes health and troubleshooting

All cluster commands below explicitly target the local `kind-splitnest` context.
They do not depend on the terminal's active cluster. Use
[kubernetes.md](kubernetes.md) for initial installation, the cgroup compatibility
option and the context-scoped Secret helper.

```powershell
kubectl --context kind-splitnest -n splitnest get pods,svc,pvc,hpa
kubectl --context kind-splitnest -n splitnest rollout status deployment/splitnest --timeout=240s
kubectl --context kind-splitnest -n splitnest logs deployment/splitnest --all-pods=true --tail=100
kubectl --context kind-splitnest -n splitnest get events --sort-by=.lastTimestamp
kubectl --context kind-splitnest top pods -n splitnest
```

Inspect a specific failing Pod with
`kubectl --context kind-splitnest -n splitnest describe pod <app-pod>`.
For a restarted container, inspect its previous log with
`kubectl --context kind-splitnest -n splitnest logs <app-pod> --previous --tail=100`.
Replace placeholders with an observed Pod name. Events and startup logs usually
distinguish a missing Secret, failed image pull, database connection failure,
migration problem, memory termination and failed probe.

For HTTP health inspection, keep this port-forward in a separate terminal:

```powershell
kubectl --context kind-splitnest -n splitnest port-forward service/splitnest 19090:9090
# In another terminal:
Invoke-RestMethod http://127.0.0.1:19090/actuator/health/liveness
Invoke-RestMethod http://127.0.0.1:19090/actuator/health/readiness
```

Liveness checks the app process. Readiness also checks PostgreSQL; a database
outage should not cause an endless liveness-restart loop. Redis outages keep
balance reads available through database fallback, while login/uploads return
503 because their rate limits cannot be enforced. A 429 response includes
`Retry-After`; wait rather than retrying in a tight loop.

Do not delete the namespace or kind cluster to restart an app. PostgreSQL uses a
single StatefulSet/PVC; Argo retention guards do not protect against deliberate
cluster deletion. An HPA or Argo CD can reverse live replica/environment edits.
Use the documented [GitOps workflow](gitops.md) for desired-state changes and
image rollback, and [monitoring.md](monitoring.md) for controlled experiments.

## Secrets and rotation limitations

`Initialize-Local.ps1` preserves an existing `.env`.
`Create-LocalClusterSecret.ps1` preserves an existing `splitnest-secrets` object;
it creates initial credentials, not a rotation protocol. Secret values supplied
through environment variables are read when a container starts, so changing a
Secret alone does not update existing processes.

- **Database password:** changing `.env`, `POSTGRES_PASSWORD` or a Kubernetes
  Secret does not change an initialized database role. Plan a maintenance window,
  change the PostgreSQL role password and update the relevant ignored file/Secret
  together, then restart the app. PostgreSQL's interactive `psql` `\password`
  command avoids placing a password literal into SQL history. Existing pooled
  connections can survive a password change until reconnect, so apparent immediate
  success is insufficient: verify fresh connections and readiness afterward.
- **JWT signing key:** replacing the Base64 key invalidates existing access JWTs.
  All replicas must use the same key. This version has no multi-key overlap/key-ring
  rotation, so a mixed-key rolling update can temporarily reject tokens issued by
  another replica. Coordinate the transition; users may need to log in again.
  Refresh-token hashes are separate persistent state, but a successful refresh
  does not solve mixed-key access validation during that transition.
- **Restart after an intentional Secret update:**
  `kubectl --context kind-splitnest -n splitnest rollout restart deployment/splitnest`,
  then wait for rollout and verify authentication/readiness. This command does not
  update a Secret or change PostgreSQL's password by itself.

Never paste credentials into tickets, Git, shell transcripts or screenshots.
Base64-encoded Secret data is still sensitive. The local deployment does not
implement automated secret rotation or external secret management.

## Migrations and import-job recovery

Flyway applies versioned SQL files on startup and records checksums in
`flyway_schema_history`. Hibernate validates the mapped schema. Once a migration
has been applied, add a new version instead of editing its historical contents.
Do not use a blind checksum repair to hide an unexplained mismatch. Review the
schema/data state, take a backup and prepare a deliberate forward migration.

Container rollback does not reverse database migrations. Keep schema evolution
compatible with the previous app version when demonstrating image rollback.
The app's JDBC pool initializes sessions in UTC, matching timestamp and scheduler
assumptions.

An uploaded statement persists as `PENDING`; the dispatcher checks pending jobs
every fifteen seconds, including jobs whose fast-path event was lost or rejected.
One atomic database claim changes a job to `PROCESSING`. Recovery runs at startup
and every sixty seconds, failing jobs whose `started_at` is over ten minutes old.
Completion locks the job and checks its state before committing expenses and
`COMPLETED` together. Terminal jobs clear their stored file bytes.

Read status through `GET /api/v1/groups/{groupId}/imports/{jobId}` as a current
member. Invalid rows are counted and skipped; a failed job has a sanitized reason.
Do not manually set a failed job back to pending: its bytes may already be cleared,
and this version has no operator retry protocol. Check the problem, then upload
again. A restored database can also contain pending/stale jobs; keep an app pointed
at a restored database stopped until its job state is inspected.

## Manual database backup

These commands use PostgreSQL 18's custom archive format and write the archive
inside the database container before copying it. This preserves binary bytes on
Windows PowerShell 5, where redirecting native binary output through `>` or
`Out-File` can corrupt it. Check every command's exit status before continuing.
Use a new timestamped local filename for each backup.

[pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html) exports one database,
including a consistent snapshot while ordinary writes continue. It does not
capture cluster roles, Kubernetes Secrets, Redis state or a complete cluster.
The dump can contain emails, expense descriptions, password/token hashes and
pending statement bytes. Treat it as private personal data. Git ignores `.work`,
but that does not encrypt it or protect it against laptop loss.

Compose backup:

```powershell
New-Item -ItemType Directory -Force .work/backups | Out-Null
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
docker compose exec -T postgres pg_dump -U splitnest -d splitnest --format=custom --file=/tmp/splitnest-backup.dump
if ($LASTEXITCODE -ne 0) { throw 'Database dump failed; do not copy an incomplete archive.' }
docker compose cp postgres:/tmp/splitnest-backup.dump ".work/backups/splitnest-compose-$backupStamp.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed; keep the container archive until copied safely.' }
Get-FileHash -Algorithm SHA256 ".work/backups/splitnest-compose-$backupStamp.dump"
docker compose exec -T postgres rm /tmp/splitnest-backup.dump
```

Kubernetes backup, using the same binary-safe copy approach:

```powershell
New-Item -ItemType Directory -Force .work/backups | Out-Null
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
kubectl --context kind-splitnest -n splitnest exec postgres-0 -- pg_dump -U splitnest -d splitnest --format=custom --file=/tmp/splitnest-backup.dump
if ($LASTEXITCODE -ne 0) { throw 'Database dump failed; do not copy an incomplete archive.' }
kubectl --context kind-splitnest -n splitnest cp postgres-0:/tmp/splitnest-backup.dump ".work/backups/splitnest-kind-$backupStamp.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed; keep the Pod archive until copied safely.' }
Get-FileHash -Algorithm SHA256 ".work/backups/splitnest-kind-$backupStamp.dump"
kubectl --context kind-splitnest -n splitnest exec postgres-0 -- rm /tmp/splitnest-backup.dump
```

[`kubectl cp`](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_cp/)
requires `tar` in the container. Do not substitute a PowerShell binary-output
pipeline if copying fails. Keep a protected copy outside the Docker/kind storage
and record its timestamp, PostgreSQL/app versions and checksum privately. A file
and checksum establish neither a successful restore nor a tested recovery time.

## Restore rehearsal: isolated target only

The following is a **procedure to verify**, not a recorded successful rehearsal.
It restores into a new database named `splitnest_restore_check`; it does not
overwrite the running app database. Choose an actual previously copied archive
and an unused target name. Start PostgreSQL first if it is stopped.

```powershell
$restoreArchive = '.work/backups/<your-compose-backup-filename>.dump'
docker compose cp $restoreArchive postgres:/tmp/splitnest-restore.dump
if ($LASTEXITCODE -ne 0) { throw 'Restore archive copy failed.' }
docker compose exec -T postgres pg_restore --list /tmp/splitnest-restore.dump
if ($LASTEXITCODE -ne 0) { throw 'Restore archive cannot be read.' }
docker compose exec -T postgres createdb -U splitnest splitnest_restore_check
if ($LASTEXITCODE -ne 0) { throw 'Restore target creation failed; do not reuse an existing database blindly.' }
docker compose exec -T postgres pg_restore -U splitnest --dbname=splitnest_restore_check --no-owner --exit-on-error /tmp/splitnest-restore.dump
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; investigate the isolated target before retrying.' }
docker compose exec -T postgres psql -U splitnest -d splitnest_restore_check -c "SELECT COUNT(*) AS user_count FROM users; SELECT COUNT(*) AS expense_count FROM expenses; SELECT version, success FROM flyway_schema_history ORDER BY installed_rank;"
```

[`pg_restore`](https://www.postgresql.org/docs/18/app-pgrestore.html) restores a
custom archive. The target database role must already exist; `--no-owner` makes
the restoring role own restored objects. Table counts and the Flyway history are
initial checks. A complete rehearsal also needs an isolated app connected to that
target, API/invariant checks, inspection of job/refresh-token state, and recorded
elapsed time. Do not point the normal deployment at this database during an ad hoc
check. Review retention and clean up this duplicate personal-data copy deliberately
after the rehearsal.

No automated backup schedule, encrypted off-machine retention, point-in-time
recovery, high-availability database or restore rehearsal is claimed here. PVC
retention protects one narrow Pod-replacement case; it is not a backup strategy.
