import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import {
  generateCrossExamination,
  getVictimCaseOverviewForCurrentSession,
  getVictimSession,
  generateModeAwareCoachReply,
  persistVoiceChatMessage,
} from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Pareeksha">;

export function PareekshaScreen({ navigation }: Props) {
  const [statement, setStatement] = useState("");
  const [questions, setQuestions] = useState("");
  const [loading, setLoading] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachChat, setCoachChat] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [contextHint, setContextHint] = useState("Loading shared case context...");

  React.useEffect(() => {
    getVictimCaseOverviewForCurrentSession()
      .then((overview) => {
        if (!overview) {
          setContextHint("Case context unavailable. Practice is running with local statement only.");
          return;
        }
        const summary = String(overview.profile?.incidentSummary || "").trim();
        setContextHint(
          `Practice context includes ${overview.fragments.length} stored fragments${summary ? ", incident summary loaded" : ""}.`
        );
      })
      .catch(() => setContextHint("Could not load shared context right now."));
  }, []);

  const run = async () => {
    if (!statement.trim()) return;
    setLoading(true);
    const caseId = getVictimSession()?.caseId || "demo-case-001";
    const result = await generateCrossExamination(caseId, [{ content: statement }]);
    setQuestions(`Q: ${result.question}\n\nCoaching: ${result.coaching}\n\nThreat Type: ${result.threatType}`);
    setLoading(false);
  };

  const sendStrictCoach = async () => {
    if (!coachInput.trim()) return;
    const text = coachInput.trim();
    setCoachInput("");
    setCoachChat((prev) => [...prev, { role: "user", text }]);
    const reply = await generateModeAwareCoachReply({ mode: "strict", text });
    setCoachChat((prev) => [...prev, { role: "assistant", text: reply }]);
    await persistVoiceChatMessage({ role: "user", mode: "strict", text });
    await persistVoiceChatMessage({ role: "assistant", mode: "strict", text: reply });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Pareeksha Practice</Text>
        <Text style={styles.sub}>Practice cross-exam in a controlled setting.</Text>
        <View style={styles.contextBanner}>
          <Text style={styles.contextTitle}>Shared Case Context</Text>
          <Text style={styles.contextBody}>{contextHint}</Text>
        </View>
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
        <View style={styles.output}>
          <Text style={styles.outputText}>{questions || "Practice questions appear here."}</Text>
        </View>

        <View style={styles.chatPanel}>
          <Text style={styles.chatTitle}>Strict Voice Coach</Text>
          <Text style={styles.chatSub}>This coach is direct and challenge-focused for realistic preparation.</Text>
          <ScrollView style={styles.chatLog}>
            {coachChat.map((item, idx) => (
              <View key={`${idx}-${item.role}`} style={[styles.bubble, item.role === "assistant" ? styles.assistant : styles.user]}>
                <Text style={styles.bubbleText}>{item.text}</Text>
              </View>
            ))}
          </ScrollView>
          <TextInput
            value={coachInput}
            onChangeText={setCoachInput}
            placeholder="Challenge my statement"
            placeholderTextColor={colors.mutedInk}
            style={styles.chatInput}
          />
          <Pressable style={styles.button} onPress={sendStrictCoach}>
            <Text style={styles.buttonLabel}>Ask Strict Coach</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav current="Pareeksha" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 124 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 13, lineHeight: 20 },
  contextBanner: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C6D2FF",
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  contextTitle: {
    color: "#314893",
    fontSize: 12,
    fontWeight: "800",
  },
  contextBody: {
    color: "#3F57A7",
    fontSize: 12,
    lineHeight: 17,
  },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 140, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  output: { backgroundColor: colors.white, borderRadius: 16, padding: 12, minHeight: 180 },
  outputText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  chatPanel: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  chatTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 15,
  },
  chatSub: {
    color: colors.mutedInk,
    fontSize: 12,
  },
  chatLog: {
    maxHeight: 140,
  },
  bubble: {
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  assistant: {
    backgroundColor: "#FFECEC",
  },
  user: {
    backgroundColor: "#F2F5FA",
  },
  bubbleText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
  },
  chatInput: {
    borderWidth: 1,
    borderColor: colors.cloud,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
  },
});
