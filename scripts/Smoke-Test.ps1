param([string]$BaseUrl = 'http://127.0.0.1:8080')
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$taskRun = [Guid]::NewGuid().ToString('N')
$taskPassword = 'Demo-Only-9!' + [Guid]::NewGuid().ToString('N')

function Invoke-DemoApi {
    param([string]$Method, [string]$Path, $Body, [string]$Token)
    $taskArguments = @{ Method=$Method; Uri=($BaseUrl + $Path); Headers=@{}; TimeoutSec=30 }
    if ($Token) { $taskArguments.Headers.Authorization = 'Bearer ' + $Token }
    if ($null -ne $Body) {
        $taskArguments.ContentType = 'application/json'
        $taskArguments.Body = $Body | ConvertTo-Json -Depth 8 -Compress
    }
    Invoke-RestMethod @taskArguments | Write-Output
}

function Assert-DemoStatus {
    param([string]$Method, [string]$Path, $Body, [string]$Token, [int]$Expected)
    try {
        Invoke-DemoApi $Method $Path $Body $Token | Out-Null
        throw "Expected HTTP $Expected for $Path but the request succeeded."
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne $Expected) { throw }
    }
}

$taskUsers = @()
foreach ($taskName in @('Alice','Bob','Charlie','Outsider')) {
    $taskEmail = "demo-$taskRun-$($taskName.ToLowerInvariant())@example.com"
    $taskUser = Invoke-DemoApi POST '/api/v1/auth/register' @{
        email=$taskEmail; password=$taskPassword; displayName=$taskName
    } ''
    $taskTokens = Invoke-DemoApi POST '/api/v1/auth/login' @{email=$taskEmail; password=$taskPassword} ''
    $taskUsers += @{Id=$taskUser.id; Email=$taskEmail; Access=$taskTokens.accessToken; Refresh=$taskTokens.refreshToken}
}
$taskAdmin = $taskUsers[0]
$taskGroup = Invoke-DemoApi POST '/api/v1/groups' @{name="Demo $taskRun"} $taskAdmin.Access
foreach ($taskMember in $taskUsers[1..2]) {
    Invoke-DemoApi POST "/api/v1/groups/$($taskGroup.id)/members" @{email=$taskMember.Email} $taskAdmin.Access | Out-Null
}
$taskExpense = Invoke-DemoApi POST "/api/v1/groups/$($taskGroup.id)/expenses" @{
    amount='100.00'; description='Three-member grocery demo'; category='GROCERIES'
    expenseDate=[DateTime]::UtcNow.ToString('yyyy-MM-dd')
} $taskAdmin.Access
$taskShares = @($taskExpense.splits | ForEach-Object { [decimal]$_.shareAmount } | Sort-Object)
if ($taskShares.Count -ne 3 -or $taskShares[0] -ne [decimal]33.33 -or
        $taskShares[1] -ne [decimal]33.33 -or $taskShares[2] -ne [decimal]33.34) {
    throw 'Uneven equal split did not preserve exactly 100.00.'
}
$taskBalances = Invoke-DemoApi GET "/api/v1/groups/$($taskGroup.id)/balances" $null $taskAdmin.Access
[decimal]$taskNet = 0
foreach ($taskBalance in $taskBalances) { $taskNet += [decimal]$taskBalance.netBalance }
if ($taskNet -ne 0) { throw 'Net balances do not sum to zero.' }
Assert-DemoStatus GET "/api/v1/groups/$($taskGroup.id)/balances" $null $taskUsers[3].Access 404
Invoke-DemoApi PUT "/api/v1/groups/$($taskGroup.id)/budgets/GROCERIES" @{monthlyLimit='50.00'} $taskAdmin.Access | Out-Null

$taskCsv = "date,description,amount`n$([DateTime]::UtcNow.ToString('yyyy-MM-dd')),SWIGGY dinner,30.00`nbad-date,Rejected row,5.00`n"
$taskClient = [Net.Http.HttpClient]::new()
$taskMultipart = [Net.Http.MultipartFormDataContent]::new()
try {
    $taskClient.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $taskAdmin.Access)
    $taskFile = [Net.Http.ByteArrayContent]::new([Text.Encoding]::UTF8.GetBytes($taskCsv))
    $taskFile.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::new('text/csv')
    $taskMultipart.Add($taskFile, 'file', 'demo.csv')
    $taskUpload = $taskClient.PostAsync("$BaseUrl/api/v1/groups/$($taskGroup.id)/imports", $taskMultipart).GetAwaiter().GetResult()
    if ([int]$taskUpload.StatusCode -ne 202) { throw 'Statement upload was not accepted.' }
    $taskJob = $taskUpload.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
} finally {
    $taskMultipart.Dispose()
    $taskClient.Dispose()
}
$taskDeadline = [DateTime]::UtcNow.AddSeconds(20)
do {
    $taskJob = Invoke-DemoApi GET "/api/v1/groups/$($taskGroup.id)/imports/$($taskJob.id)" $null $taskAdmin.Access
    if ($taskJob.status -in @('COMPLETED','FAILED')) { break }
    Start-Sleep -Milliseconds 100
} while ([DateTime]::UtcNow -lt $taskDeadline)
if ($taskJob.status -ne 'COMPLETED' -or $taskJob.importedRows -ne 1 -or $taskJob.invalidRows -ne 1) {
    throw 'Statement import counts/status did not match the demo.'
}
$taskRotated = Invoke-DemoApi POST '/api/v1/auth/refresh' @{refreshToken=$taskAdmin.Refresh} ''
Assert-DemoStatus POST '/api/v1/auth/refresh' @{refreshToken=$taskAdmin.Refresh} '' 401
Assert-DemoStatus POST '/api/v1/auth/refresh' @{refreshToken=$taskRotated.refreshToken} '' 401

[pscustomobject]@{
    Result='PASS'; GroupId=$taskGroup.id; Users=4
    Shares=($taskShares -join ', '); NetSum=$taskNet
    ImportedRows=$taskJob.importedRows; InvalidRows=$taskJob.invalidRows
    OutsiderStatus=404; RefreshReplayStatus=401
}
