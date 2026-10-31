#!/usr/bin/env python3
"""Preprocess actual hook source with test flag on/off; no object build."""
from pathlib import Path
import argparse
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--compiler', default='c++')
a = parser.parse_args()
source = (Path(__file__).resolve().parents[1] / 'blanc/browser/ui/blanc_prototype_ui.cc').read_text()
# The check tests conditional boundaries only. Native compilation checks the
# real includes separately; no replacement declaration or object is emitted.
stripped = re.sub(r'^\s*#include[^\n]*$', '', source, flags=re.M)
flags = sorted(set(re.findall(r'BUILDFLAG\((\w+)\)', source)))
for enabled in [False, True]:
    prefix = '#define BUILDFLAG(flag) BUILDFLAG_INTERNAL_##flag()\n'
    for flag in flags:
        prefix += '#define BUILDFLAG_INTERNAL_' + flag + '() ' + ('1' if flag == 'ENABLE_BLANC_TEST_HOOKS' and enabled else '0') + '\n'
    result = subprocess.run([a.compiler, '-E', '-P', '-x', 'c++', '-'], input=prefix + stripped, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stderr)
    for marker in ['"blancTest"', 'HandleTest(', 'test_calls_']:
        if (marker in result.stdout) != enabled:
            raise SystemExit('Incorrect conditional boundary for ' + marker)
    print(('Preview' if enabled else 'Release-disabled') + ' flag preprocessing: passed')
