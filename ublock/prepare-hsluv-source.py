#!/usr/bin/env python3
"""Retain HSLuv build sources; omit its unrelated publisher encryption helper."""
import gzip
import hashlib
import io
import pathlib
import sys
import tarfile

UPSTREAM_SHA256 = '1691357d86b2bbeead0ad2e31f0c4eeb40497e50bcf0faa8e97e91df50b7f9ee'
OMITTED_PATH = 'hsluv-9cd8574fad8874828b3a8119843527d62d79887a/scripts/secrets.sh'
OMITTED_SHA256 = 'e1ce30a59c2cfda3c4e9b58bfea3cf1ce4d5ae7b374238e2138cc0637880c501'


def prepare(data, upstream_sha=UPSTREAM_SHA256, omitted_path=OMITTED_PATH,
            omitted_sha=OMITTED_SHA256):
    if hashlib.sha256(data).hexdigest() != upstream_sha:
        raise ValueError('upstream source digest mismatch')
    output = io.BytesIO()
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as source:
        members = source.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or names.count(omitted_path) != 1:
            raise ValueError('unexpected source inventory')
        helper = source.extractfile(omitted_path).read()
        if hashlib.sha256(helper).hexdigest() != omitted_sha:
            raise ValueError('publisher helper digest mismatch')
        with tarfile.open(fileobj=output, mode='w', format=tarfile.PAX_FORMAT) as result:
            for member in members:
                if member.name == omitted_path:
                    continue
                if not (member.isfile() or member.isdir()):
                    raise ValueError('unexpected source member type')
                result.addfile(member, source.extractfile(member) if member.isfile() else None)
        # Compare every retained file and directory against authenticated input.
        with tarfile.open(fileobj=io.BytesIO(output.getvalue())) as result:
            if [m.name for m in result] != [n for n in names if n != omitted_path]:
                raise ValueError('prepared source inventory mismatch')
            for member in members:
                if member.name == omitted_path:
                    continue
                retained = result.getmember(member.name)
                if (retained.mode, retained.type, retained.size) != (member.mode, member.type, member.size):
                    raise ValueError('prepared source metadata mismatch')
                if member.isfile() and result.extractfile(retained).read() != source.extractfile(member).read():
                    raise ValueError('prepared source content mismatch')
    return gzip.compress(output.getvalue(), mtime=0)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Usage: python3 ublock/prepare-hsluv-source.py upstream.tar.gz preferred.tar.gz')
    source, destination = map(pathlib.Path, sys.argv[1:])
    prepared = prepare(source.read_bytes())
    destination.write_bytes(prepared)
    print(hashlib.sha256(prepared).hexdigest(), destination)
