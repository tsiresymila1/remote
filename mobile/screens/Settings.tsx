// Settings: pointer sensitivity, scroll direction, manual IP fallback.
import { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { connect, disconnect, useConnected } from "../lib/connection";
import { settings } from "../lib/settings";

const SPEEDS = [1, 1.5, 2, 3];

export default function Settings() {
  const connected = useConnected();
  const [sens, setSens] = useState(settings.sensitivity);
  const [natural, setNatural] = useState(settings.naturalScroll);
  const [ip, setIp] = useState("");

  const pickSpeed = (v: number) => {
    settings.sensitivity = v;
    setSens(v);
  };
  const toggleScroll = (v: boolean) => {
    settings.naturalScroll = v;
    setNatural(v);
  };

  return (
    <View className="flex-1 p-4">
      <Text className="mb-2 mt-5 text-[13px] uppercase text-slate-400">
        Pointer speed
      </Text>
      <View className="flex-row items-center gap-2">
        {SPEEDS.map((v) => (
          <Pressable
            key={v}
            className={`rounded-xl px-[18px] py-2.5 ${sens === v ? "bg-sky-400" : "bg-slate-700"}`}
            onPress={() => pickSpeed(v)}
          >
            <Text
              className={`font-semibold ${sens === v ? "text-slate-900" : "text-slate-200"}`}
            >
              {v}×
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mt-[18px] flex-row items-center justify-between">
        <Text className="text-base text-slate-200">Natural scroll</Text>
        <Switch value={natural} onValueChange={toggleScroll} />
      </View>

      <Text className="mb-2 mt-5 text-[13px] uppercase text-slate-400">
        Connect by IP
      </Text>
      <Text className="mb-2.5 leading-[18px] text-slate-500">
        Use this when auto-discovery is blocked (some WiFi networks isolate
        clients).
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800 p-3 text-base text-slate-200"
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.42"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Pressable
          className="rounded-xl bg-slate-700 px-5 py-3"
          onPress={() => ip.trim() && connect(ip.trim())}
        >
          <Text className="font-semibold text-slate-200">Connect</Text>
        </Pressable>
      </View>

      {connected && (
        <Pressable
          className="mt-7 items-center rounded-xl bg-red-950 p-3.5"
          onPress={disconnect}
        >
          <Text className="font-semibold text-red-200">Disconnect</Text>
        </Pressable>
      )}
    </View>
  );
}
