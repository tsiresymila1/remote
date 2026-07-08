// MJPEG screen streaming over plain HTTP (multipart/x-mixed-replace).
// `GET /stream` = the video feed; `GET /` = a minimal HTML viewer for browser
// testing. Capture only runs while a client is connected — zero idle cost.
//
// ponytail: one capture pipeline per client (a viewer is almost always alone);
// share frames across clients if that ever changes.
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::{Duration, Instant};

pub const STREAM_PORT: u16 = 8091;
const TARGET_WIDTH: u32 = 1280; // downscale retina captures; bandwidth over fidelity
const FPS: u64 = 12;
const JPEG_QUALITY: u8 = 60;

// Blocking. Call from a background thread.
pub fn start(port: u16) {
    let listener = match TcpListener::bind(("0.0.0.0", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("stream bind failed on {port}: {e}");
            return;
        }
    };
    for stream in listener.incoming() {
        if let Ok(sock) = stream {
            thread::spawn(move || {
                let _ = handle(sock); // client gone = loop ends, thread dies
            });
        }
    }
}

fn handle(mut sock: TcpStream) -> std::io::Result<()> {
    // Minimal request parse — path + query.
    let mut buf = [0u8; 2048];
    let n = sock.read(&mut buf)?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let target = req.split_whitespace().nth(1).unwrap_or("/");
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let pin = query
        .split('&')
        .find_map(|kv| kv.strip_prefix("pin="))
        .unwrap_or("");

    // PIN gate — same secret as the WS server.
    if pin != crate::pin() {
        write!(
            sock,
            "HTTP/1.1 403 Forbidden\r\nContent-Length: 4\r\nConnection: close\r\n\r\npin?"
        )?;
        return Ok(());
    }

    if path != "/stream" {
        // Viewer page: img src carries the pin through.
        let html = format!(
            "<!doctype html><title>Remote screen</title>\
             <body style=\"margin:0;background:#000\">\
             <img src=\"/stream?pin={pin}\" style=\"width:100vw;height:100vh;object-fit:contain\">\
             </body>"
        );
        write!(
            sock,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        )?;
        return Ok(());
    }

    let monitor = primary_monitor().map_err(std::io::Error::other)?;
    write!(
        sock,
        "HTTP/1.1 200 OK\r\n\
         Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\
         Cache-Control: no-cache\r\nConnection: close\r\n\r\n"
    )?;

    let interval = Duration::from_millis(1000 / FPS);
    loop {
        let t0 = Instant::now();
        let jpeg = match capture_jpeg(&monitor) {
            Ok(j) => j,
            Err(e) => {
                // Most common cause on macOS: Screen Recording permission missing.
                eprintln!("capture failed: {e} (macOS: grant Screen Recording in Privacy & Security)");
                return Ok(());
            }
        };
        write!(
            sock,
            "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
            jpeg.len()
        )?;
        sock.write_all(&jpeg)?;
        sock.write_all(b"\r\n")?;
        if let Some(rest) = interval.checked_sub(t0.elapsed()) {
            thread::sleep(rest);
        }
    }
}

fn primary_monitor() -> Result<xcap::Monitor, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "no primary monitor".into())
}

fn capture_jpeg(monitor: &xcap::Monitor) -> Result<Vec<u8>, String> {
    let img = monitor.capture_image().map_err(|e| e.to_string())?;
    let (w, h) = (img.width(), img.height());
    let nw = TARGET_WIDTH.min(w);
    let nh = (h as u64 * nw as u64 / w as u64) as u32;
    let small = image::imageops::thumbnail(&img, nw, nh);
    let rgb = image::DynamicImage::ImageRgba8(small).to_rgb8();
    let mut out = Vec::new();
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
    enc.encode_image(&rgb).map_err(|e| e.to_string())?;
    Ok(out)
}
