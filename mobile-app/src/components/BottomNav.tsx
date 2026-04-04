import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";

type RouteName = keyof RootStackParamList;

interface BottomNavProps {
  current: RouteName;
  onNavigate: (route: RouteName) => void;
}

const items: Array<{ key: RouteName; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: "Dashboard", label: "Home", icon: "home-variant-outline" },
  { key: "Chat", label: "Chat", icon: "chat-processing-outline" },
  { key: "WebWorkspace", label: "Command", icon: "console-line" },
  { key: "CaptureMethod", label: "Capture", icon: "database-plus-outline" },
  { key: "Virodhi", label: "Virodhi", icon: "gavel" },
  { key: "Raksha", label: "Raksha", icon: "shield-star-outline" },
  { key: "Settings", label: "Settings", icon: "cog-outline" },
];

export function BottomNav({ current, onNavigate }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { bottom: Math.max(10, insets.bottom + 6) }]}>
      {items.map((item) => {
        const active = item.key === current;
        return (
          <Pressable key={item.key} style={[styles.tab, active && styles.tabActive]} onPress={() => onNavigate(item.key)}>
            <MaterialCommunityIcons
              name={item.icon}
              size={17}
              color={active ? "#2C46AF" : colors.mutedInk}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#1A2535",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 7,
  },
  tab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
  },
  label: {
    color: colors.mutedInk,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  labelActive: {
    color: colors.accentStrong,
  },
});
