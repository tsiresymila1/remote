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
const TARGET_WIDTH: u32 = 1280; // downscale retina captures; bandwidth over fidelity
const FPS: u64 = 20;
const JPEG_QUALITY: u8 = 70;

// Latest captured frame, versioned so clients can tell "is there a new one?".
struct Latest {
    lock: Mutex<(u64, Vec<u8>)>, // (version, jpeg)
    cond: Condvar,
}
static LATEST: OnceLock<Latest> = OnceLock::new();
static CLIENTS: AtomicUsize = AtomicUsize::new(0);

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

// The single capture loop: publishes the latest frame while clients > 0, then exits.
fn capture_loop() {
    let monitor = match primary_monitor() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("no monitor: {e}");
            return;
        }
    };
    let interval = Duration::from_millis(1000 / FPS);
    let l = latest();
    let mut last_log = Instant::now();
    while CLIENTS.load(Ordering::SeqCst) > 0 {
        let t0 = Instant::now();
        let cap0 = Instant::now();
        let capture = monitor.capture_image();
        let cap_ms = cap0.elapsed().as_millis();
        match capture.map_err(|e| e.to_string()).and_then(|img| encode_jpeg(img)) {
            Ok((jpeg, enc_ms)) => {
                if last_log.elapsed().as_secs() >= 1 {
                    eprintln!("stream: capture {cap_ms}ms encode {enc_ms}ms size {}KB", jpeg.len() / 1024);
                    last_log = Instant::now();
                }
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

    if !crate::auth::verify_stream(k, pin) {
        write!(
            sock,
            "HTTP/1.1 403 Forbidden\r\nContent-Length: 4\r\nConnection: close\r\n\r\nkey?"
        )?;
        return Ok(());
    }

    if path != "/stream" {
        let q = k.map(|v| format!("k={v}")).unwrap_or_else(|| format!("pin={}", pin.unwrap_or("")));
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

fn primary_monitor() -> Result<xcap::Monitor, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "no primary monitor".into())
}

// Returns (jpeg, encode_ms). SIMD downscale (fast_image_resize) then JPEG encode.
fn encode_jpeg(
    img: image::ImageBuffer<image::Rgba<u8>, Vec<u8>>,
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
                fr::FilterType::Bilinear,
            )),
        )
        .map_err(|e| e.to_string())?;

    // RGBA -> RGB (drop alpha) for the JPEG encoder.
    let rgba = dst.into_vec();
    let mut rgb = Vec::with_capacity((nw * nh * 3) as usize);
    for px in rgba.chunks_exact(4) {
        rgb.extend_from_slice(&px[..3]);
    }

    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
        .encode(&rgb, nw, nh, image::ExtendedColorType::Rgb8)
        .map_err(|e| e.to_string())?;
    Ok((out, t.elapsed().as_millis()))
}
