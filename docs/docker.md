# Docker and continuous integration

Docker packages the application with its Java runtime. Compose starts the app,
PostgreSQL and Redis on one private network. PostgreSQL is the durable source of
truth; Redis counters and cached balances are disposable.

## Prerequisites and secrets

Use Docker Desktop with Linux containers and the WSL 2 engine. Copy
`.env.example` to `.env`, then fill `DB_PASSWORD` and `JWT_SECRET` with your own
values. `.env` is ignored by Git and excluded from the Docker build context.
Do not paste its contents into an issue, terminal transcript or screenshot.

`JWT_SECRET` must be a Base64 encoding of at least 32 random bytes. This PowerShell
example writes a new local `.env` without printing either secret. Run it only
when `.env` does not already exist:

```powershell
if (Test-Path .env) { throw '.env already exists; edit it instead of overwriting it' }
$passwordBytes = [byte[]]::new(32)
$signingBytes = [byte[]]::new(32)
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($passwordBytes)
$random.GetBytes($signingBytes)
$random.Dispose()
$databasePassword = [Convert]::ToBase64String($passwordBytes)
$signingSecret = [Convert]::ToBase64String($signingBytes)
@("DB_PASSWORD=$databasePassword", "JWT_SECRET=$signingSecret", 'POSTGRES_PORT=5433', 'REDIS_PORT=6379') |
    Set-Content -Encoding utf8 .env
```

PostgreSQL is available on host port 5433 to avoid an existing local database on
5432. Inside the Compose network, the app connects to `postgres:5432`; container
DNS uses the service name. The same distinction applies to Redis. All published
ports bind to `127.0.0.1`, so this learning deployment is accessible from the local
computer rather than every network interface.

## Build and run

Run these commands from the repository root:

```powershell
.\mvnw.cmd -B -ntp verify
docker compose config --quiet
docker compose up --build --wait --wait-timeout 300
docker compose ps
Invoke-RestMethod http://localhost:9090/actuator/health/readiness
Start-Process http://localhost:8080/swagger-ui/index.html
```

The Maven command runs unit and Testcontainers integration tests on the host,
where Docker is available. The image build packages the application separately.
`--wait` waits for the data-store checks and the image's readiness health check;
it does not merely wait for the processes to exist. Readiness checks PostgreSQL.
Redis failure is handled by the application's explicit cache/limiter policies.

For running Java from the IDE, start only the two data stores and provide the
same secrets to the Java process through its environment:

```powershell
docker compose up -d --wait postgres redis
# Set DB_PASSWORD and JWT_SECRET in the IDE's run configuration, then run the app.
```

Compose reads `.env` for container configuration; it does not export those values
into your PowerShell process or IDE. Stop a running Compose app before starting
the IDE app on the same ports:

```powershell
docker compose stop app
```

Inspect operation and stop the stack with:

```powershell
docker compose logs --tail=100 app
docker compose down
```

`down` preserves the named PostgreSQL volume. `docker compose down --volumes`
deletes the database; reserve that command for an intentional complete reset.
Changing `DB_PASSWORD` in `.env` does not reset a password in an already
initialized PostgreSQL volume. Rotate the existing database role password and
update the application configuration together.

## Reading the Dockerfile

| Instruction | Purpose |
|---|---|
| `FROM …21-jdk-alpine… AS build` | Start an isolated Java 21 build stage, pinned to an official image digest. The JDK includes the compiler. |
| `WORKDIR /workspace` | Give build commands a predictable current directory. |
| `COPY pom.xml mvnw …` and wrapper properties | Copy dependency definitions before source files so ordinary Java edits can reuse downloaded dependencies. |
| `RUN chmod … dependency:go-offline` | Make the Windows-created wrapper executable on Linux and populate the Maven dependency cache. |
| `COPY src/main …` | Add application source and resources, including Flyway migrations. |
| `RUN … -Dmaven.test.skip=true package` | Produce the runnable JAR. Host/CI `verify` is the mandatory test gate; ordinary Docker builds have no Testcontainers Docker daemon. |
| `FROM …21-jre-alpine… AS runtime` | Start a smaller final stage containing the Java runtime without the Java compiler. |
| `RUN addgroup … adduser …` | Create an unprivileged account with stable UID/GID 10001. |
| `WORKDIR /app` | Give the running app a predictable working directory. |
| `COPY --from=build --chown=… …jar` | Copy only the packaged application into the final image and assign ownership. |
| `ENV JAVA_TOOL_OPTIONS=…` | Bound heap allocation as a percentage of container memory and exit if memory exhaustion makes the JVM unreliable. Leave room for native memory and class metadata. |
| `USER 10001:10001` | Run the server without root privileges. |
| `EXPOSE 8080 9090` | Document API and management ports. This instruction alone does not publish either port. |
| `HEALTHCHECK … wget …readiness` | Use Alpine's existing BusyBox HTTP client to check application readiness without installing another package. |
| `ENTRYPOINT ["java", …]` | Start Java directly so Docker's shutdown signal reaches the JVM and Spring can stop gracefully. |

