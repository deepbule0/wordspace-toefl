**English** | [简体中文](README.zh-CN.md)

# Wordspace TOEFL · 词间

A personal TOEFL vocabulary study system with a local web interface, a standalone Android app, and encrypted LAN synchronization between desktop and mobile. Current app version: **1.1.3**.

This public repository includes the **complete source code and study materials**: 48 Lists, 4,264 words, practice examples and usage notes, and 4,108 local pronunciation recordings. It is not an official New Oriental or ETS app. The publisher has confirmed authorization to redistribute the included vocabulary and recordings publicly. Existing third-party notices are retained; public availability does not grant additional commercial-use or redistribution rights to downstream users. See [sources and provenance](SOURCES.md) and [third-party notices](THIRD_PARTY_NOTICES.md), both currently in Chinese.

## Features

- Customize daily new-learning and review goals by List. Defaults: 2 new Lists and 3 review Lists per day, with learning completed through List 24 and review through List 10.
- Study words, phonetics, parts of speech, Chinese definitions, pronunciation, example sentences, and usage notes in one interface. Hide Chinese information and phonetics independently.
- Cycle favorite stars through light, darker, darkest, and unmarked; combine List and level filters.
- Keep both page and word-list scroll positions when switching words. Opening a List or leaving the study view still uses normal navigation.
- Save progress locally, import/export backups, and pair devices with a QR code for AES-256-GCM encrypted sync. Learning progress is not uploaded to a cloud service.
- Use local Android QR scanning, system English text-to-speech as a fallback, and system-scheduled background sync. Real-time background execution is not guaranteed.

## Web quick start

Install [Node.js](https://nodejs.org/) 22 or 24. There are no external npm dependencies, so `npm install` is not required.

```sh
git clone https://github.com/deepbule0/wordspace-toefl.git
cd wordspace-toefl
npm start
```

Open <http://127.0.0.1:4173/>. On Windows, you can also double-click `启动背词系统.cmd`. Progress is stored in the current browser; cloning the repository does not restore previous progress automatically. Export a backup before changing computers or browsers.

```sh
npm test
npm run audit
```

Local tests, Android builds, and publication checks are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md) (Chinese). The initial GitHub Actions run failed before creating any jobs; its cause has not been established. This is neither a local test failure nor evidence that remote checks passed.

Keyboard shortcuts: Left/Right to switch words, Space to hide/reveal definitions, P for pronunciation, and S to cycle favorite levels. Focused inputs and buttons retain their own keyboard behavior.

## Desktop and mobile sync

Keep the web server running and open another terminal:

```sh
npm run sync
```

On Windows, `启动手机同步.cmd` starts both services. Display the pairing QR code in the desktop web interface, then scan and confirm it in the Android app. Pairing codes contain a key: share them only with your own devices.

The web server listens only on `127.0.0.1:4173`; the LAN sync service uses TCP port 4174. Both devices must be able to reach each other. Campus and guest Wi-Fi may isolate clients, even on the same Wi-Fi network. A personal hotspot can be an alternative. Do not disable the system-wide firewall or bypass network policies. See the [Android installation and sync guide](手机安装与同步说明.md) (Chinese).

## Android build

Minimum Android version: Android 8 / API 26. Both `compileSdk` and `targetSdk` are 36. Google Play services are not required. A recent system WebView is needed; comprehensive testing on all OnePlus or Huawei devices is not claimed.

1. Install JDK 17 or 21, Android SDK Platform 36, Build Tools 35.0.0, and Android command-line tools. Read and accept the SDK license yourself.
2. Set `JAVA_HOME` and `ANDROID_HOME`, or use `WORDSPACE_JAVA_HOME` and `WORDSPACE_ANDROID_SDK`.
3. Run the commands below, or open `android/` in Android Studio.

The project includes the Gradle 8.13 Wrapper with a pinned distribution URL and SHA-256 checksum. Its first run downloads Gradle from the official source; the first build also resolves dependencies from Google Maven and Maven Central.

```sh
# Debug-signed APK
npm run android:debug

# Personally signed release APK, lint, JVM tests, and scanner runtime checks
npm run android:build
```

Output files are written to `outputs/`, with the output version read from `package.json`. Tools, caches, signing files, and APKs are not committed to Git.

**Signing:** The repository does not contain the original APK's private signing key. A first release build on a new machine creates a new key under `.signing/`. An APK signed with a different key cannot update the existing app in place. For compatible updates, the owner must securely restore the original `.signing/` locally; never commit it. Do not simply uninstall the old app to resolve a signing mismatch: uninstalling erases mobile progress, so export a backup first.

After building, run `npm run test:native` to check JavaScript/Java encryption and merge interoperability, plus native ZXing decoding of pairing QR codes. The script locates pinned dependency JARs in the Gradle cache, so Android dependencies must have been resolved first.

## Project layout

```text
public/                 Shared web UI, generated vocabulary, examples, and audio/
android/                Native QR/TTS/network/background sync, JVM tests, Gradle Wrapper
server.mjs              Local web server
sync-server.mjs         Encrypted LAN sync service
network-info.mjs        Desktop network information
scripts/                Data maintenance, Android builds, publication audit, diagnostics
tests/                  Node, cross-language, and Windows diagnostic tests
SOURCES.md              Study-material provenance and limitations
THIRD_PARTY_NOTICES.md   Third-party license index
```

The generated data is ready to use. Rebuilding it requires your own `.sources/` inputs and an Anki deck you are authorized to use; original downloads are not included. Use `python scripts/build_data.py --deck /path/to/TOEFL.apkg` to select your input rather than relying on a particular user's Downloads directory.

## Security and maintenance

- Never commit signing files, pairing keys, sync replicas, personal progress backups, logs, or packet-capture reports.
- GitHub hosts source code and static study materials; it is not the mobile progress synchronization service.
- Keep third-party notices. Publication does not grant an additional, repository-wide open-source redistribution license for the code or learning materials.
- GitHub Actions checks Node tests, sensitive-file rules, and Windows diagnostic safety logic. It does not use private signing keys or automatically upload APKs.
- Time-limited Windows network diagnostics require the current IP addresses of both devices and manual execution as administrator. The safety tests validate logic only and do not start packet capture.

For detailed instructions, see the [usage guide](使用说明.md) (Chinese).
