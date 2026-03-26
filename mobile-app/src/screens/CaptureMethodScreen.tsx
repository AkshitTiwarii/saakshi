import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { classifyFragment } from "../services/apiClient";
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
  const [apiResult, setApiResult] = useState<string>("");

  const handleMethodPress = async (methodId: string) => {
    try {
      setBusyId(methodId);
      const result = await classifyFragment("demo-case-001", `User selected ${methodId} while mood=${mood}`);
      const summary = [result.emotion, result.time, result.location].filter(Boolean).join(" • ");
      setApiResult(summary ? `AI connected: ${summary}` : "AI connected and processed.");

      if (methodId === "write") navigation.navigate("CaptureWrite", { mood });
      if (methodId === "speak") navigation.navigate("CaptureVoice", { mood });
      if (methodId === "draw") navigation.navigate("CaptureDraw", { mood });
      if (methodId === "upload") navigation.navigate("CaptureUpload", { mood });
    } catch (error) {
      setApiResult("AI endpoint unavailable (local mode). You can still continue.");

      if (methodId === "write") navigation.navigate("CaptureWrite", { mood });
      if (methodId === "speak") navigation.navigate("CaptureVoice", { mood });
      if (methodId === "draw") navigation.navigate("CaptureDraw", { mood });
      if (methodId === "upload") navigation.navigate("CaptureUpload", { mood });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Mood context: {mood}</Text>
        <Text style={styles.title}>Choose one way to begin.</Text>
        <Text style={styles.subtitle}>No timeline. No pressure. One memory at a time.</Text>
      </View>

      <View style={styles.list}>
        {methods.map((method) => (
          <Pressable key={method.id} style={styles.card} onPress={() => handleMethodPress(method.id)}>
            <View>
              <Text style={styles.cardTitle}>{busyId === method.id ? "Connecting..." : method.label}</Text>
              <Text style={styles.cardHint}>{method.hint}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>

      {!!apiResult && <Text style={styles.apiResult}>{apiResult}</Text>}

      <BottomNav
        current="CaptureMethod"
        onNavigate={(route) => navigation.navigate(route as any)}
      />

      <Pressable style={styles.quickExit} onPress={() => navigation.navigate("QuickExit")}>
        <Text style={styles.quickExitText}>Quick Exit</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.fog,
    paddingHorizontal: 24,
    paddingTop: 24,
    justifyContent: "space-between",
  },
  header: {
    marginTop: 28,
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
    paddingVertical: 18,
    marginBottom: 24,
  },
  quickExitText: {
    color: colors.mutedInk,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  apiResult: {
    marginTop: 6,
    marginBottom: 4,
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 20,
  },
});
