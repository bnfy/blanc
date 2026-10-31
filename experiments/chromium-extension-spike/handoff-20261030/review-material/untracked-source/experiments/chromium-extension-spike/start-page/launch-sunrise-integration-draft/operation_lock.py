"""Cooperative locks; cannot exclude external workflows that ignore them."""
from contextlib import contextmanager
from pathlib import Path
import json,os,time

OUT=Path('<local-home>/Projects/BlancChromium158/src/out/BlancPrototype')

@contextmanager
def sunrise_lock():
    lock=OUT/'.blanc-sunrise-transaction.lock'
    os.mkdir(lock)
    (lock/'owner.json').write_text(json.dumps({'pid':os.getpid(),'createdEpoch':time.time()})+'\n')
    try:yield
    except BaseException:
        # A wrapper might still be live after interrupted observation. Keep the
        # lock for a human/agent to inspect rather than start competing work.
        raise
    else:
        (lock/'owner.json').unlink();os.rmdir(lock)

@contextmanager
def build_wrapper_lock():
    # Same atomic directory used by build.mjs. Never remove a preexisting lock.
    lock=OUT/'.blanc-build-guard.lock'
    os.mkdir(lock)
    try:yield
    except BaseException:raise
    else:os.rmdir(lock)
