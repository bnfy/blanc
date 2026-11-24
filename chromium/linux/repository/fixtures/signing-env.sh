# shellcheck shell=bash
# Sourced by the offline fixtures with work and linux set by the caller.
mkdir -p "$work/linux/keys" "$work/source-key" "$work/bin"
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
# Provide the owner-host identity to the copied commands, even on Linux CI.
export GIT_CONFIG_GLOBAL="$work/gitconfig"
uuid=00000000-0000-4000-8000-000000000001
git config --global blanc.linuxRepositoryOwnerUUID "$uuid"
system_uname=$(command -v uname)
cat > "$work/bin/uname" <<SH
#!/bin/sh
if [ "\$*" = "-s" ]; then echo Darwin; else exec "$system_uname" "\$@"; fi
SH
cat > "$work/bin/ioreg" <<SH
#!/bin/sh
echo '    "IOPlatformUUID" = "$uuid"'
SH
for cmd in gh wrangler op; do
  cat > "$work/bin/$cmd" <<'SH'
#!/bin/sh
echo "Unexpected service command: $0" >&2
exit 91
SH
done
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH"
