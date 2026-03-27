import React, { useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { getHealth, getVictimSession } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

const cards = [
  { title: "Capture", route: "CaptureMethod" as const, desc: "Write, speak, draw or upload", tone: ["#264B7F", "#1A345A"] as const },
  { title: "Khojak", route: "Khojak" as const, desc: "Corroborating evidence", tone: ["#9A4C27", "#6C3317"] as const },
  { title: "War Room", route: "WarRoom" as const, desc: "Legal strategy partner", tone: ["#6B2D3E", "#411823"] as const },
  { title: "Pareeksha", route: "Pareeksha" as const, desc: "Strict exam prep", tone: ["#2B5D66", "#173F47"] as const },
  { title: "Command", route: "WebWorkspace" as const, desc: "Central intelligence", tone: ["#3F4F7A", "#283452"] as const },
  { title: "Account", route: "Settings" as const, desc: "Profile and safety", tone: ["#545E70", "#353B49"] as const },
];

export function DashboardScreen({ navigation }: Props) {
  const [status, setStatus] = useState("Checking backend...");
  const [caseLabel, setCaseLabel] = useState("");
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

    const session = getVictimSession();
    if (session?.caseNumber) {
      setCaseLabel(`Your case: ${session.caseNumber}`);
    }
  }, [fade]);

  const cardRows: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    cardRows.push(cards.slice(i, i + 2));
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroTopWave} />
        <View style={styles.heroInline}> 
          <Text style={styles.brand}>SAAKSHI</Text>
          <Text style={styles.title}>Case Command</Text>
          <Text style={styles.status}>{status}</Text>
          {!!caseLabel && <Text style={styles.status}>{caseLabel}</Text>}
        </View>

        <View style={styles.heroActions}>
          <Pressable style={styles.heroButton} onPress={() => navigation.navigate("EmotionalCheckIn")}>
            <Text style={styles.heroButtonText}>Start Guided Intake</Text>
          </Pressable>
          <Pressable style={styles.heroGhostButton} onPress={() => navigation.navigate("WebWorkspace")}>
            <Text style={styles.heroGhostLabel}>Open Command Center</Text>
          </Pressable>
        </View>

        <Animated.View style={[styles.grid, { opacity: fade }]}> 
          {cardRows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.row}>
              {row.map((card) => (
                <Pressable key={card.title} style={styles.cardWrap} onPress={() => navigation.navigate(card.route)}>
                  <LinearGradient colors={card.tone} style={styles.card}>
                    <Text style={styles.cardTitle}>{card.title}</Text>
                    <Text style={styles.cardDesc}>{card.desc}</Text>
                  </LinearGradient>
                </Pressable>
              ))}
              {row.length === 1 && <View style={styles.cardWrap} />}
            </View>
          ))}
        </Animated.View>
      </ScrollView>

      <BottomNav current="Dashboard" onNavigate={(route) => navigation.navigate(route as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EBEEF5", paddingHorizontal: 16, paddingTop: 14 },
  scroll: { paddingBottom: 120 },
  heroTopWave: {
    height: 130,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 110,
    backgroundColor: "#F0C8B4",
  },
  heroInline: {
    marginTop: -42,
    marginBottom: 10,
  },
  brand: { color: "#1E4A79", fontSize: 18, letterSpacing: 2.2, fontWeight: "800" },
  title: { color: colors.ink, marginTop: 8, fontSize: 44, lineHeight: 48, fontWeight: "800" },
  status: { color: colors.mutedInk, marginTop: 6, fontSize: 12 },
  heroActions: {
    marginBottom: 12,
    gap: 8,
  },
  heroButton: {
    backgroundColor: "#123052",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  heroButtonText: { color: colors.white, fontWeight: "800", fontSize: 13, letterSpacing: 0.3 },
  heroGhostButton: {
    backgroundColor: "#FAFCFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CCD9EC",
    paddingVertical: 11,
    alignItems: "center",
  },
  heroGhostLabel: {
    color: "#2C4875",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  grid: { gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  cardWrap: { flex: 1 },
  card: { borderRadius: 18, padding: 16, minHeight: 102 },
  cardTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  cardDesc: { color: "#F7FAFF", fontSize: 13, marginTop: 4 },
});
