# Demonstrate and explain SplitNest

Navigation: [documentation index](README.md) · [project status](project-status.md) ·
[approved frontend plan](frontend-extension-plan.md).

This guide demonstrates the implemented React interface and the preserved Swagger
and HTTP workflows. The strict frontend build, 82 unit/component tests, seven
real-backend Vite/Chromium scenarios and 92 Java tests have passed. Combined-image
delivery verification is a separate gate; check [project status](project-status.md)
for its latest result. This project runs locally for academic and placement use;
public hosting and paid services are outside scope.

Use disposable local accounts and data. Start Docker Desktop, then follow
[setup.md](setup.md) and [docker.md](docker.md) to run either the JVM app with
Compose data stores or the complete Compose stack. The API must be reachable at
`http://localhost:8080` before beginning. Avoid running both app modes on that port.

Run the complete automated suite from the repository root:

```powershell
./mvnw.cmd verify
```

Docker is required for real PostgreSQL/Redis integration tests. Test reports live
under `target/surefire-reports/`. A passing test run does not establish that images
were published, Argo CD reconciled, HPA scaled or a performance improvement occurred.
Use the verification ledger for actual results and [implementation.md](implementation.md)
for the mapping from tests to guarantees.

For an automated real-HTTP smoke demonstration against the running application:

```powershell
./scripts/Smoke-Test.ps1
# A forwarded app Service can use the same script:
./scripts/Smoke-Test.ps1 -BaseUrl 'http://127.0.0.1:8080'
```

The script creates disposable accounts, verifies uneven splits/net zero, denies an
outsider, processes valid/invalid import rows and rejects refresh-token replay.
It prints a safe result summary rather than passwords or tokens. The walkthrough
below adds manual membership, role and operational observations.

## Browser demonstration

For the verified development flow, start the API with `scripts/Start-Local.ps1`,
then run `npm ci --ignore-scripts` and `npm run dev` from `frontend/` using the
versions in [setup.md](setup.md). Open `http://127.0.0.1:5173`. The packaged
application uses the same screens on `http://localhost:8080/`; its runtime
verification is recorded separately. Never run two app processes on 8080.

1. Choose **Create an account**. Register three disposable users with names,
   distinct example emails and locally chosen passwords. Use separate browser
   profiles/private contexts for different users: ordinary tabs share one login.
2. Sign in as the first user. On **Your groups**, enter a name and choose
   **Create group**. The workspace shows that user as **Admin**.
3. Open **Members**, add the other two registered emails, and explain why this
   adds an existing account rather than sending an invitation.
4. Open **Expenses**. Record a `100.00` FOOD expense with today's date and the
   selected payer. Expand **Stored shares** in its row: the actual backend split
   is 33.34/33.33/33.33. The lowest canonical UUID receives the extra paisa.
5. Open **Overview**. Compare paid, share and net balances. Add a second payment
   from another member, then inspect how the stored results change. The group
   total net remains zero; the UI displays the API's values.
6. Use the member's separate profile to open the group. Members can record
   expenses but have no member-management/budget-edit controls; only creators or
   admins see an expense's Delete button. Server permission checks still apply
   if someone manually constructs a forbidden request. An unrelated user opening
   the group's URL receives the server's 404 error.
7. As admin, remove a member. **Overview** retains their historical paid/share
   amounts and marks them as a former member. Their account loses group access.
8. Open **Imports** and upload [mixed.csv](../src/test/resources/statements/mixed.csv).
   Observe the real job status and final imported/invalid counts. The interface
   refreshes expenses/balances after completion. It polls every two seconds for
   up to two minutes, then offers **Check status again**; pausing the browser's
   checks does not cancel the server job. Only the latest pending job ID is
   remembered for that account/group in this tab, not an import-history list.
9. Open **Budgets** and save an admin category limit. Explain the schedule shown
   on screen: daily at 00:00 UTC, strict overspending, one persisted snapshot per
   category/month. Saving a limit does not run a check or display a fabricated
   live spending total. Existing alerts are read from the real API.
10. Reload the page to restore the session through the refresh cookie. Open a
    second ordinary tab, then sign out in one; both return to sign-in. Explain
    the shared Web Lock and generation guard rather than exposing token values.
11. Try the layout at a narrow viewport and navigate with Tab/Enter. Inspect form
    labels, validation messages, loading/empty/error states and the skip link.
    Delete a disposable expense after accepting its confirmation dialog.

