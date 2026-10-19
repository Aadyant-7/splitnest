# Windows setup and GitHub handoff

Navigation: [documentation index](README.md) · [project status](project-status.md) ·
[approved frontend plan](frontend-extension-plan.md).

These instructions support a fresh Windows setup. The original host has now
verified Java 21, Docker Desktop, Git, the generated wrapper and a kind cluster.
The backend/local delivery baseline is verified. The frontend and browser-auth
adapter are now implemented with passing source/browser tests; combined-image
deployment verification is tracked in [project status](project-status.md).
See [verification evidence](evidence/verification.md) for dated execution results.
Do not paste credentials into chat.

This is a local academic and placement project. These instructions require no
paid hosting, domain, managed database or cloud deployment. GitHub remains the
existing source-control and CI service; the application itself runs locally.
Node/npm are needed when developing or testing the frontend. A Docker image build
provides its own pinned Node build stage; the final runtime needs only Java.

## 1. Prerequisites for a fresh checkout

### JDK 21

Temurin Java 21.0.12.1 is now verified for SplitNest. Keep the older Java 23
installation if other projects need it; use JDK 21 for this project's IDE and
Maven runner. Installation instructions below apply to a new machine.

Install Temurin 21 using the official
[Adoptium instructions](https://adoptium.net/installation/), or run:

```powershell
winget install --exact --id EclipseAdoptium.Temurin.21.JDK
```

Open a new terminal after installation. Use terminal-session JAVA_HOME/PATH and
the IDE's project SDK settings so other projects can retain Java 23. JAVA_HOME
must point to the JDK directory, not its bin folder. For the usual Temurin
installation location, select an installed JDK 21 for this terminal:

```powershell
$taskJdk21 = Get-ChildItem -LiteralPath 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' |
    Select-Object -First 1
if (-not $taskJdk21) { throw 'Locate your installed JDK 21 directory before continuing.' }
$env:JAVA_HOME = $taskJdk21.FullName
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
```

These settings last only for the current terminal and its child processes.
Configure the IDE project SDK separately. If you instead choose to change Windows
environment settings, that can affect other projects and new terminals.

Verify in PowerShell:

```powershell
$env:JAVA_HOME
java -version
javac -version
Get-Command java | Select-Object Source
& (Join-Path $env:JAVA_HOME 'bin\java.exe') -version
```

Both Java and javac should report 21. If JAVA_HOME's executable and PATH resolve
different JDKs, correct that before running Maven. The original default Oracle
java launcher did not finish during inspection; the direct JDK 23 executable
did. Prefer checking the actual executable selected by JAVA_HOME.

### Docker Desktop

Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
Use the WSL 2 backend and Linux containers. Follow its Windows/virtualization
requirements and restart Windows if the installer or WSL setup requests it.
Start Docker Desktop and wait until the engine is running.

Check WSL first; if it needs enabling or updating, follow the linked Docker/WSL
instructions rather than changing unrelated Windows features blindly:

```powershell
wsl --version
wsl --status
```

After Docker Desktop is running:

```powershell
docker --version
docker compose version
docker info
docker run --rm hello-world
```

A CLI version alone is insufficient: docker info must connect to the engine.
The hello-world command downloads a small test image and exits. Docker is needed
for real PostgreSQL/Redis integration tests as well as Compose and kind.

### Git and IDE

Git and VS Code were found; there is no need to install another IDE.

```powershell
git --version
code --version
```

Configure the IDE to use JDK 21 when opening the project. Confirm an existing
Git author identity before making commits:

```powershell
git config --get user.name
git config --get user.email
```

If these are empty, choose your author name and GitHub-verified email or GitHub
noreply address. Set them repository-locally if you need to make commits;
there is no need to overwrite settings used by other projects.

### Maven

Do not install global Maven just for this project. The repository already includes
`mvnw`, `mvnw.cmd`, and the `.mvn/wrapper` configuration, pinned to Maven 3.10.0:

```powershell
Set-Location E:\SplitNest
.\mvnw.cmd -version
.\mvnw.cmd verify
```

The first invocation downloads the pinned Maven distribution and dependencies.
Docker must be available for the full verification suite. On Linux/CI the
equivalent command is `./mvnw verify`. The repository's Git attributes preserve
Linux wrapper/script line endings and its wrapper is executable in Git.

### Node.js and npm for frontend development

Use Node 24.22.0 and npm 11.19.1, matching
[frontend/.nvmrc](../frontend/.nvmrc) and `packageManager` in
[frontend/package.json](../frontend/package.json). The declared engine ranges are
Node `>=24.22.0 <25` and npm `>=11.19.1 <12`; exact CI/image versions are pinned.
On a fresh machine, install the compatible Node 24 LTS distribution from
[Node.js](https://nodejs.org/en/download), then verify both commands. An older
Node 24.14 installation does not satisfy this project's engine constraint.

The current workspace also has an ignored portable installation. If it exists,
select it for this PowerShell session without replacing your global installation:

```powershell
Set-Location E:\SplitNest
$taskNodeDirectory = Join-Path (Get-Location) '.work\node\node-v24.22.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $taskNodeDirectory 'node.exe')) {
    $env:Path = $taskNodeDirectory + ';' + $env:Path
}
node --version
npm.cmd --version
```

Expected pinned versions are `v24.22.0` and `11.19.1`. The portable directory is
not committed and will not exist after a fresh clone. A compatible installation
must supply these tools before npm commands run. No global Vite or TypeScript
installation is required. `@types/node` 24.19.2 supplies compile-time declarations;
its version is separate from the Node executable.

## 2. GitHub repository and authentication

The owner has already created
[Aadyant-7/splitnest](https://github.com/Aadyant-7/splitnest). Do not create another
empty repository for this checkout. On a new machine, clone the existing one:

```powershell
git clone https://github.com/Aadyant-7/splitnest.git
Set-Location splitnest
git remote -v
```

The original project configuration recommendations are:

| Setting | Recommendation |
|---|---|
| Name | splitnest |
| Description | Expense-sharing REST API built with Java, Spring Boot, PostgreSQL and Redis, with Docker, Kubernetes, GitOps and observability. |
| Visibility | Public for portfolio access, if you are comfortable sharing the source |
| Initialize README | Existing repository already contains one |
| Add .gitignore | Existing repository already contains project rules |
| License | None initially; select a license deliberately later if desired |

Suggested topics: java, spring-boot, postgresql, redis, rest-api, docker,
kubernetes, github-actions, gitops, argocd, prometheus, grafana.

Authenticate pushes using your normal Git Credential Manager browser flow or an
existing SSH setup. No token needs to be shared in chat or written into a remote
URL. Read-only cloning of the public repository needs no publishing credential.

Git history and the remote are initialized, and the backend milestone is pushed.
The repository includes `.gitignore`, `.gitattributes`, CI, Dependabot configuration
and a PR template. Branch protection is a separate GitHub setting; do not assume
that a workflow file enables it. Set required check names after their first
successful runs. The deployment branch decision is documented in
[development-plan.md](development-plan.md).

GHCR image publication uses GitHub Actions' scoped token. Check package public
visibility after its first publication; repository visibility alone is not
sufficient. If keeping the package private, create an image pull secret outside
committed manifests.

## 3. Deployment and performance tools

Backend/Compose work needs Java and Docker, while the full deployment lab uses
the tools below. The deployment guides record pinned versions and commands;
install only the tools needed for the run you intend to perform.

| Tool | When needed | Verification command |
|---|---|---|
| kubectl, including Kustomize support | Local cluster/manifests | kubectl version --client; kubectl kustomize --help |
| kind | Kubernetes milestone | kind version |
| Helm | Monitoring installation | helm version --short |
| metrics-server | HPA demonstration | kubectl top pods -n splitnest |
| Argo CD server | GitOps milestone; installed in cluster | kubectl get pods -n argocd |
| k6 | Performance milestone; can run as a container/cluster Job | k6 version, or the pinned image's version command |
| Trivy | CI image scanning; no required global installation | Scanner version in CI output |

The gh CLI and Argo CD CLI are optional conveniences, not prerequisites. Check
available laptop memory, CPU, and disk before running kind plus monitoring; use a
modest local resource profile and avoid running a duplicate full Compose stack
at the same time as the cluster unless needed.

## 4. Run and verify the application

From the repository directory:

```powershell
.\scripts\Initialize-Local.ps1
.\mvnw.cmd verify
docker compose up --build -d --wait --wait-timeout 300
.\scripts\Smoke-Test.ps1
```

`Initialize-Local.ps1` creates random ignored credentials and preserves an
existing `.env`. `Smoke-Test.ps1` creates synthetic demonstration users and data;
it verifies the real API without printing credentials. The combined Dockerfile
builds the frontend into the Java image. Its intended browser URL is
[SplitNest](http://localhost:8080/); Swagger remains at
[Swagger UI](http://localhost:8080/swagger-ui/index.html). Check
[project status](project-status.md) for the combined-image execution result;
the earlier backend deployment evidence alone does not verify this new image.

### Edit the frontend with Vite

Use two terminals. From the repository root, start the Java API and its local
data stores:

```powershell
.\scripts\Initialize-Local.ps1
.\scripts\Start-Local.ps1
```

That launcher selects explicit loopback HTTP cookie settings. In the other
terminal, with the Node version selected above:

```powershell
Set-Location E:\SplitNest\frontend
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Open [Vite development UI](http://127.0.0.1:5173/). Its `/api` proxy targets
`http://127.0.0.1:8080` by default, keeping browser requests on one origin. Start
the API and Vite rather than a second Compose app on 8080. To target a deliberately
different local API, set `SPLITNEST_API_TARGET` before starting Vite. Internal
verification ports in ignored `.work` logs are not required user defaults.

### Frontend checks and browser workflows

From `frontend/`, with a real API/data stores running on the proxy target:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Playwright starts Vite if `SPLITNEST_WEB_URL` is unset. To test an already-running
packaged application instead, set the URL before the last command:

```powershell
$env:SPLITNEST_WEB_URL = 'http://127.0.0.1:8080'
npm.cmd run test:e2e
Remove-Item Env:SPLITNEST_WEB_URL
```

The tests create synthetic accounts and financial records. Browser auth needs a
current browser with Web Locks on localhost/loopback; access tokens stay in memory.
Secure cookies default to true in Java. The local launch script, Compose and kind
configuration deliberately select `BROWSER_COOKIE_SECURE=false` for local HTTP.
Keep the default for an HTTPS environment.

Before `mvnw verify` or repackaging on Windows, stop any process running the same
`target/splitnest-*.jar`; a running JVM can prevent the package rename. A stopped
package step does not invalidate passing test results, but it is not a successful
complete build. Source tests and packaged browser/deployment checks are separate.

For installation, commands and explanations beyond Compose, follow:

- [Docker and host development](docker.md).
- [Kubernetes, the context-scoped Secret helper and cgroup compatibility](kubernetes.md).
- [Argo CD and GitOps](gitops.md).
- [Monitoring, synthetic load-data preparation and controlled experiments](monitoring.md).
- [Current verification evidence](evidence/verification.md).

All real secrets stay in ignored local environment files, environment variables,
GitHub secrets where needed, or manually created Kubernetes Secrets. Committed
examples contain placeholders and require the user to set real values.

The initial handoff is complete: Java 21 and Docker work, and the GitHub remote
is https://github.com/Aadyant-7/splitnest.git. The owner explicitly approved the
local Kubernetes Secret creation from ignored .env values. No per-feature
approvals are required by the execution plan. Frontend source, security and
browser workflows and packaged delivery are verified; follow current status for
dated results. The next phase is the owner's detailed learning walkthrough when
they are ready; the
[documentation index](README.md) separates runbooks from that later reading path.
