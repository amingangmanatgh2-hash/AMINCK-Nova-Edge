# Android Apps — Pixel 10 Pro Max Simulator & NovaMind Local AI

Two standalone Android apps built with **Jetpack Compose + Kotlin**.

| App | Package | Source |
| --- | --- | --- |
| 📱 **Pixel 10 Pro Max Simulator** — interactive Pixel Experience OS | `com.aminck.pixel` | [`pixel-simulator/`](./pixel-simulator) |
| 🧠 **NovaMind Local AI** — 100% offline on-device AI | `com.aminck.novamind` | [`novamind-local-ai/`](./novamind-local-ai) |

## Download the APKs (GitHub Releases)

- **Pixel 10 Simulator**: https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/releases/tag/pixel-sim-v1.0.0
- **NovaMind Local AI**: https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/releases/tag/novamind-v1.0.0

> Direct links:
> - `https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/releases/download/pixel-sim-v1.0.0/Pixel10ProMax-Simulator-v1.0.0.apk`
> - `https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/releases/download/novamind-v1.0.0/NovaMind-LocalAI-v1.0.0.apk`

## Build from source

Requires JDK 17 and the Android SDK (Platform 34, Build-Tools).

```bash
# Pixel 10 Simulator
cd android/pixel-simulator
gradle assembleDebug          # APK: app/build/outputs/apk/debug/app-debug.apk

# NovaMind Local AI
cd android/novamind-local-ai
gradle assembleDebug
```

CI (`.github/workflows/android-build-release.yml`) builds both APKs and
publishes them to GitHub Releases on every tag push (`pixel-sim-v*`,
`novamind-v*`) or manual workflow run.
