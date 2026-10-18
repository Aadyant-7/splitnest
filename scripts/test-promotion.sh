#!/usr/bin/env bash
set -euo pipefail

# These tests use only local temporary Git repositories and a fake kubectl.
# They never contact GitHub, modify the user's branches or require a cluster.
script_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
promoter="$script_directory/promote-deployment.sh"
temporary_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
temporary=$(mktemp -d "$temporary_root/splitnest-promotion-test.XXXXXXXX")
cleanup() {
  case "$temporary" in "$temporary_root"/splitnest-promotion-test.*) rm -rf -- "$temporary" ;; *) return 1 ;; esac
}
trap cleanup EXIT
trap 'status=$?; if ((status)); then tail -80 "$temporary/promotion.log" 2>/dev/null || true; fi' ERR
remote="$temporary/remote.git"
source="$temporary/source"
image='ghcr.io/aadyant-7/splitnest'
digest_a="sha256:$(printf '%064d' 1)"
digest_b="sha256:$(printf '%064d' 2)"
digest_c="sha256:$(printf '%064d' 3)"
digest_d="sha256:$(printf '%064d' 4)"
mkdir -p "$temporary/bin"
cat > "$temporary/bin/kubectl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  kustomize)
    [[ "${MOCK_RENDER_FAIL:-0}" != 1 ]] || exit 1
    digest=$(awk '$1=="digest:" {print $2}' "$2/kustomization.yaml")
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]
    printf 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: splitnest\nspec:\n  template:\n    spec:\n      containers:\n        - name: app\n          image: ghcr.io/aadyant-7/splitnest@%s\n' "$digest"
    ;;
  apply)
    [[ " $* " == *' --dry-run=client '* && " $* " == *' --validate=true '* ]]
    [[ "${MOCK_VALIDATE_FAIL:-0}" != 1 ]] || exit 1
    printf 'deployment.apps/splitnest configured (dry run)\n'
    ;;
  *) exit 1 ;;
esac
MOCK
chmod +x "$temporary/bin/kubectl"
export PATH="$temporary/bin:$PATH"

git init --bare -b main "$remote" >/dev/null
git init -b main "$source" >/dev/null
git -C "$source" config user.name 'Promotion Fixture'
git -C "$source" config user.email 'promotion-fixture@example.invalid'
git -C "$source" config core.autocrlf false
git -C "$source" remote add origin "$remote"
mkdir -p "$source/deploy/base" "$source/deploy/overlays/local" "$source/src/main" "$source/scripts"
printf 'FROM example\n' > "$source/Dockerfile"
printf '<project/>\n' > "$source/pom.xml"
printf 'version A\n' > "$source/src/main/application.txt"
cp -- "$promoter" "$source/scripts/promote-deployment.sh"
cat > "$source/deploy/overlays/local/kustomization.yaml" <<'YAML'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
images:
  - name: ghcr.io/aadyant-7/splitnest
    newTag: bootstrap
YAML
printf 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: fixture\ndata:\n  version: A\n' > "$source/deploy/base/configmap.yaml"
printf 'resources:\n  - configmap.yaml\n' > "$source/deploy/base/kustomization.yaml"

commit_source() {
  git -C "$source" add .
  git -C "$source" commit -m "$1" >/dev/null
  git -C "$source" push origin HEAD:main >> "$temporary/promotion.log" 2>&1
}
source_head() { git -C "$source" rev-parse HEAD; }
deployment_head() { git --git-dir="$remote" rev-parse refs/heads/deploy/local; }
deployment_file() { git --git-dir="$remote" show "refs/heads/deploy/local:$1"; }
assert_equal() {
  [[ "$1" == "$2" ]] || { printf 'FAIL %s: expected %s, got %s\n' "$3" "$1" "$2" >&2; exit 1; }
}
assert_image() {
  deployment_file deploy/provenance/image.env | grep -Fx "image=$image@$1" >/dev/null
  deployment_file deploy/overlays/local/kustomization.yaml | grep -Fx "    digest: $1" >/dev/null
}
promote() {
  local digest=$1 sha=${2:-$(source_head)}
  (cd "$source" && bash "$promoter" --source-sha "$sha" --image-name "$image" --image-digest "$digest") \
    >> "$temporary/promotion.log" 2>&1
}

