// MJPEG screen streaming over plain HTTP (multipart/x-mixed-replace).
// `GET /stream` = the video feed; `GET /` = a minimal HTML viewer.
//
// Low latency by design: ONE capture loop keeps only the latest frame; each
// client always sends the freshest frame and skips any it couldn't keep up with,
// so frames never pile up in the TCP buffer (that pile is what causes multi-second
// lag). Capture runs only while at least one client is connected.
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

pub const STREAM_PORT: u16 = 8091;
const TARGET_WIDTH: u32 = 1920; // downscale width; raise toward native for sharper image
const FPS: u64 = 20;
const JPEG_QUALITY: u8 = 85; // 0-100; higher = fewer compression artifacts, more bandwidth

// Latest captured frame, versioned so clients can tell "is there a new one?".
struct Latest {
    lock: Mutex<(u64, Vec<u8>)>, // (version, jpeg)
    cond: Condvar,
}
static LATEST: OnceLock<Latest> = OnceLock::new();
static CLIENTS: AtomicUsize = AtomicUsize::new(0);
static SELECTED_MON: AtomicUsize = AtomicUsize::new(0); // which monitor to stream

// Monitor list for the phone's screen picker: [{ i, name }].
pub fn monitors_json() -> Vec<serde_json::Value> {
    xcap::Monitor::all()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let name = m
                .friendly_name()
                .or_else(|_| m.name())
                .unwrap_or_else(|_| format!("Display {}", i + 1));
            serde_json::json!({ "i": i, "name": name })
        })
        .collect()
}

fn latest() -> &'static Latest {
    LATEST.get_or_init(|| Latest {
        lock: Mutex::new((0, Vec::new())),
        cond: Condvar::new(),
    })
}

// Blocking. Call from a background thread.
pub fn start(port: u16) {
    let listener = match TcpListener::bind(("0.0.0.0", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("stream bind failed on {port}: {e}");
            return;
        }
    };
    for stream in listener.incoming().flatten() {
        thread::spawn(move || {
            let _ = handle(stream);
        });
    }
}

// The single capture loop: publishes the latest frame of the SELECTED monitor
// while clients > 0, then exits.
fn capture_loop() {
    let monitors = match xcap::Monitor::all() {
        Ok(m) if !m.is_empty() => m,
        _ => {
            eprintln!("no monitors");
            return;
        }
    };
    let interval = Duration::from_millis(1000 / FPS);
    let l = latest();
    while CLIENTS.load(Ordering::SeqCst) > 0 {
        let t0 = Instant::now();
        let idx = SELECTED_MON.load(Ordering::SeqCst).min(monitors.len() - 1);
        let monitor = &monitors[idx];
        match monitor
            .capture_image()
            .map_err(|e| e.to_string())
            .and_then(|img| encode_jpeg(img, monitor))
        {
            Ok((jpeg, _enc_ms)) => {
                let mut g = l.lock.lock().unwrap();
                g.0 += 1;
                g.1 = jpeg;
                drop(g);
                l.cond.notify_all();
            }
            Err(e) => {
                eprintln!("capture failed: {e} (macOS: grant Screen Recording in Privacy & Security)");
                return;
            }
        }
        if let Some(rest) = interval.checked_sub(t0.elapsed()) {
            thread::sleep(rest);
        }
    }
}

