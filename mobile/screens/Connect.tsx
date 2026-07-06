// Discover servers via UDP and auto-connect to the first one found.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { connect, disconnect, serverUrl, useConnected } from "../lib/connection";
import { discover, Server } from "../lib/discovery";

export default function Connect() {
  const [servers, setServers] = useState<Server[]>([]);
  const [scanning, setScanning] = useState(false);
  const isConnected = useConnected();

  const scan = useCallback(async () => {
    setScanning(true);
    const found = await discover();
    setServers(found);
    setScanning(false);
    return found;
  }, []);

  // Auto-connect: keep scanning until a server appears, then latch onto the first one.
  useEffect(() => {
    if (isConnected) return;
    let alive = true;
    (async () => {
      while (alive) {
        const found = await scan();
        if (!alive) return;
        if (found.length > 0) {
          connect(found[0].ip, found[0].wsPort);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000)); // retry until server shows up
      }
    })();
    return () => {
      alive = false;
    };
  }, [isConnected, scan]);

  return (
    <View className="flex-1 p-4">
      <View
        className={`flex-row items-center justify-between rounded-xl p-3 ${
          isConnected ? "bg-green-950" : "bg-slate-800"
        }`}
      >
        <Text className="shrink text-slate-200">
          {isConnected ? `Connected · ${serverUrl()}` : "Searching for a server…"}
        </Text>
        {isConnected && (
          <Pressable onPress={disconnect}>
            <Text className="font-semibold text-sky-400">Disconnect</Text>
          </Pressable>
        )}
      </View>

      <View className="mb-2 mt-5 flex-row items-center justify-between">
        <Text className="text-[13px] uppercase text-slate-400">
          Servers on this WiFi
        </Text>
        <Pressable onPress={scan} disabled={scanning}>
          <Text className="font-semibold text-sky-400">
            {scanning ? "Scanning…" : "Rescan"}
          </Text>
        </Pressable>
      </View>

      {scanning && servers.length === 0 ? (
        <ActivityIndicator className="mt-6" color="#38bdf8" />
      ) : servers.length === 0 ? (
        <Text className="mt-4 leading-5 text-slate-500">
          None found yet — scanning every 2s. Make sure the desktop app is running
          on the same WiFi. You can also enter the IP manually in Settings.
        </Text>
      ) : (
        servers.map((s) => (
          <Pressable
            key={s.ip}
            className="mb-2 rounded-xl bg-slate-800 p-3.5"
            onPress={() => connect(s.ip, s.wsPort)}
          >
            <Text className="text-base font-semibold text-slate-200">{s.name}</Text>
            <Text className="mt-0.5 text-slate-400">
              {s.ip}:{s.wsPort} · {s.os}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
