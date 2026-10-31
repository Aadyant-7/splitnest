# SplitNest frontend

React/TypeScript interface for the real Java expense-sharing API. Registration,
browser sessions, groups, expenses, balances, uploads and budgets are implemented.
The public introduction explains the app; signed-in Home, My groups and Guide
provide separate entry points to the existing group workflows.
See the [verification record](../docs/evidence/verification.md) for dated
test and delivery evidence.

## Tools and organization

Node **24.22.0 LTS**, npm **11.19.1**, React **19.3.1**, React Router **8.4.0**,
TypeScript **7.0.2**, Vite **8.3.4**, Vitest **5.0.5** and Playwright **1.64.1**
are pinned in the manifest/lockfile. Node is needed for build/tests only; the
packaged application serves UI assets and API from the existing Spring Boot image.

```text
frontend/
├── package.json / package-lock.json   # exact dependencies and reproducible install
├── .nvmrc / .npmrc                    # runtime and installation policy
├── index.html / public/favicon.svg
├── vite.config.ts / tsconfig.json
├── src/
│   ├── app/                          # routes, shell, coordinated session state
│   ├── features/
│   │   ├── auth/                     # registration and sign-in
│   │   ├── landing/                  # public introduction and product workflow
│   │   ├── home/                     # actual group summaries and task guidance
│   │   ├── guide/                    # in-app instructions and examples
│   │   ├── groups/                   # group list, workspace and membership
│   │   ├── expenses/                 # forms, history, stored shares, balances
│   │   ├── imports/                  # uploads and bounded job polling
│   │   └── budgets/                  # limits and actual alert snapshots
│   ├── shared/api/                   # DTO types, errors, authenticated requests
│   ├── shared/ui/                    # formatting and accessible feedback
│   ├── styles/                       # shared tokens and responsive CSS
│   └── test/                         # component-test setup
└── e2e/                              # real Chromium workflows and fixture helpers
```

Tests are next to their features. Dependencies, generated assets, reports and
local environment files are ignored. No external font, UI service, paid API or
public hosting is needed.

## Develop locally

Run the backend on port 8080 using Compose or the
[host launcher](../docs/setup.md). In another terminal from the repository root:

```powershell
cd frontend
node --version
npm --version
npm ci --ignore-scripts
npm run dev
```

Open [127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/api` to
`http://127.0.0.1:8080`; `SPLITNEST_API_TARGET` can select another local test
backend. Server credentials stay in the backend's ignored `.env`, never frontend
variables. For an ordinary demo, use the packaged app on port 8080 and leave the
development server stopped.

Use the pinned Node 24 LTS release from the
[official downloads](https://nodejs.org/en/download). No global Vite or TypeScript
installation is required; `npm ci` installs the locked project dependencies.

## Verify

```powershell
npm test
npm run build
npm audit --audit-level=high
$env:PLAYWRIGHT_BROWSERS_PATH = '../.work/playwright-browsers'
npx playwright install chromium
npm run test:e2e
```

The unit/component tests cover forms, permissions, API errors, imports,
cancellation, locking, stale-session races and exact monetary display. Browser
journeys use real synthetic accounts for sessions, exact money/history,
permissions, imports/budgets, concurrent tabs, mobile layout, rate limiting,
keyboard navigation and every workspace section at phone/tablet/desktop widths.
They create records in the selected deployment's database. A separate browser case
injects a large-decimal balance response to verify presentation without inserting
a huge ledger; this fixture is not a database-capacity claim. Traces/video are
disabled.

To test a running packaged app instead of Vite:

```powershell
$env:SPLITNEST_WEB_URL = 'http://127.0.0.1:8080'
npm run test:e2e
Remove-Item Env:SPLITNEST_WEB_URL
```

For the free public HTTPS host, warm `/readyz` until it returns JSON with
`status: UP`, then use the explicit latency budget:

```powershell
$env:SPLITNEST_WEB_URL = 'https://splitnest-expenses.onrender.com'
npm run test:e2e -- --config=playwright.public.config.ts
Remove-Item Env:SPLITNEST_WEB_URL
```

The public configuration keeps one worker, zero retries, TLS validation and all
assertions. It allows 180 seconds per scenario and 30 seconds per expectation;
the local/CI defaults remain 60 and 10 seconds. The rate-limit case starts near
the server's minute boundary to fit the same fixed window on slower compute.
These are functional checks, not a public-host load test.

On fresh Linux machines, use `npx playwright install --with-deps chromium` for
browser system dependencies. CI does this on its disposable runner.

## Authentication and data boundaries

The interface uses Home, My groups and Guide in the top navigation, with feature
tabs within each group. Signed-out `/` explains the app; signed-in `/` and `/app`
lead to `/app/home`. Group sections use the `tab` query parameter, for example
`/app/groups/:groupId?tab=imports`. The validated values are `overview`,
`expenses`, `members`, `imports` and `budgets`; unknown values use Overview.
Refresh and browser history restore the selected section. A protected deep link
also retains its section through the sign-in flow.

Home reads the existing group summaries and roles; it does not fetch every
group's financial ledger or synthesize spending totals. Workflow diagrams are
explanatory. The public [wireframes and route map](../docs/interface-design.md)
describe each page's job and responsive reading order.

Shared CSS tokens define colors, spacing and focus states. Expense and
member tables become labeled cards on phones; account identity and actions stay
available. Group tabs support arrow keys, Home and End. Forms connect field errors
to their inputs, preserve pending states and show the result of actual API calls.
The SVG brand and downloadable statement example are local assets.

Imports retain the latest account/group-scoped job UUID and a notification UUID
in sessionStorage. Revisiting the panel reads the actual result from the API,
including completed/failed jobs. These identifiers contain no credentials or
statement rows; there is no client-generated history list. Confirmed access loss
forgets them, while transient failures keep a retry path. Polling is abortable
and pauses after two minutes, with a manual status recheck available.
New expense dates default to the browser's local calendar day; backend timestamp
and budget-schedule rules remain in UTC.

`app/session.ts` keeps access tokens in memory. Web Locks serializes cookie
rotations across same-origin tabs; BroadcastChannel sends session notifications,
never credentials. Generation checks discard responses from a previous account
or a session that signed out while a request was in flight.

Java owns a host-only HttpOnly, SameSite=Strict refresh cookie and requires CSRF
for browser login/refresh/logout. Public auth omits an expired bearer; logout
also sends a valid access token. Secure cookies default on; local launchers
explicitly allow HTTP. Coordination requires a current browser on HTTPS, or
localhost for local HTTP development.

The backend owns permissions, exact money, stored shares and job results. The UI
sends decimal strings and preserves numeric monetary response tokens through
`JSON.parse` reviver source text, then formats those exact strings with native
`Intl.NumberFormat`. It keeps the existing numeric JSON API contract while
avoiding one-paisa errors on large aggregates. No financial rule is recalculated
in the browser. Unsupported older browsers reject an unsafe large amount rather
than silently rounding it. References:
[JSON source preservation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse),
[exact decimal-string formatting](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/format).

Budget alerts are scheduled snapshots rather than live spending charts.

See the [architecture](../docs/architecture.md) and
[source map](../docs/implementation.md) for the session and data-flow details.
