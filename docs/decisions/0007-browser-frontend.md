# ADR 0007: Browser frontend in the Spring Boot application

Status: implemented. Dated test and delivery results are recorded in the
[verification ledger](../evidence/verification.md).

## Context

SplitNest needs a usable browser interface for its account, group, expense,
import and budget workflows. Swagger remains useful for API exploration.
A separate frontend deployment would add routing, release and authentication
configuration without a requirement for independent releases in this local app.

## Decision

Use React, TypeScript, Vite, React Router and plain CSS. Vitest/React Testing
Library cover component interactions; Playwright covers real-browser workflows
and multi-tab sessions. Exact compatible Node/npm and package versions are
pinned in the frontend manifest, lockfile and image build.

Compile the frontend into static assets and package them in the existing
Spring Boot image. The final runtime is the non-root Java container; Node is
a build/test dependency. Vite proxies the API during local development. Serve
only explicit browser routes so SPA fallback cannot hide API/static errors.

Separate the public introduction, signed-in Home, group directory and in-app
Guide. Home uses actual group summaries to provide orientation; it does not
aggregate financial records across groups or invent dashboard activity. Keep
financial actions inside the authorized group workspace. Encode the selected
workspace section in a validated `tab` query value so direct links, refresh and
browser history preserve that section. The [interface wireframes](../interface-design.md)
document the page responsibilities and responsive reading order.

Keep financial rules and permissions in Java. The interface submits actions,
preserves exact monetary response text and displays authoritative stored
splits, balances, import status and budget-alert snapshots. It does not imply
payments, invitation email, unequal splits or bank synchronization.

Add a browser-auth adapter over the existing token services. Access tokens
stay in memory; refresh capability uses a host-only HttpOnly cookie with
explicit SameSite/path/Secure settings. Cookie-based actions require CSRF.
Web Locks serialize rotation across tabs; generation checks discard stale
responses after logout/account changes. Retain the JSON-token API for Swagger
and apply the existing login rate limit to browser login.

Include frontend source, configuration and lockfiles in the image promotion
fingerprint. A frontend-only change therefore produces a combined app release.
Documentation-only changes retain the selected image and intentional rollback.

## Alternatives

- Swagger alone exposes the API but does not provide ordinary browser workflows.
- A separate frontend server permits independent releases, with additional
  routing, origin and operational decisions that this scope does not need.
- Recalculating financial rules in the browser duplicates authoritative logic
  and risks disagreement with stored splits, permissions and history.

## Consequences

UI and API release together. One image simplifies local operation, while any
UI source change still needs the complete build/test/promotion pipeline. Node
adds a maintained build dependency without an additional runtime service.

Browser cookies add security obligations beyond the bearer API. Java tests
cover CSRF, encoded-route matching, cookie settings and SPA routing. Component
and browser tests cover rotation, cross-tab logout, permissions and stale
responses. Real API journeys and deterministic display fixtures are identified
separately in their evidence.

[The frontend-only GitOps record](../evidence/frontend-gitops.json) documents
automatic reconciliation of a frontend source change. A manifest, component
test or Vite run alone does not prove a published image or successful rollout.
