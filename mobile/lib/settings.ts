// Tiny shared settings. Read live at gesture time; no reactivity needed.
export type HapticLevel = "off" | "light" | "medium" | "heavy";

export const settings = {
  sensitivity: 1.5, // mouse-move multiplier
  naturalScroll: true, // false = inverted
  haptics: "light" as HapticLevel, // keyboard key-press feedback
  pin: "", // last pairing PIN, reused on auto-connect
  token: "", // hex token from the last scanned QR (stronger than PIN)
};
