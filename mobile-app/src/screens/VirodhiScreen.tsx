import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import {
  getVictimCaseOverviewForCurrentSession,
  loadScreenDraft,
  persistVoiceChatMessage,
  queryVirodhiForCurrentCase,
  saveScreenDraft,
} from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Virodhi">;

export function VirodhiScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextHint, setContextHint] = useState("Loading full case context...");

  useEffect(() => {
    Promise.all([loadScreenDraft("virodhi.query"), loadScreenDraft("virodhi.reply")])
      .then(([savedQuery, savedReply]) => {
        if (savedQuery) setQuery(savedQuery);
        if (savedReply) setReply(savedReply);
      })
      .catch(() => undefined);

    getVictimCaseOverviewForCurrentSession()
      .then((overview) => {
        if (!overview) {
          setContextHint("Case context not available yet. Continue and sync once online.");
          return;
        }

        const summary = String(overview.profile?.incidentSummary || "").trim();
        setContextHint(
          `Context ready: ${overview.fragments.length} fragments, ${overview.integrity.entryCount} integrity entries${
            summary ? ", incident summary present" : ""
          }.`
        );
      })
      .catch(() => {
        setContextHint("Case context could not be loaded right now.");
      });
  }, []);

  const askVirodhi = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const result = await queryVirodhiForCurrentCase({ query });
      const formatted = [
        result.answer,
        "",
        "Likely Attack Vectors",
        ...(result.attackVectors.length ? result.attackVectors.map((item) => `- ${item}`) : ["- none"]),
        "",
        "Gaps To Fix",
        ...(result.gapsToFix.length ? result.gapsToFix.map((item) => `- ${item}`) : ["- none"]),
        "",
        "Recommended Evidence",
        ...(result.recommendedEvidence.length ? result.recommendedEvidence.map((item) => `- ${item}`) : ["- none"]),
      ].join("\n");

      setReply(formatted);
      void saveScreenDraft("virodhi.reply", formatted);
      await persistVoiceChatMessage({ role: "user", mode: "strict", text: `[VIRODHI_QUERY] ${query.trim()}` });
      await persistVoiceChatMessage({ role: "assistant", mode: "strict", text: `[VIRODHI_REPLY] ${result.answer}` });
    } catch {
      const fallback = "Virodhi is currently unavailable. Retry once backend/Gemini is reachable.";
      setReply(fallback);
      void saveScreenDraft("virodhi.reply", fallback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>VIRODHI (विरोधी)</Text>
        <Text style={styles.sub}>Adversary simulation based on your full case context.</Text>

        <View style={styles.contextBanner}>
          <Text style={styles.contextTitle}>Shared Context State</Text>
          <Text style={styles.contextBody}>{contextHint}</Text>
        </View>

        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            void saveScreenDraft("virodhi.query", value);
          }}
          placeholder="Ask how defense can challenge your statement"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
          multiline
        />

        <Pressable style={styles.button} onPress={askVirodhi}>
          <Text style={styles.buttonLabel}>{loading ? "Thinking..." : "Ask Virodhi"}</Text>
        </Pressable>

        <View style={styles.output}>
          <Text style={styles.outputText}>{reply || "Virodhi response appears here."}</Text>
        </View>
      </ScrollView>

      <BottomNav current="Virodhi" onNavigate={(route) => navigation.navigate(route as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 176, flexGrow: 1 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 13, lineHeight: 20 },
  contextBanner: {
    backgroundColor: "#FFF2EE",
    borderWidth: 1,
    borderColor: "#F4C8BB",
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  contextTitle: {
    color: "#773A2B",
    fontWeight: "800",
    fontSize: 12,
  },
  contextBody: {
    color: "#8B4A36",
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    minHeight: 120,
    color: colors.ink,
    textAlignVertical: "top",
  },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  output: { backgroundColor: colors.white, borderRadius: 16, padding: 12, minHeight: 220 },
  outputText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
});
