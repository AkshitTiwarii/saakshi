import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import {
  analyzeVoiceWithGoogleNlp,
  autoDiscoverEvidenceForCurrentCase,
  loadScreenDraft,
  saveScreenDraft,
  searchEvidenceForCurrentCase,
} from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Khojak">;

export function KhojakScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [nlpClues, setNlpClues] = useState<{
    timeClues: string[];
    locationClues: string[];
    peopleClues: string[];
    sentiment: string;
  } | null>(null);
  const [allClues, setAllClues] = useState<{
    time: Set<string>;
    location: Set<string>;
    people: Set<string>;
  }>({
    time: new Set(),
    location: new Set(),
    people: new Set(),
  });
  const [autoLeads, setAutoLeads] = useState<Array<{ type: string; source: string; query: string; confidence: number }>>([]);

  useEffect(() => {
    Promise.all([loadScreenDraft("khojak.query"), loadScreenDraft("khojak.result")])
      .then(([savedQuery, savedResult]) => {
        if (savedQuery) setQuery(savedQuery);
        if (savedResult) setResult(savedResult);
      })
      .catch(() => undefined);
  }, []);

  const onChangeQuery = (value: string) => {
    setQuery(value);
    void saveScreenDraft("khojak.query", value);
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const [searchRes, nlpRes, autoRes] = await Promise.all([
        searchEvidenceForCurrentCase(query),
        analyzeVoiceWithGoogleNlp(query),
        autoDiscoverEvidenceForCurrentCase(query),
      ]);

      const nextResult = `${searchRes.text}\n\nAuto-query: ${autoRes.autoQuery || "n/a"}`;
      setResult(nextResult);
      void saveScreenDraft("khojak.result", nextResult);
      setAutoLeads(autoRes.leads || []);

      const timeSet = new Set(allClues.time);
      const locationSet = new Set(allClues.location);
      const peopleSet = new Set(allClues.people);

      nlpRes.clues.time.forEach((t) => timeSet.add(t));
      nlpRes.clues.location.forEach((l) => locationSet.add(l));
      nlpRes.clues.people.forEach((p) => peopleSet.add(p));

      setAllClues({
        time: timeSet,
        location: locationSet,
        people: peopleSet,
      });

      setNlpClues({
        timeClues: nlpRes.clues.time,
        locationClues: nlpRes.clues.location,
        peopleClues: nlpRes.clues.people,
        sentiment: nlpRes.sentiment.label,
      });
    } catch {
      const fallback = "Khojak live search is unavailable right now. Your query and previous clues are saved locally.";
      setResult(fallback);
      void saveScreenDraft("khojak.result", fallback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Khojak Evidence Seeker</Text>
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search weather, transit, event clues"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
        />
        <Pressable style={styles.button} onPress={runSearch}>
          <Text style={styles.buttonLabel}>{loading ? "Searching..." : "Search Evidence"}</Text>
        </Pressable>

        {nlpClues && (
          <View style={styles.nlpPanel}>
            <Text style={styles.panelTitle}>Entity Clues (from query)</Text>
            <Text style={styles.clueLabel}>Sentiment: <Text style={styles.clueValue}>{nlpClues.sentiment}</Text></Text>
            <Text style={styles.clueLabel}>Time: <Text style={styles.clueValue}>{nlpClues.timeClues.join(", ") || "—"}</Text></Text>
            <Text style={styles.clueLabel}>Location: <Text style={styles.clueValue}>{nlpClues.locationClues.join(", ") || "—"}</Text></Text>
            <Text style={styles.clueLabel}>People/Org: <Text style={styles.clueValue}>{nlpClues.peopleClues.join(", ") || "—"}</Text></Text>
          </View>
        )}

        {allClues.time.size > 0 && (
          <View style={styles.graphPanel}>
            <Text style={styles.panelTitle}>Unified Timeline Graph</Text>
            <Text style={styles.graphValue}>{Array.from(allClues.time).join(" → ")}</Text>
          </View>
        )}

        {allClues.location.size > 0 && (
          <View style={styles.graphPanel}>
            <Text style={styles.panelTitle}>Unified Location Graph</Text>
            <Text style={styles.graphValue}>{Array.from(allClues.location).join(" → ")}</Text>
          </View>
        )}

        {allClues.people.size > 0 && (
          <View style={styles.graphPanel}>
            <Text style={styles.panelTitle}>Unified People/Org Graph</Text>
            <Text style={styles.graphValue}>{Array.from(allClues.people).join(", ")}</Text>
          </View>
        )}

        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Evidence Search Results</Text>
          <Text style={styles.resultText}>{result || "Results will appear here."}</Text>
        </View>

        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Automated Evidence Leads</Text>
          {autoLeads.length === 0 && <Text style={styles.resultText}>No automated leads yet.</Text>}
          {autoLeads.map((lead, index) => (
            <Text key={`${lead.type}-${lead.query}-${index}`} style={styles.resultText}>
              {`${index + 1}. ${lead.type} | ${lead.source} | ${lead.query} | confidence ${Math.round(lead.confidence * 100)}%`}
            </Text>
          ))}
        </View>
      </ScrollView>

      <BottomNav current="Khojak" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 172, flexGrow: 1 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  input: { backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  nlpPanel: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  graphPanel: {
    backgroundColor: "#FEF5E7",
    borderRadius: 14,
    padding: 12,
    gap: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#F39C12",
  },
  panelTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 14,
  },
  clueLabel: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
  },
  clueValue: {
    fontWeight: "700",
    color: colors.accent,
  },
  graphValue: {
    color: "#8B6914",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  resultBox: { backgroundColor: colors.white, borderRadius: 16, padding: 12, minHeight: 120 },
  resultLabel: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 6,
  },
  resultText: { color: colors.mutedInk, fontSize: 13, lineHeight: 18 },
});
