// Full macOS-French AZERTY keyboard for landscape, styled like a TKL mechanical
// board (two-tone keycaps, red esc, F-row, nav cluster, arrows). The rotary
// "knob" (top right of the main block) switches between the mechanical look and
// the app's flat phosphor theme.
//
// Chars are sent as unicode text (enigo types them directly) so the visual
// layout works whatever layout macOS is set to. Modifiers are sticky.
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { combo, key, typeText } from "../lib/connection";
import { keyHaptic } from "../lib/haptics";

type Cell = {
  b?: string; // base char / main (bottom) legend
  t?: string; // shifted char / top legend
  k?: string; // protocol special-key name
  m?: string; // modifier toggled by this key (ctrl/alt/cmd/shift)
  w?: number; // width in u (default 1)
  v?: "grey" | "dark" | "red" | "knob" | "gap"; // keycap variant (default grey)
  label?: string; // display label override (mods/specials)
  close?: boolean; // exits the fullscreen keyboard
  caps?: boolean; // local caps-lock toggle
};

const g = (w: number): Cell => ({ v: "gap", w });

// TKL: 15u main block + 0.4u gutter + 3u nav cluster per row.
const ROWS: Cell[][] = [
  [
    { label: "esc", k: "escape", v: "red" },
    g(0.4),
    ...[1, 2, 3, 4].map((n) => ({ label: `F${n}`, k: `f${n}`, v: "dark" as const })),
    g(0.3),
    ...[5, 6, 7, 8].map((n) => ({ label: `F${n}`, k: `f${n}`, v: "dark" as const })),
    g(0.3),
    ...[9, 10, 11, 12].map((n) => ({ label: `F${n}`, k: `f${n}`, v: "dark" as const })),
    g(0.6),
    { v: "knob", w: 0.9, label: "" },
    g(0.4 + 2),
    { label: "✕", v: "red", close: true },
  ],
  [
    { b: "@", t: "#" },
    { b: "&", t: "1" },
    { b: "é", t: "2" },
    { b: '"', t: "3" },
    { b: "'", t: "4" },
    { b: "(", t: "5" },
    { b: "§", t: "6" },
    { b: "è", t: "7" },
    { b: "!", t: "8" },
    { b: "ç", t: "9" },
    { b: "à", t: "0" },
    { b: ")", t: "°" },
    { b: "-", t: "_" },
    { label: "⌫", k: "backspace", w: 2, v: "dark" },
    g(0.4),
    { label: "ins", v: "dark" },
    { label: "home", k: "home", v: "dark" },
    { label: "pgup", k: "pageup", v: "dark" },
  ],
  [
    { label: "⇥", k: "tab", w: 1.5, v: "dark" },
    { b: "a" },
    { b: "z" },
    { b: "e" },
    { b: "r" },
    { b: "t" },
    { b: "y" },
    { b: "u" },
    { b: "i" },
    { b: "o" },
    { b: "p" },
    { b: "^", t: "¨" },
    { b: "$", t: "*" },
    { label: "⏎", k: "enter", w: 1.5, v: "dark" },
    g(0.4),
    { label: "del", k: "delete", v: "dark" },
    { label: "end", k: "end", v: "dark" },
    { label: "pgdn", k: "pagedown", v: "dark" },
  ],
  [
    { label: "caps", caps: true, w: 1.75, v: "dark" },
    { b: "q" },
    { b: "s" },
    { b: "d" },
    { b: "f" },
    { b: "g" },
    { b: "h" },
    { b: "j" },
    { b: "k" },
    { b: "l" },
    { b: "m" },
    { b: "ù", t: "%" },
    { b: "`", t: "£" },
    { label: "⏎", k: "enter", w: 1.25, v: "dark" },
    g(0.4 + 3),
  ],
  [
    { label: "⇧", m: "shift", w: 1.25, v: "dark" },
    { b: "<", t: ">" },
    { b: "w" },
    { b: "x" },
    { b: "c" },
    { b: "v" },
    { b: "b" },
    { b: "n" },
    { b: ",", t: "?" },
    { b: ";", t: "." },
    { b: ":", t: "/" },
    { b: "=", t: "+" },
    { label: "⇧", m: "shift", w: 2.75, v: "dark" },
    g(0.4 + 1),
    { label: "↑", k: "up", v: "dark" },
    g(1),
  ],
  [
    { label: "ctrl", m: "ctrl", w: 1.25, v: "dark" },
    { label: "⌥", m: "alt", w: 1.25, v: "dark" },
    { label: "⌘", m: "cmd", w: 1.25, v: "dark" },
    { b: " ", w: 6.25, label: "" },
    { label: "⌘", m: "cmd", w: 1.25, v: "dark" },
    { label: "⌥", m: "alt", w: 1.25, v: "dark" },
    { label: "fn", w: 1.25, v: "dark" },
    { label: "ctrl", m: "ctrl", w: 1.25, v: "dark" },
    g(0.4),
    { label: "←", k: "left", v: "dark" },
    { label: "↓", k: "down", v: "dark" },
    { label: "→", k: "right", v: "dark" },
  ],
];

