#!/usr/bin/env python3
"""Losslessly re-containerize the pinned preferred sources; never execute its scripts."""
import hashlib
import io
import pathlib
import sys
import tarfile
import zipfile

UPSTREAM_SHA256 = {
    '1691357d86b2bbeead0ad2e31f0c4eeb40497e50bcf0faa8e97e91df50b7f9ee',
    '1e0b65e660123f6015d84485d5ec6ac8571eeee957a0cbc0b5ea083850afe7d7',
}


def repack(data, expected_sha256=None):
    allowed = UPSTREAM_SHA256 if expected_sha256 is None else {expected_sha256}
    if hashlib.sha256(data).hexdigest() not in allowed:
        raise ValueError('upstream source digest mismatch')
    output = io.BytesIO()
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        members = archive.getmembers()
        names = set()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED,
                             compresslevel=9) as result:
            for member in sorted(members, key=lambda item: item.name):
                name = member.name
                if (name.startswith('/') or '\\' in name
                        or any(part in ('', '.', '..') for part in name.split('/'))
                        or name in names or not (member.isfile() or member.isdir())):
                    raise ValueError('unsafe or duplicate source member')
                names.add(name)
                info = zipfile.ZipInfo(name + ('/' if member.isdir() else ''),
                                       date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = ((0o040000 if member.isdir() else 0o100000)
                                      | member.mode) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                contents = b'' if member.isdir() else archive.extractfile(member).read()
                result.writestr(info, contents, compresslevel=9)
        # Independently compare every file, directory and permission bit.
        with zipfile.ZipFile(io.BytesIO(output.getvalue())) as result:
            if len(result.infolist()) != len(members):
                raise ValueError('source inventory mismatch')
            for member in members:
                name = member.name + ('/' if member.isdir() else '')
                item = result.getinfo(name)
                expected = b'' if member.isdir() else archive.extractfile(member).read()
                if (result.read(item) != expected
                        or (item.external_attr >> 16) & 0o7777 != member.mode):
                    raise ValueError('source content or permission mismatch')
    return output.getvalue()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Usage: python3 repack-hsluv-source.py upstream.tar.gz output.zip')
    source, destination = map(pathlib.Path, sys.argv[1:])
    result = repack(source.read_bytes())
    destination.write_bytes(result)
    print(hashlib.sha256(result).hexdigest(), destination)