Each `RUN` or `COPY` creates a reusable filesystem layer. Docker can reuse earlier
layers when later inputs change. The final stage starts from the JRE image and
copies only the JAR: the build stage's Maven cache, wrapper and source tree do not
become part of the runtime filesystem. Spring dependencies are packaged inside
the executable JAR because the application needs them at runtime.

`.dockerignore` is an allowlist. The Docker client sends only the POM, Linux
wrapper, wrapper properties, application source/resources and Docker build files.
It excludes `.env`, Git history, tests, generated output, IDE settings and local
work directories before sending the build context to the engine.

Compose adds a read-only root filesystem, a bounded writable `/tmp`, no Linux
capabilities and `no-new-privileges`. Its 35-second stop grace period exceeds
Spring's 25-second graceful-shutdown phase. The app waits for healthy data stores
at initial startup; later failures are handled through application behavior and
readiness. `depends_on` does not monitor dependencies forever.

## Verification and measured image size

Check actual runtime settings after building:

```powershell
docker image inspect splitnest:local --format '{{.Config.User}}'
docker image inspect splitnest:local --format '{{.Size}}'
$imageBytes = [long](docker image inspect splitnest:local --format '{{.Size}}')
'Local image size: {0:N1} MiB' -f ($imageBytes / 1MB)
docker compose exec app id
docker compose exec app java -version
```

Expected user: `10001:10001`. The size command measures the local image's
uncompressed size; registry transfer size differs. Record the actual output,
source commit, architecture and image digest in `docs/evidence/` after a real
build. No size or successful Docker run is asserted by this guide itself.

## GitHub Actions and GHCR

The `verify` job runs for every pull request, every push to `main` and manual
workflow dispatch. It uses Java 21, Maven caching and Docker-capable Ubuntu
runners, then uploads test reports. Documentation and deployment-only changes
still receive the verification check, so branch protection never waits for a
workflow skipped by a path filter.

For every push to `main`, `publish-image`:

1. Waits for complete Maven verification to succeed.
2. Builds an image locally and checks its configured non-root user.
3. Runs Trivy against operating-system packages and Java dependencies; any
   CRITICAL vulnerability fails the job, including an unfixed one.
4. Uploads the scan report, including on scan failure.
5. Authenticates using the job's short-lived `GITHUB_TOKEN` and pushes the exact
   local image that was scanned.

Every main push builds, including documentation changes, and Docker layer caching
keeps unchanged inputs cheap. Main runs are not canceled by a later documentation
push. This avoids stranding a source-code build because a newer run skipped
building. Image promotion separately compares the actual build inputs, so a
documentation or manifest-only push preserves the selected deployment image and
any intentional rollback. See [GitOps promotion](gitops-promotion.md).

The only publishing credential is the existing Actions token. Default workflow
permissions are `contents: read`; only the publication job receives
`packages: write`. Pull requests do not receive image-publication authority.
Actions are pinned to verified release commits; Java base images are pinned to
official registry manifest digests. Update pins through reviewed, tested changes
so security fixes are adopted deliberately.

Images use `ghcr.io/aadyant-7/splitnest:<source-commit-sha>`, plus OCI source and
revision labels. A source SHA identifies the code behind an image and provides
an explicit rollback target. Reusing `latest` would obscure which version a
deployment requested. The eventual deployment should record the exact image
digest too, since tags can be overwritten by authorized publishers.

The Dockerfile also supplies title, description and source labels for ordinary
local builds. CI adds the exact revision label at build time. These labels are
inspectable metadata; they do not contain credentials or change API behavior.

GHCR packages can initially be private even when the repository is public.
After the first successful publish, inspect the package's visibility settings.
Use public visibility for anonymous portfolio/kind pulls, or provide an image
pull secret for a private package. Never commit a registry token.

After publishing, the separate generation job validates and updates `deploy/local`
with immutable image digests and provenance. Only that job has `contents: write`.
It uses an isolated kind API server for client validation, then Argo CD in the
actual deployment cluster reads the generated branch. A successful publication or
branch push is not evidence that an actual application rollout succeeded.

## Questions to explain before an interview

1. Which files and tools exist in the build stage but not the runtime stage,
   and which application dependencies still need to be inside the JAR?
2. Why must `verify` run before publishing even though the Dockerfile executes
   Maven, and why are tests not run inside this ordinary image build?
3. Why do the database hostname and port differ between an IDE process and the
   Compose app container, and what persists after `docker compose down`?
