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
import { settings } from "../lib/settings";

const MOVE_THRESHOLD = 6; // px before a gesture counts as movement (not a tap)
const TAP_MS = 300;
const LONGPRESS_MS = 400;
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
            clearTimeout(g.longPress);
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
    <View className="flex-1 p-3">
      <View
        className="flex-1 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800"
        {...pan.panHandlers}
      >
        <Text className="text-center leading-[22px] text-slate-500">
          {connected
            ? "Drag to move · tap to click\ntwo fingers to scroll · hold to drag"
            : "Not connected — waiting for a server"}
        </Text>
      </View>
      <View className="mt-3 flex-row gap-2.5">
        <Pressable
          className="flex-1 items-center rounded-xl bg-slate-700 p-4"
          onPress={() => click("left")}
        >
          <Text className="font-semibold text-slate-200">Left click</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-xl bg-slate-700 p-4"
          onPress={() => click("right")}
        >
          <Text className="font-semibold text-slate-200">Right click</Text>
        </Pressable>
      </View>
    </View>
  );
}
