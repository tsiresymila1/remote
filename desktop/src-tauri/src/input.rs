// enigo wrapper — the ONLY place that touches the OS. One Enigo per connection thread.
use enigo::{
    Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};

pub struct Input {
    enigo: Enigo,
}

impl Input {
    pub fn new() -> Result<Self, String> {
        Enigo::new(&Settings::default())
            .map(|enigo| Self { enigo })
            .map_err(|e| e.to_string())
    }

    fn button(b: Option<&str>) -> Button {
        match b {
            Some("right") => Button::Right,
            Some("middle") => Button::Middle,
            _ => Button::Left,
        }
    }

    pub fn move_by(&mut self, dx: i32, dy: i32) {
        let _ = self.enigo.move_mouse(dx, dy, Coordinate::Rel);
    }

    pub fn press(&mut self, b: Option<&str>) {
        let _ = self.enigo.button(Self::button(b), Direction::Press);
    }

    pub fn release(&mut self, b: Option<&str>) {
        let _ = self.enigo.button(Self::button(b), Direction::Release);
    }

    pub fn click(&mut self, b: Option<&str>, n: i64) {
        let btn = Self::button(b);
        let _ = self.enigo.button(btn, Direction::Click);
        if n >= 2 {
            let _ = self.enigo.button(btn, Direction::Click);
        }
    }

    pub fn scroll(&mut self, dx: i32, dy: i32) {
        if dy != 0 {
            let _ = self.enigo.scroll(dy, Axis::Vertical);
        }
        if dx != 0 {
            let _ = self.enigo.scroll(dx, Axis::Horizontal);
        }
    }

    pub fn text(&mut self, s: &str) {
        let _ = self.enigo.text(s);
    }

    pub fn key(&mut self, name: &str) {
        if let Some(k) = map_key(name) {
            let _ = self.enigo.key(k, Direction::Click);
        }
    }

    // Hold modifiers, tap the key, release in reverse. `k` = special-key name or single char.
    pub fn combo(&mut self, mods: &[String], k: &str) {
        let held: Vec<Key> = mods.iter().filter_map(|m| map_mod(m)).collect();
        for m in &held {
            let _ = self.enigo.key(*m, Direction::Press);
        }
        if let Some(key) = map_key(k) {
            let _ = self.enigo.key(key, Direction::Click);
        } else if let Some(c) = k.chars().next() {
            let _ = self.enigo.key(Key::Unicode(c), Direction::Click);
        }
        for m in held.iter().rev() {
            let _ = self.enigo.key(*m, Direction::Release);
        }
    }
}

fn map_mod(name: &str) -> Option<Key> {
    Some(match name.to_lowercase().as_str() {
        "ctrl" | "control" => Key::Control,
        "shift" => Key::Shift,
        "alt" | "option" => Key::Alt,
        "cmd" | "meta" | "win" | "super" => Key::Meta,
        _ => return None,
    })
}

fn map_key(name: &str) -> Option<Key> {
    Some(match name.to_lowercase().as_str() {
        "enter" | "return" => Key::Return,
        "backspace" => Key::Backspace,
        "tab" => Key::Tab,
        "escape" | "esc" => Key::Escape,
        "space" => Key::Space,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "delete" => Key::Delete,
        "home" => Key::Home,
        "end" => Key::End,
        "capslock" => Key::CapsLock,
        _ => return None,
    })
}