commit_source 'Initial source'
sha_a=$(source_head)
promote "$digest_a"
assert_image "$digest_a"
assert_equal 2 "$(git --git-dir="$remote" rev-list --count refs/heads/deploy/local)" 'bootstrap separates manifest and image commits'
if git --git-dir="$remote" ls-tree -r --name-only refs/heads/deploy/local | grep -v '^deploy/' >/dev/null; then
  printf 'FAIL deployment branch contains application source\n' >&2; exit 1
fi
printf 'PASS bootstrap creates an orphan deployment-only history and immutable image provenance\n'

before=$(deployment_head)
promote "$digest_a"
assert_equal "$before" "$(deployment_head)" 'same source is a no-op'
printf 'PASS repeat invocation does not add commits\n'

printf 'version B\n' > "$source/src/main/application.txt"
printf 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: fixture\ndata:\n  version: B\n' > "$source/deploy/base/configmap.yaml"
commit_source 'Change application and manifests'
sha_b=$(source_head)
promote "$digest_b"
promotion_b=$(deployment_head)
assert_image "$digest_b"
assert_equal "$before" "$(git --git-dir="$remote" rev-parse refs/heads/deploy/local~2)" 'two separate fast-forward commits'
changed_image_files=$(git --git-dir="$remote" diff-tree --no-commit-id --name-only -r "$promotion_b" | sort)
assert_equal $'deploy/overlays/local/kustomization.yaml\ndeploy/provenance/image.env' "$changed_image_files" 'image commit can be reverted without manifest changes'
printf 'PASS source update separates manifest sync from image promotion and retains history\n'

printf '\n# manifest-only edit\n' >> "$source/deploy/base/configmap.yaml"
commit_source 'Change only manifests'
sha_c=$(source_head)
before=$(deployment_head)
promote "$digest_c"
assert_image "$digest_b"
assert_equal "$before" "$(git --git-dir="$remote" rev-parse refs/heads/deploy/local~1)" 'manifest-only update adds one commit'
deployment_file deploy/provenance/source.env | grep -Fx "source_sha=$sha_c" >/dev/null
deployment_file deploy/provenance/image.env | grep -Fx "source_sha=$sha_b" >/dev/null
printf 'PASS manifest-only change preserves the image and its original source provenance\n'

printf 'version D\n' > "$source/src/main/application.txt"
commit_source 'Newer application source'
sha_d=$(source_head)
before=$(deployment_head)
promote "$digest_a" "$sha_a"
assert_equal "$before" "$(deployment_head)" 'stale candidate cannot update deployment'
printf 'PASS stale source run cannot overwrite newer state\n'

if MOCK_RENDER_FAIL=1 promote "$digest_d"; then
  printf 'FAIL render failure was accepted\n' >&2; exit 1
fi
assert_equal "$before" "$(deployment_head)" 'failed final rendering never pushes commits'
printf 'PASS final rendering failure leaves the remote branch untouched\n'
if MOCK_VALIDATE_FAIL=1 promote "$digest_d"; then
  printf 'FAIL client validation failure was accepted\n' >&2; exit 1
fi
assert_equal "$before" "$(deployment_head)" 'failed client validation never pushes commits'
printf 'PASS final client validation failure leaves the remote branch untouched\n'

promote "$digest_d"
promotion_d=$(deployment_head)
assert_image "$digest_d"
git -c core.autocrlf=false clone --quiet --branch deploy/local "$remote" "$temporary/rollback"
git -C "$temporary/rollback" config user.name 'Rollback Fixture'
git -C "$temporary/rollback" config user.email 'rollback-fixture@example.invalid'
git -C "$temporary/rollback" config core.autocrlf false
git -C "$temporary/rollback" revert --no-edit "$promotion_d" >> "$temporary/promotion.log" 2>&1
git -C "$temporary/rollback" push origin HEAD:deploy/local >> "$temporary/promotion.log" 2>&1
rollback_head=$(deployment_head)
assert_image "$digest_b"
deployment_file deploy/provenance/source.env | grep -Fx "source_sha=$sha_d" >/dev/null
printf 'Documentation only\n' > "$source/README.md"
commit_source 'Documentation after rollback'
promote "$digest_c"
assert_image "$digest_b"
git --git-dir="$remote" merge-base --is-ancestor "$rollback_head" refs/heads/deploy/local
deployment_file deploy/base/configmap.yaml | grep -Fx '  version: B' >/dev/null
printf 'PASS git revert preserves manifest history and a later docs-only push keeps the rollback\n'
printf 'All 8 promotion scenarios passed. No external repository or Kubernetes cluster was used.\n'
