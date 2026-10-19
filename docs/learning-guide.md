# SplitNest learning guide

This guide explains the implemented Java backend, React interface and delivery
design. The frontend strict build and source/browser tests have passed; the new
combined-image delivery needs its own evidence. Use [project status](project-status.md) to check what exists
and the [documentation index](README.md) to find the relevant guide.

The detailed from-scratch learning phase starts after the complete browser app
is implemented and verified. Follow the [learning roadmap](learning-roadmap.md)
then. The learning sequence explains the finished system in a logical build
order; actual development history remains in Git and verification evidence.
During development, these explanations
remain available for reference without requiring a study checkpoint after every
change. Use the [file-by-file guide](implementation.md) to connect concepts to
actual classes and tests, and the [verification record](evidence/verification.md)
for results. Run the relevant demo and explain its behavior before claiming the
corresponding skill in an interview.

## 1. One application with feature boundaries

A modular monolith is one application organized into business features. Auth
handles credentials and tokens; groups handles membership; expenses handles
financial records. These are packages within the same process, not services
that call one another across a network.

This keeps deployment and local development small. A transaction can save an
expense and all of its splits in one database. Microservices would introduce
network failures and cross-service consistency before the project needs them.
Feature boundaries still matter: controllers should call services rather than
reaching into persistence details themselves.

## 2. A request through Spring Boot

For an authenticated expense request, the security filter validates the bearer
token first. The controller checks request structure and maps HTTP data to a DTO.
The service checks membership and business rules, then performs the operation
inside a transaction. Repositories perform database access. The controller maps
the result to a response DTO.

Spring dependency injection constructs these collaborators. It makes dependencies
explicit and allows a test to substitute a collaborator without writing a global
singleton. JPA entities describe persisted state; DTO records describe the public
API. Keeping them distinct prevents accidental exposure of password hashes or
unbounded entity relationships.

## 3. Schema ownership and transactions

Flyway applies numbered SQL migrations in order and records which ran. Once a
migration has been applied and shared, add another migration instead of editing
its history. Configure Hibernate to validate the schema, not recreate it.

A transaction is an all-or-nothing database unit. Saving an expense but failing
to save its splits would create money that the balance calculation cannot fully
account for. One transaction ensures either all those rows exist or none do.

Transactions alone do not solve every race. Two requests can read the same state
before either changes it. A shared group-row lock gives membership changes and
expense creation an order. A refresh-token lock similarly prevents concurrent
requests from both rotating the same valid token.

## 4. Exact financial arithmetic

Binary floating-point cannot represent every decimal amount exactly. BigDecimal
and NUMERIC preserve the required decimal precision. Validate the scale before
saving rather than silently rounding a user's expense.

For 100.00 divided between three members, convert to 10,000 paise. Each gets
3,333 paise and one remains. Give the remainder to the first member in the agreed
UUID ordering: 33.34, 33.33, 33.33. The splits sum to exactly 100.00.

If the first member paid the full amount, the corresponding net balances are
66.66, -33.33, -33.33. Net means total paid minus total share. The group sum is
zero. New members do not inherit previous splits, and removing a member does
not erase money already paid or owed.

For balances, PostgreSQL aggregates rows instead of the Java application loading
every expense. Aggregate payments and shares separately: a careless join can
repeat the same payment for each split and inflate the result.

## 5. Authentication, authorization, and JWTs

Authentication establishes who made the request. Authorization decides whether
that user may perform this operation on this group. A valid login token does not
grant access to every group.

A JWT contains claims such as user ID, issuer, audience, and expiry. Its signature
detects tampering; it does not encrypt the contents. Do not put secrets or file
data inside it. The resource server validates it on each protected request.

Stateless access authentication means the server does not need an HTTP login
session for each access token. Refresh tokens still have database state, because
the application must rotate and revoke long-lived login capability.

Passwords use BCrypt because password hashing should be deliberately expensive.
Refresh tokens are random high-entropy secrets, so SHA-256 hashing is appropriate
for storing a comparison value without storing the bearer secret itself.

