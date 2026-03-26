import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";

type RouteName = keyof RootStackParamList;

interface BottomNavProps {
  current: RouteName;
  onNavigate: (route: RouteName) => void;
}

const items: Array<{ key: RouteName; label: string }> = [
  { key: "Dashboard", label: "Home" },
  { key: "WebWorkspace", label: "Website" },
  { key: "CaptureMethod", label: "Capture" },
  { key: "Khojak", label: "Khojak" },
  { key: "WarRoom", label: "War" },
  { key: "Settings", label: "Settings" },
];

export function BottomNav({ current, onNavigate }: BottomNavProps) {
  return (
    <View style={styles.container}>
      {items.map((item) => {
        const active = item.key === current;
        return (
          <Pressable key={item.key} style={[styles.tab, active && styles.tabActive]} onPress={() => onNavigate(item.key)}>
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 999,
    padding: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#1A2535",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: "#D9E3FF",
  },
  label: {
    color: colors.mutedInk,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  labelActive: {
    color: "#2C46AF",
  },
});
