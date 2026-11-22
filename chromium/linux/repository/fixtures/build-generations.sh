#!/bin/bash
# Synthetic packages and a disposable OpenPGP key. No owner credentials or host package installation.
set -euo pipefail
umask 077
work=$1
linux=$(cd "$(dirname "$0")/../.." && pwd -P)
source "$linux/repository/fixtures/signing-env.sh"
source "$linux/repository/fixtures/build-rpms.sh"
mkdir "$work/originals"
for n in 1 2 3; do
  version="158.0.8127.$n"
  for arch in amd64 arm64; do
    deb="$work/deb-$arch"
    mkdir -p "$deb/DEBIAN" "$deb/usr/share/blanc-fixture"
    chmod 0755 "$deb/DEBIAN"
    cat > "$deb/DEBIAN/control" <<CONTROL
Package: blanc-beta
Version: $version-1
Architecture: $arch
Maintainer: Fixture <fixture@example.invalid>
Description: Local package manager fixture
Depends: libc6
Provides: blanc-browser-fixture
CONTROL
    echo "$version" > "$deb/usr/share/blanc-fixture/version"
    dpkg-deb --root-owner-group --build "$deb" "$work/originals/blanc-beta_${version}-1_${arch}.deb"
  done
  build_fixture_rpms "$version"
done

for n in 2 3; do
  input="$work/input$n"
  mkdir "$input"
  for v in "$((n-1))" "$n"; do cp "$work/originals/"*".8127.$v-1"* "$input/"; done
  sums=$(cd "$input" && sha256sum -- *.deb *.rpm)
  "$work/linux/owner/repository-approve.command" "$input" "$work/approved$n" "$sums"
  "$work/linux/repository/build-metadata.sh" "$work/approved$n" "$work/unsigned$n"
  # The public artifact contains only these paths. Reconstruct both arches from the owner copies.
  artifact="$work/artifact$n"
  (cd "$work/unsigned$n" && tar cf - tree.json deb/dists/stable rpm/stable/{x86_64,aarch64}/repodata) |
    (mkdir "$artifact" && cd "$artifact" && tar xf -)
  "$work/linux/owner/repository-sign.command" "$work/approved$n" "$artifact" "$work/signed$n"
done

# An authentic fixture approval naming an unsigned RPM must still fail on the Mac.
cp "$work/originals/blanc-beta-158.0.8127.3-1.x86_64.rpm" "$work/approved3/"
python3 "$work/linux/repository/metadata.py" approve "$work/approved3"
manifest="$work/approved3/approved-packages.json"
if "$work/linux/repository/build-metadata.sh" "$work/approved3" "$work/bad-signature"; then
  echo "Accepted changed approved-packages.json" >&2; exit 1
fi
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --armor --detach-sign --output "$manifest.asc" "$manifest" <<<fixture
"$work/linux/repository/build-metadata.sh" "$work/approved3" "$work/unsigned-rpm"
if "$work/linux/owner/repository-sign.command" "$work/approved3" "$work/unsigned-rpm" "$work/should-not-sign" > "$work/refusal" 2>&1; then
  echo "Accepted an unsigned RPM" >&2; exit 1
fi
grep -Eiq 'no verified RPM signature|rpmkeys.*checksig.*returned non-zero' "$work/refusal"

