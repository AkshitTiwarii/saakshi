import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { classifyFragmentForCurrentCase, saveVictimDetails } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureUpload">;

export function CaptureUploadScreen({ navigation }: Props) {
  const [fileNote, setFileNote] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const process = async () => {
    if (!fileNote.trim()) return;
    setLoading(true);
    const ai = await classifyFragmentForCurrentCase(`Uploaded artifact note: ${fileNote}`);
    await saveVictimDetails({
      profile: {},
      fragments: [`[upload] ${fileNote.trim()}`],
      source: "mobile-capture-upload",
    }).catch(() => null);
    setResult([ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") || "Upload note secured in case record.");
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Upload Capture</Text>
        <Text style={styles.sub}>Add file context now. This note is bound to your case and can be linked to evidence later.</Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Upload mode workflow</Text>
          <Text style={styles.infoLine}>1. Mention file type and what it proves</Text>
          <Text style={styles.infoLine}>2. Include source and approximate date/time</Text>
          <Text style={styles.infoLine}>3. AI tags it for timeline + evidence retrieval</Text>
        </View>

        <TextInput
          value={fileNote}
          onChangeText={setFileNote}
          placeholder="Photo/audio/document details"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
          multiline
        />
        <Pressable style={styles.button} onPress={process}>
          <Text style={styles.buttonLabel}>{loading ? "Processing..." : "Process Upload"}</Text>
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
  result: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
});
