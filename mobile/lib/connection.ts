// WebSocket client singleton. Send helpers mirror PROTOCOL.md. Auto-reconnects.
import { useSyncExternalStore } from "react";

let ws: WebSocket | null = null;
let url = "";
let connected = false;
let manualClose = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function connect(host: string, port = 8090) {
  url = `ws://${host}:${port}`;
  manualClose = false;
  open();
}

function open() {
  // Detach the old socket completely so its late events can't clobber the new one's state.
  if (ws) {
    ws.onopen = ws.onclose = ws.onerror = null;
    try {
      ws.close();
    } catch {}
  }
  connected = false;
  emit();

  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return; // superseded by a newer connection
    connected = true;
    emit();
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    connected = false;
    emit();
    if (!manualClose) setTimeout(() => !manualClose && open(), 1500); // auto-reconnect
  };
  sock.onerror = () => {}; // close handler drives reconnect
}

export function disconnect() {
  manualClose = true;
  ws?.close();
  ws = null;
  connected = false;
  emit();
}

function send(obj: object) {
  // readyState is the socket's own truth — the `connected` flag can lag during reconnects.
  if (ws?.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {} // socket died between the check and the send — reconnect logic handles it
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

// React binding.
export const serverUrl = () => url;
export function useConnected() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => connected,
  );
}
