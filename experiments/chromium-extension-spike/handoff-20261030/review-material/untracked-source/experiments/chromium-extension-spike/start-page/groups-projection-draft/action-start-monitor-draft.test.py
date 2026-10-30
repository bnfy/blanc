"""Replay retained logs and synthetic progress only; no Siso execution."""
from pathlib import Path
import importlib.util
h=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('action_starts',h/'action-start-monitor-draft.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
allow=m.pinned_closure();assert len(allow)==6
raw=m.SOURCE.read_bytes();o=m.StartObserver(allow)
for i in range(0,len(raw),17):o.feed(raw[i:i+17])
r=o.finish();assert r['completed']==6 and r['started']==list(allow) and r['maxAdvertised']==569
# The stopped groups1 run's one CXX start is within the closure; its large
# denominator alone is not a second action start.
o=m.StartObserver(allow)
failed=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/start-page-groups-20261029/build-groups1/build.log')
try:o.feed(failed.read_bytes());raise AssertionError('cancelled action accepted')
except m.UncertainScope as e:assert 'unreviewed Siso event -' in str(e)
assert o.started==[allow[0]] and o.max_advertised==556

def rejected(text):
 observer=m.StartObserver(allow)
 try:observer.feed(text.encode());observer.finish();raise AssertionError('unsafe progress accepted')
 except m.UncertainScope:pass
rejected('[0/999] 1.0s S CXX obj/unexpected.o\n')
rejected(f'[0/999] 1.0s S {allow[0]}\n[0/999] 1.1s S {allow[0]}\n')
rejected(f'[0/999] 1.0s F {allow[0]}\n')
rejected(f'[0/999] 1.0s c {allow[0]}\n')
rejected('[0/9] UNKNOWN STATUS\n')
rejected(f'[0/9] 1.0s S {allow[0]}\nBuild Succeeded: 1 steps\n')
rejected('Build Succeeded: 1 steps\n')
rejected('Build Succeeded: 0 steps\n')
rejected(f'[0/9] 1.0s S {allow[1]}\n[0/9] 1.1s F {allow[1]}\nBuild Succeeded: 1 steps\n')
rejected('[0/9] 1.0s S CXX obj/partial')
o=m.StartObserver(allow);o.feed((('ordinary log line\n'*90000)).encode());o.feed(b'prefix-\xc3');o.feed(b'\xa9\n');o.feed(f'[0/9] 1.0s S {allow[0]}\n[0/9] 1.1s F {allow[0]}\nBuild Succeeded: 1 steps\n'.encode());assert o.finish()['completed']==1
try:m.StartObserver(allow).feed(b'x'*(1024*1024+1));raise AssertionError('unbounded line accepted')
except m.UncertainScope:pass
print('PASS pinned six-action successful log, stopped log, large multiline chunk, split UTF-8, truncated/missing candidate and unsafe event refusal')
