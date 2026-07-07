// Server discovery, two strategies:
// 1. UDP broadcast (fast, needs the react-native-udp native module)
// 2. Fallback: TCP sweep of the /24 subnet over WebSocket with a hello→info
//    handshake — pure JS + expo-network, works even when UDP is unavailable.
import dgram from "react-native-udp";
import * as Network from "expo-network";

const PORT = 41234;
const WS_PORT = 8090;
const MAGIC = "REMOTE_DISCOVER";

export type Server = { name: string; ip: string; wsPort: number; os: string };

// True when the UDP native module is missing (Expo Go / stale dev client).
export let udpUnavailable = false;

export async function discover(timeout = 1500): Promise<Server[]> {
  const viaUdp = await discoverUdp(timeout);
  if (viaUdp.length > 0) return viaUdp;
  // UDP dead or silent (module missing, broadcast blocked) → sweep the subnet.
  return sweep();
}

const CLIENT_PORT = 41235; // fixed reply port; port 0 + the 'listening' event are flaky in react-native-udp

function discoverUdp(timeout: number): Promise<Server[]> {
  return new Promise((resolve) => {
    const found = new Map<string, Server>();
    let finished = false;
    let sock: ReturnType<typeof dgram.createSocket>;

    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        sock?.close();
      } catch {}
      resolve([...found.values()]);
    };

    try {
      sock = dgram.createSocket({ type: "udp4", reusePort: true } as { type: "udp4" });
    } catch {
      udpUnavailable = true;
      resolve([]);
      return;
    }
    udpUnavailable = false;
    // UdpSocket is an EventEmitter at runtime; RN's tsconfig lacks @types/node so on/once aren't typed.
    const ev = sock as unknown as {
      on(e: "error", cb: (err: unknown) => void): void;
      on(
        e: "message",
        cb: (msg: Uint8Array | string, rinfo: { address: string }) => void,
      ): void;
    };

    // Without an error listener the EventEmitter throws "Unhandled error" and red-screens.
    ev.on("error", finish);

    ev.on("message", (msg, rinfo) => {
      try {
        const d = JSON.parse(msg.toString());
        // Trust the packet's source address, not the advertised ip — on multi-homed
        // hosts (ethernet + internet sharing) the advertised ip is often the wrong interface.
        if (d.app === "remote")
          found.set(rinfo.address, {
            name: d.name,
            ip: rinfo.address,
            wsPort: d.wsPort,
            os: d.os,
          });
      } catch {}
    });

    // bind callback is reliable across lib versions; the 'listening' event can
    // arrive after our timeout has already closed the socket.
    try {
      sock.bind(CLIENT_PORT, () => {
        if (finished) return;
        try {
          sock.setBroadcast(true);
          sock.send(MAGIC, 0, MAGIC.length, PORT, "255.255.255.255", () => {});
        } catch {
          finish();
        }
      });
    } catch {
      finish();
      return;
    }
    setTimeout(finish, timeout);
  });
}

// Try ws://<host>:8090 on every /24 neighbor; a server answers hello with info.
async function sweep(): Promise<Server[]> {
  let ip: string;
  try {
    ip = await Network.getIpAddressAsync();
  } catch {
    return []; // expo-network missing too — nothing we can do
  }
  if (!ip || ip.split(".").length !== 4) return [];
  const base = ip.split(".").slice(0, 3).join(".");
  const found: Server[] = [];

  const probe = (host: string) =>
    new Promise<void>((res) => {
      let ws: WebSocket | null = null;
      const done = () => {
        try {
          ws?.close();
        } catch {}
        res();
      };
      const timer = setTimeout(done, 600);
      try {
        ws = new WebSocket(`ws://${host}:${WS_PORT}`);
      } catch {
        clearTimeout(timer);
        res();
        return;
      }
      ws.onopen = () => ws?.send('{"t":"hello"}');
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(String(e.data));
          if (d.t === "info" && d.app === "remote")
            found.push({ name: d.name, ip: host, wsPort: WS_PORT, os: d.os });
        } catch {}
        clearTimeout(timer);
        done();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        done();
      };
    });

  const hosts = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`).filter(
    (h) => h !== ip,
  );
  const BATCH = 50;
  for (let i = 0; i < hosts.length && found.length === 0; i += BATCH) {
    await Promise.all(hosts.slice(i, i + BATCH).map(probe));
  }
  return found;
}
