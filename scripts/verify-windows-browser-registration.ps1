param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$ProductName = 'Blanc',
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$ProgId = 'BlancURL'
)

$ErrorActionPreference = 'Stop'

function Assert-Equal([object]$Actual, [object]$Expected, [string]$Label) {
  if ($Actual -ne $Expected) {
    throw "$Label mismatch: expected '$Expected', got '$Actual'"
  }
}

$resolvedInstaller = (Resolve-Path $Installer).Path
$clientRelative = "Software\Clients\StartMenuInternet\$ProductName"
$clientKey = "HKCU:\$clientRelative"
$registeredApplications = 'HKCU:\Software\RegisteredApplications'
$progIdKey = "HKCU:\Software\Classes\$ProgId"

$install = Start-Process -FilePath $resolvedInstaller -ArgumentList '/S' -Wait -PassThru
Assert-Equal $install.ExitCode 0 'installer exit code'

if (-not (Test-Path $clientKey)) { throw "browser client key is missing: $clientKey" }
if (-not (Test-Path $progIdKey)) { throw "URL ProgId key is missing: $progIdKey" }

$capabilities = Get-ItemPropertyValue -Path $registeredApplications -Name $ProductName
Assert-Equal $capabilities "$clientRelative\Capabilities" 'RegisteredApplications pointer'

$associations = Get-ItemProperty "$clientKey\Capabilities\URLAssociations"
Assert-Equal $associations.http $ProgId 'HTTP association'
Assert-Equal $associations.https $ProgId 'HTTPS association'
if (Test-Path "$clientKey\Capabilities\FileAssociations") {
  throw 'installer registered unsupported local-file associations'
}

$urlProtocol = (Get-Item $progIdKey).GetValue('URL Protocol')
Assert-Equal $urlProtocol '' 'URL Protocol marker'
$openCommand = (Get-Item "$progIdKey\shell\open\command").GetValue('')
if ($openCommand -notmatch [regex]::Escape("$ProductName.exe") -or $openCommand -notmatch '%1') {
  throw "URL open command is invalid: $openCommand"
}

$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$uninstallEntry = Get-ChildItem $uninstallRoot |
  ForEach-Object { Get-ItemProperty $_.PSPath } |
  Where-Object { $_.DisplayName -eq "$ProductName $Version" } |
  Select-Object -First 1
if (-not $uninstallEntry) { throw "uninstall entry is missing for $ProductName $Version" }
if ($uninstallEntry.QuietUninstallString -notmatch '^"([^"]+)"\s*(.*)$') {
  throw "unexpected QuietUninstallString: $($uninstallEntry.QuietUninstallString)"
}

$uninstaller = $Matches[1]
$uninstallArguments = $Matches[2]
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList $uninstallArguments -Wait -PassThru
Assert-Equal $uninstall.ExitCode 0 'uninstaller exit code'

$deadline = (Get-Date).AddSeconds(30)
do {
  $pointer = Get-ItemPropertyValue -Path $registeredApplications -Name $ProductName -ErrorAction SilentlyContinue
  $registrationRemains = (Test-Path $clientKey) -or (Test-Path $progIdKey) -or ($null -ne $pointer)
  if (-not $registrationRemains) { break }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $deadline)

if ($registrationRemains) {
  throw 'uninstaller left one or more browser registration entries behind'
}

Write-Host 'verify-windows-browser-registration: install and uninstall registration passed'
