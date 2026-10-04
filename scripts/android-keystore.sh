#!/usr/bin/env bash
# Creates the Android release key once and prints the commands that hand it to GitHub Actions.
# Keep the generated folder safe: without this key installed apps can no longer be updated.
set -euo pipefail

dir="${1:-$HOME/.chordtune-release}"
keystore="$dir/chordtune-release.keystore"
alias=chordtune

if [[ -e "$keystore" ]]; then
  echo "$keystore already exists; refusing to overwrite the release key." >&2
  exit 1
fi
mkdir -p "$dir"
password="$(openssl rand -hex 24)"

keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$keystore" -alias "$alias" \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=ChordTune" \
  -storepass "$password" -keypass "$password"
printf '%s\n' "$password" > "$dir/password.txt"
chmod 600 "$keystore" "$dir/password.txt"

cat <<MSG

Release key: $keystore (password in $dir/password.txt). Back up this folder.

Hand it to GitHub Actions:
  base64 -i "$keystore" | gh secret set ANDROID_KEYSTORE_BASE64
  gh secret set ANDROID_KEYSTORE_PASSWORD < "$dir/password.txt"
  gh secret set ANDROID_KEY_PASSWORD < "$dir/password.txt"
  gh secret set ANDROID_KEY_ALIAS --body $alias
  gh variable set PUBLIC_URL --body https://your.domain
MSG
