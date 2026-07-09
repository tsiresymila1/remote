// UDP discovery responder. Phone broadcasts "REMOTE_DISCOVER"; we reply with our address.
use serde_json::json;
use std::net::UdpSocket;

pub const DISCOVERY_PORT: u16 = 41234;
const MAGIC: &[u8] = b"REMOTE_DISCOVER";

// All non-loopback IPv4 addresses. Multi-homed hosts (ethernet + internet sharing)
// have several; the phone connects to whichever one the UDP reply arrives from.
pub fn lan_ips() -> Vec<String> {
    local_ip_address::list_afinet_netifas()
        .map(|ifs| {
            ifs.into_iter()
                .filter(|(_, ip)| ip.is_ipv4() && !ip.is_loopback())
                .map(|(_, ip)| ip.to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub fn lan_ip() -> String {
    lan_ips().into_iter().next().unwrap_or_else(|| "127.0.0.1".into())
}

// Blocking. Call from a background thread.
pub fn start(ws_port: u16) {
    let sock = match UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("UDP bind failed on {DISCOVERY_PORT}: {e}");
            return;
        }
    };
    let _ = sock.set_broadcast(true);
    let mut buf = [0u8; 64];

    loop {
        let Ok((n, src)) = sock.recv_from(&mut buf) else { continue };
        if &buf[..n] != MAGIC {
            continue;
        }
        let reply = json!({
            "app": "remote",
            "name": gethostname::gethostname().to_string_lossy(),
            "ip": lan_ip(),
            "wsPort": ws_port,
            "streamPort": crate::stream::STREAM_PORT,
            "monitors": crate::stream::monitors_json(),
            "os": std::env::consts::OS,
        })
        .to_string();
        let _ = sock.send_to(reply.as_bytes(), src);
    }
}
