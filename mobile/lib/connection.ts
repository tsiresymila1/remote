// WebSocket client singleton. Answers the server's challenge with a token HMAC
// (QR pairing) or the PIN (fallback); only reports `connected` after authok.
// Send helpers mirror PROTOCOL.md.
import { useSyncExternalStore } from "react";
import { sha256 } from "js-sha256";

let ws: WebSocket | null = null;
let host = "";
let wsPort = 8090;
let streamPort = 8091;
let pin = "";
let token = ""; // hex; when present, auth uses HMAC and the token never leaves the phone
let connected = false; // authenticated + open
let authFailed = false;
let manualClose = false;
let monitors: { i: number; name: string }[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function connect(h: string, wp = 8090, sp = 8091, p = "", tk = "") {
  host = h;
  wsPort = wp;
  streamPort = sp;
  pin = p;
  token = tk;
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
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    let m: { t?: string; nonce?: string };
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.t === "challenge" && m.nonce) {
      // Prove we know the secret without sending it: HMAC(token, nonce).
      const frame = token
        ? { t: "auth", hmac: sha256.hmac(token, m.nonce) }
        : { t: "auth", pin };
      sock.send(JSON.stringify(frame));
    } else if (m.t === "authok") {
      connected = true;
      sock.send('{"t":"getmon"}'); // ask which monitors are available
      emit();
    } else if (m.t === "mon" && Array.isArray((m as { list?: unknown }).list)) {
      monitors = (m as { list: { i: number; name: string }[] }).list;
      emit();
    } else if (m.t === "authfail") {
      authFailed = true;
      manualClose = true; // bad credentials — stop, don't hammer with retries
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
export const streamUrl = (mon: number | "auto" = 0) => {
  // Token path: one-way derived stream key (token stays secret). Else PIN.
  const q = token
    ? `k=${sha256.hmac(token, "stream")}`
    : `pin=${encodeURIComponent(pin)}`;
  return `http://${host}:${streamPort}/?${q}&mon=${mon}`;
};

export function useMonitors() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => monitors,
  );
}
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
