import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import {
  assessTraumaForCurrentCase,
  calibrateDistressForCurrentCase,
  generateAdversarialAnalysis,
  generateWarRoomIntelligenceForCurrentCase,
  generateModeAwareCoachReply,
  getVictimSession,
  normalizeTemporalPhraseForCurrentCase,
  predictLegalForCurrentCase,
  persistVoiceChatMessage,
} from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "WarRoom">;

export function WarRoomScreen({ navigation }: Props) {
  const [facts, setFacts] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachChat, setCoachChat] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);

  const run = async () => {
    if (!facts.trim()) return;
    setLoading(true);
    const caseId = getVictimSession()?.caseId || "demo-case-001";
    try {
      const [result, intelligence, legalPrediction, temporal, trauma, distress] = await Promise.all([
        generateAdversarialAnalysis(caseId, [{ content: facts }]),
        generateWarRoomIntelligenceForCurrentCase(),
        predictLegalForCurrentCase(facts),
        normalizeTemporalPhraseForCurrentCase(facts),
        assessTraumaForCurrentCase(facts),
        calibrateDistressForCurrentCase({ transcript: facts }),
      ]);
      const virodhi = result.virodhi.map((v) => `- ${v.title}: ${v.description}`).join("\n");
      const raksha = result.raksha.map((r) => `- ${r.title}: ${r.description}`).join("\n");
      const legal = intelligence.legalSuggestions.slice(0, 4).map((l) => `- ${l.code}: ${l.title} (${l.why})`).join("\n");
      const risks = intelligence.contradictionRisks.slice(0, 4).map((r) => `- ${r.level}: ${r.title} - ${r.detail}`).join("\n");
      const modelLegal = legalPrediction.suggestions.slice(0, 4).map((item) => `- ${item.code}: ${item.title}`).join("\n");
      setAnalysis(
        [
          `Strength Score: ${result.strengthScore}`,
          `Readiness Score: ${intelligence.readinessScore}`,
          `AI Summary: ${intelligence.summary}`,
          "",
          "Virodhi",
          virodhi || "- none",
          "",
          "Raksha",
          raksha || "- none",
          "",
          "Legal Suggestions (IPC/CrPC)",
          legal || "- none",
          "",
          "Contradiction Risks",
          risks || "- none",
          "",
          `Law Model Provider: ${legalPrediction.provider}`,
          `Law Model Summary: ${legalPrediction.summary}`,
          "Law Model Suggestions",
          modelLegal || "- none",
          "",
          `Temporal Window: ${temporal.startDate} to ${temporal.endDate} (${Math.round(temporal.confidence * 100)}%)`,
          `Temporal Rationale: ${temporal.rationale}`,
          "",
          `Trauma Band: ${trauma.band}`,
          `Trauma Flags: ${trauma.flags.join(", ") || "none"}`,
          `Distress Band: ${distress.band} (${Math.round(distress.score * 100)}%)`,
          `Recommended pace: ${distress.recommendedPace}`,
          "",
          `Fake-victim risk band: ${intelligence.fakeVictimAssessment.band} (${Math.round(intelligence.fakeVictimAssessment.probability * 100)}%)`,
          intelligence.fakeVictimAssessment.flags.length
            ? `Risk flags: ${intelligence.fakeVictimAssessment.flags.join(", ")}`
            : "Risk flags: none",
        ].join("\n")
      );
    } finally {
      setLoading(false);
    }
  };

  const sendSupportiveCoach = async () => {
    if (!coachInput.trim()) return;
    const text = coachInput.trim();
    setCoachInput("");
    setCoachChat((prev) => [...prev, { role: "user", text }]);
    const reply = await generateModeAwareCoachReply({ mode: "supportive_lawyer", text });
    setCoachChat((prev) => [...prev, { role: "assistant", text: reply }]);
    await persistVoiceChatMessage({ role: "user", mode: "supportive_lawyer", text });
    await persistVoiceChatMessage({ role: "assistant", mode: "supportive_lawyer", text: reply });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
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
        <View style={styles.output}>
          <Text style={styles.outputText}>{analysis || "Findings appear here."}</Text>
        </View>

        <View style={styles.chatPanel}>
          <Text style={styles.chatTitle}>Lawyer Companion Voice Coach</Text>
          <Text style={styles.chatSub}>Supportive and strategic, like a trusted legal partner.</Text>
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
            placeholder="Ask for legal framing help"
            placeholderTextColor={colors.mutedInk}
            style={styles.chatInput}
          />
          <Pressable style={styles.button} onPress={sendSupportiveCoach}>
            <Text style={styles.buttonLabel}>Ask Lawyer Coach</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav current="WarRoom" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 124 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 13, lineHeight: 20 },
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
    backgroundColor: "#EAF8F2",
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
