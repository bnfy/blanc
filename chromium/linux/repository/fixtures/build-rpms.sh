# shellcheck shell=bash
# Build one pair of fixture RPMs in the test workspace.
build_fixture_rpms() {
  local version=$1 arch
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
mkdir -p %{buildroot}/etc
cp %{buildroot}/usr/share/blanc-fixture/version %{buildroot}/etc/blanc-fixture
%files
/usr/share/blanc-fixture/version
/etc/blanc-fixture
SPEC
  for arch in x86_64 aarch64; do
    rpmbuild --target "$arch" --define "_topdir $work/build" --define '_build_id_links none' \
      --define '_binary_payload w1.gzdio' --define '_smp_build_ncpus 1' -bb "$work/fixture.spec"
    cp "$work/build/RPMS/$arch/blanc-beta-$version-1.$arch.rpm" "$work/originals/"
  done
}
