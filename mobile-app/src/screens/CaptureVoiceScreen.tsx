import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { classifyFragment } from "../services/apiClient";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureVoice">;

export function CaptureVoiceScreen({ navigation }: Props) {
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("Tap process when transcript is ready.");
  const [processing, setProcessing] = useState(false);

  const processVoice = async () => {
    if (!transcript.trim()) return;
    setProcessing(true);
    const ai = await classifyFragment("demo-case-001", transcript);
    setStatus([ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") || "Voice processed in local mode.");
    setProcessing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Voice Capture</Text>
      <View style={styles.pill}><Text style={styles.pillText}>Trauma-safe mode: no pressure timing</Text></View>
      <TextInput
        value={transcript}
        onChangeText={setTranscript}
        placeholder="Paste or type transcript from voice input"
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
        multiline
      />
      <Pressable style={styles.button} onPress={processVoice}>
        <Text style={styles.buttonLabel}>{processing ? "Processing..." : "Process Voice"}</Text>
      </Pressable>
      <Text style={styles.status}>{status}</Text>

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  pill: { alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  pillText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 160, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 16 },
  status: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
});
