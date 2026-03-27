import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { classifyFragmentForCurrentCase, saveVictimDetails } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureDraw">;

export function CaptureDrawScreen({ navigation }: Props) {
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const process = async () => {
    if (!desc.trim()) return;
    setLoading(true);
    const ai = await classifyFragmentForCurrentCase(`Drawing description: ${desc}`);
    await saveVictimDetails({
      profile: {},
      fragments: [`[draw] ${desc.trim()}`],
      source: "mobile-capture-draw",
    }).catch(() => null);
    setStatus([ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") || "Drawing note saved in case record.");
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Draw Capture</Text>
        <Text style={styles.sub}>Sketch support mode: describe your visual memory and we map clues to your case.</Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Draw mode workflow</Text>
          <Text style={styles.infoLine}>1. Describe what you drew (objects, place, sequence)</Text>
          <Text style={styles.infoLine}>2. AI extracts timeline and location markers</Text>
          <Text style={styles.infoLine}>3. Entry is stored with your case integrity trail</Text>
        </View>

        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder="Describe what you drew"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
          multiline
        />
        <Pressable style={styles.button} onPress={process}>
          <Text style={styles.buttonLabel}>{loading ? "Processing..." : "Process Drawing"}</Text>
        </Pressable>
        {!!status && <Text style={styles.status}>{status}</Text>}
      </ScrollView>

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 124 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 13, lineHeight: 20 },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 3,
  },
  infoTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 14,
  },
  infoLine: {
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 17,
  },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 170, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 16 },
  status: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
});
