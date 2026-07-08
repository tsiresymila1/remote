// Status window. Pulls initial state via get_status, then live-updates on "status" events.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export default function App() {
  const [status, setStatus] = useState({ ips: [], wsPort: "—", pin: "----", qr: "", clients: 0 });

  useEffect(() => {
    invoke("get_status").then(setStatus).catch(() => {});
    const unlisten = listen("status", (e) => setStatus(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const connected = status.clients > 0;
  // qrcode crate prepends an <?xml …?> prolog that breaks innerHTML injection.
  const qr = status.qr ? status.qr.slice(status.qr.indexOf("<svg")) : "";

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

      {/* status core: QR + pairing info */}
      <main className="flex flex-1 items-center gap-4 px-5">
        <div
          className="fade-up h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-paper p-1.5 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="fade-up min-w-0" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fog">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-phos" : "bg-fog"}`} />
            {connected
              ? `${status.clients} device${status.clients > 1 ? "s" : ""} linked`
              : "waiting to pair"}
          </div>
          <div className="mt-1 text-sm text-paper/90">Scan to pair</div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-fog">
            or enter pin
          </div>
          <div className="font-mono text-2xl tracking-[0.3em] text-phos">
            {status.pin}
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
        <div className="mt-1.5 text-[10px] text-fog">
          closing this window keeps the server alive in the tray
        </div>
      </footer>
    </div>
  );
}
