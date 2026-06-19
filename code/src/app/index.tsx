import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
  Animated,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  Alert,
} from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { toByteArray } from "react-native-quick-base64";

// BLE Heart Rate Service & Characteristic UUIDs (Bluetooth SIG standard)
const HEART_RATE_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
const HEART_RATE_CHARACTERISTIC_UUID = "00002a37-0000-1000-8000-00805f9b34fb";

// ─── Singleton BLE manager ────────────────────────────────────────────────────
const bleManager = new BleManager();

// ─── Parse Heart Rate Measurement characteristic (BT SIG spec) ───────────────
function parseHeartRate(base64Value: string) {
  const raw = atob(base64Value);
  const bytes = Array.from(raw).map((c) => c.charCodeAt(0));
  const flags = bytes[0];
  const is16Bit = flags & 0x01;
  const hr = is16Bit ? bytes[1] | (bytes[2] << 8) : bytes[1];
  const rrIntervals = [];
  let offset = is16Bit ? 3 : 2;
  const rrPresent = (flags >> 4) & 0x01;
  if (rrPresent) {
    while (offset + 1 < bytes.length) {
      const rr = ((bytes[offset + 1] << 8) | bytes[offset]) / 1024;
      rrIntervals.push(Math.round(rr * 1000));
      offset += 2;
    }
  }
  return { heartRate: hr, rrIntervals };
}

// ─── Pulse animation component ───────────────────────────────────────────────
function PulseRing({ bpm }: { bpm: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!bpm || bpm <= 0) return;
    const interval = (60 / bpm) * 1000;
    const pulse = Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.35,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ]);
    const loop = setInterval(() => pulse.start(), interval);
    return () => clearInterval(loop);
  }, [bpm]);

  return (
    <Animated.View
      style={[styles.pulseRing, { transform: [{ scale }], opacity }]}
    />
  );
}

