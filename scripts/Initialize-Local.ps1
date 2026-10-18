$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskEnvPath = Join-Path $taskProjectRoot '.env'
if (Test-Path -LiteralPath $taskEnvPath) {
    Write-Output 'Existing .env preserved. Ensure DB_PASSWORD and JWT_SECRET are set.'
    return
}
$taskRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
$taskPasswordBytes = New-Object byte[] 24
$taskKeyBytes = New-Object byte[] 32
try {
    $taskRandom.GetBytes($taskPasswordBytes)
    $taskRandom.GetBytes($taskKeyBytes)
} finally { $taskRandom.Dispose() }
$taskPassword = [Convert]::ToBase64String($taskPasswordBytes)
$taskJwtKey = [Convert]::ToBase64String($taskKeyBytes)
[IO.File]::WriteAllLines($taskEnvPath, @(
    '# Local development secrets. This file is ignored by Git.'
    "DB_PASSWORD=$taskPassword"
    "JWT_SECRET=$taskJwtKey"
    'POSTGRES_PORT=5433'
    'REDIS_PORT=6379'
))
Write-Output 'Created ignored .env with random local secrets. Values were not printed.'
