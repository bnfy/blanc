#!/bin/bash
# Run in Terminal on the owner's Mac. BLANC_OP selects the 1Password CLI and
# BLANC_WORK_TMP selects the parent of the two disposable GnuPG homes.
set +x
set -euo pipefail
umask 077
ulimit -c 0

root=$(cd "$(dirname "$0")/../../.." && pwd -P)
public="$root/chromium/linux/keys/blanc-repository.asc"
OP="${BLANC_OP:-op}"
OPACCT=my.1password.com
export OP_BIOMETRIC_UNLOCK_ENABLED=true
SIGNING_TITLE='Blanc Linux Repository Signing'
RECOVERY_TITLE='Blanc Linux Repository Signing (passphrase and revocation)'
work_tmp="${BLANC_WORK_TMP:-/private/tmp}"
make_home=
proof_home=

cleanup() {
  local code=$? dir
  for dir in "$proof_home" "$make_home"; do
    if [[ -n "$dir" ]]; then
      gpgconf --homedir "$dir" --kill all >/dev/null 2>&1 || true
      rm -rf -- "$dir" || code=1
    fi
  done
  if (( code != 0 )); then
    echo "STOPPED. Check the messages above and any items already created in Dev." >&2
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -e "$public" || -L "$public" ]]; then
  echo "The repository public key already exists at $public." >&2
  exit 1
fi
echo "Opening the Dev vault and checking both item titles."
"$OP" vault get Dev --account "$OPACCT" >/dev/null
"$OP" item list --vault Dev --account "$OPACCT" --format json | python3 -c '
import json, sys
items = json.load(sys.stdin)
if not isinstance(items, list):
    sys.exit("Could not read the Dev item list.")
titles = {item["title"] for item in items}
for title in sys.argv[1:]:
    if title in titles:
        sys.exit(f"Dev already contains {title}.")
' "$SIGNING_TITLE" "$RECOVERY_TITLE"

make_home=$(mktemp -d "$work_tmp/blanc-key.XXXXXX")
chmod 700 "$make_home"
proof_home=$(mktemp -d "$work_tmp/blanc-proof.XXXXXX")
chmod 700 "$proof_home"
export GNUPGHOME="$make_home"
export TMPDIR="$make_home"
export TZ=UTC
unset passphrase confirmation
IFS= read -r -s -p 'Repository signing passphrase: ' passphrase
echo
IFS= read -r -s -p 'Repeat the passphrase: ' confirmation
echo
if [[ -z "$passphrase" || "$passphrase" != "$confirmation" ]]; then
  echo "Enter the same nonempty passphrase twice." >&2
  exit 1
fi
unset confirmation

builtin printf '%s\n' "$passphrase" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 \
  --quick-generate-key 'Blanc Linux Repository <support@blanc.day>' rsa4096 sign 2028-11-21
fingerprint=$(gpg --batch --with-colons --list-keys | awk -F: '$1 == "fpr" {print $10}')
[[ "$fingerprint" =~ ^[0-9A-F]{40}$ ]]
gpg --batch --armor --export "$fingerprint" > "$make_home/public.asc"
gpg --batch --dearmor --output "$make_home/public.gpg" "$make_home/public.asc"

# GnuPG prefixes the armor with a colon to prevent accidental revocation.
sed -n '/^:-----BEGIN PGP PUBLIC KEY BLOCK-----$/,$ {
  s/^:-----BEGIN/-----BEGIN/
  p
}' "$make_home/openpgp-revocs.d/$fingerprint.rev" > "$make_home/revocation.asc"
grep -qx -- '-----END PGP PUBLIC KEY BLOCK-----' "$make_home/revocation.asc"

echo "Saving the signing key and recovery item in Dev."
builtin printf '%s\n' "$passphrase" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 \
  --armor --export-secret-keys "$fingerprint" | \
  "$OP" document create - --vault Dev --title "$SIGNING_TITLE" --file-name blanc-repository-secret.asc --account "$OPACCT" >/dev/null
builtin printf '%s' "$passphrase" | python3 -c '
import json, pathlib, sys
fields = [
    {"id": "password", "type": "CONCEALED", "purpose": "PASSWORD", "label": "password",
     "value": sys.stdin.buffer.read().decode("utf-8")},
    {"type": "CONCEALED", "label": "revocation", "value": pathlib.Path(sys.argv[1]).read_text()},
]
json.dump({"category": "PASSWORD", "fields": fields}, sys.stdout)
' "$make_home/revocation.asc" | \
  "$OP" item create - --vault Dev --title "$RECOVERY_TITLE" --account "$OPACCT" >/dev/null

echo "Reading both items back, signing a test message, and verifying the signature."
export GNUPGHOME="$proof_home"
"$OP" document get "$SIGNING_TITLE" --vault Dev --account "$OPACCT" | \
  gpg --batch --import --pinentry-mode loopback --passphrase-fd 3 3< <(builtin printf '%s\n' "$passphrase")
unset passphrase
# Start with an empty agent cache so that signing proves the saved passphrase.
gpgconf --homedir "$proof_home" --kill gpg-agent
printf '%s\n' 'Blanc Linux repository signing proof' > "$proof_home/message"
"$OP" item get "$RECOVERY_TITLE" --vault Dev --account "$OPACCT" --format json | python3 -c '
import json, pathlib, sys
fields = {field["label"]: field.get("value") for field in json.load(sys.stdin)["fields"]}
if fields.get("revocation") != pathlib.Path(sys.argv[1]).read_text():
    sys.exit("The saved revocation certificate differs.")
sys.stdout.buffer.write(fields["password"].encode("utf-8") + b"\n")
' "$make_home/revocation.asc" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 \
  --local-user "$fingerprint" --output "$proof_home/message.sig" --detach-sign "$proof_home/message"
gpgv --keyring "$make_home/public.gpg" "$proof_home/message.sig" "$proof_home/message"

mkdir -p "$(dirname "$public")"
# Exclusive creation also protects a public file created during the vault proof.
python3 -c '
import pathlib, sys
armor = pathlib.Path(sys.argv[1]).read_bytes()
with open(sys.argv[2], "xb") as public:
    public.write(armor)
' "$make_home/public.asc" "$public"
echo "Public key saved to $public. Paste this line into chromium/linux/repository.md:"
echo "Fingerprint: $fingerprint"
