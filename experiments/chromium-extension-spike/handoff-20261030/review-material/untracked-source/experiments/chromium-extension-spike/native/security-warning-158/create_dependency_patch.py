#!/usr/bin/env python3
"""Prepare only the browser_view security dependencies without changing GN."""
import argparse
import difflib
import hashlib
from pathlib import Path

EXPECTED = '6de7ae41ac1fd86ef0062adc5b4212f89af7009c641f9c013d3821092f5ed69d'

def prepare(data: bytes) -> str:
    if hashlib.sha256(data).hexdigest() != EXPECTED:
        raise ValueError('unexpected durable frame BUILD.gn; refusing to stage')
    text = data.decode('utf-8')
    start = text.index('source_set("browser_view") {')
    end = text.index('\n}\n', start) + 2
    target = text[start:end]
    anchors = [
        ('    "//chrome/browser/sharing_hub",\n', '    "//chrome/browser/ssl",\n'),
        ('    "//components/search",\n', '    "//components/security_state/core",\n'),
    ]
    for before, added in anchors:
        if target.count(before) != 1 or added in target:
            raise ValueError('unexpected browser_view dependency list')
        target = target.replace(before, before + added, 1)
    new = text[:start] + target + text[end:]
    return ''.join(difflib.unified_diff(text.splitlines(keepends=True),
        new.splitlines(keepends=True), fromfile='a/chrome/browser/ui/views/frame/BUILD.gn',
        tofile='b/chrome/browser/ui/views/frame/BUILD.gn'))

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
