import React, { useState, useEffect, useRef } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Animated,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  Alert,
} from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { styles } from "../constants/styles";

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
  const [prevHeartRate, setPrevHeartRate] = useState(-1);
  const [rrIntervals, setRrIntervals] = useState<number[]>([]);
  const subscription = useRef<any>(null);
  const scanTimeout = useRef<any>(null);

  // Monitor BLE state
  useEffect(() => {
    const sub = bleManager.onStateChange((state) => {
      setBleState(state);
    }, true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (heartRate !== prevHeartRate + 8) {
      console.log(`Missed heart rate update: ${prevHeartRate} -> ${heartRate}`);
      Alert.alert(
        "Missed Heart Rate Update",
        `Expected ${prevHeartRate + 8}, got ${heartRate}`,
        [
          {
            text: "OK",
          },
        ],
      );
    }
    setPrevHeartRate(heartRate);
  }, [heartRate]);

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

    bleManager.startDeviceScan(
      [HEART_RATE_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          setScanning(false);
          return;
        }
        if (device) {
          setDevices((prev) => {
            if (prev.find((d) => d.id === device.id)) return prev;
            return [...prev, device];
          });

          // setDevices((prev) => {
          //   if (prev.find((d) => d.id === device.id)) return prev;
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
    }, 12000);
  }

  function stopScan() {
    bleManager.stopDeviceScan();
    clearTimeout(scanTimeout.current);
    setScanning(false);
  }

  async function connectToDevice(device: Device) {
    stopScan();
    setConnectingId(device.id);
    try {
      const connected = await bleManager.connectToDevice(device.id);
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(device);
      subscription.current = connected.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_CHARACTERISTIC_UUID,
        (err, characteristic) => {
          if (err) {
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
    </SafeAreaView>
  );
}
