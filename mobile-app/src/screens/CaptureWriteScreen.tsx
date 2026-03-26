import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { classifyFragment } from "../services/apiClient";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureWrite">;

export function CaptureWriteScreen({ navigation, route }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const ai = await classifyFragment("demo-case-001", text);
    setResult([ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") || "Saved in local mode.");
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Write Fragment</Text>
      <Text style={styles.sub}>Mood: {route.params?.mood || "not-set"}</Text>
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

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 170, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 16 },
  result: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
});
