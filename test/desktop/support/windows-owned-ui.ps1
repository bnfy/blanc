param([Parameter(Mandatory=$true)][int]$TargetProcessId,
 [Parameter(Mandatory=$true)][ValidateSet('restart','navigate','play','close','inspect')][string]$Action,
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
if($Action -eq 'inspect'){
 $items=@()
 foreach($window in $windows){
  $namedElements=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Restart Now'))
  foreach($item in ($namedElements|Select-Object -First 8)){
   $items += @{controlType=$item.Current.ControlType.ProgrammaticName;enabled=$item.Current.IsEnabled;focusable=$item.Current.IsKeyboardFocusable;invoke=$item.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsInvokePatternAvailableProperty)}
  }
 }
 @{windows=$windows.Count;restartElements=@($items|Select-Object -First 8)}|ConvertTo-Json -Depth 4 -Compress
 exit 0
}
if($Action -eq 'restart'){
 foreach($window in $windows){
  $nameCondition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Restart Now')
  $typeCondition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
  $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.AndCondition]::new($nameCondition,$typeCondition))
  if($button -and $button.Current.IsEnabled){
   $invoke=$null
   if($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)){
    $invoke.Invoke();'clicked';exit 0
   }
   # Some native providers expose a keyboard-focusable button without Invoke.
   # Act only on this exact button in the owned foreground process.
   [void][OwnedWindow]::SetForegroundWindow([IntPtr]$window.Current.NativeWindowHandle)
   Start-Sleep -Milliseconds 150
   [uint32]$owner=0
   [void][OwnedWindow]::GetWindowThreadProcessId([OwnedWindow]::GetForegroundWindow(),[ref]$owner)
   if($owner -ne $TargetProcessId -or !$button.Current.IsKeyboardFocusable){continue}
   $button.SetFocus()
   if(![System.Windows.Automation.Automation]::Compare($button,[System.Windows.Automation.AutomationElement]::FocusedElement)){continue}
   [System.Windows.Forms.SendKeys]::SendWait(' ');'clicked';exit 0
  }
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
