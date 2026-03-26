import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { classifyFragment } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureUpload">;

export function CaptureUploadScreen({ navigation }: Props) {
  const [fileNote, setFileNote] = useState("");
  const [result, setResult] = useState("");

  const process = async () => {
    const ai = await classifyFragment("demo-case-001", `Uploaded artifact note: ${fileNote}`);
    setResult([ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") || "Upload recorded in local mode.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Upload Capture</Text>
      <Text style={styles.sub}>File picker can be attached next. Add file note/details now.</Text>
      <TextInput
        value={fileNote}
        onChangeText={setFileNote}
        placeholder="Photo/audio/document details"
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
        multiline
      />
      <Pressable style={styles.button} onPress={process}>
        <Text style={styles.buttonLabel}>Process Upload</Text>
      </Pressable>
      {!!result && <Text style={styles.result}>{result}</Text>}

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
  result: { color: colors.mutedInk, fontSize: 13 },
});
