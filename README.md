# Remote — phone as keyboard & mouse

Phone (React Native + Expo) streams touch/keyboard input over the LAN to a desktop
server (Tauri + Rust), which injects it into the OS. Auto-discovery over UDP, input
stream over WebSocket. Protocol: [PROTOCOL.md](PROTOCOL.md).

```
desktop/   Tauri app — WS server + UDP discovery + enigo injection. UI: React + Tailwind v4 (Vite). System tray.
mobile/    Expo app — trackpad, keyboard, connect, settings. UI: NativeWind.
```

Node ≥ 20 required (`.nvmrc` pins 22 in both apps — nvm default v14 breaks Vite/Expo).

## Run the desktop server
```bash
cd desktop
npm install            # tauri CLI (JS side)
npm run tauri dev      # builds Rust, opens the status window
```
- macOS: first run needs **System Settings → Privacy & Security → Accessibility** →
  enable the app (or your terminal in dev). Without it, the cursor won't move.
- Window shows the LAN IP, WS port (8090), and connected-phone count.
- **Closing the window does NOT stop the server** — it hides to the system tray.
  Tray menu: Show window / Quit.

## Run the mobile app
`react-native-udp` is native → **not** Expo Go. Use a dev client:
```bash
cd mobile
npx expo prebuild            # generates ios/ + android/
npx expo run:ios             # or: npx expo run:android  (device/sim on the SAME WiFi)
```

## Use it
1. Desktop server running → phone scans on launch and **auto-connects** to the first
   server found (retries every 2s until one appears). Multiple servers → tap to pick.
2. **Trackpad**: drag = move, tap = click, two fingers = scroll, hold = drag. Left/right buttons below.
3. **Keyboard**: type → sent live; special keys row (enter/backspace/tab/esc/arrows).
4. **Settings**: pointer speed, natural scroll, or connect by IP if discovery is blocked.

## v1 limits (deliberate)
- **No auth** — LAN-trusted. Anyone on the WiFi can drive the cursor. PIN pairing is the next step.
- JSON over WS (fine for one phone); binary/UDP only if latency shows.
