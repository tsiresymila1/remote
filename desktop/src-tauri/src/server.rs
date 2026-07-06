// WebSocket server: decode phone messages, drive Input. Sync tungstenite + one thread per client.
use crate::input::Input;
use serde_json::Value;
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use tungstenite::Message;

// Blocking. Call from a background thread. on_clients(count) fires when the client count changes.
pub fn start<F>(port: u16, on_clients: F)
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
        thread::spawn(move || {
            on_clients(count.fetch_add(1, Ordering::SeqCst) + 1);
            handle(stream);
            on_clients(count.fetch_sub(1, Ordering::SeqCst) - 1);
        });
    }
}

fn handle(stream: std::net::TcpStream) {
    let mut ws = match tungstenite::accept(stream) {
        Ok(ws) => ws,
        Err(_) => return,
    };
    // Enigo lives per-connection (not Send-safe to share). Bail if OS injection is unavailable.
    let mut input = match Input::new() {
        Ok(i) => i,
        Err(e) => {
            eprintln!("input init failed (check Accessibility perms): {e}");
            return;
        }
    };

    loop {
        match ws.read() {
            Ok(Message::Text(txt)) => dispatch(&txt, &mut input, &mut ws),
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }
}

fn dispatch(txt: &str, input: &mut Input, ws: &mut tungstenite::WebSocket<std::net::TcpStream>) {
    let Ok(m): Result<Value, _> = serde_json::from_str(txt) else { return };
    let i = |k: &str| m.get(k).and_then(Value::as_i64).unwrap_or(0);
    let b = m.get("b").and_then(Value::as_str);
    match m.get("t").and_then(Value::as_str) {
        Some("m") => input.move_by(i("dx") as i32, i("dy") as i32),
        Some("down") => input.press(b),
        Some("up") => input.release(b),
        Some("c") => input.click(b, m.get("n").and_then(Value::as_i64).unwrap_or(1)),
        Some("s") => input.scroll(i("dx") as i32, i("dy") as i32),
        Some("txt") => {
            if let Some(s) = m.get("s").and_then(Value::as_str) {
                input.text(s);
            }
        }
        Some("key") => {
            if let Some(k) = m.get("k").and_then(Value::as_str) {
                input.key(k);
            }
        }
        Some("combo") => {
            let mods: Vec<String> = m
                .get("mods")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                .unwrap_or_default();
            if let Some(k) = m.get("k").and_then(Value::as_str) {
                input.combo(&mods, k);
            }
        }
        Some("ping") => {
            let _ = ws.send(Message::Text("{\"t\":\"pong\"}".into()));
        }
        _ => {}
    }
}
