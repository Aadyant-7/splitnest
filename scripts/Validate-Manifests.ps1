[CmdletBinding()]
param(
    [switch]$Server,
    [ValidateNotNullOrEmpty()]
    [string]$Context = 'kind-splitnest'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
    foreach ($overlay in @('deploy/base', 'deploy/overlays/local', 'deploy/monitoring', 'loadtest')) {
        $rendered = & kubectl kustomize $overlay
        if ($LASTEXITCODE -ne 0) { throw "Kustomize rendering failed: $overlay" }
        if (-not $rendered) { throw "Kustomize produced no objects: $overlay" }
        Write-Host "Rendered $overlay"
        if ($Server) {
            $rendered | & kubectl --context $Context apply --dry-run=server -f -
            if ($LASTEXITCODE -ne 0) { throw "Server validation failed: $overlay" }
        }
    }
    $dashboard = Get-Content -Raw -LiteralPath 'deploy/monitoring/dashboards/splitnest.json' | ConvertFrom-Json
    if ($dashboard.uid -ne 'splitnest-overview' -or $dashboard.panels.Count -lt 6) {
        throw 'The Grafana dashboard is missing required panels'
    }
    Write-Host 'Grafana dashboard JSON parsed successfully'
    if (-not $Server) { Write-Host 'Rendering passed. No cluster API validation or rollout was performed.' }
} finally { Pop-Location }
