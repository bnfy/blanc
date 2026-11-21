#!/usr/bin/env python3
# Copyright 2026 Bananify Creative. MIT; see LICENSE.
# Refuses to embed a blocker engine bundle whose SHA-256 is not the one pinned
# in bundle_hash.h. The browser checks the same hash again before using it.
import argparse
import hashlib
import re
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--hash-header', required=True)
    parser.add_argument('--stamp', required=True)
    a = parser.parse_args()
    with open(a.hash_header, encoding='utf-8') as f:
        pinned = re.search(r'kBlancBlockerBundleSha256\[\] = "([0-9a-f]{64})"', f.read())
    if not pinned:
        sys.exit('verify_bundle: no pinned hash in bundle_hash.h')
    with open(a.bundle, 'rb') as f:
        actual = hashlib.sha256(f.read()).hexdigest()
    if actual != pinned.group(1):
        sys.exit('verify_bundle: the blocker bundle is not the pinned one')
    with open(a.stamp, 'w', encoding='utf-8') as f:
        f.write(actual + '\n')


if __name__ == '__main__':
    main()
