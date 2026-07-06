import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Connect from "./screens/Connect";
import Keyboard from "./screens/Keyboard";
import Settings from "./screens/Settings";
import Trackpad from "./screens/Trackpad";
import { useConnected } from "./lib/connection";

// ponytail: hand-rolled tab switch instead of expo-router — 4 screens, no nav dep needed.
const TABS = [
  { key: "connect", label: "Connect", icon: "🔌", Comp: Connect },
  { key: "trackpad", label: "Trackpad", icon: "🖱️", Comp: Trackpad },
  { key: "keyboard", label: "Keyboard", icon: "⌨️", Comp: Keyboard },
  { key: "settings", label: "Settings", icon: "⚙️", Comp: Settings },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("connect");
  const connected = useConnected();
  const Active = TABS.find((t) => t.key === tab)!.Comp;

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-slate-900" edges={["top", "bottom"]}>
        <StatusBar style="light" />
      <View className="flex-row items-center gap-2 px-4 py-2.5">
        <Text className="text-xl font-bold text-slate-200">Remote</Text>
        <View
          className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-500" : "bg-slate-500"}`}
        />
      </View>

      <View className="flex-1">
        <Active />
      </View>

        <View className="flex-row border-t border-slate-800 bg-[#0b1220]">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              className="flex-1 items-center gap-0.5 py-2.5"
              onPress={() => setTab(t.key)}
            >
              <Text className={`text-xl ${tab === t.key ? "opacity-100" : "opacity-60"}`}>
                {t.icon}
              </Text>
              <Text
                className={`text-[11px] ${tab === t.key ? "text-sky-400" : "text-slate-500"}`}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
