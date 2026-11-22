#!/bin/bash
# Portable approval fixture. GnuPG always signs and verifies the record.
# Use native RPM tools when available, including on the signing Mac.
set -euo pipefail
umask 077
work=$1
linux=$(cd "$(dirname "$0")/../.." && pwd -P)
source "$linux/repository/fixtures/signing-env.sh"

if command -v rpmbuild >/dev/null && command -v rpmsign >/dev/null && command -v rpmkeys >/dev/null; then
  source "$linux/repository/fixtures/build-rpms.sh"
  mkdir "$work/originals"
  for n in 1 2; do build_fixture_rpms "158.0.8127.$n"; done
else
cat > "$work/bin/rpmsign" <<'SH'
#!/bin/bash
set -eu
echo 'fixture RPM signature' >> "${@: -1}"
SH
cat > "$work/bin/rpmkeys" <<'SH'
#!/bin/bash
set -eu
case " $* " in
  *' --import '*) exit 0 ;;
  *' --checksig '*)
    grep -q 'fixture RPM signature' "${@: -1}"
    echo ' Header RSA/SHA256 Signature, key ID 1: OK' ;;
  *) exit 1 ;;
esac
SH
chmod +x "$work/bin/"{rpmsign,rpmkeys}
fi

write_candidates() {
  : > "$work/SHA256SUMS"
  python3 - "$work" "$@" <<'PY'
import hashlib, io, json, sys, tarfile
from pathlib import Path
work = Path(sys.argv[1])
hash_bytes = lambda data: hashlib.sha256(data).hexdigest()
for n in (1, 2):
    for arch, deb, rpm in [('x64', 'amd64', 'x86_64'), ('arm64', 'arm64', 'aarch64')]:
        version = f'158.0.8127.{n}'
        chrome = f'chrome {arch} {version}'.encode()
        packages = {f'blanc-beta_{version}-1_{deb}.deb': b'deb\n', f'blanc-beta-{version}-1.{rpm}.rpm': b'rpm\n'}
        if (work / 'originals').exists():
            for file in packages:
                if file.endswith('.rpm'):
                    packages[file] = (work / 'originals' / file).read_bytes()
        manifest = dict(platform='linux', channel='beta', version=version, build=n, arch=arch, treeCommit='a'*40,
                        id=f'linux-{arch}-{hash_bytes(chrome)[:16]}', exeSha256=hash_bytes(chrome),
                        packages=[dict(file=k, sha256=hash_bytes(v)) for k,v in packages.items()])
        if n == 1 and arch == 'x64' and len(sys.argv) == 3:
            if sys.argv[2] == 'missing':
                del manifest['build']
            else:
                manifest['build'] = json.loads(sys.argv[2])
        name = f'blanc-linux-beta-{arch}-{n}-candidate.tar.gz'
        with tarfile.open(work / name, 'w:gz') as tar:
            files = {'candidate.json': json.dumps(manifest).encode(), 'chrome/chrome': chrome}
            files.update({'packages/'+k:v for k,v in packages.items()})
            for k, v in files.items():
                entry = tarfile.TarInfo(k)
                entry.size = len(v)
                tar.addfile(entry, io.BytesIO(v))
        with (work/'SHA256SUMS').open('a') as sums:
            sums.write(hash_bytes((work/name).read_bytes())+'  '+name+'\n')
PY
}

signer="$work/linux/owner/sign-candidate.command"
for declared in 2 true '"1"' 1.0 missing; do
  write_candidates "$declared"
  if "$signer" beta "$work/SHA256SUMS" "$work" "$work/bad" > "$work/refusal" 2>&1; then
    echo "Approved build 1 with manifest build $declared" >&2; exit 1
  fi
  grep -q 'manifest build' "$work/refusal" || { cat "$work/refusal" >&2; exit 1; }
  [[ ! -e "$work/bad" ]]
done
write_candidates
"$signer" beta "$work/SHA256SUMS" "$work" "$work/approved"
manifest="$work/approved/approved-packages.json"
gpg --batch --dearmor --output "$work/public.gpg" "$work/linux/keys/blanc-repository.asc"
gpgv --keyring "$work/public.gpg" "$manifest.asc" "$manifest"
python3 - "$manifest" <<'PY'
from pathlib import Path
import hashlib, json, sys
manifest = Path(sys.argv[1])
doc = json.loads(manifest.read_bytes())
assert doc['releaseVersion'] == '158.0.8127.2' and len(doc['packages']) == 8
for row in doc['packages']:
    file = manifest.parent / row['file']
    data = file.read_bytes()
    assert (row['size'], row['sha256']) == (len(data), hashlib.sha256(data).hexdigest())
    if file.suffix == '.deb':
        assert data == b'deb\n'
    elif (manifest.parents[1] / 'originals').exists():
        unsigned = manifest.parents[1] / 'originals' / file.name
        assert unsigned.read_bytes() != data
    else:
        assert data == b'rpm\nfixture RPM signature\n'
PY
if [[ -d "$work/originals" ]]; then
  mkdir "$work/checkdb"
  rpmkeys --dbpath "$work/checkdb" --import "$work/linux/keys/blanc-repository.asc"
  unsigned="$work/originals/blanc-beta-158.0.8127.2-1.x86_64.rpm"
  if python3 "$linux/repository/metadata.py" verify-rpm "$unsigned" "$work/checkdb" > "$work/refusal" 2>&1; then
    echo "Verified an unsigned RPM" >&2; exit 1
  fi
  grep -Eiq 'no verified RPM signature|rpmkeys.*checksig.*returned non-zero' "$work/refusal"
fi

# Replace the input approval just after a real verification. The builder must
# reach apt-ftparchive using the verified snapshot and all eight approved files.
cp -R "$work/approved" "$work/mutable"
export REAL_GPGV=$(command -v gpgv)
export MUTABLE_APPROVAL="$work/mutable/approved-packages.json"
cat > "$work/bin/gpgv" <<'SH'
#!/bin/sh
set -eu
"$REAL_GPGV" "$@"
echo '{}' > "$MUTABLE_APPROVAL"
SH
cat > "$work/bin/apt-ftparchive" <<'SH'
#!/bin/sh
echo "Reached fixture apt-ftparchive" >&2
exit 77
SH
chmod +x "$work/bin/"{gpgv,apt-ftparchive}
if "$work/linux/repository/build-metadata.sh" "$work/mutable" "$work/unused" > "$work/refusal" 2>&1; then exit 1; fi
grep -q 'Reached fixture apt-ftparchive' "$work/refusal" || { cat "$work/refusal" >&2; exit 1; }
printf 'changed' >> "$work/blanc-linux-beta-arm64-2-candidate.tar.gz"
if "$signer" beta "$work/SHA256SUMS" "$work" "$work/bad" > "$work/refusal" 2>&1; then exit 1; fi
grep -q 'SHA-256 mismatch' "$work/refusal"
[[ ! -e "$work/bad" ]]
if compgen -G "$work/blanc-sign.*" >/dev/null; then echo 'Temporary signing home survived' >&2; exit 1; fi