// Keycap palettes per variant, mech theme.
const MECH = {
  grey: { bezel: "#3A4150", face: "#5C6575", text: "#E8ECF3", sub: "#B9C1CE" },
  dark: { bezel: "#14161B", face: "#262A32", text: "#D7DBE2", sub: "#8B93A1" },
  red: { bezel: "#8E2626", face: "#C43C3C", text: "#FFFFFF", sub: "#FFD7D7" },
};

const isLetter = (c: string) => c.length === 1 && c.toLowerCase() !== c.toUpperCase();

// Hardware-keyboard repeat: first repeat after DELAY, then every EVERY ms until finger up.
const REPEAT_DELAY = 400;
const REPEAT_EVERY = 65;

export default function Azerty({ onClose }: { onClose?: () => void }) {
  const [mods, setMods] = useState<string[]>([]);
  const [mech, setMech] = useState(true);
  const [caps, setCaps] = useState(false);
  const shifted = mods.includes("shift");

  // Real caps-lock semantics: letters upper while locked; shift inverts it (caps+shift = lower).
  const charFor = (d: Cell) => {
    if (isLetter(d.b!)) {
      return caps !== shifted ? d.b!.toUpperCase() : d.b!;
    }
    return shifted ? (d.t ?? d.b!) : d.b!;
  };

  // Per-key repeat timers (multi-touch safe: one entry per keycap).
  const timers = useRef(
    new Map<string, { t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>(),
  ).current;

  // Kill every timer on unmount (✕ while a key is held) or keys repeat forever.
  useEffect(
    () => () => {
      timers.forEach((r) => {
        clearTimeout(r.t);
        clearInterval(r.i);
      });
      timers.clear();
    },
    [timers],
  );

  const pressOut = (id: string) => {
    const rec = timers.get(id);
    if (rec) {
      clearTimeout(rec.t);
      clearInterval(rec.i);
      timers.delete(id);
    }
  };

  const pressIn = (d: Cell, id: string) => {
    pressOut(id); // kill any orphan timer from a missed up before re-arming
    press(d); // fires on finger DOWN — haptic + send immediately
    if (d.m || d.caps || d.close) return; // stateful keys don't auto-repeat
    const rec: { t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> } = {};
    rec.t = setTimeout(() => {
      if (timers.get(id) !== rec) return; // released while waiting — don't start the loop
      rec.i = setInterval(() => {
        if (timers.get(id) !== rec) {
          clearInterval(rec.i); // self-heal: entry gone but interval alive → stop firing
          return;
        }
        press(d);
      }, REPEAT_EVERY);
    }, REPEAT_DELAY);
    timers.set(id, rec);
  };

  const press = (d: Cell) => {
    keyHaptic();
    if (d.close) {
      onClose?.();
      return;
    }
    if (d.caps) {
      setCaps((v) => !v); // local lock — stays on until tapped again
      return;
    }
    if (d.m) {
      setMods((cur) =>
        cur.includes(d.m!) ? cur.filter((x) => x !== d.m) : [...cur, d.m!],
      );
      return;
    }
    const others = mods.filter((m) => m !== "shift"); // ctrl/alt/cmd
    if (d.k) {
      if (mods.length > 0) combo(mods, d.k); // e.g. shift+arrow, cmd+tab
      else key(d.k);
    } else if (d.b) {
      if (others.length > 0) {
        combo(others, d.b); // shortcuts use the base char (cmd+a, ctrl+c…)
      } else {
        typeText(charFor(d));
      }
    } else {
      return; // dead key (fn, ins)
    }
    if (mods.length > 0) setMods([]); // modifiers auto-release after one key
  };

  const renderCell = (d: Cell, idx: string) => {
    const w = d.w ?? 1;
    if (d.v === "gap") return <View key={idx} style={{ flex: w }} />;

    if (d.v === "knob") {
      // The Keychron knob → theme switch.
      return (
        <Pressable
          key={idx}
          style={{ flex: w }}
          className="items-center justify-center"
          onPress={() => setMech((v) => !v)}
        >
          <View
            className={`aspect-square w-[80%] items-center justify-center rounded-full border-2 ${
              mech ? "border-[#3A4150] bg-[#1A1D23]" : "border-phos-dim bg-panel"
            }`}
          >
            <View className={`h-1/3 w-0.5 ${mech ? "bg-[#8B93A1]" : "bg-phos"}`} />
          </View>
        </Pressable>
      );
    }

    const active = d.m ? mods.includes(d.m) : d.caps ? caps : false;
    const main = d.label !== undefined ? d.label : charFor(d);
    const sub = d.label === undefined && d.t && !shifted ? d.t : undefined;

    if (!mech) {
      // flat phosphor theme (the app's regular design)
      return (
        <Pressable
          key={idx}
          style={{ flex: w }}
          className={`items-center justify-center rounded-lg border ${
            active
              ? "border-phos bg-phos/15"
              : "border-line bg-panel active:border-phos-dim active:bg-phos/10"
          }`}
          onPressIn={() => pressIn(d, idx)}
          onPressOut={() => pressOut(idx)}
          onTouchCancel={() => pressOut(idx)}
        >
          {sub && <Text className="font-mono text-[8px] text-fog">{sub}</Text>}
          <Text
            className={`font-mono text-[13px] font-bold ${active ? "text-phos" : "text-paper"}`}
          >
            {main}
          </Text>
        </Pressable>
      );
    }

    // mechanical keycap: dark bezel + raised top face, pressed = sink
    const c = MECH[d.v === "red" ? "red" : d.v === "dark" ? "dark" : "grey"];
    return (
      <Pressable
        key={idx}
        style={{ flex: w }}
        onPressIn={() => pressIn(d, idx)}
        onPressOut={() => pressOut(idx)}
        onTouchCancel={() => pressOut(idx)}
      >
        {({ pressed }) => (
          <View
            className="flex-1 rounded-[7px]"
            style={{
              backgroundColor: c.bezel,
              borderWidth: active ? 1.5 : 0,
              borderColor: "#3EF08A",
            }}
          >
            <View
              className="flex-1 items-center justify-center rounded-[5px]"
              style={{
                backgroundColor: c.face,
                marginTop: pressed ? 3 : 1.5,
                marginBottom: pressed ? 1.5 : 5,
                marginHorizontal: 2.5,
              }}
            >
              {sub && (
                <Text style={{ color: c.sub }} className="font-mono text-[8px] leading-[9px]">
                  {sub}
                </Text>
              )}
              <Text
                style={{ color: active ? "#3EF08A" : c.text }}
                className="font-mono text-[12px] font-bold leading-[14px]"
              >
                {main}
              </Text>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View
      className={`flex-1 justify-center gap-[5px] rounded-2xl p-2 ${
        mech ? "bg-[#0B0D10]" : "bg-ink"
      }`}
    >
      {ROWS.map((row, i) => (
        <View key={i} className="flex-1 flex-row gap-[5px]">
          {row.map((d, j) => renderCell(d, `${i}-${j}`))}
        </View>
      ))}
    </View>
  );
}
