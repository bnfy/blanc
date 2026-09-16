param(
  [Parameter(Mandatory = $true)]
  [string]$TonePath
)

$player = New-Object Media.SoundPlayer $TonePath
while ($true) {
  $player.PlaySync()
}
