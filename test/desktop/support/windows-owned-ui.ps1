param([Parameter(Mandatory=$true)][int]$TargetProcessId,
 [Parameter(Mandatory=$true)][ValidateSet('restart','navigate','play','close','inspect')][string]$Action,
 [string]$Url='',
 [ValidatePattern('^\d+\.\d+\.\d+-staging\.\d+$')][string]$ExpectedVersion)
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
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,System.Text.StringBuilder name,int count);
}
'@
function Find-OwnedUpdateDialog($element) {
 $ancestor=$element
 for($depth=0;$ancestor -and $depth -lt 24;$depth++) {
  $handle=[IntPtr]$ancestor.Current.NativeWindowHandle
  if($handle -ne [IntPtr]::Zero) {
   $class=New-Object System.Text.StringBuilder 256
   [void][OwnedWindow]::GetClassName($handle,$class,$class.Capacity)
   [uint32]$owner=0
   [void][OwnedWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
   if($class.ToString() -ceq '#32770' -and $owner -eq $TargetProcessId) {
    $message=$ancestor.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,"Update $ExpectedVersion downloaded"))
    $later=$ancestor.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Later'))
    if($message -and $later) {return $ancestor}
   }
  }
  $ancestor=[System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($ancestor)
 }
 return $null
}
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$TargetProcessId)
$windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
if($windows.Count -eq 0){'waiting';exit 0}
if($Action -eq 'inspect'){
 $items=@()
 foreach($window in $windows){
  $namedElements=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Restart Now'))
  foreach($item in ($namedElements|Select-Object -First 8)){
   $items += @{controlType=$item.Current.ControlType.ProgrammaticName;className=$item.Current.ClassName;nativeHandle=($item.Current.NativeWindowHandle -ne 0);ownedUpdateDialog=($null -ne (Find-OwnedUpdateDialog $item));enabled=$item.Current.IsEnabled;focusable=$item.Current.IsKeyboardFocusable;invoke=$item.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsInvokePatternAvailableProperty)}
  }
 }
 @{windows=$windows.Count;restartElements=@($items|Select-Object -First 8)}|ConvertTo-Json -Depth 4 -Compress
 exit 0
}
if($Action -eq 'restart'){
 if(!$ExpectedVersion){throw 'Expected staged version is required for native Restart Now'}
 foreach($window in $windows){
  $nameCondition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Restart Now')
  $buttons=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$nameCondition)
  if($buttons.Count -ne 1){continue}
  $button=$buttons[0]
  # TaskDialog command links can be exposed as Pane instead of Button by UIA.
  # Require the real OS dialog HWND, owner PID, exact staged-version message
  # and Later choice before interacting; a webpage with this text cannot pass.
  $dialog=Find-OwnedUpdateDialog $button
  if(!$dialog){continue}
  if($button -and $button.Current.IsEnabled){
   $invoke=$null
   if($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)){
    $invoke.Invoke();'clicked';exit 0
   }
   # Act only on this exact command link in the verified native dialog.
   [void][OwnedWindow]::SetForegroundWindow([IntPtr]$dialog.Current.NativeWindowHandle)
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
