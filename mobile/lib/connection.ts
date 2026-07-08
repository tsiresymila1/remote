// WebSocket client singleton. Sends a PIN auth frame first; only reports
// `connected` after the server accepts it. Send helpers mirror PROTOCOL.md.
import { useSyncExternalStore } from "react";

let ws: WebSocket | null = null;
let host = "";
let wsPort = 8090;
let streamPort = 8091;
let pin = "";
let connected = false; // authenticated + open
let authFailed = false;
let manualClose = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function connect(h: string, wp = 8090, sp = 8091, p = "") {
  host = h;
  wsPort = wp;
  streamPort = sp;
  pin = p;
  manualClose = false;
  authFailed = false;
  open();
}

function open() {
  if (ws) {
    ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
    try {
      ws.close();
    } catch {}
  }
  connected = false;
  emit();

  const sock = new WebSocket(`ws://${host}:${wsPort}`);
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return;
    sock.send(JSON.stringify({ t: "auth", pin })); // must be the first frame
  };
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    let m: { t?: string };
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.t === "authok") {
      connected = true;
      emit();
    } else if (m.t === "authfail") {
      authFailed = true;
      manualClose = true; // wrong PIN — stop, don't hammer with retries
      emit();
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    connected = false;
    emit();
    if (!manualClose) setTimeout(() => !manualClose && open(), 1500); // auto-reconnect
  };
  sock.onerror = () => {};
}

export function disconnect() {
  manualClose = true;
  ws?.close();
  ws = null;
  connected = false;
  emit();
}

function send(obj: object) {
  if (ws?.readyState !== WebSocket.OPEN || !connected) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {}
}

// Protocol helpers.
export const move = (dx: number, dy: number) => send({ t: "m", dx, dy });
export const click = (b = "left", n = 1) => send({ t: "c", b, n });
export const down = (b = "left") => send({ t: "down", b });
export const up = (b = "left") => send({ t: "up", b });
export const scroll = (dx: number, dy: number) => send({ t: "s", dx, dy });
export const typeText = (s: string) => send({ t: "txt", s });
export const key = (k: string) => send({ t: "key", k });
export const combo = (mods: string[], k: string) => send({ t: "combo", mods, k });

// React bindings + accessors.
export const serverUrl = () => `ws://${host}:${wsPort}`;
export const streamUrl = () => `http://${host}:${streamPort}/?pin=${encodeURIComponent(pin)}`;
export const authDidFail = () => authFailed;

export function useConnected() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => connected,
  );
}
