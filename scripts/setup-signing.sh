#!/usr/bin/env bash
#
# Create the release signing key and load it into GitHub Actions.
#
# Run this on a machine you control. It is the one step that cannot be done for
# you: the key has to exist where you are, not in someone else's container and
# not in a chat transcript, because it is the only proof a build came from you.
#
#   bash scripts/setup-signing.sh
#
# Passwords are read without echo and passed to keytool and gh through the
# environment or stdin, never as arguments, so they do not show up in `ps` or
# in your shell history.

set -euo pipefail

KEYSTORE="${KEYSTORE:-zentask-release.jks}"
ALIAS="${ALIAS:-zentask}"

fail() { printf '\n%s\n' "$1" >&2; exit 1; }

command -v keytool >/dev/null || fail "keytool not found. Install a JDK (21 is what CI uses)."

if [ -e "$KEYSTORE" ]; then
  fail "$KEYSTORE already exists. Refusing to overwrite it — that would destroy the key."
fi

cat <<'INTRO'
This creates a release signing key for ZenTask.

Back the resulting .jks file up somewhere you will still have in five years.
If you lose it you cannot ship an update that phones will accept as the same
app; if it leaks, someone else can.

INTRO

read -rsp "Choose a password for the keystore: " KEYSTORE_PASSWORD; echo
[ -n "$KEYSTORE_PASSWORD" ] || fail "An empty password defeats the point."
read -rsp "Type it again: " CONFIRM; echo
[ "$KEYSTORE_PASSWORD" = "$CONFIRM" ] || fail "Those did not match."
unset CONFIRM

# One password for both is normal for a single-key store and is one less thing
# to lose. Set KEY_PASSWORD beforehand if you want them to differ.
KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"

export KEYSTORE_PASSWORD KEY_PASSWORD

echo
echo "Generating $KEYSTORE (alias: $ALIAS)…"
keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 \
  -validity 10000 \
  -storetype PKCS12 \
  -storepass:env KEYSTORE_PASSWORD \
  -keypass:env KEY_PASSWORD

echo
echo "Created $KEYSTORE. Back it up now, before anything else."

if ! command -v gh >/dev/null; then
  cat <<EOM

The GitHub CLI is not installed, so the secrets have to go in by hand at
Settings → Secrets and variables → Actions:

  ANDROID_KEYSTORE_BASE64     base64 -w0 $KEYSTORE
  ANDROID_KEYSTORE_PASSWORD   the keystore password
  ANDROID_KEY_ALIAS           $ALIAS
  ANDROID_KEY_PASSWORD        the key password

EOM
  exit 0
fi

echo
read -rp "Set the four repository secrets with gh now? [y/N] " REPLY
case "$REPLY" in
  [yY]*) ;;
  *) echo "Skipped. The names are in README.md under Release signing."; exit 0 ;;
esac

# base64 -w0 is GNU; macOS base64 has no -w and does not wrap by default.
if base64 --help 2>&1 | grep -q -- "-w"; then
  ENCODED="$(base64 -w0 "$KEYSTORE")"
else
  ENCODED="$(base64 -i "$KEYSTORE" | tr -d '\n')"
fi

printf '%s' "$ENCODED"           | gh secret set ANDROID_KEYSTORE_BASE64
printf '%s' "$KEYSTORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD
printf '%s' "$ALIAS"             | gh secret set ANDROID_KEY_ALIAS
printf '%s' "$KEY_PASSWORD"      | gh secret set ANDROID_KEY_PASSWORD

echo
echo "Done. Push to main, or re-run the Build workflow, and the signed job will run."
echo "Keep $KEYSTORE out of the repository — .gitignore already covers *.jks."
