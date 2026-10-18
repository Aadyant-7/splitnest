[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot 'Validate-Manifests.ps1'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporary = Join-Path $temporaryRoot ("splitnest-manifest-tests-" + [Guid]::NewGuid().ToString('N'))
$fixtureScript = Join-Path $temporary 'scripts/Validate-Manifests.ps1'
$dashboardPath = Join-Path $temporary 'deploy/monitoring/dashboards/splitnest.json'
$null = New-Item -ItemType Directory -Path (Split-Path $fixtureScript -Parent), (Split-Path $dashboardPath -Parent) -Force
Copy-Item -LiteralPath $validator -Destination $fixtureScript
$originalKubectlFunction = Get-Item -LiteralPath Function:kubectl -ErrorAction SilentlyContinue

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "Manifest validation assertion failed: $Message" }
}

function Reset-ManifestFixture {
    $global:SplitNestManifestCalls = New-Object 'System.Collections.Generic.List[object]'
    $global:SplitNestManifestApplyCount = 0
    $global:SplitNestManifestFailureAt = 0
    $global:LASTEXITCODE = 0
    [IO.File]::WriteAllText($dashboardPath,
            '{"uid":"splitnest-overview","panels":[{},{},{},{},{},{}]}', [Text.UTF8Encoding]::new($false))
}

function global:kubectl {
    $arguments = @($args | ForEach-Object { [string]$_ })
    $pipelineItems = @($input)
    $global:SplitNestManifestCalls.Add([pscustomobject]@{ Arguments = $arguments; Input = $pipelineItems })
    if ($arguments[0] -eq 'kustomize') {
        $global:LASTEXITCODE = 0
        Write-Output 'apiVersion: v1'
        Write-Output 'kind: ConfigMap'
        return
    }
    if ($arguments -contains 'apply') {
        ++$global:SplitNestManifestApplyCount
        $global:LASTEXITCODE = if ($global:SplitNestManifestApplyCount -eq $global:SplitNestManifestFailureAt) { 9 } else { 0 }
        return
    }
    throw 'Unexpected mock kubectl invocation'
}

try {
    Reset-ManifestFixture
    & $fixtureScript 6>$null | Out-Null
    Assert-True ($global:SplitNestManifestCalls.Count -eq 4) 'render-only mode renders every overlay'
    foreach ($call in $global:SplitNestManifestCalls) {
        Assert-True ($call.Arguments[0] -eq 'kustomize') 'render-only mode makes no cluster calls'
        Assert-True (-not ($call.Arguments -contains '--context')) 'rendering stays independent of cluster context'
    }
    Write-Output 'PASS render-only mode makes no cluster calls'

    foreach ($selectedContext in @('kind-splitnest', 'kind-explicit-test')) {
        Reset-ManifestFixture
        if ($selectedContext -eq 'kind-splitnest') {
            & $fixtureScript -Server 6>$null | Out-Null
        } else {
            & $fixtureScript -Server -Context $selectedContext 6>$null | Out-Null
        }
        $applies = @($global:SplitNestManifestCalls | Where-Object { $_.Arguments -contains 'apply' })
        Assert-True ($applies.Count -eq 4) 'server mode validates all overlays'
        foreach ($call in $applies) {
            Assert-True ($call.Arguments[0] -eq '--context' -and $call.Arguments[1] -eq $selectedContext) 'server mode pins the requested context'
            Assert-True ($call.Arguments -contains '--dry-run=server') 'server validation cannot persist resources'
            Assert-True ($call.Input.Count -gt 0) 'server validation receives rendered objects on stdin'
        }
        Write-Output "PASS explicit server context $selectedContext"
    }

    Reset-ManifestFixture
    $global:SplitNestManifestFailureAt = 1
    $failure = $null
    try { & $fixtureScript -Server 6>$null | Out-Null } catch { $failure = $_ }
    Assert-True ($null -ne $failure -and $failure.ToString().Contains('Server validation failed')) 'server failure is reported'
    Assert-True ($global:SplitNestManifestCalls.Count -eq 2) 'server failure aborts before later overlays'
    Write-Output 'PASS nonzero server validation aborts immediately'

    Reset-ManifestFixture
    [IO.File]::WriteAllText($dashboardPath, '{broken', [Text.UTF8Encoding]::new($false))
    $failure = $null
    try { & $fixtureScript 6>$null | Out-Null } catch { $failure = $_ }
    Assert-True ($null -ne $failure) 'malformed dashboard JSON is rejected'
    Assert-True ($global:SplitNestManifestApplyCount -eq 0) 'bad JSON in render-only mode cannot contact a cluster'
    Write-Output 'PASS malformed dashboard JSON is rejected'

    Reset-ManifestFixture
    $failure = $null
    try { & $fixtureScript -Server -Context '' 6>$null | Out-Null } catch { $failure = $_ }
    Assert-True ($null -ne $failure -and $global:SplitNestManifestCalls.Count -eq 0) 'empty context is rejected before kubectl'
    Write-Output 'PASS empty server context is rejected before kubectl'
    Write-Output 'All 6 manifest validation scenarios passed. No real cluster was contacted.'
} finally {
    Remove-Item -LiteralPath Function:kubectl -Force
    if ($null -ne $originalKubectlFunction) {
        Set-Item -LiteralPath Function:global:kubectl -Value $originalKubectlFunction.ScriptBlock
    }
    Remove-Variable -Scope Global -Name SplitNestManifestCalls,SplitNestManifestApplyCount,SplitNestManifestFailureAt -ErrorAction SilentlyContinue
    $resolvedTemporary = [IO.Path]::GetFullPath($temporary)
    if ($resolvedTemporary.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
            (Split-Path -Leaf $resolvedTemporary).StartsWith('splitnest-manifest-tests-')) {
        Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
    } else {
        throw 'Temporary manifest test directory failed its cleanup boundary check.'
    }
}
