# US Android internal signing

US uses one permanent internal signing identity for Android update continuity.

## Why

Android only accepts an APK as an update when the package name and signing identity match the installed app. US keeps:

- application id: `com.usapp.us`
- one permanent private signing key
- an increasing `versionCode`

The signing key must never be committed to Git.

## GitHub Actions secrets

Create these repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The workflow decodes the keystore into the runner temporary directory and deletes it with the runner.

## Local Windows build

Place the permanent keystore somewhere under `android/` that is ignored by Git, for example:

`android/app/us-internal-signing.jks`

Create `android/keystore.properties`:

```properties
storeFile=app/us-internal-signing.jks
storePassword=<private>
keyAlias=us-internal
keyPassword=<private>
```

Then run:

```powershell
.\scripts\build-android-internal.ps1
```

The script assigns an epoch-seconds versionCode so every later build is newer than the previous one.

## Migration from the old debug APK

The currently installed debug APK was signed by a temporary CI debug key. Android cannot replace it with the permanent internal key.

There is therefore exactly one final uninstall/reinstall:

1. uninstall the old debug-signed US;
2. install the first `US-Android-Internal.apk`;
3. from then on install newer internally signed APKs over the existing app.

Do not lose the permanent keystore. Losing it means existing installations cannot be updated with future APKs.
