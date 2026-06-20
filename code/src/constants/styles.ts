import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
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
});
