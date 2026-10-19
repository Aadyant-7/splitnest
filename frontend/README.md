# SplitNest frontend

React/TypeScript interface for the real Java expense-sharing API. Registration,
browser sessions, groups, expenses, balances, uploads and budgets are implemented.
See [project status](../docs/project-status.md) and the
[verification record](../docs/evidence/verification.md) for delivery evidence.

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

The prepared Windows workspace has a checksum-verified portable runtime in
ignored `.work/node/`. If the global version is older, select it in the current
PowerShell terminal while in `frontend/`:

```powershell
$taskNode = Join-Path (Get-Location) '../.work/node/node-v24.22.0-win-x64'
if (Test-Path (Join-Path $taskNode 'node.exe')) {
    $env:Path = $taskNode + ';' + $env:Path
}
```

Fresh checkouts should install the pinned Node 24 LTS release from the
[official downloads](https://nodejs.org/en/download). The global runtime was not
changed during implementation.

## Verify

```powershell
npm test
npm run build
npm audit --audit-level=high
$env:PLAYWRIGHT_BROWSERS_PATH = '../.work/playwright-browsers'
npx playwright install chromium
npm run test:e2e
```

The 82 unit/component tests cover forms, permissions, API errors, imports,
cancellation, locking and stale-session races. Eight browser scenarios use real
synthetic accounts for sessions, exact money/history, permissions, imports/budgets,
concurrent tabs, mobile layout, rate limiting and keyboard navigation. They create
demo records in the selected local database. Traces/video are disabled.

To test a running packaged app instead of Vite:

```powershell
$env:SPLITNEST_WEB_URL = 'http://127.0.0.1:8080'
npm run test:e2e
Remove-Item Env:SPLITNEST_WEB_URL
```

On fresh Linux machines, use `npx playwright install --with-deps chromium` for
browser system dependencies. CI does this on its disposable runner.

## Authentication and data boundaries

`app/session.ts` keeps access tokens in memory. Web Locks serializes cookie
rotations across same-origin tabs; BroadcastChannel sends session notifications,
never credentials. Generation checks discard responses from a previous account
or a session that signed out while a request was in flight.

Java owns a host-only HttpOnly, SameSite=Strict refresh cookie and requires CSRF
for browser login/refresh/logout. Public auth omits an expired bearer; logout
also sends a valid access token. Secure cookies default on; local launchers
explicitly allow HTTP. Coordination requires a current browser on localhost.

The backend owns permissions, exact money, stored shares and job results. The UI
sends decimal strings and formats returned amounts without recalculating financial
rules. Import polling is abortable and pauses after two minutes; only a non-secret
user/group-scoped job ID enters sessionStorage. Budget alerts are scheduled
snapshots rather than live spending charts.

Follow the [learning roadmap](../docs/learning-roadmap.md) after complete delivery
verification for the detailed explanation from scratch.
