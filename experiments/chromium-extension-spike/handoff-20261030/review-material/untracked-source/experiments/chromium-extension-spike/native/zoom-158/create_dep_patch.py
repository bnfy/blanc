#!/usr/bin/env python3
"""Prepare the explicit Blink dependency for the zoom command patch."""
import argparse
import difflib
import hashlib
from pathlib import Path

EXPECTED = '21853530be27f8a5198138a9b6f371c7d2748b67ba8c2a597a69b3f043835c91'

def prepare(data: bytes) -> str:
    if hashlib.sha256(data).hexdigest() != EXPECTED:
        raise ValueError('unexpected BUILD.gn; refusing to stage')
    text = data.decode('utf-8')
    start = text.index('  source_set("browser_commands_impl") {')
    end = text.index('\nif (is_mac) {\n  source_set("browser_commands_mac")', start)
    part = text[start:end]
    anchor = '      "//printing/buildflags",\n'
    if part.count(anchor) != 1 or '"//third_party/blink/public/common"' in part:
        raise ValueError('unexpected target dependency list')
    replacement = anchor + '      "//third_party/blink/public/common",\n'
    new = text[:start] + part.replace(anchor, replacement, 1) + text[end:]
    return ''.join(difflib.unified_diff(text.splitlines(keepends=True),
        new.splitlines(keepends=True), fromfile='a/chrome/browser/ui/BUILD.gn',
        tofile='b/chrome/browser/ui/BUILD.gn'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('patch', type=Path)
    args = parser.parse_args()
    patch = prepare(args.input.read_bytes())
    with args.patch.open('x', encoding='utf-8') as output:
        output.write(patch)
    print('prepared patch sha256', hashlib.sha256(patch.encode()).hexdigest())

if __name__ == '__main__':
    main()
