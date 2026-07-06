// Keyboard. A TextInput captures typing; we diff against the previous value and
// stream typed chars (txt) or backspaces (key). Modifiers are sticky toggles:
// tap Ctrl, then the next char/special key is sent as a combo, then they clear.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Azerty from "../components/Azerty";
import { combo, key, typeText, useConnected } from "../lib/connection";
import { keyHaptic } from "../lib/haptics";
import { setKbFullscreen, useKbFullscreen } from "../lib/ui";

const MODIFIERS: [string, string][] = [
  ["CTRL", "ctrl"],
  ["SHIFT", "shift"],
  ["ALT", "alt"],
  ["CMD", "cmd"],
];

const SPECIALS: [string, string][] = [
  ["⏎", "enter"],
  ["⌫", "backspace"],
  ["⇥", "tab"],
  ["ESC", "escape"],
  ["←", "left"],
  ["↑", "up"],
  ["↓", "down"],
  ["→", "right"],
  ["⇪", "capslock"],
];

export default function Keyboard() {
  const connected = useConnected();
  const [buf, setBuf] = useState("");
  const [mods, setMods] = useState<string[]>([]);
  const azerty = useKbFullscreen();

  // Full-screen AZERTY keyboard: locks landscape, App shell hides header + tabs.
  // The red ✕ keycap (top right of the board) exits and restores portrait.
  if (azerty) {
    return <Azerty onClose={() => setKbFullscreen(false)} />;
  }

  const toggleMod = (m: string) => {
    keyHaptic();
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  };

  // Send a key/char, wrapped in the active modifiers if any (then clear them).
  const emit = (k: string, isSpecial: boolean) => {
    keyHaptic();
    if (mods.length > 0) {
      combo(mods, k);
      setMods([]);
    } else if (isSpecial) {
      key(k);
    } else {
      typeText(k);
    }
  };

  const onChange = (next: string) => {
    let c = 0;
    while (c < next.length && c < buf.length && next[c] === buf[c]) c++;
    for (let i = 0; i < buf.length - c; i++) key("backspace");
    const added = next.slice(c);
    if (added) {
      if (mods.length > 0) {
        combo(mods, added[0]); // combo takes a single key
        setMods([]);
        if (added.length > 1) typeText(added.slice(1));
      } else {
        typeText(added);
      }
    }
    setBuf(next);
  };

  return (
    <View className="flex-1 px-5 pt-5">
      <Text
        className={`mb-2 font-mono text-[10px] tracking-[3px] ${
          connected ? "text-fog" : "text-ember"
        }`}
      >
        {connected ? "LIVE FEED → DESKTOP" : "NO LINK"}
      </Text>
      <TextInput
        className="min-h-[96px] rounded-2xl border border-line bg-panel p-4 font-mono text-base text-paper"
        value={buf}
        onChangeText={onChange}
        onSubmitEditing={() => emit("enter", true)}
        blurOnSubmit={false}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        placeholder="type here…"
        placeholderTextColor="#5C6E66"
        multiline
        textAlignVertical="top"
      />

      <Text className="mb-2 mt-5 font-mono text-[10px] tracking-[3px] text-fog">
        MODIFIERS{mods.length > 0 ? ` · ARMED: ${mods.join("+").toUpperCase()}+…` : ""}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MODIFIERS.map(([label, m]) => {
          const on = mods.includes(m);
          return (
            <Pressable
              key={m}
              className={`min-w-[64px] items-center rounded-xl border px-4 py-3 ${
                on ? "border-phos bg-phos/15" : "border-line bg-panel"
              }`}
              onPress={() => toggleMod(m)}
            >
              <Text
                className={`font-mono text-xs font-bold tracking-[2px] ${
                  on ? "text-phos" : "text-paper"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-2 mt-5 font-mono text-[10px] tracking-[3px] text-fog">
        KEYS
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {SPECIALS.map(([label, k]) => (
          <Pressable
            key={k + label}
            className="min-w-[52px] items-center rounded-xl border border-line bg-panel px-3.5 py-3 active:border-phos-dim active:bg-phos/10"
            onPress={() => emit(k, true)}
          >
            <Text className="font-mono text-base font-bold text-paper">{label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable className="mt-5 items-center" onPress={() => setBuf("")}>
        <Text className="font-mono text-[11px] tracking-[2px] text-phos">
          CLEAR FIELD · NOTHING SENT
        </Text>
      </Pressable>

      <Pressable
        className="mt-4 items-center rounded-xl border border-phos-dim bg-phos/10 py-3.5 active:bg-phos/20"
        onPress={() => setKbFullscreen(true)}
      >
        <Text className="font-mono text-xs font-bold tracking-[2px] text-phos">
          ⌨ FULL AZERTY KEYBOARD
        </Text>
      </Pressable>
    </View>
  );
}
