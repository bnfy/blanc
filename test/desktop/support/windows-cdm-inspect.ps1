param([Parameter(Mandatory=$true)][int[]]$ProcessIds)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CdmToken {
 [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll")] static extern bool IsTokenRestricted(IntPtr token);
 [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int size,out int needed);
 [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertSidToStringSid(IntPtr sid,out IntPtr text);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
 public static string Read(int pid) {
  IntPtr process=OpenProcess(0x1000,false,pid),token=IntPtr.Zero,buffer=IntPtr.Zero,text=IntPtr.Zero;
  if(process==IntPtr.Zero)throw new Exception("OpenProcess failed");
  try {
   if(!OpenProcessToken(process,8,out token))throw new Exception("Token query failed");
   int needed;GetTokenInformation(token,25,IntPtr.Zero,0,out needed);buffer=Marshal.AllocHGlobal(needed);
   if(!GetTokenInformation(token,25,buffer,needed,out needed))throw new Exception("Integrity query failed");
   if(!ConvertSidToStringSid(Marshal.ReadIntPtr(buffer),out text))throw new Exception("SID conversion failed");
   bool inJob;if(!IsProcessInJob(process,IntPtr.Zero,out inJob))throw new Exception("Job query failed");
   return (IsTokenRestricted(token)?"true":"false")+"|"+(inJob?"true":"false")+"|"+Marshal.PtrToStringUni(text);
  } finally {if(text!=IntPtr.Zero)LocalFree(text);if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);if(token!=IntPtr.Zero)CloseHandle(token);CloseHandle(process);}
 }
}
'@
$results = @()
foreach ($processId in $ProcessIds) {
 $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
 if (!$process) { continue }
 foreach ($module in $process.Modules) {
  if ($module.ModuleName -ine 'widevinecdm.dll') { continue }
  $command = (Get-CimInstance Win32_Process -Filter "ProcessId=$processId").CommandLine
  $parts = [CdmToken]::Read($processId).Split('|')
  $signature = Get-AuthenticodeSignature $module.FileName
  $results += [pscustomobject]@{
   pid=$processId; binary=$module.FileName; sha256=(Get-FileHash -Algorithm SHA256 $module.FileName).Hash.ToLowerInvariant()
   cdmService=($command -match 'cdm\.mojom\.CdmService'); cdmSandbox=($command -match '--service-sandbox-type=cdm')
   sandboxDisabled=($command -match '--no-sandbox|--disable-seccomp'); restrictedToken=($parts[0] -eq 'true')
   inJob=($parts[1] -eq 'true'); integritySid=$parts[2]; signature=[string]$signature.Status
  }
 }
}
ConvertTo-Json -Depth 4 -InputObject @($results) -Compress
