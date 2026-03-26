import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { generateAdversarialAnalysis } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "WarRoom">;

export function WarRoomScreen({ navigation }: Props) {
  const [facts, setFacts] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!facts.trim()) return;
    setLoading(true);
    const result = await generateAdversarialAnalysis("demo-case-001", [{ content: facts }]);
    const virodhi = result.virodhi.map((v) => `- ${v.title}: ${v.description}`).join("\n");
    const raksha = result.raksha.map((r) => `- ${r.title}: ${r.description}`).join("\n");
    setAnalysis(`Strength Score: ${result.strengthScore}\n\nVirodhi\n${virodhi || "- none"}\n\nRaksha\n${raksha || "- none"}`);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>War Room</Text>
      <Text style={styles.sub}>Stress-test your statement before external review.</Text>
      <TextInput
        value={facts}
        onChangeText={setFacts}
        placeholder="Paste timeline or key claim"
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
        multiline
      />
      <Pressable style={styles.button} onPress={run}>
        <Text style={styles.buttonLabel}>{loading ? "Analyzing..." : "Run Adversarial Analysis"}</Text>
      </Pressable>
      <ScrollView style={styles.output}>
        <Text style={styles.outputText}>{analysis || "Findings appear here."}</Text>
      </ScrollView>

      <BottomNav current="WarRoom" onNavigate={(r) => navigation.navigate(r as any)} />
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
