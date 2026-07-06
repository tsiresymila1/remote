// UDP discovery. Broadcast "REMOTE_DISCOVER", collect desktop replies for `timeout` ms.
import dgram from "react-native-udp";

const PORT = 41234;
const MAGIC = "REMOTE_DISCOVER";

export type Server = { name: string; ip: string; wsPort: number; os: string };

let warned = false;

export function discover(timeout = 1500): Promise<Server[]> {
  return new Promise((resolve) => {
    const found = new Map<string, Server>();
    let sock: ReturnType<typeof dgram.createSocket>;
    try {
      sock = dgram.createSocket({ type: "udp4" });
    } catch (e) {
      // Native module missing — Expo Go or a dev client built before react-native-udp
      // was added. Discovery is impossible; manual IP in Settings still works.
      if (!warned) {
        warned = true;
        console.warn(
          "UDP unavailable (rebuild the dev client: npx expo prebuild --clean && npx expo run:android|ios).",
          e,
        );
      }
      resolve([]);
      return;
    }
    // UdpSocket is an EventEmitter at runtime; RN's tsconfig lacks @types/node so on/once aren't typed.
    const ev = sock as unknown as {
      on(
        e: "message",
        cb: (msg: Uint8Array | string, rinfo: { address: string }) => void,
      ): void;
      once(e: "listening", cb: () => void): void;
    };

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

    ev.once("listening", () => {
      sock.setBroadcast(true);
      sock.send(MAGIC, 0, MAGIC.length, PORT, "255.255.255.255", () => {});
    });

    sock.bind(0); // ephemeral local port
    setTimeout(() => {
      try {
        sock.close();
      } catch {}
      resolve([...found.values()]);
    }, timeout);
  });
}
