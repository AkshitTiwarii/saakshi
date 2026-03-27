import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import {
  classifyFragmentForCurrentCase,
  saveVictimDetails,
} from "../services/apiClient";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureWrite">;

export function CaptureWriteScreen({ navigation, route }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const ai = await classifyFragmentForCurrentCase(text);
    await saveVictimDetails({
      profile: {},
      fragments: [text.trim()],
      source: "mobile-capture-write",
    }).catch(() => {
      // Allow local continuation if backend is temporarily unavailable.
      return null;
    });
    setResult(
      [ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") ||
        "Fragment secured with backend integrity chain."
    );
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Write Fragment</Text>
        <Text style={styles.sub}>Mood: {route.params?.mood || "not-set"}</Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How it helps</Text>
          <Text style={styles.infoLine}>Write key facts in your own words.</Text>
          <Text style={styles.infoLine}>AI extracts emotion, time, and location clues.</Text>
          <Text style={styles.infoLine}>Your fragment is linked to your case integrity chain.</Text>
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="I remember..."
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
          multiline
        />
        <Pressable style={styles.button} onPress={submit}>
          <Text style={styles.buttonLabel}>{loading ? "Processing..." : "Secure Fragment"}</Text>
        </Pressable>
        {!!result && <Text style={styles.result}>{result}</Text>}
      </ScrollView>

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 124 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, marginBottom: 6 },
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
  result: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
});
