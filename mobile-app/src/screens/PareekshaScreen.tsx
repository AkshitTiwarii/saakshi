import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { generateCrossExamination } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Pareeksha">;

export function PareekshaScreen({ navigation }: Props) {
  const [statement, setStatement] = useState("");
  const [questions, setQuestions] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!statement.trim()) return;
    setLoading(true);
    const result = await generateCrossExamination("demo-case-001", [{ content: statement }]);
    setQuestions(`Q: ${result.question}\n\nCoaching: ${result.coaching}\n\nThreat Type: ${result.threatType}`);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Pareeksha Practice</Text>
      <Text style={styles.sub}>Practice cross-exam in a controlled setting.</Text>
      <TextInput
        value={statement}
        onChangeText={setStatement}
        placeholder="Enter a key statement"
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
        multiline
      />
      <Pressable style={styles.button} onPress={run}>
        <Text style={styles.buttonLabel}>{loading ? "Generating..." : "Generate Questions"}</Text>
      </Pressable>
      <ScrollView style={styles.output}>
        <Text style={styles.outputText}>{questions || "Practice questions appear here."}</Text>
      </ScrollView>

      <BottomNav current="Pareeksha" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 13, lineHeight: 20 },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 140, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  output: { backgroundColor: colors.white, borderRadius: 16, padding: 12, minHeight: 180 },
  outputText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
});
