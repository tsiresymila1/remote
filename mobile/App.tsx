import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Connect from "./screens/Connect";
import Keyboard from "./screens/Keyboard";
import ScreenView from "./screens/View";
import Settings from "./screens/Settings";
import Trackpad from "./screens/Trackpad";
import { useConnected } from "./lib/connection";
import { useKbFullscreen } from "./lib/ui";

// ponytail: hand-rolled tab switch instead of expo-router — 5 screens, no nav dep needed.
const TABS = [
  { key: "connect", label: "LINK", Comp: Connect },
  { key: "view", label: "VIEW", Comp: ScreenView },
  { key: "trackpad", label: "PAD", Comp: Trackpad },
  { key: "keyboard", label: "KEYS", Comp: Keyboard },
  { key: "settings", label: "TUNE", Comp: Settings },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("connect");
  const connected = useConnected();
  const kbFullscreen = useKbFullscreen();
  const Active = TABS.find((t) => t.key === tab)!.Comp;

  // Keyboard fullscreen: no header, no tabs, no status bar — just the board.
  if (kbFullscreen) {
    return (
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-ink" edges={["top", "bottom"]}>
          <StatusBar style="light" hidden />
          <Keyboard />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-ink" edges={["top", "bottom"]}>
        <StatusBar style="light" />

        <View className="flex-row items-center justify-between border-b border-line px-5 pb-3 pt-2">
          <Text className="font-mono text-lg font-bold tracking-[4px] text-paper">
            REMOTE
          </Text>
          <View className="flex-row items-center gap-2">
            <View
              className={`h-2 w-2 rounded-full ${connected ? "bg-phos" : "bg-fog"}`}
            />
            <Text className="font-mono text-[10px] tracking-[2px] text-fog">
              {connected ? "LINKED" : "SEARCHING"}
            </Text>
          </View>
        </View>

        <View className="flex-1">
          <Active />
        </View>

        <View className="flex-row border-t border-line bg-panel">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <Pressable
                key={t.key}
                className="flex-1 items-center py-3.5"
                onPress={() => setTab(t.key)}
              >
                <View
                  className={`mb-1.5 h-0.5 w-6 rounded-full ${on ? "bg-phos" : "bg-transparent"}`}
                />
                <Text
                  className={`font-mono text-[11px] font-bold tracking-[3px] ${
                    on ? "text-phos" : "text-fog"
                  }`}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
