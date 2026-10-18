# Windows setup and GitHub handoff

These are the grouped setup instructions following the completed planning review.
No application code, wrapper, Compose file, or cluster exists yet. Commands below
are labeled by when they become applicable. Do not paste credentials into chat.

## 1. Required before backend implementation can be fully verified

### JDK 21

Java 23.0.2 is installed. Keep it if other projects need it; select JDK 21 for
SplitNest, its IDE project SDK, and its Maven runner.

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

Configure the IDE to use JDK 21 when the project is generated. Confirm an existing
Git author identity before making commits:

```powershell
git config --get user.name
git config --get user.email
```

If these are empty, choose your author name and GitHub-verified email or GitHub
noreply address. We can set them repository-locally once Git is initialized;
there is no need to overwrite settings used by other projects.

### Maven

Do not install global Maven just for this project. We will generate and commit
mvnw, mvnw.cmd, and .mvn/wrapper configuration. After those files exist:

```powershell
Set-Location E:\SplitNest
.\mvnw.cmd -version
.\mvnw.cmd verify
```

The first invocation downloads the pinned Maven distribution and dependencies.
Docker must be available for the full verification suite. On Linux/CI the
equivalent command is ./mvnw verify. The wrapper's executable bit and line endings
will be configured for that environment.

## 2. Create the empty GitHub repository

Use [GitHub's new repository page](https://github.com/new).

| Setting | Recommendation |
|---|---|
| Name | splitnest |
| Description | Expense-sharing REST API built with Java, Spring Boot, PostgreSQL and Redis, with Docker, Kubernetes, GitOps and observability. |
| Visibility | Public for portfolio access, if you are comfortable sharing the source |
| Initialize README | Unchecked; the local README already exists |
| Add .gitignore | None; we will create the appropriate local file |
| License | None initially; select a license deliberately later if desired |

Suggested topics: java, spring-boot, postgresql, redis, rest-api, docker,
kubernetes, github-actions, gitops, argocd, prometheus, grafana.

After creation, provide only the repository URL, such as
https://github.com/YOUR-USERNAME/splitnest. Authenticate using your normal Git
Credential Manager browser flow or an existing SSH setup. No token needs to be
shared in chat or written into a remote URL.

We will initialize local Git, create .gitignore and .gitattributes, attach the
remote, check the staged diff for secrets, and make meaningful commits. Later,
we will add CI, branch rules, and a PR template. Set required check names only
after the workflows exist. The deployment branch decision is documented in
[development-plan.md](development-plan.md).

GHCR image publication uses GitHub Actions' scoped token. Check package public
visibility after its first publication; repository visibility alone is not
sufficient. If keeping the package private, create an image pull secret outside
committed manifests.

## 3. Tools needed later

There is no need to install all of these before backend work begins. We will pin
compatible versions and provide exact installation commands when reaching the
corresponding milestone.

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

## 4. Commands that will be documented after implementation

The verified runbook will include environment-file creation, secret generation,
Compose startup/shutdown, local IDE startup, tests, Swagger authentication,
sample-data/API smoke commands, kind setup, manual Kubernetes secret creation,
Kustomize application, Argo installation/sync, dashboard access, load tests, and
Git rollback. Exact commands must match actual files and chosen versions.

All real secrets stay in ignored local environment files, environment variables,
GitHub secrets where needed, or manually created Kubernetes Secrets. Committed
examples contain placeholders and require the user to set real values.

Current external handoff: install/select JDK 21, install/start Docker Desktop,
and create the empty GitHub repository. Share its URL after completing setup;
no per-feature approvals are required by the execution plan.
