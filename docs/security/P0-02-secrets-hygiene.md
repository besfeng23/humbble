# P0-02: Repository Secrets & Signing Artifact Hygiene

**Status:** Implemented  
**Plan Reference:** `Humbble_Execution_Build_Plan_v1.2.md` — Amendment A3 & PR P0-02  
**Baseline Commit:** `e5bff440a7f0f2f7a11a89f8b01b2985b6990c59`

---

## 1. Summary of Changes

1. **`.gitignore` Hardening**
   - Added `.env` and `.env.*` ignore rules with an explicit `!.env.example` exception so only template variable names can be committed.
   - Added `*.keystore`, `google-services.json`, `GoogleService-Info.plist`, and `android/keystore.properties`.
   - Retained existing ignore patterns for signing/certificate materials (`*.jks`, `*.p8`, `*.p12`, `*.pem`, `*.key`, `*.mobileprovision`).

2. **Removed Committed Debug Keystore**
   - Deleted `android/app/debug.keystore` from the working tree so no keystore binary is tracked on `main` going forward.

3. **Android Signing Configuration (`android/app/build.gradle`)**
   - **Debug builds (`signingConfigs.debug`):** Pointed `storeFile` at the standard per-user Android debug keystore (`System.getProperty("user.home") + "/.android/debug.keystore"`) so local development continues to work without a repository-committed keystore.
   - **Release builds (`signingConfigs.release` & `buildTypes.release`):** Removed fallback to `signingConfigs.debug`. Release signing reads exclusively from Gradle properties or environment variables and **fails closed** with a `GradleException` whenever a release task is invoked with missing signing inputs or a non-existent keystore file, while allowing debug tasks and configuration to succeed without release credentials.

---

## 2. Supplying Release Signing Credentials

Release builds require all four of the following keys via either Gradle properties (e.g., `~/.gradle/gradle.properties` or `-P` flags) or environment variables:

| Key | Description |
|---|---|
| `HUMBBLE_UPLOAD_STORE_FILE` | Path to the release/upload `.jks` or `.keystore` file |
| `HUMBBLE_UPLOAD_STORE_PASSWORD` | Password for the keystore |
| `HUMBBLE_UPLOAD_KEY_ALIAS` | Alias of the upload/release signing key |
| `HUMBBLE_UPLOAD_KEY_PASSWORD` | Password for the upload/release signing key |

### Option A: Environment Variables (CI / EAS / Shell)
```bash
export HUMBBLE_UPLOAD_STORE_FILE="/secure/path/upload-keystore.jks"
export HUMBBLE_UPLOAD_STORE_PASSWORD="<redacted>"
export HUMBBLE_UPLOAD_KEY_ALIAS="<redacted>"
export HUMBBLE_UPLOAD_KEY_PASSWORD="<redacted>"
```

### Option B: User-Level Gradle Properties (`~/.gradle/gradle.properties`)
```properties
HUMBBLE_UPLOAD_STORE_FILE=/secure/path/upload-keystore.jks
HUMBBLE_UPLOAD_STORE_PASSWORD=<redacted>
HUMBBLE_UPLOAD_KEY_ALIAS=<redacted>
HUMBBLE_UPLOAD_KEY_PASSWORD=<redacted>
```

> **Important:** Never commit release keystores, `android/keystore.properties`, or signing passwords to the repository. If any of the four properties/variables is missing when running a `*Release*` Gradle task, the build fails closed with a `GradleException`.

---

## 3. Secret & Signing Artifact Scan Results

- **Scanner:** `gitleaks 8.21.2` (redacted mode)
- **Working tree scan:** `0` findings
- **Full Git history scan:** `0` secret findings
- **Historical signing artifact note:**
  - `android/app/debug.keystore` was introduced in commit `3fb0bfe` and contains the standard default React Native / Android debug key (`alias=androiddebugkey`, `password=android`).
  - It is removed from the working tree in P0-02.
  - **Git history was not rewritten** in this PR. Whether to rewrite history to purge the historical `debug.keystore` blob remains an explicit **owner decision** (per Amendment A3, to be decided before parallel branches multiply).
