import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { searchEvidence } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Khojak">;

export function KhojakScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await searchEvidence("demo-case-001", query);
    setResult(res.text);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Khojak Evidence Seeker</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search weather, transit, event clues"
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
      />
      <Pressable style={styles.button} onPress={runSearch}>
        <Text style={styles.buttonLabel}>{loading ? "Searching..." : "Search Evidence"}</Text>
      </Pressable>
      <ScrollView style={styles.resultBox}>
        <Text style={styles.resultText}>{result || "Results will appear here."}</Text>
      </ScrollView>

      <BottomNav current="Khojak" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  input: { backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  resultBox: { backgroundColor: colors.white, borderRadius: 16, padding: 12, minHeight: 200 },
  resultText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
});
