# Remote — phone as keyboard & mouse

Control your computer from your phone over WiFi. The mobile app (React Native +
Expo, NativeWind) streams trackpad gestures and keystrokes to a desktop server
(Tauri + Rust) that injects them into the OS with `enigo`, and views the desktop
screen live over MJPEG. Auto-discovery, QR pairing, no account, no cloud —
everything stays on your LAN.

```
desktop/   Tauri app — WS input server + UDP discovery responder + system tray.
           UI: React + Tailwind v4 (Vite).
mobile/    Expo app — trackpad, keyboard (incl. full AZERTY), connect, settings.
           UI: NativeWind.
scripts/   release.sh (tag + push → CI release)
```

Protocol reference: [PROTOCOL.md](PROTOCOL.md). Node ≥ 20 required (`.nvmrc` pins 22).

## Features

- **Pairing**: scan the desktop's QR (256-bit token, HMAC challenge/response — the
  token never crosses the wire) or type the 4-digit PIN. Same secret gates input and screen.
- **Auto-connect**: phone scans on launch and latches onto the first server found.
  Discovery is UDP broadcast, with a WebSocket subnet-sweep fallback (`hello`→`info`
  handshake) when broadcast is blocked. Manual IP entry in Settings as last resort.
- **Screen view**: live desktop over MJPEG (~20 fps, 1920px, cursor drawn in) in a
  WebView, with a toggleable trackpad/keyboard overlay. Multi-monitor picker with an
  **AUTO** mode that follows the screen under the cursor.
- **Trackpad**: 1-finger move / tap click / hold-to-drag · 2-finger scroll ·
  2-finger tap = right click · 3-finger tap = middle click · 3-finger swipe =
  macOS Spaces / Mission Control / Exposé (`ctrl+arrows`). Speed is normalized by
  pad size, so one sensitivity setting feels the same on the full pad and the View overlay.
- **Keyboard**: portrait text mode (live diff streaming) + full-screen **AZERTY
  mechanical keyboard** (Keychron-style keycaps, F-row, nav cluster, arrows,
  sticky ctrl/alt/cmd/shift, local caps lock, key auto-repeat, landscape
  auto-rotation). The rotary knob on the board switches mech ↔ flat theme.
- **Haptics** on every key, level configurable in Settings (off/light/med/heavy).
- **Desktop tray**: closing the window keeps the server running; tray menu has
  Show / Quit. Dark title bar, phosphor-on-graphite status window with live
  client count and all reachable IPs (multi-homed hosts supported).

## Install (releases)

Grab the latest from [Releases](../../releases): `.dmg` (macOS), `.msi`/`-setup.exe`
(Windows), `.AppImage`/`.deb`/`.rpm` (Linux), `.apk` (Android sideload).

- **macOS**: app is unsigned — after copying to Applications run
  `xattr -cr /Applications/Remote.app`. On first launch grant **Accessibility**
  (mouse/keyboard) and **Screen Recording** (for the screen view) under
  System Settings → Privacy & Security; the Screen Recording toggle needs an app restart.
- **Android**: allow installs from unknown sources, install the APK.

## Develop

Desktop:
```bash
cd desktop && npm install && npm run tauri dev
```

Mobile — native modules (UDP, haptics, orientation) mean **no Expo Go**; build a
dev client:
```bash
cd mobile && npm install
npx expo prebuild --clean
npx expo run:android   # or run:ios — device on the SAME WiFi
```
(Expo Go still works for UI tinkering: discovery falls back to the subnet sweep
and shows a stale-build banner.)

## Release

```bash
./scripts/release.sh v1.2.3
```
Deletes/recreates the tag and pushes it. CI then builds and attaches to the
GitHub release: Android APK + AAB (expo prebuild + gradle — no Expo account),
and Tauri bundles for macOS / Linux / Windows. Tag must be full semver.

Optional secrets:
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_PASSWORD` — Play-Store-ready signing (without them the APK is
  debug-signed, fine for sideload).
- `PLAY_SERVICE_ACCOUNT_JSON` — auto-upload the AAB to the Play internal track.

Repo setting required once: **Settings → Actions → General → Workflow
permissions → Read and write** (release creation).

## Security model (v1)

Pairing (QR token or PIN) gates both input and the screen stream. The QR token
never transits — auth is HMAC challenge/response with a fresh nonce each connect,
so it can't be replayed. The PIN and the derived stream key, however, do travel in
cleartext (`ws://`/`http://`, Android manifest opts in), so an on-network sniffer
could grab them: pairing stops accidental/casual access, not a determined attacker
on the same LAN. No transport encryption yet — TLS is the next step. Don't run the
server on networks you don't trust.
