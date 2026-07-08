# Wire protocol

Two channels on the LAN:

## 1. Discovery (UDP, port `41234`)
- Phone broadcasts the ASCII string `REMOTE_DISCOVER` to `255.255.255.255:41234`.
- Desktop replies (unicast) with JSON:
  ```json
  { "app": "remote", "name": "<hostname>", "ip": "<lan-ip>", "wsPort": 8090, "streamPort": 8091, "os": "darwin" }
  ```
- Phone connects to `ws://<ip>:<wsPort>`. Clients should use the packet's source
  address, not the advertised `ip` (multi-homed hosts).

## 3. Screen stream (HTTP, default port `8091`)
- `GET /stream` → MJPEG: `multipart/x-mixed-replace; boundary=frame`, ~12 fps,
  primary monitor downscaled to 1280px wide, JPEG q60.
- `GET /` → minimal HTML viewer (for browsers / WebViews).
- Capture runs only while at least one client is connected.
- macOS requires the **Screen Recording** permission (separate from Accessibility).

## 2. Input stream (WebSocket, default port `8090`)
JSON messages, one per frame. Mouse moves are **relative deltas**; the desktop keeps
the real cursor position.

| Message | Meaning |
|---|---|
| `{ "t":"m", "dx":12, "dy":-4 }` | move cursor by delta |
| `{ "t":"down", "b":"left" }` | press button (start drag) |
| `{ "t":"up", "b":"left" }` | release button |
| `{ "t":"c", "b":"left", "n":1 }` | click; `n:2` = double-click |
| `{ "t":"s", "dx":0, "dy":3 }` | scroll |
| `{ "t":"txt", "s":"hello" }` | type text |
| `{ "t":"key", "k":"enter" }` | special key (enter/backspace/tab/escape/space/arrows/delete/home/end/capslock) |
| `{ "t":"combo", "mods":["ctrl","shift"], "k":"c" }` | modifier combo; `k` = single char or special-key name. mods: ctrl/shift/alt/cmd |
| `{ "t":"ping" }` | keepalive → server replies `{"t":"pong"}` |

`b` (button): `left` \| `right` \| `middle`. Defaults to `left`.

## Security (v1)
None. LAN-trusted: anyone on the WiFi can drive the cursor. Planned: 4-digit PIN — desktop
shows it, phone sends `{ "t":"auth", "pin":"1234" }` as the first frame; server drops the
socket if wrong.
