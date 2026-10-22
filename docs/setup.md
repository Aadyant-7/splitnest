# Setup and development

SplitNest can run entirely in Docker Compose, or with Java and Vite running
on the host while PostgreSQL/Redis run in containers. Kubernetes is an optional
local delivery environment. Start with Compose unless changing source code.

## Requirements

| Tool | Required for | Verify |
|---|---|---|
| Git | Cloning and source changes | `git --version` |
| Docker with Linux containers and Compose | Compose, Java integration tests, kind | `docker info`, `docker compose version` |
| JDK 21 | Host Java development and Maven verification | `java -version`, `javac -version` |
| Node 24.22.0 and npm 11.19.1 | Frontend development/tests | `node --version`, `npm --version` |

Docker image builds supply their own pinned Java/Node toolchains. The Maven
wrapper supplies Maven; a global Maven installation is unnecessary. Exact
dependency/tool versions are pinned in `pom.xml`, `.mvn/`, `frontend/` and
the Dockerfile. Upgrade pins through a reviewed change and run the tests.

On Windows, install a JDK 21 such as [Eclipse Temurin](https://adoptium.net/installation/),
[Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
with the WSL 2/Linux container backend, and the matching
[Node LTS release](https://nodejs.org/en/download). For example:

```powershell
winget install --exact --id EclipseAdoptium.Temurin.21.JDK
```

Open a new terminal afterward. `JAVA_HOME` must point to the JDK directory,
not its `bin` directory. The IDE's project SDK and Maven runner should also
select Java 21. Docker's CLI version alone is insufficient: `docker info`
must connect to a running engine.

## Clone and initialize

```powershell
git clone https://github.com/Aadyant-7/splitnest.git
cd splitnest
.\scripts\Initialize-Local.ps1
```

The PowerShell initializer creates an ignored `.env` with random `DB_PASSWORD`
and `JWT_SECRET` values, preserving any existing file. It does not change an
already initialized PostgreSQL password. Never share `.env` or real tokens.

Without PowerShell, copy `.env.example` to `.env` and replace the placeholders:

```bash
cp .env.example .env
```

Use a random database password and a Base64-encoded cryptographically random
JWT key of at least 32 bytes. For example, `openssl rand -base64 32` generates
a suitable key when OpenSSL is installed. Keep generated values private.

## Run the complete application

From the repository root:

```powershell
docker compose up --build -d --wait --wait-timeout 300
docker compose ps
.\scripts\Smoke-Test.ps1
```

- [Browser app](http://127.0.0.1:8080/)
- [Swagger UI](http://127.0.0.1:8080/swagger-ui/index.html)
- [Readiness](http://127.0.0.1:9090/actuator/health/readiness)

Create an account in the app. The [user guide](user-guide.md) explains each
feature; the [demo](demo.md) gives a multi-user scenario. The smoke test creates
synthetic users/records and verifies the real API without printing credentials.
It is a PowerShell script; Compose itself works on Windows, Linux and macOS.

Compose binds exposed ports to loopback: app 8080, management 9090,
PostgreSQL 5433 and Redis 6379. Check for other processes using these ports.

```powershell
docker compose logs -f app
docker compose stop
docker compose start
docker compose down
```

`stop`/`start` reuse containers. `down` removes containers/network and preserves
the named database volume. Removing volumes destroys the saved data. Persistent
storage is not a backup; see [operations](operations.md).

## Develop the Java backend

Use a running Docker engine, JDK 21 and the Maven wrapper:

```powershell
.\mvnw.cmd -version
.\mvnw.cmd verify
docker compose stop app
.\scripts\Start-Local.ps1
```

The launcher starts PostgreSQL/Redis, reads the ignored local credentials and
starts Java. Ctrl+C stops Java while the data containers remain running.
An IDE process needs the same environment variables. Compose does not export
`.env` into an IDE automatically. The host app connects to PostgreSQL on 5433;
the container app connects to `postgres:5432` on the Compose network.

On Linux/macOS, use `./mvnw verify`. For host development, load only your own
trusted `.env`, which must use shell-compatible `NAME=value` lines:

```bash
docker compose stop app
docker compose up -d --wait postgres redis
set -a
. ./.env
set +a
export DB_URL="jdbc:postgresql://localhost:${POSTGRES_PORT:-5433}/splitnest"
export BROWSER_COOKIE_SECURE=false
./mvnw spring-boot:run
```

These variables stay in the current shell and its child processes. The cookie
override is for local HTTP only. The committed Windows launcher is optional.

Never run a second app process on port 8080. On Windows, stop a JVM using
`target/splitnest-*.jar` before packaging again: the open JAR can block rename.

## Develop the frontend

With the backend running on 8080, use another terminal:

```powershell
cd frontend
node --version
npm --version
npm ci --ignore-scripts
npm test
npm run build
npm run dev
```

Open [Vite on 5173](http://127.0.0.1:5173/). It proxies `/api` to the backend
on 8080. Set `SPLITNEST_API_TARGET` before starting Vite to deliberately select
a different local API. Never put server credentials in frontend variables.

Use one UI environment per browser profile. Cookies are scoped by host/path,
rather than port: the Vite, Compose and kind URLs can share a refresh cookie
even when they represent different databases. Use separate browser profiles
when comparing those environments.

## Browser and integration checks

Java integration tests use real temporary PostgreSQL/Redis containers:

```powershell
.\mvnw.cmd verify
```

Frontend checks from `frontend/`:

```powershell
npm ci --ignore-scripts
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

With no `SPLITNEST_WEB_URL`, Playwright starts Vite and uses the local backend.
To test the already-running packaged application instead:

```powershell
$env:SPLITNEST_WEB_URL = 'http://127.0.0.1:8080'
npm run test:e2e
Remove-Item Env:SPLITNEST_WEB_URL
```

On Linux, use `npx playwright install --with-deps chromium` to install browser
system dependencies. Browser tests create synthetic records in the selected
local database. Traces/video are disabled to avoid recording authentication
traffic. Use a current browser with Web Locks on localhost/loopback.

Secure cookies default to true in Java. Local launchers, Compose and kind
explicitly set `BROWSER_COOKIE_SECURE=false` for local HTTP. Retain the secure
default for HTTPS environments. Swagger's JSON-token contract is unchanged.

## Optional delivery tools

| Tool | Purpose | Verify |
|---|---|---|
| kind | Local Kubernetes cluster | `kind version` |
| kubectl | Resources and Kustomize | `kubectl version --client` |
| Helm | Monitoring chart installation | `helm version --short` |
| k6 | Load testing, alternatively a container/cluster Job | `k6 version` |

Follow [Kubernetes](kubernetes.md), [GitOps](gitops.md) and
[monitoring](monitoring.md) for pinned versions, setup and validation. Argo CD
and Metrics Server run in the cluster; their CLIs are not required. Trivy runs
in CI without a global installation. Use explicit `kind-splitnest` contexts.

Git pushes use normal Git Credential Manager or SSH authentication. GHCR
publication uses a scoped GitHub Actions token. Public repositories and public
container packages have separate visibility settings; private packages need
an image pull Secret. Never put publishing tokens in Git URLs or documents.

[Dated verification evidence](evidence/verification.md) distinguishes actual
observed runs from the setup procedures in this guide.
