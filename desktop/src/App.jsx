// Status window. Pulls initial state via get_status, then live-updates on "status" events.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export default function App() {
  const [status, setStatus] = useState({ ips: [], wsPort: "—", pin: "----", clients: 0 });

  useEffect(() => {
    invoke("get_status").then(setStatus).catch(() => {});
    const unlisten = listen("status", (e) => setStatus(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const connected = status.clients > 0;

  return (
    <div className="scanlines relative flex h-screen select-none flex-col overflow-hidden bg-ink font-mono text-paper">
      {/* faint radar grid backdrop */}
      <svg
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 opacity-[0.13]"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="96" stroke="#3EF08A" strokeWidth="1" />
        <circle cx="100" cy="100" r="64" stroke="#3EF08A" strokeWidth="1" />
        <circle cx="100" cy="100" r="32" stroke="#3EF08A" strokeWidth="1" />
        <line x1="100" y1="0" x2="100" y2="200" stroke="#3EF08A" strokeWidth="1" />
        <line x1="0" y1="100" x2="200" y2="100" stroke="#3EF08A" strokeWidth="1" />
      </svg>

      {/* header */}
      <header className="fade-up flex items-center justify-between border-b border-line px-5 pb-3 pt-4">
        <div className="font-display text-lg font-extrabold uppercase tracking-[0.22em] text-paper">
          Remote
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-fog">
          input server
        </div>
      </header>

      {/* status core */}
      <main className="flex flex-1 items-center gap-5 px-5">
        <div className="relative grid h-16 w-16 shrink-0 place-items-center">
          {!connected && (
            <>
              <span className="ping-ring absolute inset-0 rounded-full border border-phos-dim" />
              <span className="ping-ring-2 absolute inset-0 rounded-full border border-phos-dim" />
            </>
          )}
          <span
            className={`grid h-9 w-9 place-items-center rounded-full border ${
              connected
                ? "border-phos bg-phos/15 shadow-[0_0_18px_rgba(62,240,138,0.45)]"
                : "border-line-bright bg-panel"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-phos" : "bg-fog"}`}
            />
          </span>
        </div>

        <div className="fade-up min-w-0" style={{ animationDelay: "0.1s" }}>
          <div className="text-[10px] uppercase tracking-[0.18em] text-fog">
            {connected ? "link established" : "scanning for phones"}
          </div>
          <div className="mt-0.5 truncate text-xl font-medium text-phos">
            {connected
              ? `${status.clients} device${status.clients > 1 ? "s" : ""} connected`
              : "Listening…"}
          </div>
        </div>
      </main>

      {/* address plate */}
      <footer className="fade-up border-t border-line bg-panel/60 px-5 py-3" style={{ animationDelay: "0.2s" }}>
        <div className="text-[10px] uppercase tracking-[0.18em] text-fog">
          reachable at · ws port {status.wsPort}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {(status.ips.length ? status.ips : ["—"]).map((ip) => (
            <span key={ip} className="text-sm text-paper/90">
              {ip}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-fog">
            pairing pin
          </span>
          <span className="font-mono text-lg tracking-[0.3em] text-phos">
            {status.pin}
          </span>
        </div>
        <div className="mt-1.5 text-[10px] text-fog">
          closing this window keeps the server alive in the tray
        </div>
      </footer>
    </div>
  );
}
