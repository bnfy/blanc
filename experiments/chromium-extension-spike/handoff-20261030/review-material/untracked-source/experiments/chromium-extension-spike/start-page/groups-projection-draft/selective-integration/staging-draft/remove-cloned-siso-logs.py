#!/usr/bin/env python3
"""Remove eleven receipt-bound clone log links only. Never runs during verification."""
import argparse,hashlib,json,os,pathlib,re,stat,subprocess,sys,time
BASE=pathlib.Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
CLONE=BASE/'workspaces/Chromium158-combined-copy-20261029'
SOURCE=pathlib.Path('<local-home>/Projects/BlancChromium158')
COPY=BASE/'evidence/combined-workspace-copy-20261029/receipt.json'
VERIFY=BASE/'evidence/combined-workspace-copy-20261029/verification-v2.json'
PREFIX='/var/folders/4x/r7mr2b5d4q53x8nbf_trvcxw0000gn/T/siso.mac.anthonyjloria.log.INFO.20261029-'
LOGS={'siso.6.INFO':'132610.57086','siso.7.INFO':'132558.57069','siso.INFO':'133924.57971','siso.0.INFO':'133842.57940','siso.1.INFO':'133831.57912','siso.2.INFO':'133813.57859','siso.3.INFO':'133059.57396','siso.4.INFO':'133048.57380','siso.8.INFO':'132534.57021','siso.9.INFO':'131638.56173','siso.5.INFO':'133028.57326'}
EXPECTED={k:PREFIX+v for k,v in LOGS.items()};REL='src/out/BlancPrototype/'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stop(message):raise ValueError(message)
def check_exited(pid):
 if type(pid)!=int or pid<=1:stop('invalid copy PID')
 try:os.kill(pid,0)
 except ProcessLookupError:return
 except PermissionError:stop('copy process state unavailable')
 stop('copy process exists')
def is_writer_command(command):
 # Match executable or argument basename, covering wrappers and all option orders.
 # False positives stop conservatively; this snapshot is not a mutual-exclusion lock.
 command=command.lower()
 return bool(re.search(r'(?:^|[\s/])(?:gn|ninja|autoninja|siso|cp)(?=$|\s)',command) or 'verify-one-shot-copy' in command)
def check_no_writers():
 result=subprocess.run(['/bin/ps','-axo','pid=,command='],capture_output=True,text=True,check=True)
 for line in result.stdout.splitlines():
  fields=line.strip().split(None,1)
  if len(fields)<2 or fields[0]==str(os.getpid()):continue
  if is_writer_command(fields[1]):stop('copy, verifier or build process detected')
def check_receipts(want):
 if not re.fullmatch(r'[0-9a-f]{64}',want):stop('verification SHA required')
 raw=VERIFY.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=want:stop('verification receipt SHA changed')
 v=json.loads(raw);c=json.loads(COPY.read_bytes())
 if v.get('status')!='matched-with-limitations' or c.get('status')!='copied-unverified' or c.get('exitCode')!=0 or c.get('lowSpaceStopped') is not False:stop('copy or verifier result not eligible')
 if v.get('copy_receipt_sha256')!=sha(COPY) or c.get('source')!=str(SOURCE) or c.get('destination')!=str(CLONE):stop('receipt identity mismatch')
 if sorted(v.get('included_entries',[]))!=sorted(c.get('entries',[])):stop('entry set mismatch')
 links=v.get('external_links_pending_review');
 if not isinstance(links,list):stop('missing link evidence')
 selected=[x for x in links if isinstance(x,dict) and isinstance(x.get('path'),str) and re.fullmatch(REL+r'siso(?:\.\d+)?\.INFO',x['path'])]
 got={x['path']:x['target'] for x in selected}
 if len(selected)!=len(EXPECTED) or got!={REL+k:v for k,v in EXPECTED.items()}:stop('verified log-link inventory differs')
 check_exited(c.get('pid'));return v,c

def open_directory(path):
 # Open each absolute component without following symlinks.
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
 try:
  for part in path.parts[1:]:
   new=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=new
  return fd
 except BaseException:os.close(fd);raise

def capture(fd,expected):
 names=set(n for n in os.listdir(fd) if re.fullmatch(r'siso(?:\.\d+)?\.INFO',n))
 if names!=set(expected):stop('log-link names changed')
 result={}
 for name,target in sorted(expected.items()):
  st=os.stat(name,dir_fd=fd,follow_symlinks=False)
  if not stat.S_ISLNK(st.st_mode) or os.readlink(name,dir_fd=fd)!=target:stop('log-link type or target changed: '+name)
  result[name]={'target':target,'device':st.st_dev,'inode':st.st_ino,'mtime_ns':st.st_mtime_ns,'ctime_ns':st.st_ctime_ns}
 return result

def append(journal,data):
 journal.write(json.dumps(data,sort_keys=True)+'\n');journal.flush();os.fsync(journal.fileno())

def apply(fd,journal,expected):
 captured=capture(fd,expected);append(journal,{'event':'preflight','links':captured})
 for name,original in captured.items():
  append(journal,{'event':'pending_unlink','name':name,'identity':original})
  st=os.stat(name,dir_fd=fd,follow_symlinks=False)
  if not stat.S_ISLNK(st.st_mode) or (st.st_dev,st.st_ino,st.st_mtime_ns,st.st_ctime_ns)!=(original['device'],original['inode'],original['mtime_ns'],original['ctime_ns']) or os.readlink(name,dir_fd=fd)!=original['target']:stop('link changed before unlink: '+name)
  os.unlink(name,dir_fd=fd);os.fsync(fd);append(journal,{'event':'unlinked','name':name})
 append(journal,{'event':'complete','count':len(captured)})
 return captured

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--verification-sha',required=True);args=parser.parse_args();check_receipts(args.verification_sha);check_no_writers()
 root=open_directory(CLONE);src=open_directory(SOURCE)
 try:
  st=os.fstat(root);orig=os.fstat(src)
  if st.st_uid!=os.getuid() or stat.S_IMODE(st.st_mode)!=0o700 or (st.st_dev,st.st_ino)==(orig.st_dev,orig.st_ino):stop('clone ownership or identity invalid')
 finally:os.close(root);os.close(src)
 output=open_directory(CLONE/'src/out/BlancPrototype')
 journal=BASE/'evidence/combined-workspace-copy-20261029/siso-log-treatment.jsonl'
 try:
  before=capture(output,EXPECTED);check_no_writers();check_receipts(args.verification_sha)
  fd=os.open(journal,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  parent=open_directory(journal.parent)
  try:os.fsync(parent)
  finally:os.close(parent)
  try:
   with os.fdopen(fd,'w') as f:
    append(f,{'event':'start','verification_sha256':args.verification_sha,'copy_receipt_sha256':sha(COPY),'clone':str(CLONE),'time_ns':time.time_ns(),'qualification':'no-writer assumption; unlink identity check is not atomic against hostile concurrent replacement'})
    if capture(output,EXPECTED)!=before:stop('links changed after preflight')
    apply(output,f,EXPECTED)
  finally:
   parent=open_directory(journal.parent)
   try:os.fsync(parent)
   finally:os.close(parent)
 finally:os.close(output)
 print('removed eleven verified clone-only Siso log symlinks; all other paths require separate review')
if __name__=='__main__':
 try:main()
 except Exception as e:print('stopped:',type(e).__name__,str(e),file=sys.stderr);sys.exit(1)
