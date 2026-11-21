#!/usr/bin/env python3
"""Derive the Linux installer keyring from the owner's public key."""
import argparse
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not args.source.is_file() or not args.source.stat().st_size:
        parser.exit(1, f"Missing owner's public key {args.source}. Run the owner key ceremony for blanc-repository.asc first.\n")
    armor = args.source.read_bytes().strip()
    if not (armor.startswith(b'-----BEGIN PGP PUBLIC KEY BLOCK-----\n')
            and armor.endswith(b'-----END PGP PUBLIC KEY BLOCK-----')
            and armor.count(b'-----BEGIN') == 1):
        parser.error('expected one ASCII-armored OpenPGP public key')
    with tempfile.TemporaryDirectory() as home:
        gpg = ['gpg', '--no-options', '--homedir', home, '--batch']
        listing = subprocess.check_output(gpg + ['--with-colons', '--show-keys'], input=armor)
        records = [line.split(b':', 1)[0] for line in listing.splitlines()]
        if records.count(b'pub') != 1 or any(r in (b'sec', b'ssb') for r in records):
            parser.error('expected a single public primary key')
        ring = subprocess.check_output(gpg + ['--dearmor'], input=armor)
    if args.output.is_file() and args.output.read_bytes() == ring:
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as temp:
        temp.write(ring)
    output = Path(temp.name)
    output.chmod(0o644)
    output.replace(args.output)


if __name__ == '__main__':
    main()
