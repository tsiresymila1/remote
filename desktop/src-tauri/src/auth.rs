// Pairing secrets + HMAC challenge-response.
//
// Two ways for a client to prove it may connect:
//   - PIN (fallback): a 4-digit code typed by the user.
//   - Token (QR): a 256-bit secret delivered via QR. The token NEVER crosses the
//     wire — the server sends a random nonce and the client returns
//     HMAC-SHA256(token_hex, nonce); the server recomputes and compares.
//
// The screen stream can't do challenge-response (a WebView just GETs), so it uses
// a derived one-way key = HMAC(token, "stream"). Leaking it exposes the screen but
// NOT the token, so input auth stays safe.
use std::sync::OnceLock;

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

static PIN: OnceLock<String> = OnceLock::new();
static TOKEN: OnceLock<String> = OnceLock::new();

fn rand_hex(bytes: usize) -> String {
    use rand::RngExt;
    let mut rng = rand::rng();
    (0..bytes).map(|_| format!("{:02x}", rng.random::<u8>())).collect()
}

// 4-digit fallback PIN, once per launch.
pub fn pin() -> &'static str {
    PIN.get_or_init(|| {
        use rand::RngExt;
        format!("{:04}", rand::rng().random_range(0..10_000))
    })
}

// 256-bit hex token, once per launch. Delivered by QR, never sent raw over the wire.
pub fn token() -> &'static str {
    TOKEN.get_or_init(|| rand_hex(32))
}

pub fn hmac_hex(key: &[u8], msg: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac key");
    mac.update(msg);
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// Static per-launch stream key (one-way derived from the token).
pub fn stream_key() -> String {
    hmac_hex(token().as_bytes(), b"stream")
}

// Constant-time string compare (avoid leaking match length via timing).
pub fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

// Fresh 128-bit challenge nonce.
pub fn nonce() -> String {
    rand_hex(16)
}

// Verify a client's answer to `nonce`: correct HMAC of the token, or the PIN.
pub fn verify(hmac: Option<&str>, given_pin: Option<&str>, nonce: &str) -> bool {
    if let Some(h) = hmac {
        return ct_eq(h, &hmac_hex(token().as_bytes(), nonce.as_bytes()));
    }
    if let Some(p) = given_pin {
        return ct_eq(p, pin());
    }
    false
}

// Stream request auth: derived stream key, or the PIN.
pub fn verify_stream(k: Option<&str>, given_pin: Option<&str>) -> bool {
    if let Some(k) = k {
        return ct_eq(k, &stream_key());
    }
    if let Some(p) = given_pin {
        return ct_eq(p, pin());
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    // Must match js-sha256 sha256.hmac() / `openssl dgst -sha256 -hmac` on the phone.
    #[test]
    fn hmac_matches_reference() {
        assert_eq!(
            hmac_hex(b"deadbeef", b"nonce123"),
            "65d610929bd290ae3033d8da25dcf549f4f10ec3c96d8cff3d4212da90e750de"
        );
        assert_eq!(
            hmac_hex(b"deadbeef", b"stream"),
            "197b3df756d275a2e2ebdf3e6231c51709f4247d7beb70245fd11bc01d85b631"
        );
    }
}
