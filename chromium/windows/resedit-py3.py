"""Runs Chromium's chrome/tools/build/win/resedit.py under Python 3.

Its --update path still names Python 2's `basestring` (in _ConvertInts), so on
Python 3 every update stops with a NameError. This supplies the name as `str`
and runs the script unchanged, with the remaining arguments.

    python resedit-py3.py PATH/TO/resedit.py [resedit arguments]
"""
import builtins
import runpy
import sys

if len(sys.argv) < 2:
    raise SystemExit(__doc__)
builtins.basestring = str
script = sys.argv[1]
sys.argv = [script] + sys.argv[2:]
runpy.run_path(script, run_name='__main__')
