// Discover servers via UDP, enter the pairing PIN, connect over WebSocket.
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, TextInput, View } from "react-native";
import {
  authDidFail,
  connect,
  disconnect,
  serverUrl,
  useConnected,
} from "../lib/connection";
import { discover, Server } from "../lib/discovery";
import { settings } from "../lib/settings";

// Radar ping: two expanding rings while searching.
function Ping() {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: 2200,
          delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ).start();
    loop(a1, 0);
    loop(a2, 700);
  }, [a1, a2]);
  const ring = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.6] }) }],
    opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.7, 0] }),
  });
  return (
    <View className="h-24 w-24 items-center justify-center">
      <Animated.View className="absolute h-24 w-24 rounded-full border border-phos-dim" style={ring(a1)} />
      <Animated.View className="absolute h-24 w-24 rounded-full border border-phos-dim" style={ring(a2)} />
      <View className="h-12 w-12 items-center justify-center rounded-full border border-line-bright bg-panel">
        <View className="h-2.5 w-2.5 rounded-full bg-fog" />
      </View>
    </View>
  );
}

export default function Connect() {
  const [servers, setServers] = useState<Server[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pin, setPin] = useState(settings.pin);
  const isConnected = useConnected();
  const failed = authDidFail();

  const scan = useCallback(async () => {
    setScanning(true);
    setServers(await discover());
    setScanning(false);
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  const go = (s: Server) => {
    settings.pin = pin;
    connect(s.ip, s.wsPort, s.streamPort, pin);
  };

  return (
    <View className="flex-1 px-5 pt-6">
      {isConnected ? (
        <View className="items-center rounded-2xl border border-phos-dim bg-panel px-5 py-8">
          <View className="h-12 w-12 items-center justify-center rounded-full border border-phos bg-phos/10">
            <View className="h-2.5 w-2.5 rounded-full bg-phos" />
          </View>
          <Text className="mt-4 font-mono text-[10px] tracking-[3px] text-fog">
            LINK ESTABLISHED
          </Text>
          <Text className="mt-1 font-mono text-base text-phos">{serverUrl()}</Text>
          <Pressable
            className="mt-5 rounded-xl border border-line-bright px-5 py-2.5"
            onPress={disconnect}
          >
            <Text className="font-mono text-xs tracking-[2px] text-paper">DISCONNECT</Text>
          </Pressable>
        </View>
      ) : (
        <View className="items-center rounded-2xl border border-line bg-panel px-5 py-6">
          <Ping />
          <Text className="mt-2 font-mono text-[10px] tracking-[3px] text-fog">
            ENTER THE PIN SHOWN ON THE DESKTOP
          </Text>
          <TextInput
            className="mt-3 w-40 rounded-xl border border-line-bright bg-ink py-2 text-center font-mono text-2xl tracking-[8px] text-phos"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder="----"
            placeholderTextColor="#2A3C33"
            keyboardType="number-pad"
            maxLength={4}
          />
          {failed && (
            <Text className="mt-2 font-mono text-[10px] tracking-[2px] text-ember">
              WRONG PIN — TRY AGAIN
            </Text>
          )}
        </View>
      )}

      <View className="mb-2 mt-7 flex-row items-center justify-between">
        <Text className="font-mono text-[10px] tracking-[3px] text-fog">STATIONS FOUND</Text>
        <Pressable onPress={scan} disabled={scanning}>
          <Text className="font-mono text-[11px] tracking-[2px] text-phos">
            {scanning ? "SWEEPING…" : "RESCAN"}
          </Text>
        </Pressable>
      </View>

      {servers.length === 0 ? (
        <Text className="font-mono text-xs text-fog/70">— none yet —</Text>
      ) : (
        servers.map((s) => (
          <Pressable
            key={s.ip}
            className="mb-2 flex-row items-center justify-between rounded-xl border border-line bg-panel px-4 py-3.5"
            onPress={() => go(s)}
          >
            <View>
              <Text className="font-mono text-sm font-bold text-paper">{s.name}</Text>
              <Text className="mt-0.5 font-mono text-xs text-fog">
                {s.ip}:{s.wsPort} · {s.os}
              </Text>
            </View>
            <Text className="font-mono text-phos">{pin.length === 4 ? "→" : "PIN?"}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
