// Key-press haptic feedback, honoring the settings level.
import * as Haptics from "expo-haptics";
import { settings } from "./settings";

const STYLE = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

export function keyHaptic() {
  if (settings.haptics === "off") return;
  // fire-and-forget; module absent from the binary → silent no-op until rebuild
  Haptics.impactAsync(STYLE[settings.haptics]).catch(() => {});
}
