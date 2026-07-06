// Status window. Pulls initial state via get_status, then live-updates on "status" events.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export default function App() {
  const [status, setStatus] = useState({ ips: [], wsPort: "—", clients: 0 });

  useEffect(() => {
    invoke("get_status").then(setStatus).catch(() => {});
    const unlisten = listen("status", (e) => setStatus(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const connected = status.clients > 0;

  return (
    <div className="flex h-screen select-none flex-col items-center justify-center gap-2.5 bg-slate-900 text-slate-200">
      <h1 className="text-base font-semibold">📱 Remote server</h1>
      <div className="flex flex-col items-center">
        {(status.ips.length ? status.ips : ["—"]).map((ip) => (
          <div key={ip} className="font-mono text-2xl text-sky-400">
            {ip}
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-400">WebSocket port {status.wsPort}</div>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span
          className={`inline-block h-3 w-3 rounded-full ${connected ? "bg-green-500" : "bg-slate-500"}`}
        />
        {connected
          ? `${status.clients} phone${status.clients > 1 ? "s" : ""} connected`
          : "Listening…"}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        Closing this window keeps the server running in the tray.
      </div>
    </div>
  );
}
