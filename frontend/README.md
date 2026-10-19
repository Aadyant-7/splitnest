# SplitNest frontend

Status: **approved; implementation not started**. This directory currently
contains preparation notes only. No `package.json`, project dependencies,
runnable UI or frontend test results have been added yet.

The browser app will demonstrate the existing expense-sharing API through real
registration, sign-in, group, expense, import and budget workflows. It is a free
local academic and placement demo. See the [approved plan](../docs/frontend-extension-plan.md)
and [project status](../docs/project-status.md).

## Planned structure

Create these directories as their code is implemented, rather than committing
empty placeholders:

```text
frontend/
├── README.md
├── package.json           # scripts and approved dependencies
├── package-lock.json      # reproducible npm installation
├── index.html
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── app/               # application entry, routing, session coordination
│   ├── features/
│   │   ├── auth/          # registration, sign-in, session restoration
│   │   ├── groups/        # group list, workspace and membership
│   │   ├── expenses/      # expense forms, history and balances
│   │   ├── imports/       # statement upload and job polling
│   │   └── budgets/       # category limits and alert snapshots
│   ├── shared/
│   │   ├── api/           # typed HTTP client and ProblemDetail handling
│   │   └── ui/            # accessible shared controls and states
│   ├── styles/
│   └── test/              # component-test setup and shared fixtures
└── e2e/                   # Playwright workflows and browser-session tests
```

Keep component tests next to the components they verify. Share only code used
across features; keep business-specific code inside its feature. Generated
dependencies, builds, coverage and browser-test artifacts are ignored.

## Build and runtime boundary

React, TypeScript, Vite, React Router and plain CSS are approved. Vitest, React
Testing Library and Playwright verify the interface. A compatible supported
Node.js LTS version, npm and dependency versions will be checked and pinned at
implementation time, then recorded here with exact commands.

During development, Vite will proxy `/api` to Spring Boot. The packaged app will
serve the compiled UI and API from the existing Spring Boot image. Node.js is
needed for build/tests only. The Maven root and Java `src/` stay where they are.

The backend remains authoritative for identity, roles, amounts, splits and job
state. Browser access tokens stay in memory; the planned browser-auth adapter
uses an HttpOnly refresh cookie and CSRF checks. Never place server credentials
in frontend variables or store authentication tokens in browser localStorage.

## Acceptance and documentation

Implement against the real API with explicit loading, empty, validation and
failure states. Verify session restoration, refresh concurrency across tabs,
role boundaries, exact displayed money, real imports and packaged deployment.
No fake charts, simulated authentication or paid service dependencies.

Frontend commands and test counts will replace these preparation notes only
after they exist and have been run. The later learning phase follows the
[from-scratch roadmap](../docs/learning-roadmap.md).
