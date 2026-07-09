// Virtual trackpad. One-finger = move, tap = click, long-press+drag = drag,
// two-finger drag = scroll. Deltas stream over WebSocket.
import { useMemo, useRef } from "react";
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  Text,
  View,
} from "react-native";
import { click, combo, down, move, scroll, up, useConnected } from "../lib/connection";
import { keyHaptic } from "../lib/haptics";
import { settings } from "../lib/settings";

// Finger drift while "holding still" easily reaches 6-10px — keep the threshold
// generous or the long-press drag never arms.
const MOVE_THRESHOLD = 14; // px before a gesture counts as movement (not a tap/hold)
const TAP_MS = 300;
const LONGPRESS_MS = 350;
const SCROLL_FACTOR = 0.15;
const SWIPE_THRESHOLD = 50; // px of 3-finger travel that counts as a swipe

// `gain` multiplies sensitivity — used to compensate the smaller pad in View mode.
export default function Trackpad({ gain = 1 }: { gain?: number }) {
  const connected = useConnected();
  const g = useRef({
    prevDx: 0,
    prevDy: 0,
    prevScrollDy: 0,
    startTime: 0,
    moved: false,
    twoFinger: false,
    maxTouches: 1,
    scrolled: false,
    dragging: false,
    longPress: undefined as ReturnType<typeof setTimeout> | undefined,
  }).current;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: () => {
          g.prevDx = 0;
          g.prevDy = 0;
          g.prevScrollDy = 0;
          g.startTime = Date.now();
          g.moved = false;
          g.twoFinger = false;
          g.maxTouches = 1;
          g.scrolled = false;
          g.dragging = false;
          g.longPress = setTimeout(() => {
            if (!g.moved && !g.twoFinger) {
              g.dragging = true;
              keyHaptic(); // feel the drag arm
              down("left");
            }
          }, LONGPRESS_MS);
        },

        onPanResponderMove: (
          e: GestureResponderEvent,
          s: PanResponderGestureState,
        ) => {
          const touches = e.nativeEvent.touches.length;
          if (touches > g.maxTouches) g.maxTouches = touches;
          if (touches >= 3) {
            // 3-finger gesture: no scroll, no drag — direction resolved on release.
            g.twoFinger = true;
            clearTimeout(g.longPress);
            return;
          }
          if (touches === 2) {
            g.twoFinger = true;
            clearTimeout(g.longPress);
            const dy = s.dy - g.prevScrollDy;
            const amt = Math.round(dy * SCROLL_FACTOR * (settings.naturalScroll ? 1 : -1));
            if (amt !== 0) {
              scroll(0, amt);
              g.scrolled = true;
            }
            g.prevScrollDy = s.dy;
            return;
          }
          const dx = s.dx - g.prevDx;
          const dy = s.dy - g.prevDy;
          if (!g.moved && Math.abs(s.dx) + Math.abs(s.dy) > MOVE_THRESHOLD) {
            g.moved = true;
            if (!g.dragging) clearTimeout(g.longPress); // real move before arming → it's a move, not a hold
          }
          // Ignore micro-jitter while waiting for the long-press to arm, so the
          // cursor doesn't creep during a deliberate hold.
          if (!g.moved && !g.dragging) {
            g.prevDx = s.dx;
            g.prevDy = s.dy;
            return;
          }
          const speed = settings.sensitivity * gain;
          move(Math.round(dx * speed), Math.round(dy * speed));
          g.prevDx = s.dx;
          g.prevDy = s.dy;
        },

        onPanResponderRelease: (
          _e: GestureResponderEvent,
          s: PanResponderGestureState,
        ) => {
          clearTimeout(g.longPress);
          const quick = Date.now() - g.startTime < TAP_MS;

          if (g.dragging) {
            up("left");
            return;
          }

          // 3-finger: swipe → workspace navigation; tap → middle click.
          if (g.maxTouches >= 3) {
            const ax = Math.abs(s.dx);
            const ay = Math.abs(s.dy);
            if (Math.max(ax, ay) > SWIPE_THRESHOLD) {
              const dir =
                ax > ay ? (s.dx > 0 ? "right" : "left") : s.dy > 0 ? "down" : "up";
              keyHaptic();
              combo(["ctrl"], dir); // macOS: spaces ←/→, Mission Control ↑, Exposé ↓
            } else if (quick) {
              click("middle");
            }
            return;
          }

          // 2-finger tap (no scroll happened) → right click.
          if (g.maxTouches === 2 && !g.scrolled && quick) {
            click("right");
            return;
          }

          if (!g.moved && !g.twoFinger && quick) {
            click("left");
          }
        },
      }),
    [g, gain],
  );

  return (
    <View className="flex-1 p-4">
      <View
        className="flex-1 items-center justify-center overflow-hidden rounded-2xl border border-line bg-panel"
        {...pan.panHandlers}
      >
        {/* corner ticks — precision-instrument framing */}
        <View className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-line-bright" />
        <View className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-line-bright" />
        <View className="absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-line-bright" />
        <View className="absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-line-bright" />
        {/* center crosshair */}
        <View className="absolute h-px w-10 bg-line-bright" />
        <View className="absolute h-10 w-px bg-line-bright" />

        <Text
          className={`px-8 text-center font-mono text-[11px] leading-5 tracking-[1px] ${
            connected ? "text-fog" : "text-ember"
          }`}
        >
          {connected
            ? "DRAG · MOVE — TAP · CLICK — HOLD · DRAG\n2 FINGERS · SCROLL — 2-TAP · RIGHT CLICK\n3-SWIPE · SPACES/MISSION — 3-TAP · MIDDLE"
            : "NO LINK\nWAITING FOR A STATION"}
        </Text>
      </View>
      <View className="mt-3 flex-row gap-3">
        <Pressable
          className="flex-1 items-center rounded-xl border border-line bg-panel py-4 active:border-phos-dim active:bg-phos/10"
          onPress={() => click("left")}
        >
          <Text className="font-mono text-xs font-bold tracking-[2px] text-paper">
            L·CLICK
          </Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-xl border border-line bg-panel py-4 active:border-phos-dim active:bg-phos/10"
          onPress={() => click("right")}
        >
          <Text className="font-mono text-xs font-bold tracking-[2px] text-paper">
            R·CLICK
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
