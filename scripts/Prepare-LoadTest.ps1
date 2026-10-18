[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://127.0.0.1:18080',
    [ValidateRange(0, 2000)]
    [int]$SeedExpenseCount = 1000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$parsedUrl = $null
if (-not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref]$parsedUrl) -or
    $parsedUrl.Scheme -notin @('http', 'https') -or $parsedUrl.Query -or $parsedUrl.Fragment) {
    throw 'BaseUrl must be an absolute HTTP(S) application URL without a query or fragment.'
}
$apiBaseUrl = $BaseUrl.TrimEnd('/')
$projectDirectory = Split-Path -Parent $PSScriptRoot
$workDirectory = Join-Path $projectDirectory '.work'
$outputPath = Join-Path $workDirectory 'loadtest.env'

# Check before making API writes: credentials must never land in a tracked path.
& git -C $projectDirectory check-ignore --quiet -- '.work/loadtest.env'
if ($LASTEXITCODE -ne 0) { throw '.work/loadtest.env must be ignored by Git before preparing test data.' }

function Expand-ApiItems {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return }
    # Invoke-RestMethod array enumeration differs between Windows PowerShell and PS7.
    if ($Value -is [Array]) {
        foreach ($item in $Value) { Expand-ApiItems -Value $item }
    } else {
        Write-Output -NoEnumerate $Value
    }
}

function Invoke-ApplicationApi {
    param([string]$Method, [string]$Path, [AllowNull()][object]$Payload = $null, [string]$AccessToken = '')
    $request = @{
        Method = $Method
        Uri = "$apiBaseUrl$Path"
        ContentType = 'application/json'
        TimeoutSec = 30
        ErrorAction = 'Stop'
        Verbose = $false
        Debug = $false
    }
    if ($AccessToken) { $request.Headers = @{ Authorization = "Bearer $AccessToken" } }
    if ($null -ne $Payload) { $request.Body = ConvertTo-Json -InputObject $Payload -Depth 8 -Compress }
    try {
        $response = Invoke-RestMethod @request
        Write-Output -NoEnumerate $response
    } catch {
        # Raw error details can contain a request body. Keep credentials out of console errors.
        $status = 'unavailable'
        $responseProperty = $_.Exception.PSObject.Properties['Response']
        if ($null -ne $responseProperty -and $null -ne $responseProperty.Value) {
            $statusProperty = $responseProperty.Value.PSObject.Properties['StatusCode']
            if ($null -ne $statusProperty) { $status = [string][int]$statusProperty.Value }
        }
        throw "API request failed: $Method $Path (HTTP $status). Request credentials and response details are withheld."
    }
}

function New-SyntheticPassword {
    $bytes = New-Object byte[] 24
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    } finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
        $random.Dispose()
    }
}

$runId = [Guid]::NewGuid().ToString('N')
$users = New-Object 'System.Collections.Generic.List[object]'
for ($index = 1; $index -le 3; $index++) {
    $email = "load-$runId-$index@example.invalid"
    $password = New-SyntheticPassword
    $registered = Invoke-ApplicationApi -Method POST -Path '/api/v1/auth/register' -Payload @{
        email = $email; password = $password; displayName = "Synthetic load user $index"
    }
    $login = Invoke-ApplicationApi -Method POST -Path '/api/v1/auth/login' -Payload @{ email = $email; password = $password }
    $users.Add([pscustomobject]@{ id = [string]$registered.id; email = $email; password = $password; token = [string]$login.accessToken })
}

$group = Invoke-ApplicationApi -Method POST -Path '/api/v1/groups' -AccessToken $users[0].token -Payload @{
    name = "Synthetic load test $($runId.Substring(0, 12))"
}
$groupId = [Guid]::Parse([string]$group.id).ToString()
for ($index = 1; $index -lt $users.Count; $index++) {
    $null = Invoke-ApplicationApi -Method POST -Path "/api/v1/groups/$groupId/members" -AccessToken $users[0].token -Payload @{ email = $users[$index].email }
}

$categories = @('FOOD', 'GROCERIES', 'RENT', 'UTILITIES', 'TRAVEL', 'ENTERTAINMENT', 'SHOPPING', 'OTHER')
$todayUtc = [DateTime]::UtcNow.Date
for ($index = 0; $index -lt $SeedExpenseCount; $index++) {
    # Integer paise converted to decimal avoids binary floating-point test data.
    $amount = [decimal](1000 + (($index * 37) % 90000)) / [decimal]100
    $expenseDate = $todayUtc.AddDays(-($index % 60)).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $null = Invoke-ApplicationApi -Method POST -Path "/api/v1/groups/$groupId/expenses" -AccessToken $users[$index % $users.Count].token -Payload @{
            amount = $amount
            description = "Synthetic expense $($index + 1)"
            category = $categories[$index % $categories.Count]
            expenseDate = $expenseDate
        }
}

$verifiedGroup = Invoke-ApplicationApi -Method GET -Path "/api/v1/groups/$groupId" -AccessToken $users[0].token
$members = @(Expand-ApiItems -Value $verifiedGroup.members)
if ($members.Count -ne 3) { throw 'The synthetic group does not have exactly three current members.' }
$page = Invoke-ApplicationApi -Method GET -Path "/api/v1/groups/$groupId/expenses?size=1" -AccessToken $users[0].token
if ([long]$page.totalElements -ne $SeedExpenseCount) { throw 'The stored expense count differs from the requested seed count.' }
$rawBalances = Invoke-ApplicationApi -Method GET -Path "/api/v1/groups/$groupId/balances" -AccessToken $users[0].token
$balances = @(Expand-ApiItems -Value $rawBalances)
$netTotal = [decimal]0
foreach ($balance in $balances) { $netTotal += [decimal]$balance.netBalance }
if ($balances.Count -ne 3 -or $netTotal -ne 0) { throw 'The synthetic group failed the balance/member invariant check.' }

$credentialRows = @($users | ForEach-Object { [ordered]@{ email = $_.email; password = $_.password } })
$credentialsJson = ConvertTo-Json -InputObject $credentialRows -Depth 4 -Compress
$null = New-Item -ItemType Directory -Path $workDirectory -Force
$temporaryPath = Join-Path $workDirectory ("loadtest.env.tmp." + [Guid]::NewGuid().ToString('N'))
try {
    # BOM-free UTF-8 is accepted by kubectl --from-env-file on PS5 and PS7.
    [IO.File]::WriteAllText($temporaryPath, "GROUP_ID=$groupId`nUSERS_JSON=$credentialsJson`n", [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
} finally {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
}

# Deliberately return only identifiers/counts, never tokens or credentials.
[pscustomobject]@{ GroupId = $groupId; MemberCount = 3; ExpenseCount = $SeedExpenseCount }
