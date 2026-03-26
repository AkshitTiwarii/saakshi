import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { classifyFragment } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureDraw">;

export function CaptureDrawScreen({ navigation }: Props) {
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState("");

  const process = async () => {
    const ai = await classifyFragment("demo-case-001", `Drawing description: ${desc}`);
    setStatus([ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") || "Drawing saved in local mode.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Draw Capture</Text>
      <Text style={styles.sub}>For now, describe your sketch. Canvas module can be added next.</Text>
      <TextInput
        value={desc}
        onChangeText={setDesc}
        placeholder="Describe what you drew"
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
        multiline
      />
      <Pressable style={styles.button} onPress={process}>
        <Text style={styles.buttonLabel}>Process Drawing</Text>
      </Pressable>
      {!!status && <Text style={styles.status}>{status}</Text>}

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 13, lineHeight: 20 },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 170, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 16 },
  status: { color: colors.mutedInk, fontSize: 13 },
});