The automated browser scenarios create synthetic data and exercise real HTTP
requests. Run from `frontend/` after starting the API:

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Use `SPLITNEST_WEB_URL=http://127.0.0.1:8080` for an already-running packaged app;
without it Playwright starts Vite. See [frontend/README.md](../frontend/README.md)
for configuration and current evidence. Traces/video are disabled because they
can capture login bodies or authentication headers. Share only reviewed synthetic
screenshots, never browser storage/network dumps containing credentials.

## Swagger demonstration

Open [Swagger UI](http://localhost:8080/swagger-ui/index.html).
Access JWTs expire after fifteen minutes; log in again and update **Authorize**
if a learning session takes longer. Serialize refresh calls rather than issuing
them in parallel tabs.

1. Register three users through `POST /api/v1/auth/register`, using distinct
   example email addresses and a locally chosen password. Log in as each user and
   retain their responses privately. Do not put tokens or passwords in screenshots.
2. Click **Authorize** and paste the first user's access token. The UI supplies
   the bearer prefix. `GET /api/v1/users/me` proves the API recognized the caller.
3. Create a group. Its creator is the only `ADMIN`. Add the other registered users
   by email through the members endpoint. Keep the returned group/user UUIDs.
4. Add a 100.00 `FOOD` expense with today's `yyyy-MM-dd` date. Omit `paidBy` to
   use the caller. Inspect the three stored split amounts: 33.34/33.33/33.33.
   The member with the lowest canonical UUID receives the extra paisa.
5. Read balances. The payer's total paid is 100.00. Each total share matches its
   stored split. Add another 30.00 expense as the second user; explain how paid,
   share and net differ. All net balances must sum to zero.
6. Change authorization to an unrelated fourth test user. Group, expense and
   balance reads return 404. Change to an ordinary member and attempt adding a
   member; that admin operation returns 403.
7. Change back to the admin and remove one member. Balances still include that
   person's historical debt with `currentMember: false`. Their token now receives
   404 when querying the group. An old split is never recalculated.
8. Upload a sample CSV or XLSX through the multipart import endpoint. A 202
   response means accepted for background work; it does not mean completed.
   Poll the returned job's GET endpoint until terminal status and inspect counts.
9. Set the current month's `FOOD` budget below spending. The daily UTC scheduler
   creates an alert on its next run; there is no public force-run endpoint.
10. Refresh a login's token A to obtain B, then replay A. Both replayed A and
    subsequent B refresh attempts return 401 because their family was revoked.
    Use a different login family to demonstrate logout. Explain why its previously
    issued access token can still work until expiry.

## Reproducible PowerShell financial scenario

These commands generate temporary demonstration credentials in memory; they do
not print them or store them in the repository. Keep the shell private and do not
enable request/body tracing. Run from the repository root in PowerShell:

```powershell
$demoBase = 'http://localhost:8080/api/v1'
$demoSuffix = [Guid]::NewGuid().ToString('N')
$demoPassword = [Guid]::NewGuid().ToString('N') + 'Aa1!'

function Invoke-DemoApi {
    param([string]$Method, [string]$Path, $Body = $null, [string]$Token)
    $demoHeaders = @{}
    if ($Token) { $demoHeaders.Authorization = "Bearer $Token" }
    $demoArguments = @{ Method = $Method; Uri = "$demoBase$Path"; Headers = $demoHeaders }
    if ($null -ne $Body) {
        $demoArguments.ContentType = 'application/json'
        $demoArguments.Body = $Body | ConvertTo-Json -Depth 8
    }
    Invoke-RestMethod @demoArguments
}

function New-DemoActor {
    param([string]$Name)
    $demoEmail = "$Name-$demoSuffix@example.com"
    $demoUser = Invoke-DemoApi POST '/auth/register' @{
        email = $demoEmail; password = $demoPassword; displayName = $Name
    }
    $demoTokens = Invoke-DemoApi POST '/auth/login' @{
        email = $demoEmail; password = $demoPassword
    }
    [pscustomobject]@{ user = $demoUser; tokens = $demoTokens }
}

function Expect-DemoStatus {
    param([scriptblock]$Call, [int]$Expected)
    try {
        & $Call | Out-Null
        throw "Expected HTTP $Expected but the call succeeded"
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne $Expected) { throw }
        "Observed HTTP $Expected"
    }
}

$demoAdmin = New-DemoActor 'admin'
$demoSecond = New-DemoActor 'member-two'
$demoThird = New-DemoActor 'member-three'
$demoGroup = Invoke-DemoApi POST '/groups' @{ name = 'Resume demo' } $demoAdmin.tokens.accessToken
$demoGroupPath = "/groups/$($demoGroup.id)"
Invoke-DemoApi POST "$demoGroupPath/members" @{ email = $demoSecond.user.email } $demoAdmin.tokens.accessToken | Out-Null
Invoke-DemoApi POST "$demoGroupPath/members" @{ email = $demoThird.user.email } $demoAdmin.tokens.accessToken | Out-Null
$demoToday = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
$demoExpense = Invoke-DemoApi POST "$demoGroupPath/expenses" @{
    amount = 100.00; description = 'Shared dinner'; category = 'FOOD'; expenseDate = $demoToday
} $demoAdmin.tokens.accessToken
$demoExpense.splits | Format-Table userId, shareAmount

$demoBalances = Invoke-DemoApi GET "$demoGroupPath/balances" $null $demoAdmin.tokens.accessToken
$demoBalances | Format-Table userId, currentMember, totalPaid, totalShare, netBalance
$demoNetSum = [decimal]0
foreach ($demoBalance in $demoBalances) { $demoNetSum += [decimal]$demoBalance.netBalance }
if ($demoNetSum -ne 0) { throw 'Balance invariant failed' }

$demoOutsider = New-DemoActor 'outsider'
Expect-DemoStatus { Invoke-DemoApi GET "$demoGroupPath/balances" $null $demoOutsider.tokens.accessToken } 404
Expect-DemoStatus { Invoke-DemoApi POST "$demoGroupPath/members" @{ email = $demoOutsider.user.email } $demoSecond.tokens.accessToken } 403
Invoke-DemoApi DELETE "$demoGroupPath/members/$($demoThird.user.id)" $null $demoAdmin.tokens.accessToken | Out-Null
Invoke-DemoApi GET "$demoGroupPath/balances" $null $demoAdmin.tokens.accessToken |
    Format-Table userId, currentMember, totalPaid, totalShare, netBalance
Expect-DemoStatus { Invoke-DemoApi GET "$demoGroupPath/balances" $null $demoThird.tokens.accessToken } 404

$demoRotated = Invoke-DemoApi POST '/auth/refresh' @{ refreshToken = $demoAdmin.tokens.refreshToken }
Expect-DemoStatus { Invoke-DemoApi POST '/auth/refresh' @{ refreshToken = $demoAdmin.tokens.refreshToken } } 401
Expect-DemoStatus { Invoke-DemoApi POST '/auth/refresh' @{ refreshToken = $demoRotated.refreshToken } } 401
```

The decimal sum assertion uses PowerShell's `decimal` type rather than floating
point. An HTTP error is deliberately expected in the negative scenarios; the
helper prints only the observed status. A repeated run uses new account emails.
Rows remain in the local database so the demonstration can be inspected afterward.

## Statement import contract

For a stable reusable fixture, upload
[mixed.csv](../src/test/resources/statements/mixed.csv) or
[sample.xlsx](../src/test/resources/statements/sample.xlsx) through Swagger.
The mixed CSV contains both valid and invalid rows. Its dates are fixed fixture
dates; edit a copy locally to the current month when demonstrating current budgets.

For a new CSV, use this structure with current dates:

```csv
date,description,amount
2026-10-18,SWIGGY dinner,100.00
2026-10-18,UBER ride,60.00
not-a-date,Invalid date is skipped,20.00
2026-10-18,Negative amount is skipped,-5.00
```

Supported files are UTF-8 CSV, optionally with a BOM, or one-sheet XLSX, up to
5 MiB. Headers are case insensitive. Plain amounts have no currency sign or
thousands separator, at most ten integer/two fractional digits and a positive
value. Text dates use four-digit years 0001–9999. Keywords are case insensitive;
SWIGGY maps to FOOD and UBER to TRAVEL under the committed configuration.

Formulas are not evaluated; rows containing formulas in required cells are
skipped. External links/macros are rejected. Ten thousand rows and bounded ZIP
expansion plus XML depth/cell/style/shared-string limits protect the worker before
POI builds its workbook objects. A completely unreadable file or zero valid rows
produces `FAILED` with a safe explanation. Imported rows are paid by the uploader
and share one current member roster when committed. After the removal above, that
means two members. A removal during parsing is rechecked before any expense saves.

For command-line multipart upload in PowerShell 7, using the variables above:

```powershell
$demoJob = Invoke-RestMethod -Method Post -Uri "$demoBase$demoGroupPath/imports" `
    -Headers @{ Authorization = "Bearer $($demoAdmin.tokens.accessToken)" } `
    -Form @{ file = Get-Item './src/test/resources/statements/mixed.csv' }
do {
    Start-Sleep -Milliseconds 200
    $demoJob = Invoke-DemoApi GET "$demoGroupPath/imports/$($demoJob.id)" $null $demoAdmin.tokens.accessToken
} while ($demoJob.status -in @('PENDING', 'PROCESSING'))
$demoJob | Select-Object id, status, totalRows, importedRows, invalidRows, errorMessage
```

Windows PowerShell 5.1 lacks `Invoke-RestMethod -Form`; use Swagger for this step.
The sample poll is interactive and can be interrupted if the app is stopped.

## Budgets, limiting and operations

Create a budget through `PUT /groups/{id}/budgets/FOOD`, body
`{"monthlyLimit":50.00}`. Read it through GET `/budgets`. The daily 00:00 UTC job
checks the current month by expense date, creates at most one alert per category
and month and snapshots spending/limit. Equal spending does not trigger it.
To observe quickly in a disposable local environment, override
`splitnest.budgets.cron` at startup, for example environment variable
`SPLITNEST_BUDGETS_CRON='*/15 * * * * *'`, then remove the override afterward.
Restarting or changing configuration is distinct from adding a debug API.

Send six login attempts with the same normalized email and IP in one calendar
minute. The first five validly formed requests reach authentication; the sixth
returns 429 with `Retry-After`. Use a fresh test email so earlier demo logins do
not consume its allowance. At the minute boundary the bucket resets. Uploads
have a separate ten-per-hour per-user limit.

Inspect health and metrics privately on the management port:

```powershell
Invoke-RestMethod 'http://localhost:9090/actuator/health/liveness'
Invoke-RestMethod 'http://localhost:9090/actuator/health/readiness'
(Invoke-WebRequest 'http://localhost:9090/actuator/prometheus').Content |
    Select-String 'splitnest_imports_processed_total|splitnest_imports_duration_seconds_bucket|splitnest_budget_alerts_total'
docker compose logs --tail=30 app
```

Logs show ECS JSON with request path, available user/group IDs and status. Do not
dump `.env`, bearer responses or bank-statement contents into demonstration logs.
The metrics names are Prometheus-exported names; the Java meters use dot notation.

For replica/failure experiments follow [kubernetes.md](kubernetes.md). For actual
Prometheus/Grafana setup and controlled cache comparisons follow
[monitoring.md](monitoring.md). Use a k6 Job through the Kubernetes Service when
demonstrating multi-replica traffic. A Service port-forward selects a backing Pod
and cannot prove that load was distributed.

## Delivery evidence and the learning phase

The browser source and real-backend development workflows are implemented and
tested. The combined image, its scan, Compose/kind browser operation and a
frontend-only GitOps promotion need their own execution evidence; source files
or a Vite run alone cannot establish those results. Use
[project status](project-status.md) and the [verification ledger](evidence/verification.md)
for the latest delivery state. The original API walkthrough remains a useful
developer/debugging path. The detailed code/interview walkthrough starts after
the full local app is verified, when the owner is ready.

## A concise interview explanation

This describes the implemented source and its demonstrated browser/API behavior.
Attach deployment claims only to the corresponding evidence record.

> SplitNest is a full-stack expense-sharing application with a React interface
> and a Java modular monolith. I focused
> on exact financial arithmetic and access isolation: PostgreSQL transactions
> save expenses with immutable split snapshots, and SQL aggregates calculate net
> balances. JWTs authenticate requests, rotating refresh families detect replay,
> and Redis supplies shared limiting and bounded-staleness caching. Background
> imports use persisted jobs, atomic claims and recovery rather than depending on
> an in-memory event alone. The repository includes container, Kubernetes,
> GitOps delivery and monitoring, verified against a local Kubernetes cluster,
> with tests and operating documentation. Browser sessions use HttpOnly refresh
> cookies, CSRF checks and coordinated rotation across tabs.

The verification ledger links the successful CI run and exact registry image
reconciled by Argo CD. Describe the controlled performance results with their
dataset and limits; do not treat one local run as a capacity guarantee. The local single PostgreSQL instance and PVC
are a deployment learning setup, not a highly available database or a backup plan.
The original delivery evidence identifies the backend release it tested; the
combined frontend image requires a new record. A source/browser result does not
prove a registry publication or Kubernetes rollout.

After demonstrating, explain without reading:

1. Which exact row receives the extra paisa, and why does the outcome stay deterministic?
2. Which failure can occur between upload commit and async dispatch, and how is it recovered?
3. Which assertions prove API correctness, and which deployment/performance claims need separate evidence?

The twenty broader interview questions remain unanswered in
[interview-prep.md](interview-prep.md).
