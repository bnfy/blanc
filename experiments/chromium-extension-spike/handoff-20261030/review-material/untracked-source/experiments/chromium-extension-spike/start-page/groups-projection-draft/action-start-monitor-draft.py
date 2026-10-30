"""Offline, review-only Siso start-event parser; no process control or build."""
from pathlib import Path
import hashlib,re
SOURCE=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/start-page-sunrise-20261029/stage-sunrise-a/restore-build.log')
SOURCE_SHA256='3ca6080080c101c58e2a56b673c45f8a6dda4ee688d0a122e6158987dd27c10b'
EVENT=re.compile(r'^\[(\d+)/(\d+)\]\s+\S+\s+([SFcErfW-])\s+(.+)$')
SUMMARY=re.compile(r'Build Succeeded: (\d+) steps')
class UncertainScope(RuntimeError):pass

def pinned_closure():
 data=SOURCE.read_bytes()
 if hashlib.sha256(data).hexdigest()!=SOURCE_SHA256:raise UncertainScope('closure source changed')
 starts=[]
 for line in data.decode('utf8',errors='strict').splitlines():
  m=EVENT.match(line)
  if m and m.group(3)=='S':starts.append(m.group(4))
 if len(starts)!=6 or len(set(starts))!=6 or starts[0]!='CXX obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o':raise UncertainScope('unexpected closure source')
 return tuple(starts)

class StartObserver:
 def __init__(self,allowlist):
  if len(allowlist)!=6 or len(set(allowlist))!=6:raise ValueError('requires six distinct reviewed action descriptions')
  self.allowlist=frozenset(allowlist);self.required=allowlist[0];self.started=[];self.finished=[];self.pending=b'';self.success=None;self.max_advertised=0
 def line(self,raw):
  try:line=raw.decode('utf8',errors='strict')
  except UnicodeDecodeError as e:raise UncertainScope('invalid UTF-8 in build output') from e
  m=EVENT.match(line)
  if m:
   done,total,status,desc=m.groups();self.max_advertised=max(self.max_advertised,int(total))
   if int(done)>6:raise UncertainScope('completed action count exceeds reviewed closure')
   if status=='S':
    if desc not in self.allowlist or desc in self.started or len(self.started)>=6:raise UncertainScope('unexpected, duplicate or excessive action start: '+desc)
    self.started.append(desc)
   elif status=='F':
    if desc not in self.started or desc in self.finished:raise UncertainScope('finish without matching start: '+desc)
    self.finished.append(desc)
   else:raise UncertainScope('unreviewed Siso event '+status+': '+desc)
   return
  if re.match(r'^\[\d+/\d+\]',line):raise UncertainScope('unrecognized progress record: '+line)
  m=SUMMARY.search(line)
  if m:self.success=int(m.group(1))
 def feed(self,chunk):
  self.pending+=chunk
  parts=self.pending.split(b'\n');self.pending=parts.pop()
  for line in parts:
   if len(line)>1024*1024:raise UncertainScope('unbounded output line')
   self.line(line.rstrip(b'\r'))
  if len(self.pending)>1024*1024:raise UncertainScope('unbounded unterminated output')
 def finish(self):
  if self.pending:self.line(self.pending.rstrip(b'\r'));self.pending=b''
  if self.required not in self.started or self.required not in self.finished or self.success is None or self.success!=len(self.started) or len(self.finished)!=len(self.started) or self.success>6:
   raise UncertainScope('missing, incomplete or mismatched build event record')
  return {'started':self.started,'finished':self.finished,'completed':self.success,'maxAdvertised':self.max_advertised}
