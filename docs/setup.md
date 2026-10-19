# Windows setup and GitHub handoff

Navigation: [documentation index](README.md) · [project status](project-status.md) ·
[approved frontend plan](frontend-extension-plan.md).

These instructions support a fresh Windows setup. The original host has now
verified Java 21, Docker Desktop, Git, the generated wrapper and a kind cluster.
The backend, Compose files and local deployment are implemented and verified;
the approved browser frontend is not implemented yet. The commands below run the
current backend. See [verification evidence](evidence/verification.md) for exact
execution results. Do not paste credentials into chat.

This is a local academic and placement project. These instructions require no
paid hosting, domain, managed database or cloud deployment. GitHub remains the
existing source-control and CI service; the application itself runs locally.
Frontend build-tool installation will be documented with the implementation,
after versions are selected and verified. There is no frontend setup step to run
at this documentation-only stage.

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

## 4. Run and verify the current backend

From the repository directory:

```powershell
.\scripts\Initialize-Local.ps1
.\mvnw.cmd verify
docker compose up --build -d --wait --wait-timeout 300
.\scripts\Smoke-Test.ps1
```

`Initialize-Local.ps1` creates random ignored credentials and preserves an
existing `.env`. `Smoke-Test.ps1` creates synthetic demonstration users and data;
it verifies the real API without printing credentials. Open
[Swagger UI](http://localhost:8080/swagger-ui/index.html) after startup.
Swagger is the current developer interface. These commands do not start the
approved user-facing screens; those will be added under the
[frontend plan](frontend-extension-plan.md).

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
approvals are required by the execution plan. The frontend extension is approved,
but its implementation and verification remain pending. Complete the full local
app before beginning the owner's detailed learning walkthrough; the
[documentation index](README.md) separates runbooks from that later reading path.
