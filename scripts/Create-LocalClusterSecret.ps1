$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskEnvFile = Join-Path $taskProjectRoot '.env'
if (-not (Test-Path -LiteralPath $taskEnvFile)) { throw 'Initialize the ignored local .env first.' }
$taskSecrets = @{}
foreach ($taskLine in Get-Content -LiteralPath $taskEnvFile) {
    if ($taskLine -match '^(DB_PASSWORD|JWT_SECRET)=(.+)$') { $taskSecrets[$Matches[1]] = $Matches[2] }
}
foreach ($taskKey in @('DB_PASSWORD','JWT_SECRET')) {
    if ([string]::IsNullOrWhiteSpace($taskSecrets[$taskKey])) { throw "Missing $taskKey in .env." }
}
# The context and namespace are fixed to this disposable local lab, never the user's other clusters.
kubectl --context kind-splitnest get namespace splitnest -o name | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Create the splitnest namespace in kind-splitnest first.' }
$taskExisting = kubectl --context kind-splitnest -n splitnest get secret splitnest-secrets --ignore-not-found -o name
if ($LASTEXITCODE -ne 0) { throw 'Cannot check for an existing local Secret.' }
if ($taskExisting) { Write-Output 'Existing splitnest-secrets preserved.'; return }
$taskData = @{}
foreach ($taskKey in @('DB_PASSWORD','JWT_SECRET')) {
    $taskData[$taskKey] = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskSecrets[$taskKey]))
}
$taskSecret = @{
    apiVersion='v1'; kind='Secret'; type='Opaque'
    metadata=@{name='splitnest-secrets'; namespace='splitnest'}
    data=$taskData
}
# Send the object directly to kubectl: no secret manifest is written to disk or printed.
$taskSecret | ConvertTo-Json -Depth 5 -Compress | kubectl --context kind-splitnest create -f -
if ($LASTEXITCODE -ne 0) { throw 'Local Secret creation failed.' }
