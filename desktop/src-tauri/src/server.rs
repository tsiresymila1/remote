// WebSocket server: decode phone messages into input::Cmd and hand them to the
// Tauri main thread (macOS input APIs must run there). See PROTOCOL.md.
use crate::input::{self, Cmd};
use serde_json::Value;
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::AppHandle;
use tungstenite::Message;

// Blocking. Call from a background thread. on_clients(count) fires when the client count changes.
pub fn start<F>(port: u16, app: AppHandle, on_clients: F)
where
    F: Fn(usize) + Send + Sync + 'static,
{
    let listener = match TcpListener::bind(("0.0.0.0", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("WS bind failed on {port}: {e}");
            return;
        }
    };
    let count = Arc::new(AtomicUsize::new(0));
    let on_clients = Arc::new(on_clients);

    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let count = count.clone();
        let on_clients = on_clients.clone();
        let app = app.clone();
        thread::spawn(move || {
            on_clients(count.fetch_add(1, Ordering::SeqCst) + 1);
            handle(stream, &app);
            on_clients(count.fetch_sub(1, Ordering::SeqCst) - 1);
        });
    }
}

fn handle(stream: std::net::TcpStream, app: &AppHandle) {
    let mut ws = match tungstenite::accept(stream) {
        Ok(ws) => ws,
        Err(_) => return,
    };

    // PIN gate: the first frame must be a correct {t:"auth",pin:"..."} or we drop.
    let mut authed = false;
    loop {
        match ws.read() {
            Ok(Message::Text(txt)) => {
                if authed {
                    dispatch(&txt, app, &mut ws);
                } else if is_hello(&txt) {
                    let _ = ws.send(Message::Text(hello_reply().into())); // discovery works pre-auth
                } else {
                    match check_auth(&txt) {
                        Some(true) => {
                            authed = true;
                            let _ = ws.send(Message::Text("{\"t\":\"authok\"}".into()));
                        }
                        Some(false) => {
                            let _ = ws.send(Message::Text("{\"t\":\"authfail\"}".into()));
                            break; // wrong PIN — disconnect
                        }
                        None => {} // ignore anything before auth
                    }
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }
}

fn is_hello(txt: &str) -> bool {
    serde_json::from_str::<Value>(txt)
        .ok()
        .and_then(|m| m.get("t").and_then(Value::as_str).map(|t| t == "hello"))
        .unwrap_or(false)
}

// Discovery reply: identifies this server to a subnet-sweeping client (pre-auth).
fn hello_reply() -> String {
    serde_json::json!({
        "t": "info",
        "app": "remote",
        "name": gethostname::gethostname().to_string_lossy(),
        "streamPort": crate::stream::STREAM_PORT,
        "os": std::env::consts::OS,
    })
    .to_string()
}

// Some(true/false) if this is an auth frame (pin match), None otherwise.
fn check_auth(txt: &str) -> Option<bool> {
    let m: Value = serde_json::from_str(txt).ok()?;
    if m.get("t").and_then(Value::as_str)? != "auth" {
        return None;
    }
    Some(m.get("pin").and_then(Value::as_str) == Some(crate::pin()))
}

fn dispatch(txt: &str, app: &AppHandle, ws: &mut tungstenite::WebSocket<std::net::TcpStream>) {
    let Ok(m): Result<Value, _> = serde_json::from_str(txt) else { return };
    let i = |k: &str| m.get(k).and_then(Value::as_i64).unwrap_or(0) as i32;
    let b = || m.get("b").and_then(Value::as_str).map(String::from);
    let s = |k: &str| m.get(k).and_then(Value::as_str).map(String::from);

    let cmd = match m.get("t").and_then(Value::as_str) {
        Some("m") => Some(Cmd::Move(i("dx"), i("dy"))),
        Some("down") => Some(Cmd::Press(b())),
        Some("up") => Some(Cmd::Release(b())),
        Some("c") => Some(Cmd::Click(b(), m.get("n").and_then(Value::as_i64).unwrap_or(1))),
        Some("s") => Some(Cmd::Scroll(i("dx"), i("dy"))),
        Some("txt") => s("s").map(Cmd::Text),
        Some("key") => s("k").map(Cmd::Key),
        Some("combo") => {
            let mods: Vec<String> = m
                .get("mods")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                .unwrap_or_default();
            s("k").map(|k| Cmd::Combo(mods, k))
        }
        Some("ping") => {
            let _ = ws.send(Message::Text("{\"t\":\"pong\"}".into()));
            None
        }
        _ => None,
    };

    if let Some(cmd) = cmd {
        // macOS TSM/HIToolbox APIs assert the main queue — never inject from here.
        let _ = app.run_on_main_thread(move || input::run(cmd));
    }
}
