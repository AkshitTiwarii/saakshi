import React, { useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { getHealth } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

const cards = [
  { title: "Capture", route: "CaptureMethod" as const, desc: "Write, speak, draw or upload", tone: ["#DFF4FF", "#EEF8FF"] as const },
  { title: "Khojak", route: "Khojak" as const, desc: "Search corroborating evidence", tone: ["#FDECCF", "#FFF5E4"] as const },
  { title: "War Room", route: "WarRoom" as const, desc: "Case strength + strategy", tone: ["#FFE4E8", "#FFF1F3"] as const },
  { title: "Pareeksha", route: "Pareeksha" as const, desc: "Cross-exam practice", tone: ["#E6E8FF", "#F0F2FF"] as const },
  { title: "Docs", route: "Docs" as const, desc: "Export and summaries", tone: ["#E8F8EC", "#F3FDF5"] as const },
  { title: "Settings", route: "Settings" as const, desc: "Privacy and preferences", tone: ["#F2F2F2", "#FAFAFA"] as const },
];

export function DashboardScreen({ navigation }: Props) {
  const [status, setStatus] = useState("Checking backend...");
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();

    getHealth()
      .then((h) => setStatus(`Backend ${h.status}`))
      .catch(() => setStatus("Backend unavailable (local mode)"));
  }, [fade]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <LinearGradient colors={["#0E1C2B", "#1A324E"]} style={styles.hero}>
          <Text style={styles.brand}>SAAKSHI</Text>
          <Text style={styles.title}>Trauma-consistent evidence workspace</Text>
          <Text style={styles.status}>{status}</Text>
          <Pressable style={styles.heroButton} onPress={() => navigation.navigate("WebWorkspace")}>
            <Text style={styles.heroButtonText}>Open Full Website Workspace</Text>
          </Pressable>
        </LinearGradient>

        <Animated.View style={[styles.grid, { opacity: fade }]}> 
          {cards.map((card) => (
            <Pressable key={card.title} onPress={() => navigation.navigate(card.route)}>
              <LinearGradient colors={card.tone} style={styles.card}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardDesc}>{card.desc}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </Animated.View>
      </ScrollView>

      <BottomNav current="Dashboard" onNavigate={(route) => navigation.navigate(route as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EBEEF5", paddingHorizontal: 16, paddingTop: 14 },
  scroll: { paddingBottom: 16 },
  hero: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#0C1725",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  brand: { color: "#A9D5FF", fontSize: 13, letterSpacing: 2, fontWeight: "800" },
  title: { color: colors.white, marginTop: 10, fontSize: 31, lineHeight: 38, fontWeight: "800" },
  status: { color: "#DDE6F2", marginTop: 8, marginBottom: 14, fontSize: 13 },
  heroButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  heroButtonText: { color: colors.white, fontWeight: "800", fontSize: 13, letterSpacing: 0.3 },
  grid: { gap: 12 },
  card: { borderRadius: 18, padding: 16 },
  cardTitle: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  cardDesc: { color: colors.mutedInk, fontSize: 14, marginTop: 4 },
});
