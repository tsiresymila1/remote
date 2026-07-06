// Keyboard. A TextInput captures typing; we diff against the previous value and
// stream typed chars (txt) or backspaces (key). Modifiers are sticky toggles:
// tap Ctrl, then the next char/special key is sent as a combo, then they clear.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { combo, key, typeText, useConnected } from "../lib/connection";

const MODIFIERS: [string, string][] = [
  ["ctrl", "ctrl"],
  ["shift", "shift"],
  ["alt", "alt"],
  ["cmd", "cmd"],
];

const SPECIALS: [string, string][] = [
  ["⏎", "enter"],
  ["⌫", "backspace"],
  ["⇥", "tab"],
  ["esc", "escape"],
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

  const toggleMod = (m: string) =>
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  // Send a key/char, wrapped in the active modifiers if any (then clear them).
  const emit = (k: string, isSpecial: boolean) => {
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
    <View className="flex-1 p-4">
      <Text className="mb-2 text-slate-400">
        {connected ? "Type here — sent live to the desktop" : "Not connected"}
      </Text>
      <TextInput
        className="min-h-[100px] rounded-xl border border-slate-700 bg-slate-800 p-3.5 text-base text-slate-200"
        value={buf}
        onChangeText={onChange}
        onSubmitEditing={() => emit("enter", true)}
        blurOnSubmit={false}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        placeholder="Start typing…"
        placeholderTextColor="#64748b"
        multiline
        textAlignVertical="top"
      />

      <Text className="mb-1.5 mt-4 text-[13px] uppercase text-slate-400">
        Modifiers {mods.length > 0 ? `· next key = ${[...mods, "…"].join("+")}` : ""}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MODIFIERS.map(([label, m]) => {
          const on = mods.includes(m);
          return (
            <Pressable
              key={m}
              className={`min-w-[52px] items-center rounded-xl px-3.5 py-3 ${on ? "bg-sky-400" : "bg-slate-700"}`}
              onPress={() => toggleMod(m)}
            >
              <Text
                className={`text-base font-semibold ${on ? "text-slate-900" : "text-slate-200"}`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-1.5 mt-4 text-[13px] uppercase text-slate-400">Keys</Text>
      <View className="flex-row flex-wrap gap-2">
        {SPECIALS.map(([label, k]) => (
          <Pressable
            key={k + label}
            className="min-w-[52px] items-center rounded-xl bg-slate-700 px-3.5 py-3"
            onPress={() => emit(k, true)}
          >
            <Text className="text-base font-semibold text-slate-200">{label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable className="mt-4 items-center" onPress={() => setBuf("")}>
        <Text className="text-sky-400">Clear field (no keys sent)</Text>
      </Pressable>
    </View>
  );
}
