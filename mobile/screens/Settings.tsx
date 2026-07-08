// Settings: pointer sensitivity, scroll direction, manual IP fallback.
import { useState } from "react";
import { Keyboard, Pressable, Switch, Text, TextInput, View } from "react-native";
import { connect, disconnect, useConnected } from "../lib/connection";
import { keyHaptic } from "../lib/haptics";
import { HapticLevel, settings } from "../lib/settings";

const SPEEDS = [1, 1.5, 2, 3];
const HAPTICS: [string, HapticLevel][] = [
  ["OFF", "off"],
  ["LIGHT", "light"],
  ["MED", "medium"],
  ["HEAVY", "heavy"],
];

export default function Settings() {
  const connected = useConnected();
  const [sens, setSens] = useState(settings.sensitivity);
  const [natural, setNatural] = useState(settings.naturalScroll);
  const [haptics, setHaptics] = useState(settings.haptics);
  const [ip, setIp] = useState("");

  const pickHaptics = (v: HapticLevel) => {
    settings.haptics = v;
    setHaptics(v);
    keyHaptic(); // instant preview of the chosen level
  };

  const pickSpeed = (v: number) => {
    settings.sensitivity = v;
    setSens(v);
  };
  const toggleScroll = (v: boolean) => {
    settings.naturalScroll = v;
    setNatural(v);
  };

  return (
    <View className="flex-1 px-5 pt-5">
      <Text className="mb-2 font-mono text-[10px] tracking-[3px] text-fog">
        POINTER GAIN
      </Text>
      <View className="flex-row gap-2">
        {SPEEDS.map((v) => {
          const on = sens === v;
          return (
            <Pressable
              key={v}
              className={`flex-1 items-center rounded-xl border py-3 ${
                on ? "border-phos bg-phos/15" : "border-line bg-panel"
              }`}
              onPress={() => pickSpeed(v)}
            >
              <Text
                className={`font-mono text-sm font-bold ${on ? "text-phos" : "text-paper"}`}
              >
                {v}×
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-6 flex-row items-center justify-between rounded-xl border border-line bg-panel px-4 py-3.5">
        <Text className="font-mono text-xs tracking-[2px] text-paper">
          NATURAL SCROLL
        </Text>
        <Switch
          value={natural}
          onValueChange={toggleScroll}
          trackColor={{ false: "#1E2A26", true: "#1F7A4A" }}
          thumbColor={natural ? "#3EF08A" : "#5C6E66"}
        />
      </View>

      <Text className="mb-2 mt-6 font-mono text-[10px] tracking-[3px] text-fog">
        KEYBOARD HAPTICS
      </Text>
      <View className="flex-row gap-2">
        {HAPTICS.map(([label, v]) => {
          const on = haptics === v;
          return (
            <Pressable
              key={v}
              className={`flex-1 items-center rounded-xl border py-3 ${
                on ? "border-phos bg-phos/15" : "border-line bg-panel"
              }`}
              onPress={() => pickHaptics(v)}
            >
              <Text
                className={`font-mono text-[11px] font-bold tracking-[1px] ${
                  on ? "text-phos" : "text-paper"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-1 mt-7 font-mono text-[10px] tracking-[3px] text-fog">
        MANUAL LINK
      </Text>
      <Text className="mb-2.5 font-mono text-[11px] leading-4 text-fog/80">
        for networks that block UDP discovery
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 font-mono text-base text-paper"
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.42"
          placeholderTextColor="#5C6E66"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Pressable
          className="rounded-xl border border-phos-dim bg-phos/10 px-5 py-3 active:bg-phos/20"
          onPress={() => {
            Keyboard.dismiss();
            if (ip.trim()) connect(ip.trim(), 8090, 8091, settings.pin);
          }}
        >
          <Text className="font-mono text-xs font-bold tracking-[2px] text-phos">
            LINK
          </Text>
        </Pressable>
      </View>

      {connected && (
        <Pressable
          className="mt-8 items-center rounded-xl border border-ember/40 py-3.5"
          onPress={disconnect}
        >
          <Text className="font-mono text-xs font-bold tracking-[2px] text-ember">
            DISCONNECT
          </Text>
        </Pressable>
      )}
    </View>
  );
}
