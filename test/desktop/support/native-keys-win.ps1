# Real Windows key and mouse input for browser-shortcuts-smoke.mjs, through
# the OS input queue (keybd_event/mouse_event), so a key release takes the same
# native path a keyboard's does. Electron's sendInputEvent skips that path.
# Reads one command per line on stdin: down <key>, up <key>, sleep <ms>,
# click <x> <y> (physical screen pixels), done (answers "done").
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BlancNativeInput {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[BlancNativeInput]::SetProcessDPIAware() | Out-Null
$keys = @{ ctrl = 0x11; shift = 0x10; tab = 0x09; escape = 0x1B; w = 0x57 }
$KEYUP = 2; $LEFTDOWN = 2; $LEFTUP = 4
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $parts = $line.Trim().Split(' ')
  switch ($parts[0]) {
    'down' { [BlancNativeInput]::keybd_event([byte]$keys[$parts[1]], 0, 0, [UIntPtr]::Zero) }
    'up' { [BlancNativeInput]::keybd_event([byte]$keys[$parts[1]], 0, $KEYUP, [UIntPtr]::Zero) }
    'sleep' { Start-Sleep -Milliseconds ([int]$parts[1]) }
    'click' {
      [BlancNativeInput]::SetCursorPos([int]$parts[1], [int]$parts[2]) | Out-Null
      Start-Sleep -Milliseconds 50
      [BlancNativeInput]::mouse_event($LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
      [BlancNativeInput]::mouse_event($LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
    }
    'done' { [Console]::Out.WriteLine('done'); [Console]::Out.Flush() }
  }
}
