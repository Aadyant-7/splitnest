# GitOps image promotion and rollback

Application source lives on `main`. CI verifies that source, builds and scans its
container image, then publishes a source-SHA tag to GHCR. A separate job generates
the `deploy/local` branch. Argo CD running inside the laptop's cluster reads that
branch and reconciles the actual cluster with its manifests.

GitHub Actions does not need network access to the laptop. The cluster initiates
the Git reads. CI's temporary kind cluster is used only to validate generated
manifests; it is not the user's deployment and does not run the application.

## What the branches contain

| Location | Meaning |
|---|---|
| `main` | Application source, tests, documentation and original deployment templates. The source overlay uses the local `bootstrap` image tag. |
| `deploy/local` | Generated `deploy/` files and provenance only; no application source or build secrets. Its first commit has no parent from `main`. |
| `deploy/local:deploy/provenance/source.env` | Latest evaluated source SHA, its build-input fingerprint and its manifest-tree fingerprint. |
| `deploy/local:deploy/provenance/image.env` | Source SHA and build fingerprint of the image currently selected by Git, plus its exact `ghcr.io/…@sha256:…` reference. |

The generated overlay selects an immutable digest rather than relying on a tag
remaining unchanged. The source SHA records where the image came from; the digest
identifies the exact registry artifact. A later documentation commit can change
the evaluated source SHA without changing the selected image's source SHA.

Generated provenance belongs only on `deploy/local`; the script rejects a source
tree that commits the reserved `deploy/provenance/` directory on `main`.

## Why synchronization and promotion use separate commits

For an application change, generation creates two commits before pushing:

1. **Sync manifests:** copy `main`'s `deploy/` files, preserve the currently
   selected image and record the new source/build fingerprints in `source.env`.
2. **Promote image:** change only the local overlay's digest and `image.env`.

This separation allows `git revert` of an image promotion to restore the previous
image without undoing unrelated manifest changes. It also preserves the source
watermark: a later documentation-only push sees that the same build inputs were
already evaluated and keeps the intentionally rolled-back image.

The build fingerprint covers `Dockerfile`, `.dockerignore`, `pom.xml`, `mvnw`,
`.mvn/`, `src/main/`, every tracked `frontend/` file except Markdown, the CI
workflow and the promotion script. A frontend-only screen change, dependency
lockfile, engine setting or build configuration therefore selects its verified
combined image instead of silently preserving an older interface. Frontend tests
are included because Docker's TypeScript build checks those files too.
Java tests, Markdown documentation and deployment templates alone do not select
a new image. In particular, editing `frontend/README.md` preserves an intentional
rollback. A manifest-only
change still synchronizes the manifests and updates source provenance, while
retaining the exact existing digest and its image provenance.

On the first promotion there is no previous image. The script builds an orphan
deployment history, creates the two initial commits, validates the final digest
overlay and only then creates the remote branch. Argo CD never receives the
intermediate bootstrap-only commit as the desired branch tip.

## Ordering, verification and concurrent runs

Every push to `main` receives Java, frontend component/build, real-browser and
promotion-script verification, an
image build using Docker layer caches, a CRITICAL vulnerability scan and image
publication. Publishing a documentation-only image is a deliberate reliability
tradeoff: an earlier code build cannot be stranded because a later documentation
push canceled it and then skipped building. The generation policy still preserves
the selected image when build inputs are unchanged.

Main workflows are not canceled by newer pushes. GitHub may replace intermediate
pending runs; the latest run always builds the complete latest source. Pull
request runs can be canceled when superseded. The script additionally:

- Fetches `main` and skips a candidate that is no longer its latest commit.
- Requires the previous evaluated source to be an ancestor of the candidate.
- Checks the source tip again after final rendering and validation.
- Refuses to push if the deployment branch changed during generation.
- Uses a normal fast-forward Git push, preserving history and letting Git reject
  a concurrent update; it never force-pushes.

These checks prevent an old build from replacing a newer generated deployment.
The final source-tip check and Git push are separate remote operations; a source
push can occur between them. The newer workflow will reconcile that later state,
and fast-forward protection prevents an older deployment parent from overwriting
an already-updated deployment branch.

Before any remote update, the script runs `kubectl kustomize` on the **generated**
overlay and `kubectl apply --dry-run=client --validate=true` on the rendered YAML.
Client dry-run still needs API discovery and schema information, so CI supplies
an isolated kind cluster named `validate` with its own kubeconfig and removes
that cluster in an always-run cleanup step. This does not create the actual app
resources or prove that images will pull and pods will become ready in the real
cluster. Argo CD and the deployment runbook supply that evidence separately.

