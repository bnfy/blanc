#!/bin/bash
# Blanc Beta for Windows: the update server on staging (W3 Task C1). Deploys
# cloudflare/update-worker to workers.dev (no blanc.day route), gives it Blanc's
# CUP signing seed from 1Password ("Blanc Windows Beta CUP Key") after checking
# that key against the committed public key, and asks it one signed update
# check. Nothing secret is printed or left on disk.
# With BLANC_WORKER_ENV=staging (update-worker-gate.command) it deploys and keys
# the release gate's staging server, blanc-update-staging, instead.
# (BLANC_OP, BLANC_WRANGLER, BLANC_CUP_PUBLIC, BLANC_SKIP_SMOKE and BLANC_WORK_TMP are for tests.)
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
WORKER="$REPO/cloudflare/update-worker"
OPENSSL=/opt/homebrew/opt/openssl@3/bin/openssl
OP="${BLANC_OP:-op}"
OPACCT=my.1password.com
PUBLIC="${BLANC_CUP_PUBLIC:-$REPO/chromium/windows/keys/cup-public.der}"
export OP_BIOMETRIC_UNLOCK_ENABLED=true
ENV_ARGS=()
LABEL="update server on staging"
if [ "${BLANC_WORKER_ENV:-}" = staging ]; then ENV_ARGS=(--env staging); LABEL="staging update server (release gate)"; fi
WORK=$(mktemp -d "${BLANC_WORK_TMP:-/private/tmp}/blanc-update-staging.XXXXXX")
trap 'code=$?; rm -rf "$WORK"; if [ $code -ne 0 ]; then echo; echo "STOPPED. Nothing secret was left on disk. Tell Claude."; fi' EXIT
cd "$WORKER"
[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund >/dev/null
WRANGLER=("${BLANC_WRANGLER:-npx}")
[ -z "${BLANC_WRANGLER:-}" ] && WRANGLER=(op run --env-file=.env.1password -- npx wrangler)
echo "Blanc Beta for Windows: the $LABEL"
echo
echo "1. Open 1Password's Dev vault (Touch ID)."
"$OP" vault get Dev --account "$OPACCT" >/dev/null 2>&1 || { echo "1Password's Dev vault didn't open. Stopping."; exit 1; }
echo "2. Checking the CUP key in 1Password against the committed public key."
"$OP" document get "Blanc Windows Beta CUP Key" --vault Dev --account "$OPACCT" --output "$WORK/key.pem" >/dev/null
"$OPENSSL" pkey -in "$WORK/key.pem" -provparam ml-dsa.output_formats=seed-only -outform DER -out "$WORK/seed.der" 2>/dev/null
rm -f "$WORK/key.pem"
[ "$(head -c 22 "$WORK/seed.der" | xxd -p)" = "3034020100300b060960864801650304031104228020" ] || { echo "The 1Password key isn't an ML-DSA-44 seed. Stopping."; exit 1; }
"$OPENSSL" pkey -inform DER -in "$WORK/seed.der" -pubout -outform DER -out "$WORK/public.der" 2>/dev/null
cmp -s "$WORK/public.der" "$PUBLIC" || { echo "The 1Password key is NOT the committed public key. Stopping."; exit 1; }
echo "3. Deploying the Worker to workers.dev (staging; no blanc.day route)."
"${WRANGLER[@]}" deploy ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} > "$WORK/deploy.log" 2>&1 || { tail -5 "$WORK/deploy.log"; echo "Deploy failed. Stopping."; exit 1; }
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$WORK/deploy.log" | head -1)
[ -n "$URL" ] || { echo "Couldn't read the Worker's address. Stopping."; exit 1; }
echo "   $URL"
echo "4. Giving it the signing seed."
tail -c 32 "$WORK/seed.der" | base64 | tr -d '\n' | "${WRANGLER[@]}" secret put CUP_SEED ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} > /dev/null 2>&1 || { echo "Setting the secret failed. Stopping."; exit 1; }
rm -f "$WORK/seed.der"
if [ -z "${BLANC_SKIP_SMOKE:-}" ]; then
  echo "5. Asking it one update check and checking the signature."
  sleep 5
  node scripts/smoke.mjs "$URL" "$PUBLIC"
fi
echo
echo "Done. The $LABEL is $URL"
