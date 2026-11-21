#!/bin/bash
# Synthetic packages and a disposable OpenPGP key. No owner credentials or host package installation.
set -euo pipefail
umask 077
work=$1
linux=$(cd "$(dirname "$0")/../.." && pwd -P)
mkdir -p "$work/linux/keys" "$work/source-key" "$work/originals"
chmod 700 "$work/source-key"
cp -R "$linux/owner" "$work/linux/"
mkdir "$work/linux/repository"
cp "$linux/repository/"{metadata.py,build-metadata.sh,apt-ftparchive.conf} "$work/linux/repository/"
export GNUPGHOME="$work/source-key"
export BLANC_WORK_TMP="$work"
export BLANC_OP="$work/test-op"
export BLANC_TEST_KEY_DIR="$GNUPGHOME"
trap 'gpgconf --homedir "$BLANC_TEST_KEY_DIR" --kill all >/dev/null 2>&1 || true' EXIT
gpg --batch --pinentry-mode loopback --passphrase-fd 0 --quick-gen-key 'Blanc repository fixture' rsa2048 sign 1d <<<fixture
gpg --armor --export > "$work/linux/keys/blanc-repository.asc"
cat > "$BLANC_OP" <<'OP'
#!/bin/bash
set -euo pipefail
[[ "$OP_BIOMETRIC_UNLOCK_ENABLED" == true ]]
case "$1 $2" in
  'vault get') exit 0 ;;
  'document get') exec gpg --homedir "$BLANC_TEST_KEY_DIR" --batch --pinentry-mode loopback --passphrase-fd 0 --armor --export-secret-keys <<<fixture ;;
  'item get')
    [[ "$#" == 12 && "$3" == 'Blanc Linux Repository Signing (passphrase and revocation)' ]] || exit 1
    shift 3
    [[ "$*" == '--vault Dev --account my.1password.com --fields label=password --format json --reveal' ]] || exit 1
    echo '{"value":"fixture"}' ;;
  *) exit 1 ;;
esac
OP
chmod +x "$BLANC_OP"
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
  cat > "$work/fixture.spec" <<SPEC
Name: blanc-beta
Version: $version
Release: 1
Summary: Local package manager fixture
License: MIT
Provides: blanc-browser-fixture = %{version}
Conflicts: blanc-fixture-obsolete
Requires(post): /bin/sh
Recommends: blanc-fixture-language >= 2:1.2-3
%description
Local package manager fixture.
%install
mkdir -p %{buildroot}/usr/share/blanc-fixture
echo %{version} > %{buildroot}/usr/share/blanc-fixture/version
install -Dm644 %{buildroot}/usr/share/blanc-fixture/version %{buildroot}/etc/blanc-fixture
%files
/usr/share/blanc-fixture/version
/etc/blanc-fixture
SPEC
  for arch in x86_64 aarch64; do
    rpmbuild --target "$arch" --define "_topdir $work/build" --define '_build_id_links none' \
      --define '_binary_payload w1.gzdio' --define '_smp_build_ncpus 1' -bb "$work/fixture.spec"
    cp "$work/build/RPMS/$arch/blanc-beta-$version-1.$arch.rpm" "$work/originals/"
  done
done

for n in 2 3; do
  input="$work/input$n"
  mkdir "$input"
  for v in "$((n-1))" "$n"; do cp "$work/originals/"*".8127.$v-1"* "$input/"; done
  "$work/linux/owner/repository-approve.command" "$input" "$work/approved$n"
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

