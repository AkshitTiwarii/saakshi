import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureMethod">;

const methods = [
  { id: "speak", label: "Speak", hint: "Voice first" },
  { id: "draw", label: "Draw", hint: "Visual memory" },
  { id: "write", label: "Write", hint: "Text fragments" },
  { id: "upload", label: "Upload", hint: "Photo, audio, document" },
];

export function CaptureMethodScreen({ route, navigation }: Props) {
  const mood = route.params?.mood || "unknown";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<string>("Pick any method. You can switch between methods anytime.");

  const handleMethodPress = (methodId: string) => {
    setBusyId(methodId);
    setApiResult("Opening your selected capture workspace...");

    if (methodId === "write") navigation.navigate("CaptureWrite", { mood });
    if (methodId === "speak") navigation.navigate("CaptureVoice", { mood });
    if (methodId === "draw") navigation.navigate("CaptureDraw", { mood });
    if (methodId === "upload") navigation.navigate("CaptureUpload", { mood });

    setTimeout(() => setBusyId(null), 250);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Mood context: {mood}</Text>
          <Text style={styles.title}>Choose one way to begin.</Text>
          <Text style={styles.subtitle}>No timeline. No pressure. One memory at a time.</Text>
        </View>

        <View style={styles.flowCard}>
          <Text style={styles.flowTitle}>Capture Flow</Text>
          <Text style={styles.flowLine}>1. Choose method</Text>
          <Text style={styles.flowLine}>2. Add memory details</Text>
          <Text style={styles.flowLine}>3. AI extracts clues for timeline and evidence</Text>
        </View>

        <View style={styles.list}>
          {methods.map((method) => (
            <Pressable key={method.id} style={styles.card} onPress={() => handleMethodPress(method.id)}>
              <View>
                <Text style={styles.cardTitle}>{busyId === method.id ? "Opening..." : method.label}</Text>
                <Text style={styles.cardHint}>{method.hint}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>

        {!!apiResult && <Text style={styles.apiResult}>{apiResult}</Text>}

        <Pressable style={styles.quickExit} onPress={() => navigation.navigate("QuickExit")}>
          <Text style={styles.quickExitText}>Quick Exit</Text>
        </Pressable>
      </ScrollView>

      <BottomNav
        current="CaptureMethod"
        onNavigate={(route) => navigation.navigate(route as any)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.fog,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  scroll: {
    paddingBottom: 124,
    gap: 14,
  },
  header: {
    marginTop: 24,
    gap: 10,
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.mutedInk,
    fontSize: 15,
    lineHeight: 22,
  },
  flowCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  flowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  flowLine: {
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 18,
  },
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "700",
  },
  cardHint: {
    color: colors.mutedInk,
    fontSize: 14,
    marginTop: 2,
  },
  arrow: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: "700",
  },
  quickExit: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  quickExitText: {
    color: colors.mutedInk,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  apiResult: {
    marginTop: 4,
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 20,
  },
});
