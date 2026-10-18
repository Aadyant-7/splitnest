# GitOps with Argo CD

GitHub Actions builds, tests and publishes an image. Argo CD runs inside the local
cluster and regularly compares live resources with Git, then reconciles them.
This pull-based model works when GitHub's runners cannot connect to a laptop's
private Kubernetes API. It still requires the laptop, Docker and cluster to be
running, with outbound access to GitHub and GHCR.

`main` contains application source and deployment templates. `deploy/local`
contains generated deployment state and image provenance. The Application watches
`deploy/overlays/local` on that branch. Keeping promotion separate from `main`
allows normal source branch protection without giving an image bot permission
to bypass reviews on application code.

## Install the pinned controller

After creating the cluster and `splitnest-secrets` as described in
[kubernetes.md](kubernetes.md):

```powershell
kubectl --context kind-splitnest create namespace argocd
kubectl --context kind-splitnest apply -n argocd --server-side --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.5/manifests/install.yaml
kubectl --context kind-splitnest -n argocd rollout status deployment/argocd-server --timeout=240s
kubectl --context kind-splitnest -n argocd get pods
```

Argo CD v3.5.5 was verified against the
[official release](https://github.com/argoproj/argo-cd/releases/tag/v3.5.5).
This uses the upstream non-HA installation to fit a local learning environment.
For UI access, run `kubectl --context kind-splitnest -n argocd port-forward service/argocd-server 8081:443`
and visit [the local Argo UI](https://localhost:8081). Its local certificate is
self-signed. Retrieve the initial admin password privately using the documented
Argo login procedure; do not paste or store it in the repository.

Apply the Application only after the generated `deploy/local` branch exists and
contains a pullable app image:

```powershell
kubectl --context kind-splitnest apply -f deploy/argocd/application.yaml
kubectl --context kind-splitnest -n argocd get application splitnest-local
kubectl --context kind-splitnest -n splitnest get deployment,pods
```

Check the Application status, the deployed image digest, and the ready Pods.
`Synced` describes agreement with Git; `Healthy` describes runtime health. Either
one alone is insufficient evidence of a working API. Run the API demo after a
successful reconciliation.

## Image visibility and authentication

A public GitHub repository does not automatically make its GHCR package public.
For the easiest public portfolio demonstration, explicitly set the **container
package** visibility to public and verify an anonymous pull of the exact digest.

For a private package, create an image pull Secret in `splitnest` using a local
Docker authentication config containing read-only GHCR credentials:

```powershell
kubectl --context kind-splitnest -n splitnest create secret generic ghcr-pull --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson=$env:USERPROFILE/.docker/config.json
```

Do this only when that config actually contains registry authentication in a
portable form; a desktop credential-helper reference is not a Kubernetes
credential. The alternative is creating the standard `docker-registry` Secret
from a privately supplied read-only credential. Never paste a token into chat,
shell history, a manifest or CI logs. Reference `ghcr-pull` with the app Pod's
`imagePullSecrets` in an explicitly reviewed overlay patch. This optional private
registry patch is not enabled by the current public-image overlay.

## Promotion and reconciliation

The delivery workflow must publish only after tests and the critical-vulnerability
scan pass. It promotes the exact image digest, records its source commit, renders
the final overlay and rejects stale runs before pushing. A newer successful
promotion must never be overwritten by an older slower build.

The workflow calls the repository's promotion script from the source checkout:

```bash
bash scripts/promote-deployment.sh \
  --source-sha <full-40-character-source-SHA> \
  --image-name ghcr.io/aadyant-7/splitnest \
  --image-digest sha256:<64-character-image-digest>
```

The script needs an authenticated Git remote and a usable validation cluster.
Its defaults are `origin/main` and `origin/deploy/local`. Generated provenance is
kept in `deploy/provenance/source.env` (the source watermark and build/manifest
profiles) and `deploy/provenance/image.env` (the promoted source and immutable
image). These files contain revision metadata, never runtime secrets. CI supplies
the image digest after publication; do not invent one for a manual demonstration.

Manifest synchronization and image promotion are separate commits on
`deploy/local`. Manifest-only updates preserve the current image reference. This
keeps a rollback of an image promotion from also reverting unrelated resources.
Do not edit generated deployment files by hand on `main` to create ad hoc releases.

Promotion checks that the candidate is the current remote `main` before changes
and again before pushing. An older successful run is skipped. The source
watermark remains after reverting an image-only commit, allowing a subsequent
documentation-only update to preserve that deliberate rollback. A successful
build/scan alone does not mean a different image must replace the current one;
the build profile determines whether application inputs changed.

Argo CD's Application enables automated sync, prune and self-heal. It ignores the
app Deployment's `/spec/replicas` with `RespectIgnoreDifferences=true` so the HPA
can control replica count. Namespace and database storage carry retention guards;
the Application intentionally has no cascading-delete finalizer. Inspect storage
and backups separately before any destructive cluster cleanup.

## Git rollback

Use a separate checkout so application work on `main` stays intact:

```powershell
git fetch origin deploy/local
git worktree add ../splitnest-deploy-review origin/deploy/local
Set-Location ../splitnest-deploy-review
git switch -c rollback/local-image
git log --oneline -8
# Select the image-only promotion commit after checking its diff:
git show <promotion-commit>
git revert <promotion-commit>
git push origin HEAD:deploy/local
kubectl --context kind-splitnest -n splitnest rollout status deployment/splitnest --timeout=240s
```

The revert changes desired state in Git; Argo CD then deploys it. A direct
`kubectl rollout undo` will be overwritten by self-heal unless Git agrees. Revert
the faulty source change on `main` too, or a later build may reintroduce it.
Rollback does not undo Flyway migrations. Use backward-compatible forward-only
schema changes so the previous image can still run.

When branch protection requires a PR for `deploy/local`, open the rollback branch
as a PR and merge through that rule instead of pushing directly. Do not force-push
or rewrite deployment history. Verify the digest and API behavior after rollback;
a Git commit alone is not deployment evidence.

## Questions to check understanding

1. Why can Argo CD deploy to a laptop when a GitHub-hosted runner cannot reach its API server?
2. Why does Argo CD ignore the replicas field, and what happens without that rule?
3. Why is a Git revert durable while an unrecorded live rollout undo is temporary?