Rotation revokes the old refresh token and creates a successor atomically. A
family relationship lets replay detection revoke the remaining login chain.
Rejection alone cannot prove that an attacker does not hold a valid successor.
That revocation must commit even though the response is 401; throwing an exception
inside its transaction can otherwise undo it. Clients serialize refresh calls
because simultaneous legitimate refreshes can trigger the same replay handling.
Logout revokes refresh capability; existing access tokens can last until their
short expiry. This tradeoff must be stated in the API documentation.

Returning 404 to a group outsider avoids confirming that a guessed group ID
exists. An actual member without the required admin role receives 403. Cached
responses must pass the same membership check as database-backed responses.

## 6. Redis limiting and caching

A fixed window counts requests in a defined period. It is simple, but requests
near the end and beginning of adjacent windows can create a burst. A token bucket
replenishes a budget gradually and handles bursts differently; this project uses
fixed windows to make the implementation clear.

Redis shares the counter across application replicas. An in-memory Java map
would give each replica its own independent allowance. INCR and the initial
expiry must run atomically; otherwise a crash between them can leave a counter
without an expiry. A small Lua script makes the operation indivisible in Redis.

The rate-limit response includes how long to wait. If Redis is unavailable,
limited operations return a temporary service error rather than bypassing their
limits. The cache has a different failure policy: recompute balances in PostgreSQL.

A balance cache stores a replaceable calculation. A cache hit saves a database
aggregate. Expense or membership changes invalidate affected entries after the
transaction commits. Invalidating before commit allows another request to cache
the old database state. Even after-commit eviction can race with an already
running read; a short TTL bounds stale results. The system must describe this
eventual-consistency tradeoff rather than promising instantaneous cache accuracy.

## 7. Background jobs and durability

A 202 Accepted upload response means the job was saved, not that parsing is
complete. The client can poll its status. A bounded executor limits worker and
queue growth so uploads cannot allocate unlimited work.

AFTER_COMMIT matters because a worker should not read a job before its upload
transaction is durable. However, an in-process event can disappear during a
crash. The stored PENDING row plus periodic dispatcher gives the worker another
chance without adding a message broker.

The dispatcher and event path may both find the same row. An atomic status claim
ensures only one can process it. started_at measures processing age. Recovery
marks stale jobs FAILED. The worker's final transaction locks that job row and
requires PROCESSING before saving anything, so a job already declared stale
cannot later commit expenses.

Parsing happens outside a long write transaction. The final persistence step
saves the valid expense rows and marks the job complete atomically. Invalid
rows are counted; an unreadable file or a file with no valid rows fails. This version deliberately avoids
automatic retry of partially completed work.

## 8. Docker and Compose

An image is the packaged application and runtime. A container is a running
instance of an image. Docker Compose describes how the app, PostgreSQL, and
Redis run together on the developer's computer.

A multistage Dockerfile uses Node to compile the React assets, a JDK stage to
package them with Java, and a JRE stage to run the result. The final image does
not need a Node server, npm, Maven or application source files.
Running as a non-root user reduces unnecessary privileges. Image layers let
Docker reuse unchanged build steps.

A named PostgreSQL volume survives container replacement. It is not a backup.
Service names such as postgres and redis resolve within the Compose network;
localhost inside the app container refers to that app container, not the host.
Health checks make dependency readiness observable, but the application still
needs appropriate connection failure handling.

## 9. Kubernetes objects in this project

| Object | SplitNest example |
|---|---|
| Namespace | Groups and names SplitNest resources; it does not automatically enforce network/security isolation |
| Pod | Runs an app container; it can be replaced and is not durable identity |
| Deployment | Maintains the desired app replicas and performs rollouts |
| Service | Gives changing app or data-store pods a stable network endpoint |
| ConfigMap | Holds ordinary configuration, such as database host and log settings |
| Secret | Supplies credentials; it must be created outside committed manifests |
| StatefulSet | Gives the PostgreSQL pod a stable identity and volume association |
| PersistentVolumeClaim | Requests storage that survives a PostgreSQL pod replacement |
| Startup probe | Gives Java time to initialize before other probes act |
| Readiness probe | Determines whether a pod should receive Service traffic |
| Liveness probe | Determines whether the application process needs restarting |
| HPA | Adjusts app replicas using observed resource demand |

