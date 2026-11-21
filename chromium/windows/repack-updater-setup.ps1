# Unpacks Blanc's updater setup program (UpdaterSetup.exe, the online
# installer) into the files it carries, and packs them back in, so they can be
# signed before the setup is (W3 Task E1; chromium/windows/signing.md).
#
#   repack-updater-setup.ps1 -Phase unpack -Setup UpdaterSetup.exe -Work DIR
#     -> DIR\bin\updater.exe and DIR\bin\uninstall.cmd, ready to sign
#   repack-updater-setup.ps1 -Phase pack -Setup UpdaterSetup.exe -Work DIR -Output OUT.exe
#     -> OUT.exe with the (signed) files back in its resources, ready to sign
#
# It mirrors chrome/updater/win/installer/create_installer_archive.py:
# updater.7z stores bin\ uncompressed, and updater.packed.7z holds updater.7z
# with LZMA and no timestamp, as one B7 resource. resedit.py is Chromium's own
# resource editor, staged by the build in signing\mini_installer.
param(
  [Parameter(Mandatory)][ValidateSet('unpack', 'pack')] [string]$Phase,
  [Parameter(Mandatory)] [string]$Setup,
  [Parameter(Mandatory)] [string]$Work,
  [string]$Output,
  [string]$Resedit = (Join-Path (Split-Path $Setup) 'signing\mini_installer\resedit.py'),
  [string]$SevenZip = "${env:ProgramFiles}\7-Zip\7z.exe"
)
$ErrorActionPreference = 'Stop'
function Run([string]$exe, [string[]]$arguments) {
  & $exe @arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$(Split-Path $exe -Leaf) failed ($LASTEXITCODE): $($arguments -join ' ')" }
}
foreach ($tool in $Resedit, $SevenZip, $Setup) { if (-not (Test-Path $tool)) { throw "Missing $tool" } }
$ReseditPy3 = Join-Path $PSScriptRoot 'resedit-py3.py'
$resources = Join-Path $Work 'resources'

if ($Phase -eq 'unpack') {
  if (Test-Path $Work) { throw "$Work exists; use a new folder." }
  New-Item -ItemType Directory $Work | Out-Null
  Run python @($ReseditPy3, $Resedit, '--extract_all', $resources, $Setup)
  # Exactly one B7 resource (the archive), by Chromium's naming.
  $archive = @(Get-ChildItem "$resources\B7" -Recurse -File)
  if ($archive.Count -ne 1) { throw "Expected one B7 resource, found $($archive.Count)." }
  $layout = [ordered]@{ archive = @{ lang = $archive[0].Directory.Name.TrimStart('#'); name = $archive[0].Name } }
  if ($layout.archive.lang -notmatch '^\d+$') { throw "Unexpected resource language: $($layout.archive.lang)" }
  $layout | ConvertTo-Json | Set-Content (Join-Path $Work 'layout.json')
  Run $SevenZip @('x', '-y', "-o$Work\packed", $archive[0].FullName)
  $inner = @(Get-ChildItem "$Work\packed" -File)
  if ($inner.Count -ne 1) { throw 'updater.packed.7z should hold one archive.' }
  Run $SevenZip @('x', '-y', "-o$Work", $inner[0].FullName)
  if (-not (Test-Path "$Work\bin\updater.exe")) { throw 'The archive holds no bin\updater.exe.' }
  "Unpacked: $((Get-ChildItem "$Work\bin" -Recurse -File).Count) files in bin."
} else {
  if (-not $Output) { throw '-Output is required to pack.' }
  $layout = Get-Content (Join-Path $Work 'layout.json') -Raw | ConvertFrom-Json
  $out = Join-Path $Work 'repacked'
  New-Item -ItemType Directory $out -Force | Out-Null
  Push-Location $Work
  try {
    Run $SevenZip @('a', '-t7z', '-mx0', "$out\updater.7z", 'bin')
    Run $SevenZip @('a', '-t7z', '-m0=LZMA', '-mx9', '-mtm-', "$out\updater.packed.7z", "$out\updater.7z")
  } finally { Pop-Location }
  Run python @($ReseditPy3, $Resedit, '--update', 'B7', $layout.archive.lang, $layout.archive.name, "$out\updater.packed.7z",
    '--output_file', $Output, $Setup)
  "Packed: $Output ($([math]::Round((Get-Item $Output).Length / 1MB)) MB)"
}
