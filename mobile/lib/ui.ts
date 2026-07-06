// Tiny shared UI state: keyboard-fullscreen flag + orientation lock.
// Same useSyncExternalStore pattern as connection.ts.
import { useSyncExternalStore } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

let kbFullscreen = false;
const listeners = new Set<() => void>();

export async function setKbFullscreen(v: boolean) {
  kbFullscreen = v;
  listeners.forEach((l) => l());
  try {
    await ScreenOrientation.lockAsync(
      v
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  } catch {} // module absent from the current binary — rotation is manual until rebuild
}

export function useKbFullscreen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => kbFullscreen,
  );
}
