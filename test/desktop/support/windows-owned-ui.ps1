param([Parameter(Mandatory=$true)][int]$TargetProcessId,
 [Parameter(Mandatory=$true)][ValidateSet('restart','navigate','play','close')][string]$Action,
 [string]$Url='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class OwnedWindow {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
}
'@
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$TargetProcessId)
$windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
if($windows.Count -eq 0){'waiting';exit 0}
if($Action -eq 'restart'){
 foreach($window in $windows){
  $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Restart Now')))
  if($button){$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();'clicked';exit 0}
 }
 'waiting';exit 0
}
$handle=[IntPtr]$windows[0].Current.NativeWindowHandle
[void][OwnedWindow]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 150
[uint32]$foregroundPid=0
[void][OwnedWindow]::GetWindowThreadProcessId([OwnedWindow]::GetForegroundWindow(),[ref]$foregroundPid)
if($foregroundPid -ne $TargetProcessId){'waiting';exit 0}
if($Action -eq 'navigate'){
 if($Url -notmatch '^http://127\.0\.0\.1:[0-9]+/$'){throw 'Only the owned loopback probe is allowed'}
 [System.Windows.Forms.SendKeys]::SendWait('^l');[System.Windows.Forms.SendKeys]::SendWait('^a')
 [System.Windows.Forms.SendKeys]::SendWait($Url);[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}elseif($Action -eq 'play'){[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')}
elseif($Action -eq 'close'){[System.Windows.Forms.SendKeys]::SendWait('%{F4}')}
'done'
