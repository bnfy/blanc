from pathlib import Path
import subprocess,os,time,json
r=Path(__file__).parent;d=r/'default';d.mkdir(exist_ok=True)
app='/private/tmp/blanc-l7-repair/Blanc Chromium Preview.app'
log=(d/'launch.log').open('w');p=subprocess.Popen([app+'/Contents/MacOS/Blanc Preview Launcher','--user-data-dir='+str(d/'profile'),'--no-first-run'],stdout=log,stderr=log)
try:
 time.sleep(7)
 out={'alive':p.poll() is None,'pid':p.pid,'command':subprocess.check_output(['ps','-p',str(p.pid),'-o','args='],text=True).strip()}
 out['noDebugFlags']=not any(x in out['command'] for x in ['--remote-debugging','--no-sandbox','--disable-web-security','--blanc-ubo-','--blanc-worker-update-log','--blanc-blocker-log','--use-mock-keychain'])
 x=subprocess.run(['lsof','-nP','-a','-p',str(p.pid),'-iTCP','-sTCP:LISTEN'],capture_output=True,text=True)
 out['browserTcpListeners']=x.stdout;out['noBrowserListener']=not x.stdout.strip();assert out['alive'] and out['noDebugFlags'] and out['noBrowserListener']
finally:
 p.terminate()
 try:p.wait(timeout=10)
 except subprocess.TimeoutExpired:p.kill();p.wait()
 log.close()
out['disposableTerminationExit']=p.returncode
(d/'report.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
