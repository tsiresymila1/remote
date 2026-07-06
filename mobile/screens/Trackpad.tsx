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
import { click, down, move, scroll, up, useConnected } from "../lib/connection";
import { keyHaptic } from "../lib/haptics";
import { settings } from "../lib/settings";

// Finger drift while "holding still" easily reaches 6-10px — keep the threshold
// generous or the long-press drag never arms.
const MOVE_THRESHOLD = 14; // px before a gesture counts as movement (not a tap/hold)
const TAP_MS = 300;
const LONGPRESS_MS = 350;
const SCROLL_FACTOR = 0.15;

export default function Trackpad() {
  const connected = useConnected();
  const g = useRef({
    prevDx: 0,
    prevDy: 0,
    prevScrollDy: 0,
    startTime: 0,
    moved: false,
    twoFinger: false,
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
          if (touches >= 2) {
            g.twoFinger = true;
            clearTimeout(g.longPress);
            const dy = s.dy - g.prevScrollDy;
            const amt = Math.round(dy * SCROLL_FACTOR * (settings.naturalScroll ? 1 : -1));
            if (amt !== 0) scroll(0, amt);
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
          move(Math.round(dx * settings.sensitivity), Math.round(dy * settings.sensitivity));
          g.prevDx = s.dx;
          g.prevDy = s.dy;
        },

        onPanResponderRelease: () => {
          clearTimeout(g.longPress);
          if (g.dragging) {
            up("left");
          } else if (!g.moved && !g.twoFinger && Date.now() - g.startTime < TAP_MS) {
            click("left");
          }
        },
      }),
    [g],
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
            ? "DRAG · MOVE\nTAP · CLICK — HOLD · DRAG\nTWO FINGERS · SCROLL"
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