Secret values are not safe just because their YAML representation is base64.
Avoid committing them and understand that real production clusters also need
access controls and protection for stored secrets.

CPU requests help scheduling and provide the denominator for a CPU-utilization
HPA target. Limits cap consumption. Choose them using measurements. A database
outage should not trigger liveness restart storms across all app replicas.
Readiness depends on PostgreSQL but excludes Redis, allowing balance reads to
continue without their cache while rate-limited operations temporarily return 503.

Two replicas mean two JVMs running the same scheduled method. ShedLock records
exclusive scheduler ownership in PostgreSQL for a bounded time. Database unique
constraints still protect business invariants if a job is repeated.

The local metrics-server insecure-TLS setting accommodates kind's local kubelet
certificates. It is a local lab concession, not a recommended production default.

## 10. CI, image delivery, and GitOps

Continuous integration verifies changes automatically. The pipeline runs tests,
builds the application, scans its image, and publishes verified images. A source
commit SHA tag associates an image with a specific code revision more clearly
than a moving latest tag. Record the actual digest too; tags can be overwritten.

Argo CD watches the desired manifests in Git and reconciles them into the cluster.
It can pull changes from GitHub while running on the laptop; GitHub-hosted runners
do not need inbound access to the local cluster.

The implemented deployment branch separates generated image promotion from protected
application source. Guard promotion against out-of-order builds. Argo self-heal
must also respect the HPA's ownership of replica counts.

A Git revert of the deployment image reference asks Argo to restore that version.
It does not undo SQL migrations or recover lost data. Keep schema changes
compatible with the versions that may run during rollout or rollback.

## 11. Observability and measurement

Logs explain individual events, metrics describe aggregate trends, and health
probes tell the runtime whether to route traffic or restart a process. Structured
JSON logs let tools search request path and relevant user/group context. Never
log passwords, tokens, bank-statement contents, or raw request bodies.

Prometheus collects metrics; Grafana displays queries over them. Counters track
events, timers record duration distributions, and histogram buckets support
latency percentiles. A p95 latency means 95 percent of measured requests completed
at or below that duration for the stated sample; it is not the average.

Use bounded labels such as import status. A label per user or group creates an
unbounded number of metric series. Keep those identifiers in logs instead.

Compare cached and uncached latency under controlled conditions. Keep replicas
fixed for that comparison and show HPA behavior separately. Port-forward is
convenient for Swagger but selects a pod; distribute benchmark traffic through
the in-cluster Service. Report errors and hardware with latency results.

## 12. How to prepare for an interview

For each major decision, practice explaining the problem, chosen design,
alternative, tradeoff, and evidence. Be ready to open the implementation and its
test. Explain a failure case as well as the successful path.

The source now implements a full-stack expense-sharing application. Explain its
real browser/API tests and identify which image a deployment record verified.
A successful Vite workflow does not establish a combined-image rollout.
Explain what would be needed for public production use, such as TLS, managed
backups/restores, database high availability, access controls, and operational
capacity. Those are limits to understand, not additional implementation scope.

Three initial self-checks:

1. Which parts of SplitNest need durable storage, and which could be recomputed?
2. What data would become inconsistent if an expense and its splits used separate transactions?
3. Why is a valid JWT insufficient to authorize a request for any group?

The full unanswered question list is in [interview-prep.md](interview-prep.md).

## 13. Trace the implemented browser interface

Start with [App.tsx](../frontend/src/app/App.tsx), then
[GroupPage.tsx](../frontend/src/features/groups/GroupPage.tsx) and
[ExpenseForm.tsx](../frontend/src/features/expenses/ExpenseForm.tsx). React renders
state as components; an event updates state or sends a request. TypeScript checks
declared shapes during a build, while actual server validation still decides
whether an amount, payer or membership is valid. The form sends the decimal as
text. Only Java/PostgreSQL create authoritative stored splits.

The group workspace reads group details, balances and a page of expenses. After
a mutation, it fetches actual results again. `AbortController`, cleanup flags and
account/group-keyed components prevent old responses updating a different screen.
A hidden Delete button improves the interface; server authorization is what
prevents a forbidden deletion. The UI formats returned INR values rather than
reimplementing the financial algorithm in JavaScript.

