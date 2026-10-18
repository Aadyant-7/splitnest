[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$preparer = Join-Path $PSScriptRoot 'Prepare-LoadTest.ps1'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporary = Join-Path $temporaryRoot ("splitnest-prepare-tests-" + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path (Join-Path $temporary 'scripts') -Force
$fixtureScript = Join-Path $temporary 'scripts/Prepare-LoadTest.ps1'
Copy-Item -LiteralPath $preparer -Destination $fixtureScript
$null = & git init -b main $temporary 2>&1
[IO.File]::WriteAllText((Join-Path $temporary '.gitignore'), ".work/`n", [Text.UTF8Encoding]::new($false))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "Load-test preparation assertion failed: $Message" }
}

function Reset-MockApi {
    $global:SplitNestLoadFixtureCalls = New-Object 'System.Collections.Generic.List[object]'
    $global:SplitNestLoadFixtureRegistered = New-Object 'System.Collections.Generic.List[object]'
    $global:SplitNestLoadFixtureMembers = New-Object 'System.Collections.Generic.List[object]'
    $global:SplitNestLoadFixtureExpenses = New-Object 'System.Collections.Generic.List[object]'
    $global:SplitNestLoadFixtureGroupId = [Guid]::NewGuid().ToString()
    $global:SplitNestLoadFixtureFailurePath = ''
    $global:SplitNestLoadFixtureInvalidBalance = $false
}

function Invoke-RestMethod {
    [CmdletBinding()]
    param([string]$Method, [string]$Uri, [string]$ContentType, [int]$TimeoutSec, [string]$Body, [hashtable]$Headers)
    $path = ([Uri]$Uri).PathAndQuery
    $payload = if ($Body) { ConvertFrom-Json -InputObject $Body } else { $null }
    $global:SplitNestLoadFixtureCalls.Add([pscustomobject]@{ Method = $Method; Path = $path; Payload = $payload; Headers = $Headers })
    if ($global:SplitNestLoadFixtureFailurePath -and $path -eq $global:SplitNestLoadFixtureFailurePath) {
        throw [InvalidOperationException]::new('Raw sensitive-body-marker must be withheld')
    }
    if ($Method -eq 'POST' -and $path -eq '/api/v1/auth/register') {
        $row = [pscustomobject]@{ id = [Guid]::NewGuid().ToString(); email = $payload.email; password = $payload.password }
        $global:SplitNestLoadFixtureRegistered.Add($row)
        return [pscustomobject]@{ id = $row.id }
    }
    if ($Method -eq 'POST' -and $path -eq '/api/v1/auth/login') {
        return [pscustomobject]@{ accessToken = 'synthetic-token-marker'; refreshToken = 'synthetic-refresh-marker' }
    }
    if ($Method -eq 'POST' -and $path -eq '/api/v1/groups') {
        $global:SplitNestLoadFixtureMembers.Add([pscustomobject]@{ userId = $global:SplitNestLoadFixtureRegistered[0].id })
        return [pscustomobject]@{ id = $global:SplitNestLoadFixtureGroupId }
    }
    if ($Method -eq 'POST' -and $path -eq "/api/v1/groups/$global:SplitNestLoadFixtureGroupId/members") {
        $match = @($global:SplitNestLoadFixtureRegistered | Where-Object { $_.email -eq $payload.email })
        $global:SplitNestLoadFixtureMembers.Add([pscustomobject]@{ userId = $match[0].id })
        return [pscustomobject]@{ userId = $match[0].id }
    }
    if ($Method -eq 'POST' -and $path -eq "/api/v1/groups/$global:SplitNestLoadFixtureGroupId/expenses") {
        $global:SplitNestLoadFixtureExpenses.Add($payload)
        return [pscustomobject]@{ id = [Guid]::NewGuid().ToString() }
    }
    if ($Method -eq 'GET' -and $path -eq "/api/v1/groups/$global:SplitNestLoadFixtureGroupId") {
        $wrapped = New-Object object[] 1
        $wrapped[0] = $global:SplitNestLoadFixtureMembers.ToArray()
        return [pscustomobject]@{ members = $wrapped }
    }
    if ($Method -eq 'GET' -and $path -eq "/api/v1/groups/$global:SplitNestLoadFixtureGroupId/expenses?size=1") {
        return [pscustomobject]@{ totalElements = $global:SplitNestLoadFixtureExpenses.Count }
    }
    if ($Method -eq 'GET' -and $path -eq "/api/v1/groups/$global:SplitNestLoadFixtureGroupId/balances") {
        $rows = @($global:SplitNestLoadFixtureMembers | ForEach-Object { [pscustomobject]@{ userId = $_.userId; netBalance = 0 } })
        if ($global:SplitNestLoadFixtureInvalidBalance) { $rows[0].netBalance = 1 }
        $wrapped = New-Object object[] 1
        $wrapped[0] = $rows
        Write-Output -NoEnumerate $wrapped
        return
    }
    throw "Unexpected mocked API route: $Method $path"
}

