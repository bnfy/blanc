# Unpacks Chromium's mini_installer.exe into the files it carries, and packs
# them back in, so the files inside can be signed before the installer is
# (W1 Part C; chromium/windows/signing.md). Runs on a Windows runner, which
# holds the signing credentials; the build server never does.
#
#   repack-installer.ps1 -Phase unpack -Installer mini_installer.exe -Work DIR
#     -> DIR\Chrome-bin\... and DIR\setup.exe, ready to sign
#   repack-installer.ps1 -Phase pack -Installer mini_installer.exe -Work DIR -Output OUT.exe
#     -> OUT.exe with the (signed) files back in its resources, ready to sign
#
# It mirrors chrome/tools/build/win/create_installer_archive.py: chrome.7z
# stores Chrome-bin uncompressed, chrome.packed.7z holds chrome.7z with LZMA and
# no timestamp, and setup.exe is a cabinet (LZX) named setup.ex_. resedit.py is
# Chromium's own resource editor, staged by the build in signing\mini_installer.
param(
  [Parameter(Mandatory)][ValidateSet('unpack', 'pack')] [string]$Phase,
  [Parameter(Mandatory)] [string]$Installer,
  [Parameter(Mandatory)] [string]$Work,
  [string]$Output,
  [string]$Resedit = (Join-Path (Split-Path $Installer) 'signing\mini_installer\resedit.py'),
  [string]$SevenZip = "${env:ProgramFiles}\7-Zip\7z.exe"
)
$ErrorActionPreference = 'Stop'
function Run([string]$exe, [string[]]$arguments) {
  & $exe @arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$(Split-Path $exe -Leaf) failed ($LASTEXITCODE): $($arguments -join ' ')" }
}
foreach ($tool in $Resedit, $SevenZip, $Installer) { if (-not (Test-Path $tool)) { throw "Missing $tool" } }
$resources = Join-Path $Work 'resources'

if ($Phase -eq 'unpack') {
  if (Test-Path $Work) { throw "$Work exists; use a new folder." }
  New-Item -ItemType Directory $Work | Out-Null
  Run python @($Resedit, '--extract_all', $resources, $Installer)
  # Exactly one B7 (the archive) and one BL (setup) resource, by Chromium's naming.
  $archive = @(Get-ChildItem "$resources\B7" -Recurse -File)
  $setup = @(Get-ChildItem "$resources\BL" -Recurse -File)
  if ($archive.Count -ne 1 -or $setup.Count -ne 1) { throw "Expected one B7 and one BL resource, found $($archive.Count) and $($setup.Count)." }
  $layout = [ordered]@{
    archive = @{ lang = $archive[0].Directory.Name; name = $archive[0].Name }
    setup = @{ lang = $setup[0].Directory.Name; name = $setup[0].Name }
  }
  $layout | ConvertTo-Json | Set-Content (Join-Path $Work 'layout.json')
  Run $SevenZip @('x', '-y', "-o$Work\packed", $archive[0].FullName)
  $inner = @(Get-ChildItem "$Work\packed" -File)
  if ($inner.Count -ne 1) { throw 'chrome.packed.7z should hold one archive.' }
  Run $SevenZip @('x', '-y', "-o$Work", $inner[0].FullName)
  if (-not (Test-Path "$Work\Chrome-bin\chrome.exe")) { throw 'The archive holds no Chrome-bin\chrome.exe.' }
  Run expand.exe @($setup[0].FullName, "$Work\setup.exe")
  $layout | Format-List | Out-Host
  "Unpacked: $((Get-ChildItem "$Work\Chrome-bin" -Recurse -File).Count) files in Chrome-bin, and setup.exe."
} else {
  if (-not $Output) { throw '-Output is required to pack.' }
  $layout = Get-Content (Join-Path $Work 'layout.json') -Raw | ConvertFrom-Json
  $out = Join-Path $Work 'repacked'
  New-Item -ItemType Directory $out -Force | Out-Null
  Push-Location $Work
  try {
    Run $SevenZip @('a', '-t7z', '-mx0', "$out\chrome.7z", 'Chrome-bin')
    Run $SevenZip @('a', '-t7z', '-m0=LZMA', '-mx9', '-mtm-', "$out\chrome.packed.7z", "$out\chrome.7z")
  } finally { Pop-Location }
  Run makecab.exe @('/D', 'CompressionType=LZX', '/V1', '/L', $out, "$Work\setup.exe")
  if (-not (Test-Path "$out\setup.ex_")) { throw 'makecab wrote no setup.ex_.' }
  Run python @($Resedit, '--update', 'B7', $layout.archive.lang, $layout.archive.name, "$out\chrome.packed.7z",
    '--update', 'BL', $layout.setup.lang, $layout.setup.name, "$out\setup.ex_", '--output_file', $Output, $Installer)
  "Packed: $Output ($([math]::Round((Get-Item $Output).Length / 1MB)) MB)"
}
