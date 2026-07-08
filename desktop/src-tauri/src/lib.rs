mod discovery;
mod input;
mod server;
mod stream;

use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};

const WS_PORT: u16 = 8090;

static CLIENTS: AtomicUsize = AtomicUsize::new(0);

#[tauri::command]
fn get_status() -> Value {
    json!({
        "ips": discovery::lan_ips(),
        "wsPort": WS_PORT,
        "clients": CLIENTS.load(Ordering::SeqCst),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_status])
        .setup(|app| {
            // System tray: server keeps running when the window is closed.
            let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Remote server")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // UDP discovery responder.
            thread::spawn(|| discovery::start(WS_PORT));

            // MJPEG screen stream (captures only while a client is connected).
            thread::spawn(|| stream::start(stream::STREAM_PORT));

            // WebSocket input server; emit client count on every change.
            let handle = Arc::new(app.handle().clone());
            let app_for_input = app.handle().clone();
            thread::spawn(move || {
                server::start(WS_PORT, app_for_input, move |clients| {
                    CLIENTS.store(clients, Ordering::SeqCst);
                    let _ = handle.emit(
                        "status",
                        json!({ "ips": discovery::lan_ips(), "wsPort": WS_PORT, "clients": clients }),
                    );
                });
            });
            Ok(())
        })
        // Close button hides to tray instead of quitting.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
