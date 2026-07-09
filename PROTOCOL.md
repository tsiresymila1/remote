# Wire protocol

Three channels on the LAN. Ports: discovery `41234/udp`, input `8090/ws`, stream `8091/http`.

## 1. Discovery (UDP, port `41234`)
- Phone broadcasts the ASCII string `REMOTE_DISCOVER` to `255.255.255.255:41234`.
- Desktop replies (unicast) with JSON:
  ```json
  {
    "app": "remote", "name": "<hostname>",
    "ip": "<lan-ip>", "wsPort": 8090, "streamPort": 8091,
    "monitors": [ { "i": 0, "name": "Built-in Display" } ],
    "os": "darwin"
  }
  ```
- Clients use the packet's **source address**, not the advertised `ip` (multi-homed hosts).
- Fallback when UDP is blocked: the phone sweeps the /24 over WebSocket, sending
  `{ "t":"hello" }` to each host; a server answers `{ "t":"info", "app":"remote", … }`
  (same fields). `hello`/`info` work **before** pairing.

## 2. Input stream (WebSocket, port `8090`)

### Pairing — challenge/response (first exchange)
On connect the server sends a nonce; the client answers with proof it knows the secret:
```json
→ { "t": "challenge", "nonce": "<hex>" }
← { "t": "auth", "hmac": "<HMAC-SHA256(token, nonce) hex>" }   // QR pairing
  { "t": "auth", "pin": "1234" }                               // PIN fallback
→ { "t": "authok" }  |  { "t": "authfail" }   (authfail → socket closes)
```
- **Token** (256-bit hex) is delivered by the desktop's QR code; it never crosses the
  wire — only `HMAC(token, nonce)` does, and the nonce is fresh each connect (no replay).
- **PIN** (4-digit) is the fallback for manual entry.
- Frames before `authok` are ignored, except `hello` (discovery).

### Frames (after `authok`)
JSON, one per message. Mouse moves are **relative deltas**; the desktop keeps cursor state.

| Message | Meaning |
|---|---|
| `{ "t":"m", "dx":12, "dy":-4 }` | move cursor by delta |
| `{ "t":"down", "b":"left" }` | press button (start drag) |
| `{ "t":"up", "b":"left" }` | release button |
| `{ "t":"c", "b":"left", "n":1 }` | click; `n:2` = double-click |
| `{ "t":"s", "dx":0, "dy":3 }` | scroll |
| `{ "t":"txt", "s":"hello" }` | type text |
| `{ "t":"key", "k":"enter" }` | special key (see list) |
| `{ "t":"combo", "mods":["ctrl","shift"], "k":"c" }` | modifier combo; `k` = char or special-key name |
| `{ "t":"ping" }` | keepalive → `{"t":"pong"}` |
| `{ "t":"getmon" }` | → `{ "t":"mon", "list":[{"i":0,"name":"…"}] }` (monitor list) |

- `b` (button): `left` \| `right` \| `middle`. Default `left`.
- `mods`: `ctrl` \| `shift` \| `alt` \| `cmd`.
- special keys: `enter` `backspace` `tab` `escape` `space` `up` `down` `left` `right`
  `delete` `home` `end` `capslock` `pageup` `pagedown` `f1`…`f12`.

## 3. Screen stream (HTTP, port `8091`)
- Auth via query param: `?k=<HMAC-SHA256(token,"stream") hex>` (QR) or `?pin=1234` (fallback).
  Wrong/absent → `403`. The stream key is one-way derived, so leaking it can't forge input auth.
- Monitor: `?mon=N` picks a display, `?mon=auto` follows the monitor under the cursor.
- `GET /stream?k=&mon=` → MJPEG: `multipart/x-mixed-replace; boundary=frame`.
  ~20 fps, selected monitor downscaled to 1920px wide (Lanczos3), JPEG q85, cursor drawn in.
- `GET /?k=&mon=` → minimal HTML viewer (browsers / WebViews).
- Capture runs only while a client is connected.
- macOS requires the **Screen Recording** permission (separate from Accessibility).

## Security (v1)
PIN or QR-token pairing gates input and stream. The token never transits (HMAC
challenge/response); the PIN and stream key do, in cleartext, so an on-network
sniffer could capture them — pairing stops accidental/casual access, not a determined
attacker on the same LAN. No transport encryption yet (TLS would be the next step).
