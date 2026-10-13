#!/usr/bin/env bash
# Recovers the permanent internal Android keystore from the signing bundle
# secret, re-wraps it with a new password and the SAME certificate, and seals
# the result for one recipient only (CMS/PKCS#7, AES-256, to the founder's
# Windows document-encryption certificate, whose private key never leaves his
# PC). Used by .github/workflows/android-signing-recovery.yml; tested by
# tests/android-signing-recovery.test.js with a throwaway keystore.
#
# Inputs (environment):
#   SIGNING_BUNDLE_B64     base64 JSON {keystoreBase64, storePassword, keyAlias, keyPassword}
#   RECIPIENT_CERT_B64     base64 DER of the recipient certificate (RSA >= 3072)
#   PINNED_CERT_SHA256     signing certificate SHA-256 fixed in the workflow
#   REFERENCE_CERT_SHA256  space-separated SHA-256 values read from signed APK runs
#   WORK_DIR               scratch directory (created, mode 700)
# Output: $WORK_DIR/out/US-signing-recovery.p7m, and nothing else in out/.
# Prints only public data: certificate fingerprints, key type, alias.
set -euo pipefail
umask 077

fail() { echo "::error::$1"; exit 1; }
mask() { if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$1"; fi; }
hex() { printf '%s' "$1" | tr -d ': \r\n' | tr 'A-F' 'a-f'; }
# jq on Windows prints CRLF; strip it so values are byte-exact everywhere.
field() { jq -r "$1 // empty" "$WORK_DIR/bundle.json" | tr -d '\r'; }

: "${WORK_DIR:?WORK_DIR is required}"
[ -n "${SIGNING_BUNDLE_B64:-}" ] || fail "ANDROID_SIGNING_BUNDLE_B64 is not set"
[ -n "${RECIPIENT_CERT_B64:-}" ] || fail "recipient certificate is missing"
pinned="$(hex "${PINNED_CERT_SHA256:-}")"
printf '%s' "$pinned" | grep -Eq '^[0-9a-f]{64}$' || fail "pinned certificate SHA-256 is missing or invalid"
[ -n "${REFERENCE_CERT_SHA256:-}" ] || fail "no reference certificate from signed APK runs"
for ref in $REFERENCE_CERT_SHA256; do
  [ "$(hex "$ref")" = "$pinned" ] || fail "a signed APK run reports certificate $(hex "$ref"), not the pinned one"
done

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/payload" "$WORK_DIR/out"
chmod 700 "$WORK_DIR"
cleanup_secrets() { rm -rf "$WORK_DIR/payload" "$WORK_DIR/bundle.json" "$WORK_DIR/original.keystore" "$WORK_DIR/payload.zip"; }
trap cleanup_secrets EXIT

# 1. Recipient certificate: RSA >= 3072 bits, printed by fingerprint so the
#    founder can compare it with the one his PC showed.
printf '%s' "$RECIPIENT_CERT_B64" | tr -d ' \r\n' | base64 -d > "$WORK_DIR/recipient.der" 2>/dev/null || fail "recipient certificate is not valid base64"
openssl x509 -inform DER -in "$WORK_DIR/recipient.der" -out "$WORK_DIR/recipient.pem" 2>/dev/null || fail "recipient certificate is not a valid X.509 certificate"
bits="$(openssl x509 -in "$WORK_DIR/recipient.pem" -noout -text | sed -n 's/.*Public-Key: (\([0-9]*\) bit).*/\1/p' | head -1)"
openssl x509 -in "$WORK_DIR/recipient.pem" -noout -text | grep -q 'rsaEncryption' || fail "recipient key must be RSA"
[ -n "$bits" ] && [ "$bits" -ge 3072 ] || fail "recipient RSA key must be at least 3072 bits"
recipient_fp="$(hex "$(openssl x509 -in "$WORK_DIR/recipient.pem" -noout -fingerprint -sha256 | cut -d= -f2)")"
echo "Recipient certificate SHA-256: $recipient_fp ($bits bit RSA)"

# 2. Current keystore from the secret: must be the pinned certificate.
printf '%s' "$SIGNING_BUNDLE_B64" | base64 -d > "$WORK_DIR/bundle.json" 2>/dev/null || fail "signing bundle is not valid base64"
OLD_STORE="$(field .storePassword)"
OLD_KEY="$(field .keyPassword)"
ALIAS="$(field .keyAlias)"
mask "$OLD_STORE"; mask "$OLD_KEY"
[ -n "$OLD_STORE" ] && [ -n "$OLD_KEY" ] && [ -n "$ALIAS" ] || fail "signing bundle is incomplete"
export OLD_STORE OLD_KEY
field .keystoreBase64 | base64 -d > "$WORK_DIR/original.keystore" 2>/dev/null || fail "keystore is not valid base64"
[ -s "$WORK_DIR/original.keystore" ] || fail "keystore is empty"

fingerprint() { keytool -exportcert -alias "$ALIAS" -keystore "$1" -storepass:env "$2" 2>/dev/null | sha256sum | awk '{print $1}'; }
type="$(keytool -list -keystore "$WORK_DIR/original.keystore" -storepass:env OLD_STORE 2>/dev/null | sed -n 's/^Keystore type: *//Ip' | head -1)"
original="$(fingerprint "$WORK_DIR/original.keystore" OLD_STORE)"
echo "Keystore type: ${type:-unknown}, alias: $ALIAS, certificate SHA-256: $original"
[ "$original" = "$pinned" ] || fail "the keystore in the secret does not carry the pinned certificate; nothing is produced"

# 3. Same private key and certificate, PKCS12, new 32-character password.
NEW_PASS="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)"
mask "$NEW_PASS"
[ "${#NEW_PASS}" -eq 32 ] || fail "password generation failed"
export NEW_PASS
keytool -importkeystore -noprompt \
  -srckeystore "$WORK_DIR/original.keystore" -srcstorepass:env OLD_STORE -srckeypass:env OLD_KEY -srcalias "$ALIAS" \
  -destkeystore "$WORK_DIR/payload/us-internal-signing.p12" -deststoretype PKCS12 \
  -deststorepass:env NEW_PASS -destkeypass:env NEW_PASS -destalias "$ALIAS" >/dev/null 2>&1 || fail "keystore re-wrap failed"
rotated="$(fingerprint "$WORK_DIR/payload/us-internal-signing.p12" NEW_PASS)"
[ "$rotated" = "$pinned" ] || fail "the re-wrapped keystore does not carry the same certificate"
echo "Re-wrapped keystore: PKCS12, certificate SHA-256: $rotated"

# 4. Minimal payload: new keystore, ready secret value, short notes. The old
#    keystore with its publicly exposed passwords is NOT included.
jq -n --arg ks "$(base64 -w0 "$WORK_DIR/payload/us-internal-signing.p12")" --arg p "$NEW_PASS" --arg a "$ALIAS" \
  '{keystoreBase64:$ks, storePassword:$p, keyAlias:$a, keyPassword:$p}' | tr -d '\r' | base64 -w0 \
  > "$WORK_DIR/payload/NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt"
cat > "$WORK_DIR/payload/LEGGIMI.txt" <<NOTE
US - keystore interno recuperato ($(date -u +%Y-%m-%dT%H:%MZ))

Certificato di firma SHA-256: $rotated
Alias: $ALIAS
Formato: PKCS12, password unica per archivio e chiave: $NEW_PASS

NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt e' il valore da incollare nel
segreto GitHub ANDROID_SIGNING_BUNDLE_B64.
Copia us-internal-signing.p12 su due supporti offline e salva la password nel
gestore password, separata dalle copie. La password precedente e' compromessa:
non usarla piu'.
NOTE
PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import zipfile' >/dev/null 2>&1; then PYTHON="$candidate"; break; fi
done
[ -n "$PYTHON" ] || fail "python is required"
(cd "$WORK_DIR/payload" && "$PYTHON" -m zipfile -c "$WORK_DIR/payload.zip" us-internal-signing.p12 NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt LEGGIMI.txt) || fail "payload packaging failed"

# 5. Seal for the recipient only, then prove the output is not readable.
openssl cms -encrypt -binary -aes-256-cbc -in "$WORK_DIR/payload.zip" -outform DER \
  -out "$WORK_DIR/out/US-signing-recovery.p7m" "$WORK_DIR/recipient.pem" 2>/dev/null || fail "encryption failed"
sealed="$WORK_DIR/out/US-signing-recovery.p7m"
[ -s "$sealed" ] || fail "encryption produced no output"
openssl cms -cmsout -inform DER -in "$sealed" -print 2>/dev/null | grep -q 'aes-256-cbc' || fail "sealed file is not AES-256 CMS"
if LC_ALL=C grep -aqF -e "$NEW_PASS" -e "keystoreBase64" -e "PK$(printf '\003\004')" "$sealed"; then
  fail "sealed file contains readable payload"
fi
[ "$(ls -A "$WORK_DIR/out")" = "US-signing-recovery.p7m" ] || fail "unexpected files in the output folder"
echo "Sealed for recipient $recipient_fp: $(wc -c < "$sealed") bytes"
