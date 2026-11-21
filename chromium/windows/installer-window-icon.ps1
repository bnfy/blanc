# Reads the online installer's taskbar icon (W3 E1, owner 2026-11-21: "plain
# Sunrise"). Finds the updater's install window once it shows its logo
# (IDC_APP_BITMAP holds a bitmap), reads its ICON_BIG and compares it pixel for
# pixel with IDI_APP loaded from the same updater.exe at the same size.
# Writes icon.png, app-icon.png and icon.json to -Out. Exit 0: read; 2: the
# window or its logo isn't there yet. Read-only: it sends only WM_GETICON and
# STM_GETIMAGE, which change nothing.
#
#   pwsh -NoProfile -File chromium/windows/installer-window-icon.ps1 -Out DIR
param([Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class BlancInstallerIcon {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr LoadImage(IntPtr inst, IntPtr name, uint type, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr LoadLibraryEx(string f, IntPtr r, uint flags);
  [DllImport("kernel32.dll")] public static extern bool FreeLibrary(IntPtr h);
  public static List<IntPtr> VisibleWindows() {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { if (IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
}
'@
# chrome/updater/win/ui/resources/resources.grh
$IDI_APP = 101; $IDC_APP_BITMAP = 2014
$WM_GETICON = 0x7F; $ICON_BIG = [IntPtr]1; $STM_GETIMAGE = 0x173; $IMAGE_BITMAP = [IntPtr]0; $IMAGE_ICON = 1
$LOAD_AS_DATAFILE_AND_IMAGE = 0x22

foreach ($hwnd in [BlancInstallerIcon]::VisibleWindows()) {
  [uint32]$procId = 0
  [void][BlancInstallerIcon]::GetWindowThreadProcessId($hwnd, [ref]$procId)
  $exe = (Get-Process -Id $procId -ErrorAction SilentlyContinue).Path
  if (-not $exe -or (Split-Path $exe -Leaf) -ne 'updater.exe') { continue }
  $logo = [BlancInstallerIcon]::GetDlgItem($hwnd, $IDC_APP_BITMAP)
  if ($logo -eq [IntPtr]::Zero) { continue }
  if ([BlancInstallerIcon]::SendMessage($logo, $STM_GETIMAGE, $IMAGE_BITMAP, [IntPtr]::Zero) -eq [IntPtr]::Zero) { continue }
  # The logo is drawn; UpdateAppLogo sets the window icon in the same call.
  $big = [BlancInstallerIcon]::SendMessage($hwnd, $WM_GETICON, $ICON_BIG, [IntPtr]::Zero)
  if ($big -eq [IntPtr]::Zero) { continue }
  $shown = ([System.Drawing.Icon]::FromHandle($big)).ToBitmap()
  $module = [BlancInstallerIcon]::LoadLibraryEx($exe, [IntPtr]::Zero, $LOAD_AS_DATAFILE_AND_IMAGE)
  if ($module -eq [IntPtr]::Zero) { throw "Could not load $exe as a resource file." }
  try {
    $appHandle = [BlancInstallerIcon]::LoadImage($module, [IntPtr]$IDI_APP, $IMAGE_ICON, $shown.Width, $shown.Height, 0)
    if ($appHandle -eq [IntPtr]::Zero) { throw 'IDI_APP did not load.' }
    $app = ([System.Drawing.Icon]::FromHandle($appHandle)).ToBitmap()
    [void][BlancInstallerIcon]::DestroyIcon($appHandle)
  } finally { [void][BlancInstallerIcon]::FreeLibrary($module) }
  $sum = 0.0
  for ($y = 0; $y -lt $shown.Height; $y++) {
    for ($x = 0; $x -lt $shown.Width; $x++) {
      $a = $shown.GetPixel($x, $y); $b = $app.GetPixel($x, $y)
      $sum += [math]::Abs($a.A - $b.A) + [math]::Abs($a.R - $b.R) + [math]::Abs($a.G - $b.G) + [math]::Abs($a.B - $b.B)
    }
  }
  New-Item -ItemType Directory -Force $Out | Out-Null
  $shown.Save((Join-Path $Out 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $app.Save((Join-Path $Out 'app-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  [ordered]@{
    seen = $true; size = $shown.Width
    meanDifference = [math]::Round($sum / ($shown.Width * $shown.Height * 4), 2)
    process = Split-Path $exe -Leaf
  } | ConvertTo-Json | Set-Content (Join-Path $Out 'icon.json') -Encoding utf8
  exit 0
}
exit 2
