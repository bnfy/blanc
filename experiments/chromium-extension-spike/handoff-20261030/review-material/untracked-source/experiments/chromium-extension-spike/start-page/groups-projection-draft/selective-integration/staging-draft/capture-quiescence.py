#!/usr/bin/env python3
"""Capture one process snapshot; this is not a lock or proof of future quiescence."""
import json,os,pathlib,re,subprocess,sys,time
ROOT=pathlib.Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
CLONE=ROOT/'workspaces/Chromium158-combined-copy-20261029/src'
EVIDENCE=ROOT/'evidence/combined-workspace-copy-20261029'
def is_writer_command(command):
 # Match executable basenames and quoted shell commands, not substrings such
 # as "sync" or "shopping". It remains a conservative snapshot heuristic.
 cmd=command.lower()
 return bool(re.search(r'''(?:^|[\s/'"])(?:gn|ninja|autoninja|siso|cp|clang|clang\+\+|ld64|ld64\.lld)(?=$|[\s'"])''',cmd) or 'verify-one-shot-copy' in cmd)
def contains_writer(ps_output, self_pid):
 for line in ps_output.splitlines():
  fields=line.strip().split(None,1)
  if len(fields)<2 or fields[0]==str(self_pid):continue
  if is_writer_command(fields[1]):return True
 return False
def main():
 r=subprocess.run(['/bin/ps','-axo','pid=,command='],capture_output=True,text=True,check=True)
 if contains_writer(r.stdout,os.getpid()):raise ValueError('possible copy, verifier or build actor')
 ns=time.time_ns();p=EVIDENCE/('quiescence-%d-%d.json'%(ns,os.getpid()))
 data=json.dumps({'status':'no-matching-writers','scope':str(CLONE),'time_ns':ns,'limitation':'one process snapshot; non-cooperative actors may start afterward'},sort_keys=True).encode()+b'\n'
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  os.write(fd,data);os.fsync(fd)
 finally:os.close(fd)
 print(p)
if __name__=='__main__':
 try:main()
 except Exception as e:print('stopped:',type(e).__name__,e,file=sys.stderr);sys.exit(1)