Vite serves the development interface and proxies `/api` to Java. It also builds
static files for Spring Boot. React Router handles screen navigation; the Java
allowlist forwards known page refreshes to `index.html` and leaves unknown API,
actuator and static paths as errors. Follow
[SpaController](../src/main/java/com/splitnest/common/config/SpaController.java)
and its tests to see that boundary. Bundled same-origin scripts/styles work with
the UI's restrictive content security policy.

### Why browser authentication needs another boundary

Read [session.ts](../frontend/src/app/session.ts) and
[BrowserAuthController](../src/main/java/com/splitnest/auth/BrowserAuthController.java).
The access JWT lives only in memory; reloading loses it. The browser automatically
sends the HttpOnly refresh cookie to its narrow browser-auth path, allowing the
application to restore access. HttpOnly prevents JavaScript reading that cookie;
it does not stop the browser sending it. Therefore all unsafe browser-auth calls,
including login and bearer-authenticated logout, require the masked CSRF header
and matching cookie. Existing JSON bearer API clients retain their contracts.

The frontend fetches the CSRF token while holding a shared Web Lock, then posts
the browser operation. A local promise merges concurrent refresh requests within
one tab. The Web Lock additionally serializes the shared cookie across tabs.
Without it, two tabs could submit the same refresh secret and trigger the
backend's family-replay defense. Logout refreshes directly under its existing
lock rather than trying to acquire that same lock again.

BroadcastChannel sends only account-change/sign-out notifications. A generation
number invalidates older requests: if `/users/me` finishes after another tab
signed out, the profile must not revive that user. The API client likewise checks
generation before returning results and retries an authentication rejection only
once. It preserves JSON/FormData and cancellation signals. Authentication secrets
never enter browser storage or channel messages.

For a transient server error, the adapter preserves the refresh cookie so the
user can retry. A confirmed invalid/expired token clears it. A rejected logout
with a different owner's token returns 403 without deleting that owner's valid
cookie. The four focused controller failure tests distinguish these outcomes.

### Interface state and test layers

The server's `BigDecimal` values remain JSON numbers for API compatibility. A
browser must also preserve their decimal text: converting a large aggregate such
as `99999999999999.99` directly to JavaScript `Number` can display `.98`.
The API client uses the JSON reviver's original source token for money fields
and passes that exact string to native `Intl.NumberFormat`. Counts remain
numbers; financial arithmetic stays on the server. Current browsers support this
path, and compatibility guards reject unsafe values when exact parsing/formatting
is unavailable. See [source-preserving JSON parsing](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)
and [decimal-string formatting](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/format).

[ImportsPanel](../frontend/src/features/imports/ImportsPanel.tsx) remembers only a
validated job UUID under a user/group key in per-tab sessionStorage. It polls
every two seconds, bounds automatic checks to two minutes and offers a manual
recheck. Changing account/group aborts the old lifecycle. The backend remains
responsible for access and processing even if the browser stops checking.
[BudgetsPanel](../frontend/src/features/budgets/BudgetsPanel.tsx) distinguishes
limits and first-detection alert snapshots from live spending. Saving a limit
does not run the daily job.

Current source and delivery checks are indexed in the verification record.
Component tests isolate
loading, validation, error, permission and timing states; Chromium checks browser
navigation, real cookies, actual financial writes and two-tab sessions. Java
tests establish CSRF, cookie scope, permissions and transactions independently.
The browser suite also has a deterministic large-decimal display fixture;
it does not insert a huge ledger or establish database capacity. Image scanning
and local deployment have separate evidence; build/promotion source includes
the frontend, and eleven GitOps fixtures cover its change profile.

Understanding checks:

1. Why does a TypeScript interface not validate a real HTTP response at runtime?
2. Why is a promise sufficient inside one tab but insufficient for its shared refresh cookie?
3. Which result should be discarded when an account changes while a request is running?
4. Why is a remembered job UUID safe to persist while a refresh token is not?
5. Which test layer can prove a real cookie works, and which additional check proves the image serves the compiled UI?

No paid service or public app host is required. The later guided study phase
begins when the full app is verified and the owner is ready, using synthetic
accounts and statements.
