$ErrorActionPreference = 'Stop'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$node = Join-Path $env:USERPROFILE 'node-win-arm64\node-v22.19.0-win-arm64\node.exe'
$electron = Join-Path $env:USERPROFILE 'electron-44.1.1-win32-arm64\electron.exe'
$root = '\\Mac\Home\Projects\Blanc Browser'
$smoke = Join-Path $root 'experiments\display-capture-broker\product-smoke\run.cjs'
if (-not (Test-Path $node)) { throw "missing $node" }
if (-not (Test-Path $electron)) { throw "missing $electron" }
if (-not (Test-Path $smoke)) { throw "missing $smoke" }
Unblock-File -Path $electron -ErrorAction SilentlyContinue
$env:BLANC_PRODUCT_SMOKE_ELECTRON = $electron
$env:BLANC_PRODUCT_SMOKE_PORTAL = '0'
Write-Host "node=$node"
Write-Host "electron=$electron"
Set-Location $root
& $node $smoke
Write-Host "smoke-exit=$LASTEXITCODE"
exit $LASTEXITCODE
