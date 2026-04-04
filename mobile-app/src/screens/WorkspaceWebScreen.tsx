import React, { useMemo, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { BottomNav } from "../components/BottomNav";
import {
  classifyFragmentForCurrentCase,
  generateAdversarialAnalysis,
  generateCrossExamination,
  getVictimSession,
  searchEvidence,
} from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "WebWorkspace">;

export function WorkspaceWebScreen({ navigation }: Props) {
  const [intake, setIntake] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const [strategyResult, setStrategyResult] = useState("");
  const [crossExamResult, setCrossExamResult] = useState("");
  const [emotionResult, setEmotionResult] = useState("");
  const [working, setWorking] = useState<"search" | "strategy" | "cross" | "emotion" | "">("");

  const session = getVictimSession();
  const caseId = session?.caseId || "demo-case-001";

  const headline = useMemo(() => {
    if (session?.caseNumber) return `Case ${session.caseNumber}`;
    return "Case workspace";
  }, [session?.caseNumber]);

  const runEvidenceSearch = async () => {
    if (!searchQuery.trim()) return;
    setWorking("search");
    try {
      const result = await searchEvidence(caseId, searchQuery.trim());
      setSearchResult(result.text || "No evidence match found yet.");
    } finally {
      setWorking("");
    }
  };

  const runStrategy = async () => {
    if (!intake.trim()) return;
    setWorking("strategy");
    try {
      const result = await generateAdversarialAnalysis(caseId, [{ content: intake.trim() }]);
      const virodhi = result.virodhi.map((v) => `- ${v.title}: ${v.description}`).join("\n");
      const raksha = result.raksha.map((r) => `- ${r.title}: ${r.description}`).join("\n");
      setStrategyResult(
        `Strength Score: ${result.strengthScore}\n\nVirodhi\n${virodhi || "- none"}\n\nRaksha\n${raksha || "- none"}`
      );
    } finally {
      setWorking("");
    }
  };

  const runCrossExam = async () => {
    if (!intake.trim()) return;
    setWorking("cross");
    try {
      const result = await generateCrossExamination(caseId, [{ content: intake.trim() }]);
      setCrossExamResult(
        `Question\n${result.question}\n\nCoaching\n${result.coaching}\n\nThreat Type\n${result.threatType}`
      );
    } finally {
      setWorking("");
    }
  };

  const runEmotionTagging = async () => {
    if (!intake.trim()) return;
    setWorking("emotion");
    try {
      const result = await classifyFragmentForCurrentCase(intake.trim());
      const chips = [result.emotion, result.time, result.location].filter(Boolean).join(" • ");
      setEmotionResult(chips || "No markers detected yet.");
    } finally {
      setWorking("");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Native Command Center</Text>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.sub}>All intelligence and evidence operations run directly in-app.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Narrative Input</Text>
          <TextInput
            value={intake}
            onChangeText={setIntake}
            style={[styles.input, styles.textArea]}
            multiline
            textAlignVertical="top"
            placeholder="Paste statement, event sequence, or incident memory"
            placeholderTextColor={colors.mutedInk}
          />
          <View style={styles.actionRow}>
            <Pressable style={styles.primary} onPress={runEmotionTagging}>
              <Text style={styles.primaryText}>Tag Emotion</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={runStrategy}>
              <Text style={styles.secondaryText}>Run Strategy</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={runCrossExam}>
              <Text style={styles.secondaryText}>Cross-Exam</Text>
            </Pressable>
          </View>
          {!!emotionResult && <Text style={styles.inlineResult}>Signal: {emotionResult}</Text>}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Evidence Search</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.input}
            placeholder="Search weather, transit, location, witnesses"
            placeholderTextColor={colors.mutedInk}
          />
          <Pressable style={styles.primary} onPress={runEvidenceSearch}>
            <Text style={styles.primaryText}>Search Evidence</Text>
          </Pressable>
          <Text style={styles.blockResult}>{searchResult || "Search output will appear here."}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Raksha Output</Text>
          <Text style={styles.blockResult}>{strategyResult || "Adversarial analysis appears here."}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Pareeksha Output</Text>
          <Text style={styles.blockResult}>{crossExamResult || "Cross-exam practice appears here."}</Text>
        </View>

        <View style={styles.quickGrid}>
          <Pressable style={styles.quickCard} onPress={() => navigation.navigate("CaptureMethod")}> 
            <Text style={styles.quickTitle}>Capture</Text>
            <Text style={styles.quickDesc}>Write, voice, draw, upload</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => navigation.navigate("Docs")}> 
            <Text style={styles.quickTitle}>Docs</Text>
            <Text style={styles.quickDesc}>Summaries and exports</Text>
          </Pressable>
        </View>

        {!!working && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loadingText}>Processing {working}...</Text>
          </View>
        )}
      </ScrollView>

      <BottomNav current="WebWorkspace" onNavigate={(route) => navigation.navigate(route as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 14, paddingTop: 10 },
  scroll: { gap: 12, paddingBottom: 124 },
  hero: {
    backgroundColor: "#102A44",
    borderRadius: 24,
    padding: 18,
  },
  kicker: {
    color: "#92B7DA",
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "800",
  },
  title: {
    color: "#EFF6FF",
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "800",
    marginTop: 8,
  },
  sub: {
    color: "#D6E3F1",
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#1F2A3D",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  panelTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  input: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
  textArea: {
    minHeight: 108,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryText: { color: colors.white, fontWeight: "700", fontSize: 12 },
  secondary: {
    backgroundColor: "#EDF2FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryText: { color: "#2A4597", fontWeight: "700", fontSize: 12 },
  inlineResult: {
    color: "#335B88",
    fontSize: 12,
    fontWeight: "600",
  },
  blockResult: {
    backgroundColor: "#F5F8FD",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6EDFA",
    padding: 10,
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 64,
  },
  quickGrid: {
    flexDirection: "row",
    gap: 10,
  },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickTitle: { color: colors.ink, fontWeight: "800", fontSize: 15 },
  quickDesc: { color: colors.mutedInk, fontSize: 12, marginTop: 3 },
  loadingOverlay: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  loadingText: { color: colors.mutedInk, fontSize: 12, fontWeight: "600" },
});