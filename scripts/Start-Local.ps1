param([switch]$SkipInfrastructure)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskEnvPath = Join-Path $taskProjectRoot '.env'
if (-not (Test-Path -LiteralPath $taskEnvPath)) {
    throw 'Run scripts/Initialize-Local.ps1 first.'
}
foreach ($taskLine in Get-Content -LiteralPath $taskEnvPath) {
    if ($taskLine -match '^([A-Z_]+)=(.*)$') {
        $taskKey = $Matches[1]
        if ($taskKey -in @('DB_PASSWORD','JWT_SECRET','POSTGRES_PORT','REDIS_PORT')) {
            [Environment]::SetEnvironmentVariable($taskKey, $Matches[2], 'Process')
        }
    }
}
if ([string]::IsNullOrWhiteSpace($env:DB_PASSWORD) -or [string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
    throw '.env must supply DB_PASSWORD and JWT_SECRET.'
}
$taskPostgresPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { '5433' }
$env:DB_URL = "jdbc:postgresql://localhost:$taskPostgresPort/splitnest"
$env:DB_USER = 'splitnest'
# This launcher is only for loopback HTTP development; the server default stays Secure.
$env:BROWSER_COOKIE_SECURE = 'false'
Push-Location $taskProjectRoot
try {
    if (-not $SkipInfrastructure) {
        docker compose up -d --wait postgres redis
        if ($LASTEXITCODE -ne 0) { throw 'Dependency startup failed.' }
    }
    & (Join-Path $taskProjectRoot 'mvnw.cmd') spring-boot:run
    if ($LASTEXITCODE -ne 0) { throw 'Application startup failed.' }
} finally {
    Pop-Location
}