// ─── BPM Gauge ────────────────────────────────────────────────────────────────
function BpmGauge({ bpm }: { bpm: number }) {
  const heartScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!bpm) return;
    Animated.sequence([
      Animated.timing(heartScale, {
        toValue: 1.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [bpm]);

  const zone =
    bpm < 60
      ? "#4fc3f7"
      : bpm < 100
        ? "#a5d6a7"
        : bpm < 140
          ? "#fff176"
          : "#ef9a9a";
  const zoneLabel =
    bpm < 60
      ? "RESTING"
      : bpm < 100
        ? "NORMAL"
        : bpm < 140
          ? "ELEVATED"
          : "HIGH";

  return (
    <View style={styles.gaugeContainer}>
      <PulseRing bpm={bpm} />
      <Animated.View
        style={[styles.heartIcon, { transform: [{ scale: heartScale }] }]}
      >
        <Text style={[styles.heartEmoji]}>♥</Text>
      </Animated.View>
      <Text style={[styles.bpmValue, { color: zone }]}>{bpm ?? "--"}</Text>
      <Text style={styles.bpmUnit}>BPM</Text>
      {bpm != null && (
        <View style={[styles.zoneBadge, { borderColor: zone }]}>
          <Text style={[styles.zoneText, { color: zone }]}>{zoneLabel}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Device row ───────────────────────────────────────────────────────────────
function DeviceRow({
  device,
  onPress,
  isConnecting,
}: {
  device: Device;
  onPress: (device: Device) => void;
  isConnecting: boolean;
}) {
  const rssiBar = Math.max(0, Math.min(100, (device.rssi ?? 0 + 100) * 2));
  return (
    <TouchableOpacity
      style={styles.deviceRow}
      onPress={() => onPress(device)}
      activeOpacity={0.75}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName} numberOfLines={1}>
          {device.name || "Unknown Device"}
        </Text>
        <Text style={styles.deviceId} numberOfLines={1}>
          {device.id}
        </Text>
        <View style={styles.rssiRow}>
          <View style={styles.rssiTrack}>
            <View style={[styles.rssiBar, { width: `${rssiBar}%` }]} />
          </View>
          <Text style={styles.rssiText}>{device.rssi} dBm</Text>
        </View>
      </View>
      {isConnecting ? (
        <ActivityIndicator color="#ef5350" size="small" />
      ) : (
        <Text style={styles.connectArrow}>›</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [bleState, setBleState] = useState("Unknown");
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [heartRate, setHeartRate] = useState(0);
  const [rrIntervals, setRrIntervals] = useState<number[]>([]);
  const [log, setLog] = useState([]);
  const subscription = useRef<any>(null);
  const scanTimeout = useRef<any>(null);

  const addLog = useCallback((msg: string) => {
    // setLog((prev) =>
    //   [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30),
    // );
  }, []);

  // Monitor BLE state
  useEffect(() => {
    const sub = bleManager.onStateChange((state) => {
      setBleState(state);
      addLog(`BLE state: ${state}`);
    }, true);
    return () => sub.remove();
  }, []);

  // Android permissions
  async function requestPermissions() {
    if (Platform.OS !== "android") return true;
    const apiLevel = Platform.Version;
    if (apiLevel >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(results).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED,
      );
    } else {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
  }

  async function startScan() {
    if (bleState !== State.PoweredOn) {
      Alert.alert(
        "Bluetooth Off",
        "Please enable Bluetooth to scan for devices.",
      );
      return;
    }
    const granted = await requestPermissions();
    if (!granted) {
      Alert.alert("Permission Denied", "Bluetooth permissions are required.");
      return;
    }
    setDevices([]);
    setScanning(true);
    addLog("Scanning for Heart Rate sensors…");

    bleManager.startDeviceScan(
      [HEART_RATE_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          addLog(`Scan error: ${error.message}`);
          setScanning(false);
          return;
        }
        if (device) {
          const existingDevice = devices.find((d) => d.id === device.id);
          if (existingDevice) return;

          setDevices((prev) => {
            return [...prev, device];
          });

          // setDevices((prev) => {
          //   if (prev.find((d) => d.id === device.id)) return prev;
          //   addLog(`Found: ${device.name || device.id}`);
          //   return [
          //     ...prev,
          //     { id: device.id, name: device.name, rssi: device.rssi },
          //   ];
          // });
        }
      },
    );

    scanTimeout.current = setTimeout(() => {
      bleManager.stopDeviceScan();
      setScanning(false);
      addLog("Scan complete.");
    }, 12000);
  }

  function stopScan() {
    bleManager.stopDeviceScan();
    clearTimeout(scanTimeout.current);
    setScanning(false);
    addLog("Scan stopped.");
  }

  async function connectToDevice(device: Device) {
    stopScan();
    setConnectingId(device.id);
    addLog(`Connecting to ${device.name || device.id}…`);
    try {
      const connected = await bleManager.connectToDevice(device.id);
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(device);
      addLog(`Connected! Subscribing to Heart Rate…`);
      subscription.current = connected.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_CHARACTERISTIC_UUID,
        (err, characteristic) => {
          if (err) {
            addLog(`Monitor error: ${err.message}`);
            return;
          }
          if (characteristic?.value) {
            const { heartRate: hr, rrIntervals: rr } = parseHeartRate(
              characteristic.value,
            );
            setHeartRate(hr);
            setRrIntervals(rr);
          }
        },
      );
    } catch (e: any) {
      addLog(`Connection failed: ${e.message}`);
      Alert.alert("Connection Failed", e.message);
    } finally {
      setConnectingId(null);
    }
  }

  async function disconnect() {
    if (!connectedDevice) return;
    subscription.current?.remove();
    try {
      await bleManager.cancelDeviceConnection(connectedDevice.id);
    } catch (_) {}
    addLog(`Disconnected from ${connectedDevice.name || connectedDevice.id}`);
    setConnectedDevice(null);
    setHeartRate(0);
    setRrIntervals([]);
  }

  const isConnected = !!connectedDevice;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PULSE</Text>
        <Text style={styles.headerSub}>BLE Heart Rate Monitor</Text>
        <View
          style={[
            styles.bleDot,
            {
              backgroundColor: bleState === "PoweredOn" ? "#69f0ae" : "#ef5350",
            },
          ]}
        />
      </View>

      {/* Connected view */}
      {isConnected ? (
        <View style={styles.connectedContainer}>
          <Text style={styles.connectedLabel}>
            ⬤ {connectedDevice.name || connectedDevice.id}
          </Text>
          <BpmGauge bpm={heartRate} />
          {rrIntervals.length > 0 && (
            <View style={styles.rrContainer}>
              <Text style={styles.rrLabel}>RR INTERVALS</Text>
              <Text style={styles.rrValues}>
                {rrIntervals.map((r) => `${r}ms`).join("  ·  ")}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect}>
            <Text style={styles.disconnectBtnText}>DISCONNECT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Scan view */
        <View style={styles.scanContainer}>
          <TouchableOpacity
            style={[styles.scanBtn, scanning && styles.scanBtnActive]}
            onPress={scanning ? stopScan : startScan}
            activeOpacity={0.8}
          >
            {scanning ? (
              <View style={styles.scanBtnInner}>
                <ActivityIndicator color="#0a0a0f" size="small" />
                <Text style={styles.scanBtnText}>SCANNING…</Text>
              </View>
            ) : (
              <Text style={styles.scanBtnText}>SCAN FOR SENSORS</Text>
            )}
          </TouchableOpacity>

          {devices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyText}>
                {scanning
                  ? "Searching for Heart Rate sensors nearby…"
                  : "No sensors found yet.\nTap Scan to begin."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              style={styles.deviceList}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => (
                <DeviceRow
                  device={item}
                  onPress={connectToDevice}
                  isConnecting={connectingId === item.id}
                />
              )}
              ListHeaderComponent={
                <Text style={styles.listHeader}>
                  {devices.length} SENSOR{devices.length !== 1 ? "S" : ""} FOUND
                </Text>
              }
            />
          )}
        </View>
      )}

      {/* Log */}
      <View style={styles.logContainer}>
        <Text style={styles.logHeader}>LOG</Text>
        <FlatList
          data={log}
          keyExtractor={(_, i) => String(i)}
          style={styles.logList}
          renderItem={({ item }) => <Text style={styles.logEntry}>{item}</Text>}
        />
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e2e",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 22,
    fontWeight: "700",
    color: "#ef5350",
    letterSpacing: 6,
  },
  headerSub: {
    fontSize: 11,
    color: "#555570",
    letterSpacing: 1,
    flex: 1,
    textTransform: "uppercase",
  },
  bleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Connected view
  connectedContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  connectedLabel: {
    color: "#69f0ae",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: "uppercase",
  },

  // Gauge
  gaugeContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
    position: "relative",
    width: 180,
    height: 180,
  },
  pulseRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: "#ef5350",
  },
  heartIcon: {
    marginBottom: 4,
  },
  heartEmoji: {
    fontSize: 32,
    color: "#ef5350",
  },
  bpmValue: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 52,
    fontWeight: "700",
    lineHeight: 58,
    color: "#a5d6a7",
  },
  bpmUnit: {
    fontSize: 13,
    letterSpacing: 4,
    color: "#555570",
    marginTop: 2,
  },
  zoneBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  zoneText: {
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: "700",
  },

  // RR
  rrContainer: {
    backgroundColor: "#12121f",
    borderRadius: 10,
    padding: 14,
    width: "100%",
    marginBottom: 16,
  },
  rrLabel: {
    fontSize: 10,
    color: "#555570",
    letterSpacing: 3,
    marginBottom: 6,
  },
  rrValues: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 12,
    color: "#aaaacc",
    lineHeight: 18,
  },

  // Disconnect
  disconnectBtn: {
    borderWidth: 1,
    borderColor: "#ef5350",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  disconnectBtnText: {
    color: "#ef5350",
    fontSize: 13,
    letterSpacing: 3,
    fontWeight: "600",
  },

  // Scan view
  scanContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  scanBtn: {
    backgroundColor: "#ef5350",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  scanBtnActive: {
    backgroundColor: "#b71c1c",
  },
  scanBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scanBtnText: {
    color: "#0a0a0f",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 3,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.5,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 14,
  },
  emptyText: {
    color: "#666680",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },

  // Device list
  deviceList: {
    flex: 1,
  },
  listHeader: {
    fontSize: 10,
    color: "#555570",
    letterSpacing: 3,
    marginBottom: 10,
  },
  deviceRow: {
    backgroundColor: "#12121f",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e1e2e",
  },
  deviceInfo: { flex: 1 },
  deviceName: {
    color: "#e0e0f0",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  deviceId: {
    color: "#555570",
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    marginBottom: 8,
  },
  rssiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rssiTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "#1e1e2e",
    borderRadius: 2,
  },
  rssiBar: {
    height: 3,
    backgroundColor: "#ef5350",
    borderRadius: 2,
  },
  rssiText: {
    color: "#555570",
    fontSize: 10,
    width: 55,
    textAlign: "right",
  },
  connectArrow: {
    color: "#ef5350",
    fontSize: 28,
    marginLeft: 12,
    lineHeight: 30,
  },

  // Log
  logContainer: {
    height: 130,
    borderTopWidth: 1,
    borderTopColor: "#1e1e2e",
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: "#08080d",
  },
  logHeader: {
    fontSize: 9,
    color: "#333350",
    letterSpacing: 3,
    marginBottom: 4,
  },
  logList: { flex: 1 },
  logEntry: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 10,
    color: "#444460",
    lineHeight: 16,
  },
});
