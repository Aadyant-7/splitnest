#!/usr/bin/env bash
set -euo pipefail

die() { printf 'Promotion error: %s\n' "$*" >&2; exit 1; }
notice() { printf '%s\n' "$*"; }

source_sha=''
image_name=''
image_digest=''
remote='origin'
source_branch='main'
deployment_branch='deploy/local'
while (($#)); do
  (($# >= 2)) || die "Every option requires a value"
  case "$1" in
    --source-sha) source_sha=$2 ;;
    --image-name) image_name=$2 ;;
    --image-digest) image_digest=$2 ;;
    --remote) remote=$2 ;;
    --source-branch) source_branch=$2 ;;
    --deployment-branch) deployment_branch=$2 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift 2
done

[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || die 'source-sha must be a full Git commit SHA'
[[ "$image_name" =~ ^ghcr\.io/[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._/-]*$ ]] || die 'image-name must be a lowercase GHCR repository without a tag'
[[ "$image_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die 'image-digest must be a SHA-256 registry digest'
[[ "$remote" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || die 'remote must be a configured Git remote name'
git check-ref-format --branch "$source_branch" >/dev/null
git check-ref-format --branch "$deployment_branch" >/dev/null
[[ "$source_branch" != "$deployment_branch" ]] || die 'Source and generated deployment branches must differ'
repo=$(git rev-parse --show-toplevel)
git -C "$repo" remote get-url "$remote" >/dev/null
git -C "$repo" var GIT_AUTHOR_IDENT >/dev/null
git -C "$repo" var GIT_COMMITTER_IDENT >/dev/null
command -v kubectl >/dev/null || die 'kubectl is required for final rendering and client validation'

source_ref="refs/remotes/$remote/$source_branch"
deployment_ref="refs/remotes/$remote/$deployment_branch"
git -C "$repo" fetch --no-tags "$remote" "refs/heads/$source_branch:$source_ref"
if [[ "$(git -C "$repo" rev-parse "$source_ref")" != "$source_sha" ]]; then
  notice 'Skipped stale run: the remote source branch has a newer commit.'
  exit 0
fi

# These files are generated branch state, never input from main.
[[ -z "$(git -C "$repo" ls-tree --name-only "$source_sha" -- deploy/provenance)" ]] || die 'deploy/provenance is reserved for generated deployment state'
[[ -n "$(git -C "$repo" ls-tree --name-only "$source_sha" -- deploy)" ]] || die 'Source commit has no deploy directory'
if git -C "$repo" ls-tree -r "$source_sha" -- deploy | awk '$1 != "100644" && $1 != "100755" { bad=1 } END { exit !bad }'; then
  die 'Deployment inputs must be ordinary files; symlinks and submodules are not supported'
fi

# Frontend tests/configuration are typechecked in the Docker build, so include
# every tracked frontend input except Markdown. Java tests and deploy manifests
# remain separate from the application build profile.
build_profile=$(git -C "$repo" ls-tree -r "$source_sha" -- \
  Dockerfile .dockerignore pom.xml mvnw .mvn src/main frontend .github/workflows/ci.yml scripts/promote-deployment.sh \
  | awk 'tolower($0) !~ /\tfrontend\/.*\.md$/' \
  | git -C "$repo" hash-object --stdin)
manifest_profile=$(git -C "$repo" rev-parse "$source_sha:deploy")

deployment_exists=false
previous_deployment=''
if remote_head=$(git -C "$repo" ls-remote --exit-code --heads "$remote" "refs/heads/$deployment_branch"); then
  deployment_exists=true
  git -C "$repo" fetch --no-tags "$remote" "refs/heads/$deployment_branch:$deployment_ref"
  previous_deployment=$(git -C "$repo" rev-parse "$deployment_ref")
elif [[ $? != 2 ]]; then
  die 'Could not inspect the deployment branch'
fi

temporary_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
temporary=$(mktemp -d "$temporary_root/splitnest-promotion.XXXXXXXX")
worktree="$temporary/checkout"
cleanup() {
  # Delete only the exact temporary directory created by mktemp above.
  case "$temporary" in "$temporary_root"/splitnest-promotion.*) ;; *) return 1 ;; esac
  git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf -- "$temporary"
}
trap cleanup EXIT

field() {
  local value
  value=$(awk -v key="$1" 'index($0,key "=")==1 { count++; value=substr($0,length(key)+2) } END { if(count!=1) exit 1; print value }' "$2") \
    || die "Missing or duplicated provenance field: $1"
  printf '%s' "$value"
}

set_image() {
  local file=$1 digest=$2 name count
  count=$(awk '/^images:[[:space:]]*$/ { inside=1; next } inside && /^[^[:space:]#]/ { inside=0 } inside && /^  - name: / { count++ } END { print count+0 }' "$file")
  name=$(awk '/^images:[[:space:]]*$/ { inside=1; next } inside && /^[^[:space:]#]/ { inside=0 } inside && /^  - name: / { sub(/^  - name: /, ""); print }' "$file")
  [[ "$count" == 1 && "$name" == "$image_name" ]] || die 'The local overlay must contain exactly one app image entry matching image-name'
  awk -v name="$image_name" -v digest="$digest" '
    /^images:[[:space:]]*$/ { print "images:"; print "  - name: " name; print "    digest: " digest; inside=1; next }
    inside && /^[^[:space:]#]/ { inside=0 }
    !inside { print }
  ' "$file" > "$file.next"
  mv -- "$file.next" "$file"
}

should_promote=true
previous_image=''
if [[ "$deployment_exists" == true ]]; then
  if git -C "$repo" ls-tree -r --name-only "$deployment_ref" | awk '$0 !~ /^deploy\// { bad=1 } END { exit !bad }'; then
    die 'Deployment branch contains files outside deploy/'
  fi
  git -C "$repo" show "$deployment_ref:deploy/provenance/source.env" > "$temporary/source.env"
  git -C "$repo" show "$deployment_ref:deploy/provenance/image.env" > "$temporary/image.env"
  previous_source=$(field source_sha "$temporary/source.env")
  previous_profile=$(field build_profile "$temporary/source.env")
  [[ "$previous_source" =~ ^[0-9a-f]{40}$ && "$previous_profile" =~ ^[0-9a-f]{40}$ ]] || die 'Invalid source provenance'
  git -C "$repo" merge-base --is-ancestor "$previous_source" "$source_sha" || die 'Source history diverged from the previously evaluated commit'
  previous_image=$(field image "$temporary/image.env")
  [[ "$previous_image" == "$image_name@"* ]] || die 'Existing image provenance names a different repository'
  previous_digest=${previous_image#*@}
  [[ "$previous_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die 'Invalid existing image digest'
  if [[ "$previous_profile" == "$build_profile" ]]; then should_promote=false; fi
  git -C "$repo" worktree add --detach "$worktree" "$deployment_ref"
  git -C "$worktree" rm -r -f --ignore-unmatch -- deploy >/dev/null
else
  git -C "$repo" worktree add --detach "$worktree" "$source_sha"
  # An empty index and commit-tree create an orphan history without introducing
  # an extra local branch or copying application sources into deploy/local.
  git -C "$worktree" read-tree --empty
fi

git -C "$repo" archive "$source_sha" deploy | tar -x -C "$worktree"
overlay="$worktree/deploy/overlays/local/kustomization.yaml"
[[ -f "$overlay" ]] || die 'The source local overlay is missing'
mkdir -p "$worktree/deploy/provenance"
printf 'source_sha=%s\nbuild_profile=%s\nmanifest_profile=%s\n' "$source_sha" "$build_profile" "$manifest_profile" \
  > "$worktree/deploy/provenance/source.env"
if [[ "$deployment_exists" == true ]]; then
  set_image "$overlay" "${previous_image#*@}"
  cp -- "$temporary/image.env" "$worktree/deploy/provenance/image.env"
fi

git -C "$worktree" add -- deploy
if [[ "$deployment_exists" == false ]]; then
  tree=$(git -C "$worktree" write-tree)
  initial_commit=$(printf 'chore(deploy): sync manifests from %s\n\nSource-SHA: %s\n' "${source_sha:0:12}" "$source_sha" \
    | git -C "$worktree" commit-tree "$tree")
  git -C "$worktree" reset --soft "$initial_commit"
elif ! git -C "$worktree" diff --cached --quiet; then
  git -C "$worktree" commit -m "chore(deploy): sync manifests from ${source_sha:0:12}" -m "Source-SHA: $source_sha"
fi

if [[ "$should_promote" == true ]]; then
  set_image "$overlay" "$image_digest"
  printf 'source_sha=%s\nbuild_profile=%s\nimage=%s@%s\n' "$source_sha" "$build_profile" "$image_name" "$image_digest" \
    > "$worktree/deploy/provenance/image.env"
  git -C "$worktree" add -- deploy/overlays/local/kustomization.yaml deploy/provenance/image.env
  if ! git -C "$worktree" diff --cached --quiet; then
    git -C "$worktree" commit -m "chore(deploy): promote image from ${source_sha:0:12}" \
      -m "Source-SHA: $source_sha" -m "Image: $image_name@$image_digest"
  fi
else
  notice 'Build inputs are unchanged; preserving the deployed image, including any manual rollback.'
fi

# Validate the actual generated combination, rather than only the source overlay.
# kubectl client dry-run still needs API discovery: CI supplies a temporary kind cluster.
kubectl kustomize "$worktree/deploy/overlays/local" > "$temporary/rendered.yaml"
kubectl apply --dry-run=client --validate=true -f "$temporary/rendered.yaml" > "$temporary/validation.txt"

git -C "$repo" fetch --no-tags "$remote" "refs/heads/$source_branch:$source_ref"
if [[ "$(git -C "$repo" rev-parse "$source_ref")" != "$source_sha" ]]; then
  notice 'Skipped stale run: the source branch advanced during validation.'
  exit 0
fi
actual_deployment=$(git -C "$repo" ls-remote --heads "$remote" "refs/heads/$deployment_branch" | awk '{ print $1 }')
[[ "$actual_deployment" == "$previous_deployment" ]] || die 'Deployment branch changed during validation; rerun instead of overwriting it'
if [[ "$deployment_exists" == true && "$(git -C "$worktree" rev-parse HEAD)" == "$previous_deployment" ]]; then
  notice 'Deployment state is already current; no push is required.'
  exit 0
fi

# Normal fast-forward pushes retain history and reject concurrent branch updates.
git -C "$worktree" push "$remote" "HEAD:refs/heads/$deployment_branch"
notice "Updated $deployment_branch from verified source $source_sha."
