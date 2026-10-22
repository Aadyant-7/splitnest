# ADR 0006: Separate reviewed source from generated deployment state

Status: implemented and verified through remote CI publication/promotion, live
Argo reconciliation and automatic Git-driven rollback/restoration. See the
[verification ledger](../evidence/verification.md).

## Context

GitHub-hosted runners cannot directly reach a Kubernetes API on a private laptop.
Source on `main` should support normal review/branch protection, while image
promotion should not require a bot to bypass those protections. Git rollback
must be distinguishable from a source-code revert.

## Decision

Build/test/scan application changes in GitHub Actions. Publish only a scanned
image from verified `main`, tagged by source SHA. Generate deployment state on
`deploy/local` in the same repository; Argo CD inside the cluster watches that
branch's local overlay and reconciles with outbound Git/registry access.

Promotions record the exact image digest and source commit. Synchronizing manifest
source and changing the promoted image are separate commits. A manifest-only sync
preserves the current image. Reject stale source runs and validate the final
generated overlay before pushing. Do not force-push generated history.

Argo CD self-heals and prunes deliberately while preserving database/namespace
retention safeguards. Ignore the HPA-owned replica field and respect that rule
during sync. Supply Secrets outside Git and explicitly verify GHCR pull access.

## Consequences

The cluster pulls desired state and does not need an inbound connection from CI.
Source protection and automatic deployment have separate permissions. Reverting
an image-only promotion restores Git's desired image without undoing unrelated
manifest changes. Also revert faulty source on `main` to prevent reintroduction.

There is an extra generated branch and promotion protocol to maintain. Git rollback
does not undo database migrations, so schema changes must remain compatible with
the previous image. This ADR describes the required protocol; files or a successful
local render do not establish publication, branch creation, reconciliation or
rollback. The two successful CI releases demonstrate the remote publication and
promotion protocol. The [live rollback record](../evidence/gitops-rollback.json)
separately shows Synced/Healthy with two ready replicas for the second image,
its predecessor after a promotion revert, and the second image after reverting
that rollback. Automatic Argo polling reconciled each stage without a manual
refresh. Those images differ in OCI repository labels with the same API code;
the observation proves image deployment reversal rather than business/schema
rollback. See [gitops.md](../gitops.md) and the verification ledger for release
identities and explicitly excluded recovery/deployment claims.