Only the publishing job receives `packages: write`. Only the generation job
receives `contents: write`; all other jobs default to `contents: read`.
`GITHUB_TOKEN` writes to `deploy/local`, which is outside the workflow's `main`
push trigger. No personal registry/Git token is needed in the repository.

## Run the isolated tests

On Linux or Git Bash, from the repository root:

```bash
bash -n scripts/promote-deployment.sh scripts/test-promotion.sh
bash scripts/test-promotion.sh
```

On Windows PowerShell with Git installed in its default location:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/test-promotion.sh
```

The eleven scenarios use temporary local bare repositories and a mock `kubectl`:
bootstrap, repeated no-op, separate manifest/image updates, manifest-only image
preservation, stale-run rejection, render failure, client-validation failure,
and a real Git revert followed by a documentation-only push. Three frontend
regressions additionally prove source-only promotion, frontend README-only
preservation after rollback, and dependency-lockfile-only promotion. These tests verify
generation and Git behavior; mock validation is not evidence of Kubernetes
schema correctness. CI performs actual final validation using its API server.

## Inspect or reproduce a promotion

CI passes the digest returned by pushing the exact image that passed Trivy. The
script's command is:

```bash
bash scripts/promote-deployment.sh \
  --source-sha <full-verified-source-commit-sha> \
  --image-name ghcr.io/aadyant-7/splitnest \
  --image-digest sha256:<verified-published-image-digest>
```

Run it from the source checkout with authorized `origin` authentication, a real
configured Git identity and a usable validation-cluster context. Optional flags
are `--remote`, `--source-branch` and `--deployment-branch`; normal operation uses
`origin`, `main` and `deploy/local`. The script pushes the generated branch if
there is a valid change. It is not a read-only preview command.

The source must be the current remote tip. The script cannot establish that an
arbitrary manually supplied digest passed testing/scanning: the CI dependency
chain provides that guarantee in normal operation. Use a digest from a verified
publication rather than inventing or copying an unverified one.

Inspect branch history and provenance without checking out the generated branch:

```bash
git fetch origin main deploy/local
git log --oneline origin/deploy/local
git show origin/deploy/local:deploy/provenance/source.env
git show origin/deploy/local:deploy/provenance/image.env
```

Public repository visibility does not guarantee public GHCR package visibility.
Confirm anonymous image pulls or configure the cluster's image pull secret before
claiming end-to-end delivery succeeds.

## Roll back through Git

Choose the failing **image promotion** commit from the generated branch's log,
then create a separate checkout so the source working directory stays on `main`:

```bash
git fetch origin deploy/local
git worktree add ../splitnest-rollback -b rollback/local-image origin/deploy/local
cd ../splitnest-rollback
git log --oneline -8
git show --stat <image-promotion-commit>
git revert <image-promotion-commit>
git push origin HEAD:deploy/local
```

The promotion commit should change only
`deploy/overlays/local/kustomization.yaml` and `deploy/provenance/image.env`.
Argo CD sees the revert and requests the previous digest. Observe its sync result
and the app rollout rather than assuming Git success means the app is healthy.
Avoid reverting a manifest-sync commit as an image rollback. The first image
promotion has no earlier deployable image, so it is not a useful rollback target.

If the bad behavior came from source code, revert or fix it on `main` too. A new
application change intentionally triggers a new image promotion. Documentation
and manifest-only pushes preserve the rolled-back digest. To intentionally
restore the newer image before any source change, revert the rollback commit on
`deploy/local`; this keeps an auditable history.

An image rollback does not undo Flyway migrations or data changes. Keep database
migrations backward compatible and forward-only, and verify that the older
application can run against the current schema.

The [frontend-only rollout record](evidence/frontend-gitops.json) verifies this
path with an actual React source change, two different registry digests and
JavaScript assets, automatic Argo reconciliation and packaged browser checks.
The shell fixtures separately cover frontend lockfile promotion and README-only
preservation after rollback.

## Questions to explain before an interview

1. Why can Argo CD deploy to a laptop cluster that GitHub Actions cannot reach,
   and what exactly remains on the generated branch?
2. Why must manifest synchronization and image promotion be separate commits,
   and why does the source watermark survive an image rollback?
3. Which failures are caught by mock shell tests, client validation, registry
   scanning and an actual rollout respectively?
