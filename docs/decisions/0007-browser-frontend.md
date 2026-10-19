# ADR 0007: Browser frontend in the Spring Boot application

Status: **implemented and verified, including packaged delivery**.
The owner approved this extension on 19 October 2026. Frontend acceptance is
**6 of 6 milestones complete (100%)**; UI, security, CI and automatic local
GitOps delivery have dated verification evidence.
See [project status](../project-status.md) and the
[frontend execution plan](../frontend-extension-plan.md).

## Context

The verified backend already supports authentication, groups, exact equal-split
expenses, balances, statement imports and scheduled budget alerts. Swagger is
useful for inspecting the API, but an academic or placement demonstration should
let a person perform those real workflows through ordinary browser screens.

The owner explicitly approved a frontend, superseding the original exclusion.
The project remains a free local demonstration. It does not require paid APIs,
public hosting, cloud infrastructure or new business features. Preserve the
existing Java tests, API contracts, security rules, Compose/kind topology and
verified delivery evidence while extending the interface.

## Decision

Use the approved React, TypeScript, Vite and React Router stack with plain CSS.
Use Vitest/React Testing Library for component interactions and Playwright for
real-browser workflows, including multi-tab session behavior. Supported Node.js
LTS and npm are build/test tooling; compatible exact versions are pinned in
the frontend package/lock files and documented in its README.

Keep one deployable Spring Boot application. A frontend image-build stage
produces static assets for the Java application to package and serve alongside
the API. The final runtime remains the existing non-root Java application image.
For local development Vite proxies API requests so the browser uses one
origin. No extra Nginx service, ingress, hosted frontend or server framework is
needed for this scope. Browser-route fallback must not swallow API errors.

Expose existing capabilities only: registration/sign-in, groups and membership,
expenses and stored splits/balances, current statement-job polling, budgets and
persisted alert snapshots. The server owns authorization, exact money, historical
membership rules, imports and scheduling. The UI must not imply payments,
invitation emails, unequal splits, an import-history endpoint or an unsupported
live monthly-spending summary.

Add a browser-auth adapter over the existing authentication services while
preserving JSON token responses for Swagger/API clients. Keep access tokens in
memory and refresh capability in a host-only HttpOnly cookie, with deliberate
SameSite/path settings and explicit CSRF protection for cookie-based actions.
Provide explicit local HTTP settings and safe Secure-cookie settings for HTTPS
environments without adding public deployment to the scope. Coordinate refresh,
logout and account changes across tabs because the existing replay policy can
revoke the token family. Apply the same login rate limit to browser login; a new
route must not bypass existing controls. Do not persist authentication tokens in
localStorage or place backend secrets in frontend build variables.

Update the image, CI checks and promotion source profile as part of delivery.
Frontend source and lockfiles must count as application changes, so a frontend-only
commit can promote its newly built image. Keep documentation-only image
preservation and manual Git rollback behavior covered by regression tests.

## Alternatives considered

- Keep Swagger as the only interface: the backend baseline is already complete
  this way, but this does not provide the approved ordinary-user demonstration.
- Deploy a separate frontend server: separate releases are possible, but add
  runtime/routing configuration and authentication-origin decisions without a
  requirement that needs them in this local modular monolith.
- Recalculate business rules in the browser: easier to make an attractive mockup,
  but cannot establish permissions, exact historical splits or real job results.
  Use the real backend for every business action.

## Consequences and acceptance

The UI and API release together, keeping local operations small and one running
image easy to explain. A UI change requires the combined image pipeline. Node
adds a build/test dependency and dependency maintenance, even though no Node
server is added to the final runtime.

Cookie-based browser authentication adds security obligations beyond the original
bearer API. Dedicated Java tests now cover CSRF, encoded-path matching, cookie
scope and SPA fallback; component and real-browser tests cover refresh
coordination, logout and stale-account responses. Original API tests remain.

All six
[frontend milestones](../frontend-extension-plan.md#5-focused-execution-milestones)
pass: actual DTOs/routes, browser auth, core expense workflows, imports/budgets,
accessible interaction/error states and packaged local delivery. Tests verify
real three-user journeys, server permission boundaries, session expiry/multi-tab
behavior and image/Compose/kind operation. The
[frontend-only GitOps exercise](../evidence/frontend-gitops.json) records automatic
reconciliation of an actual frontend source change and nine passing browser scenarios.

After the full app is verified, follow the
[learning roadmap](../learning-roadmap.md) for the requested from-scratch
explanation. The learning sequence explains the finished system in a logical
build order; actual development history remains in Git and verification evidence.
Find the current code and evidence through the
[documentation index](../README.md).

Understanding check: how does keeping one runtime simplify delivery while adding
browser-session responsibilities that the existing JSON-token API does not test?
