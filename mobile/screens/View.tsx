// Live screen view: MJPEG feed in a WebView, with an optional overlay panel
// (trackpad or keyboard) that toggles to reclaim space.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { streamUrl, useConnected } from "../lib/connection";
import Keyboard from "./Keyboard";
import Trackpad from "./Trackpad";

type Overlay = "pad" | "keys" | "off";

export default function ScreenView() {
  const connected = useConnected();
  const [overlay, setOverlay] = useState<Overlay>("pad");

  if (!connected) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center font-mono text-xs leading-5 text-fog">
          NO LINK{"\n"}Connect to a station first — the screen appears here once
          paired.
        </Text>
      </View>
    );
  }

  const Chip = ({ mode, label }: { mode: Overlay; label: string }) => {
    const on = overlay === mode;
    return (
      <Pressable
        className={`rounded-lg border px-3 py-1.5 ${on ? "border-phos bg-phos/15" : "border-line bg-panel/80"}`}
        onPress={() => setOverlay(mode)}
      >
        <Text className={`font-mono text-[11px] font-bold tracking-[2px] ${on ? "text-phos" : "text-paper"}`}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-black">
      <WebView
        source={{ uri: streamUrl() }}
        style={{ flex: 1, backgroundColor: "#000" }}
        scrollEnabled={false}
        allowsInlineMediaPlayback
        // Android: http feed needs cleartext (allowed app-wide in the manifest).
        mixedContentMode="always"
      />

      {/* floating control bar */}
      <View className="absolute left-0 right-0 top-2 flex-row justify-center gap-2">
        <Chip mode="pad" label="PAD" />
        <Chip mode="keys" label="KEYS" />
        <Chip mode="off" label="HIDE" />
      </View>

      {/* overlay panel */}
      {overlay !== "off" && (
        <View
          className="absolute bottom-0 left-0 right-0 border-t border-line bg-ink/95"
          style={{ height: "55%" }}
        >
          {overlay === "pad" ? <Trackpad /> : <Keyboard />}
        </View>
      )}
    </View>
  );
}