try {
    Reset-MockApi
    $result = @(& $fixtureScript -SeedExpenseCount 8 -BaseUrl 'http://127.0.0.1:18080/')
    Assert-True ($result.Count -eq 1 -and $result[0].ExpenseCount -eq 8 -and $result[0].MemberCount -eq 3) 'output contains only one identifier/count object'
    Assert-True ($global:SplitNestLoadFixtureRegistered.Count -eq 3 -and $global:SplitNestLoadFixtureMembers.Count -eq 3 -and $global:SplitNestLoadFixtureExpenses.Count -eq 8) 'three users, three members and requested expense count'
    $emails = @($global:SplitNestLoadFixtureRegistered | ForEach-Object { $_.email })
    Assert-True (@($emails | Select-Object -Unique).Count -eq 3) 'unique synthetic email addresses'
    Assert-True (@($emails | Where-Object { $_ -notlike '*@example.invalid' }).Count -eq 0) 'reserved synthetic email domain'
    Assert-True (@($global:SplitNestLoadFixtureRegistered | Where-Object { $_.password.Length -lt 8 -or $_.password.Length -gt 72 }).Count -eq 0) 'passwords meet BCrypt input limits'
    Assert-True (@($global:SplitNestLoadFixtureRegistered | ForEach-Object { $_.password } | Select-Object -Unique).Count -eq 3) 'independent random passwords'
    Assert-True (@($global:SplitNestLoadFixtureExpenses | ForEach-Object { $_.category } | Select-Object -Unique).Count -eq 8) 'all categories represented'
    foreach ($expense in $global:SplitNestLoadFixtureExpenses) {
        $decimalAmount = [decimal]$expense.amount
        Assert-True ($decimalAmount -gt 0 -and ($decimalAmount * 100) -eq [decimal]::Truncate($decimalAmount * 100)) 'positive exact-paise amounts'
        Assert-True ([DateTime]::ParseExact($expense.expenseDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture).Date -le [DateTime]::UtcNow.Date) 'UTC date has no future value'
    }
    $outputPath = Join-Path $temporary '.work/loadtest.env'
    $bytes = [IO.File]::ReadAllBytes($outputPath)
    Assert-True ($bytes[0] -eq [byte][char]'G') 'credential env file has no UTF-8 BOM'
    $lines = @(Get-Content -LiteralPath $outputPath)
    Assert-True ($lines.Count -eq 2 -and $lines[0] -eq "GROUP_ID=$global:SplitNestLoadFixtureGroupId" -and $lines[1].StartsWith('USERS_JSON=[')) 'two-line minified Kubernetes env-file format'
    $credentials = @(ConvertFrom-Json -InputObject $lines[1].Substring('USERS_JSON='.Length) | ForEach-Object { $_ })
    Assert-True ($credentials.Count -eq 3) 'three credential rows are retained'
    foreach ($credential in $credentials) {
        Assert-True (@($credential.PSObject.Properties.Name).Count -eq 2) 'credential rows contain email and password only'
        Assert-True ($credential.email -and $credential.password) 'credential fields are populated'
    }
    $printed = ConvertTo-Json -InputObject $result -Compress
    Assert-True ($printed -notmatch 'password|email|synthetic-token-marker|synthetic-refresh-marker') 'console result excludes credentials and tokens'
    Write-Output 'PASS seeded fixture: exact money, categories, UTC dates, synthetic identities, secret-free output and BOM-free env file'

    Reset-MockApi
    $zero = @(& $fixtureScript -SeedExpenseCount 0)
    Assert-True ($zero[0].ExpenseCount -eq 0 -and $global:SplitNestLoadFixtureExpenses.Count -eq 0) 'zero-expense mode'
    Assert-True (@($global:SplitNestLoadFixtureRegistered | Where-Object { $emails -contains $_.email }).Count -eq 0) 'a later run uses new identities'
    Write-Output 'PASS zero-expense fixture and nested PowerShell API array flattening'

    Remove-Item -LiteralPath $outputPath -Force
    Reset-MockApi
    $global:SplitNestLoadFixtureFailurePath = '/api/v1/auth/login'
    $failure = $null
    try { $null = & $fixtureScript -SeedExpenseCount 0 } catch { $failure = $_ }
    Assert-True ($null -ne $failure -and [string]$failure -notmatch 'sensitive-body-marker') 'HTTP failure details are sanitized'
    Assert-True (-not (Test-Path -LiteralPath $outputPath)) 'failed setup does not publish a credential file'
    Write-Output 'PASS sanitized HTTP failure without a partial credential file'

    Reset-MockApi
    $global:SplitNestLoadFixtureInvalidBalance = $true
    $failure = $null
    try { $null = & $fixtureScript -SeedExpenseCount 0 } catch { $failure = $_ }
    Assert-True ($null -ne $failure -and -not (Test-Path -LiteralPath $outputPath)) 'balance invariant failure prevents env publication'
    Write-Output 'PASS inconsistent balance response is rejected'

    foreach ($invalidCount in @(-1, 2001)) {
        Reset-MockApi
        $failure = $null
        try { $null = & $fixtureScript -SeedExpenseCount $invalidCount } catch { $failure = $_ }
        Assert-True ($null -ne $failure -and $global:SplitNestLoadFixtureCalls.Count -eq 0) 'out-of-range seed count is rejected before API requests'
    }
    Reset-MockApi
    $failure = $null
    try { $null = & $fixtureScript -BaseUrl 'file:///tmp/fixture' -SeedExpenseCount 0 } catch { $failure = $_ }
    Assert-True ($null -ne $failure -and $global:SplitNestLoadFixtureCalls.Count -eq 0) 'non-HTTP base URL is rejected before API requests'
    Write-Output 'PASS seed-range and URL validation prevent invalid setup requests'

    [IO.File]::WriteAllText((Join-Path $temporary '.gitignore'), '', [Text.UTF8Encoding]::new($false))
    Reset-MockApi
    $failure = $null
    try { $null = & $fixtureScript -SeedExpenseCount 0 } catch { $failure = $_ }
    Assert-True ($null -ne $failure -and $global:SplitNestLoadFixtureCalls.Count -eq 0) 'Git ignore guard runs before creating users'
    Write-Output 'PASS credential-file Git ignore guard prevents accidental tracking'
    Write-Output 'All 6 load-data preparation scenarios passed. No real API or cluster was contacted.'
} finally {
    Remove-Variable -Scope Global -Name SplitNestLoadFixtureCalls,SplitNestLoadFixtureRegistered,SplitNestLoadFixtureMembers,SplitNestLoadFixtureExpenses,SplitNestLoadFixtureGroupId,SplitNestLoadFixtureFailurePath,SplitNestLoadFixtureInvalidBalance -ErrorAction SilentlyContinue
    $resolvedTemporary = [IO.Path]::GetFullPath($temporary)
    if ($resolvedTemporary.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedTemporary).StartsWith('splitnest-prepare-tests-')) {
        Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
    } else {
        throw 'Temporary test directory failed the cleanup boundary check.'
    }
}

# Expected negative Git checks leave a nonzero native status; report success only after cleanup succeeds.
$global:LASTEXITCODE = 0
