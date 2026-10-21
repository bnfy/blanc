import sys,subprocess,time,datetime,json,os
root='/private/tmp/blanc-f12-native-build'
name=sys.argv[1]; argv=sys.argv[2:]
start=time.monotonic(); row={'stage':name,'argv':argv,'cwd':os.getcwd(),'start':datetime.datetime.now(datetime.timezone.utc).isoformat(),'classification':'tranche-2 routine; never Task0 cold'}
with open(root+'/invocations.jsonl','a') as f:f.write(json.dumps(row)+'\n')
with open(root+'/'+name+'.log','w') as log:
 p=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
 for line in p.stdout:log.write(line);log.flush();print(line,end='',flush=True)
 code=p.wait()
row.update(end=datetime.datetime.now(datetime.timezone.utc).isoformat(),seconds=time.monotonic()-start,exit_code=code)
with open(root+'/invocations.jsonl','a') as f:f.write(json.dumps(row)+'\n')
print(json.dumps(row),flush=True);sys.exit(code)
