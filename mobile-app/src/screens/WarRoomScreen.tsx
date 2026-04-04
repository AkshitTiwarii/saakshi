import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import {
  assessTraumaForCurrentCase,
  calibrateDistressForCurrentCase,
  getLocalCaseCacheForCurrentSession,
  generateAdversarialAnalysis,
  generateWarRoomIntelligenceForCurrentCase,
  generateModeAwareCoachReply,
  getVictimSession,
  loadScreenDraft,
  normalizeTemporalPhraseForCurrentCase,
  predictLegalForCurrentCase,
  persistVoiceChatMessage,
  saveScreenDraft,
} from "../services/apiClient";
import { KAAL_CHAKRA_DECAY_ALERTS } from "../constants/saakshi";

type Props = NativeStackScreenProps<RootStackParamList, "Raksha">;

export function WarRoomScreen({ navigation }: Props) {
  const [facts, setFacts] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachChat, setCoachChat] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);

  useEffect(() => {
    Promise.all([
      loadScreenDraft("warroom.facts"),
      loadScreenDraft("warroom.analysis"),
      loadScreenDraft("warroom.chat"),
    ])
      .then(([savedFacts, savedAnalysis, savedChat]) => {
        if (savedFacts) setFacts(savedFacts);
        if (savedAnalysis) setAnalysis(savedAnalysis);
        if (savedChat) {
          try {
            setCoachChat(JSON.parse(savedChat));
          } catch {
            setCoachChat([]);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  const onChangeFacts = (value: string) => {
    setFacts(value);
    void saveScreenDraft("warroom.facts", value);
  };

  const run = async () => {
    if (!facts.trim()) return;
    setLoading(true);
    const caseId = getVictimSession()?.caseId || "demo-case-001";
    try {
      const [result, intelligence, legalPrediction, temporal, trauma, distress] = await Promise.allSettled([
        generateAdversarialAnalysis(caseId, [{ content: facts }]),
        generateWarRoomIntelligenceForCurrentCase(),
        predictLegalForCurrentCase(facts),
        normalizeTemporalPhraseForCurrentCase(facts),
        assessTraumaForCurrentCase(facts),
        calibrateDistressForCurrentCase({ transcript: facts }),
      ]);
      const resultData = result.status === "fulfilled" ? result.value : null;
      const intelligenceData = intelligence.status === "fulfilled" ? intelligence.value : null;
      const legalPredictionData = legalPrediction.status === "fulfilled" ? legalPrediction.value : null;
      const temporalData = temporal.status === "fulfilled" ? temporal.value : null;
      const traumaData = trauma.status === "fulfilled" ? trauma.value : null;
      const distressData = distress.status === "fulfilled" ? distress.value : null;
      const localCaseCache = await getLocalCaseCacheForCurrentSession().catch(() => null);

      const virodhi = resultData?.virodhi.map((v) => `- ${v.title}: ${v.description}`).join("\n") || "";
      const raksha = resultData?.raksha.map((r) => `- ${r.title}: ${r.description}`).join("\n") || "";
      const legal = intelligenceData?.legalSuggestions.slice(0, 4).map((l) => `- ${l.code}: ${l.title} (${l.why})`).join("\n") || "";
      const risks = intelligenceData?.contradictionRisks.slice(0, 4).map((r) => `- ${r.level}: ${r.title} - ${r.detail}`).join("\n") || "";
      const modelLegal = legalPredictionData?.suggestions.slice(0, 4).map((item) => `- ${item.code}: ${item.title}`).join("\n") || "";
      const output =
        [
          `Strength Score: ${resultData?.strengthScore ?? "n/a"}`,
          `Readiness Score: ${intelligenceData?.readinessScore ?? "n/a"}`,
          `AI Summary: ${intelligenceData?.summary || "Using local fallback summary"}`,
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
          `Law Model Provider: ${legalPredictionData?.provider || "fallback"}`,
          `Law Model Summary: ${legalPredictionData?.summary || "Legal model currently unavailable"}`,
          "Law Model Suggestions",
          modelLegal || "- none",
          "",
          temporalData
            ? `Temporal Window: ${temporalData.startDate} to ${temporalData.endDate} (${Math.round(temporalData.confidence * 100)}%)`
            : "Temporal Window: unavailable",
          temporalData ? `Temporal Rationale: ${temporalData.rationale}` : "Temporal Rationale: fallback mode",
          "",
          `Trauma Band: ${traumaData?.band || "n/a"}`,
          `Trauma Flags: ${traumaData?.flags.join(", ") || "none"}`,
          `Distress Band: ${distressData?.band || "n/a"}${distressData ? ` (${Math.round(distressData.score * 100)}%)` : ""}`,
          `Recommended pace: ${distressData?.recommendedPace || "n/a"}`,
          "",
          intelligenceData
            ? `Fake-victim risk band: ${intelligenceData.fakeVictimAssessment.band} (${Math.round(intelligenceData.fakeVictimAssessment.probability * 100)}%)`
            : "Fake-victim risk band: unavailable",
          intelligenceData?.fakeVictimAssessment.flags.length
            ? `Risk flags: ${intelligenceData.fakeVictimAssessment.flags.join(", ")}`
            : "Risk flags: none",
          "",
          `Local chain length: ${localCaseCache?.chain.length || 0}`,
          `Stored local fragments: ${localCaseCache?.fragments.length || 0}`,
        ].join("\n");
      setAnalysis(output);
      void saveScreenDraft("warroom.analysis", output);
    } catch {
      setAnalysis("Raksha could not complete this run. Check backend and API keys, then retry.");
      void saveScreenDraft("warroom.analysis", "Raksha could not complete this run. Check backend and API keys, then retry.");
    } finally {
      setLoading(false);
    }
  };

  const sendSupportiveCoach = async () => {
    if (!coachInput.trim()) return;
    const text = coachInput.trim();
    setCoachInput("");
    setCoachChat((prev) => {
      const next = [...prev, { role: "user" as const, text }];
      void saveScreenDraft("warroom.chat", JSON.stringify(next));
      return next;
    });
    try {
      const reply = await generateModeAwareCoachReply({ mode: "supportive_lawyer", text });
      setCoachChat((prev) => {
        const next = [...prev, { role: "assistant" as const, text: reply }];
        void saveScreenDraft("warroom.chat", JSON.stringify(next));
        return next;
      });
      await persistVoiceChatMessage({ role: "user", mode: "supportive_lawyer", text });
      await persistVoiceChatMessage({ role: "assistant", mode: "supportive_lawyer", text: reply });
    } catch {
      setCoachChat((prev) => {
        const next = [...prev, { role: "assistant" as const, text: "Coach is temporarily unavailable. Your message was saved locally." }];
        void saveScreenDraft("warroom.chat", JSON.stringify(next));
        return next;
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Raksha</Text>
        <Text style={styles.sub}>Stress-test your statement before external review.</Text>
        <TextInput
          value={facts}
          onChangeText={onChangeFacts}
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

        <View style={styles.kaalChakraPanel}>
          <Text style={styles.kaalTitle}>KAAL CHAKRA | Evidence Decay Alerts</Text>
          {KAAL_CHAKRA_DECAY_ALERTS.map((alert) => (
            <View key={alert.id} style={styles.kaalItem}>
              <Text style={styles.kaalMeta}>{alert.level} | {alert.window}</Text>
              <Text style={styles.kaalSource}>{alert.source}</Text>
              <Text style={styles.kaalAction}>{alert.action}</Text>
            </View>
          ))}
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

      <BottomNav current="Raksha" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 176, flexGrow: 1 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 13, lineHeight: 20 },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 140, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  output: { backgroundColor: colors.white, borderRadius: 16, padding: 12, minHeight: 180 },
  outputText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  kaalChakraPanel: {
    backgroundColor: "#FFF7EC",
    borderWidth: 1,
    borderColor: "#F1D8B8",
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  kaalTitle: {
    color: "#6F4416",
    fontWeight: "800",
    fontSize: 13,
  },
  kaalItem: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F1E4D0",
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  kaalMeta: {
    color: "#8E5A22",
    fontSize: 10,
    fontWeight: "800",
  },
  kaalSource: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  kaalAction: {
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 17,
  },
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