fn handle(mut sock: TcpStream) -> std::io::Result<()> {
    let mut buf = [0u8; 2048];
    let n = sock.read(&mut buf)?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let target = req.split_whitespace().nth(1).unwrap_or("/");
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let param = |name: &str| query.split('&').find_map(|kv| kv.strip_prefix(name));
    let k = param("k=");
    let pin = param("pin=");

    // Optional monitor selection (?mon=N).
    if let Some(n) = param("mon=").and_then(|v| v.parse::<usize>().ok()) {
        SELECTED_MON.store(n, Ordering::SeqCst);
    }

    if !crate::auth::verify_stream(k, pin) {
        write!(
            sock,
            "HTTP/1.1 403 Forbidden\r\nContent-Length: 4\r\nConnection: close\r\n\r\nkey?"
        )?;
        return Ok(());
    }

    if path != "/stream" {
        let mut q = k.map(|v| format!("k={v}")).unwrap_or_else(|| format!("pin={}", pin.unwrap_or("")));
        if let Some(m) = param("mon=") {
            q.push_str(&format!("&mon={m}"));
        }
        let html = format!(
            "<!doctype html><title>Remote screen</title>\
             <body style=\"margin:0;background:#000\">\
             <img src=\"/stream?{q}\" style=\"width:100vw;height:100vh;object-fit:contain\">\
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

    // Send frames as they come. NODELAY so each frame ships immediately.
    let _ = sock.set_nodelay(true);
    write!(
        sock,
        "HTTP/1.1 200 OK\r\n\
         Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\
         Cache-Control: no-cache\r\nConnection: close\r\n\r\n"
    )?;

    // First client starts the capture loop.
    if CLIENTS.fetch_add(1, Ordering::SeqCst) == 0 {
        thread::spawn(capture_loop);
    }
    let result = stream_frames(&mut sock);
    CLIENTS.fetch_sub(1, Ordering::SeqCst);
    result
}

fn stream_frames(sock: &mut TcpStream) -> std::io::Result<()> {
    let l = latest();
    let mut sent = 0u64;
    loop {
        // Wait for a frame newer than the one we last sent — always the freshest.
        let jpeg = {
            let mut g = l.lock.lock().unwrap();
            while g.0 == sent {
                let (ng, timeout) = l.cond.wait_timeout(g, Duration::from_secs(2)).unwrap();
                g = ng;
                if timeout.timed_out() && g.0 == sent {
                    return Ok(()); // capture stalled/stopped — drop the client
                }
            }
            sent = g.0;
            g.1.clone()
        };
        write!(
            sock,
            "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
            jpeg.len()
        )?;
        sock.write_all(&jpeg)?;
        sock.write_all(b"\r\n")?;
    }
}

// Returns (jpeg, encode_ms). SIMD downscale (fast_image_resize) then JPEG encode.
// The OS capture omits the cursor, so we draw it in ourselves.
fn encode_jpeg(
    img: image::ImageBuffer<image::Rgba<u8>, Vec<u8>>,
    monitor: &xcap::Monitor,
) -> Result<(Vec<u8>, u128), String> {
    use fast_image_resize as fr;
    let t = Instant::now();
    let (w, h) = (img.width(), img.height());
    let nw = TARGET_WIDTH.min(w);
    let nh = (h as u64 * nw as u64 / w as u64) as u32;

    let src = fr::images::Image::from_vec_u8(w, h, img.into_raw(), fr::PixelType::U8x4)
        .map_err(|e| e.to_string())?;
    let mut dst = fr::images::Image::new(nw, nh, fr::PixelType::U8x4);
    fr::Resizer::new()
        .resize(
            &src,
            &mut dst,
            &fr::ResizeOptions::new().resize_alg(fr::ResizeAlg::Convolution(
                fr::FilterType::Lanczos3, // sharper downscale than bilinear
            )),
        )
        .map_err(|e| e.to_string())?;

    let mut rgba = dst.into_vec();
    draw_cursor(&mut rgba, nw, nh, monitor, w);

    // jpeg-encoder (SIMD) encodes the resized RGBA directly — no manual RGBA->RGB.
    let mut out = Vec::new();
    jpeg_encoder::Encoder::new(&mut out, JPEG_QUALITY)
        .encode(&rgba, nw as u16, nh as u16, jpeg_encoder::ColorType::Rgba)
        .map_err(|e| e.to_string())?;
    Ok((out, t.elapsed().as_millis()))
}

// Draw an arrow cursor into the resized RGBA frame at the current mouse position.
fn draw_cursor(buf: &mut [u8], nw: u32, nh: u32, monitor: &xcap::Monitor, cap_w: u32) {
    use mouse_position::mouse_position::Mouse;
    let (mx, my) = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (x, y),
        Mouse::Error => return,
    };
    let (Ok(ox), Ok(oy), Ok(scale)) = (monitor.x(), monitor.y(), monitor.scale_factor()) else {
        return;
    };
    // Cursor is in logical points; the capture is physical px. Map to resized px.
    let px_per_unit = nw as f32 / cap_w as f32 * scale; // resized px per logical point
    let cx = ((mx - ox) as f32 * px_per_unit) as i32;
    let cy = ((my - oy) as f32 * px_per_unit) as i32;
    if cx < 0 || cy < 0 || cx >= nw as i32 || cy >= nh as i32 {
        return;
    }

    // Classic arrow: tip at (cx,cy), a filled white triangle with a black edge.
    let tri = [(0.0f32, 0.0f32), (13.0, 5.0), (5.0, 13.0)];
    let put = |buf: &mut [u8], x: i32, y: i32, c: [u8; 3]| {
        if x < 0 || y < 0 || x >= nw as i32 || y >= nh as i32 {
            return;
        }
        let i = ((y as u32 * nw + x as u32) * 4) as usize;
        buf[i] = c[0];
        buf[i + 1] = c[1];
        buf[i + 2] = c[2];
        buf[i + 3] = 255;
    };
    let inside = |x: f32, y: f32| {
        let sign = |a: (f32, f32), b: (f32, f32)| (x - b.0) * (a.1 - b.1) - (a.0 - b.0) * (y - b.1);
        let d1 = sign(tri[0], tri[1]);
        let d2 = sign(tri[1], tri[2]);
        let d3 = sign(tri[2], tri[0]);
        let neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
        let pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
        !(neg && pos)
    };
    // Black 1px halo first (offsets), then white fill on top — cheap outline.
    for dy in 0..15i32 {
        for dx in 0..15i32 {
            if inside(dx as f32, dy as f32) {
                for (ox2, oy2) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                    put(buf, cx + dx + ox2, cy + dy + oy2, [0, 0, 0]);
                }
            }
        }
    }
    for dy in 0..15i32 {
        for dx in 0..15i32 {
            if inside(dx as f32, dy as f32) {
                put(buf, cx + dx, cy + dy, [255, 255, 255]);
            }
        }
    }
}
