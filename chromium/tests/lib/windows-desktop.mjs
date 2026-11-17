// Real desktop input and capture on Windows, for checks that synthetic input
// cannot make: whether a click on the window's own buttons, a drag on its
// caption or a pull on its edge does what a person's would. Coordinates are
// screen pixels; the callers run at 100% scale, where they equal DIPs.
import {execFileSync} from 'node:child_process';

const INPUT=`
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class BlancInput {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@
[void][BlancInput]::SetProcessDPIAware()
foreach ($step in ($env:BLANC_INPUT | ConvertFrom-Json)) {
  switch ($step.do) {
    # A real, absolute mouse movement as well as the cursor's position: a
    # window's move or size loop follows input events, not the cursor.
    'move'  {
      [void][BlancInput]::SetCursorPos([int]$step.x, [int]$step.y)
      $nx = [uint32][math]::Round([int]$step.x * 65535 / ([BlancInput]::GetSystemMetrics(0) - 1))
      $ny = [uint32][math]::Round([int]$step.y * 65535 / ([BlancInput]::GetSystemMetrics(1) - 1))
      [BlancInput]::mouse_event(0x8001, $nx, $ny, 0, [UIntPtr]::Zero)
    }
    'down'  { [BlancInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) }
    'up'    { [BlancInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) }
    'key'   { [BlancInput]::keybd_event([byte]$step.vk, 0, 0, [UIntPtr]::Zero); [BlancInput]::keybd_event([byte]$step.vk, 0, 2, [UIntPtr]::Zero) }
    'sleep' { Start-Sleep -Milliseconds ([int]$step.ms) }
  }
}`;
// The steps one gesture is made of; pure, so the gestures can be tested.
const move=(x,y)=>({do:'move',x:Math.round(x),y:Math.round(y)}),sleep=ms=>({do:'sleep',ms});
export const clickSteps=(x,y)=>[move(x,y),sleep(120),{do:'down'},sleep(60),{do:'up'},sleep(120)];
export const doubleClickSteps=(x,y)=>[move(x,y),sleep(120),{do:'down'},{do:'up'},sleep(60),{do:'down'},{do:'up'},sleep(150)];
// A drag moves in small steps: Windows starts a move or size loop only once
// the pointer has travelled, and drops a drag whose first move leaves the band.
export function dragSteps(from,to,count=12){
 const steps=[move(from.x,from.y),sleep(150),{do:'down'},sleep(120)];
 for(let i=1;i<=count;i++){steps.push(move(from.x+(to.x-from.x)*i/count,from.y+(to.y-from.y)*i/count),sleep(25));}
 return [...steps,sleep(150),{do:'up'},sleep(200)];
}
export const keySteps=vk=>[{do:'key',vk},sleep(120)];
export function realInput(steps){
 if(process.platform!=='win32')throw Error('Real desktop input is for Windows');
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',INPUT],{env:{...process.env,BLANC_INPUT:JSON.stringify(steps)},stdio:'ignore',timeout:60000});
}
// The whole desktop, as a person would see it.
export function desktopCapture(file){
 if(process.platform!=='win32')return false;
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($i); $g.CopyFromScreen($b.Left,$b.Top,0,0,$i.Size); $i.Save($env:BLANC_CAPTURE)'],
  {env:{...process.env,BLANC_CAPTURE:file},stdio:'ignore',timeout:30000});
 return true;
}
