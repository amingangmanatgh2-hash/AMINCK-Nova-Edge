# CI — Build the APKs automatically on GitHub

The build workflow is ready at **`android/CI/android-build-release.yml`**.

> Why is it not already in `.github/workflows/`? The Arena bot token is not
> granted the `workflows` scope, so it cannot create files under
> `.github/workflows/` or upload release binaries. Any human (repo owner)
> enables it in ~20 seconds:

## Enable (one time)

```bash
# from the repo root, on the branch with these changes
mkdir -p .github/workflows
cp android/CI/android-build-release.yml .github/workflows/
git add .github/workflows/android-build-release.yml
git commit -m "CI: build & release Pixel Simulator + NovaMind APKs"
git push
```

Then either:

- **push a tag** — `git tag pixel-sim-v1.0.0 && git push origin pixel-sim-v1.0.0`
  (and/or `novamind-v1.0.0`), **or**
- open the **Actions** tab → **Android APK Build & Release** → **Run workflow**.

The workflow:

1. sets up JDK 17 + Android SDK,
2. builds both apps with Gradle (`assembleDebug` — signed with the standard
   debug key, so it installs on any device),
3. attaches both APKs as a workflow artifact, and
4. creates two GitHub Releases and uploads the APKs:
   - `pixel-sim-v1.0.0` → `Pixel10ProMax-Simulator-v1.0.0.apk`
   - `novamind-v1.0.0` → `NovaMind-LocalAI-v1.0.0.apk`

## Build locally (no GitHub required)

Requirements: JDK 17 + Android SDK (Platform 34, Build-Tools 34).

```bash
cd android/pixel-simulator && gradle assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk

cd ../novamind-local-ai && gradle assembleDebug
```

Install on a phone: copy the APK, allow “install from unknown sources”, open.
