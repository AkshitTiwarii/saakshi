import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import {
  analyzeVoiceWithGoogleNlp,
  autoDiscoverEvidenceForCurrentCase,
  findNearbyCamerasForCurrentCase,
  getVictimCaseOverviewForCurrentSession,
  loadScreenDraft,
  lookupMerchantTransactionForCurrentCase,
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
  const [contextHint, setContextHint] = useState("Loading shared context...");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [cameraRadius, setCameraRadius] = useState("1200");
  const [cameraSearchLoading, setCameraSearchLoading] = useState(false);
  const [cameraResult, setCameraResult] = useState<{ hint: string; center?: { displayName: string }; cameras: Array<{ id: string; name: string; type: string; source: string; distanceMeters: number }> } | null>(null);
  const [merchantTransactionId, setMerchantTransactionId] = useState("");
  const [googleMerchantId, setGoogleMerchantId] = useState("");
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionResult, setTransactionResult] = useState<string>("");

  useEffect(() => {
    Promise.all([
      loadScreenDraft("khojak.query"),
      loadScreenDraft("khojak.result"),
      loadScreenDraft("khojak.location"),
      loadScreenDraft("khojak.radius"),
      loadScreenDraft("khojak.transactionId"),
      loadScreenDraft("khojak.googleMerchantId"),
      loadScreenDraft("khojak.transactionResult"),
    ])
      .then(([savedQuery, savedResult, savedLocation, savedRadius, savedTransactionId, savedGoogleMerchantId, savedTransactionResult]) => {
        if (savedQuery) setQuery(savedQuery);
        if (savedResult) setResult(savedResult);
        if (savedLocation) setIncidentLocation(savedLocation);
        if (savedRadius) setCameraRadius(savedRadius);
        if (savedTransactionId) setMerchantTransactionId(savedTransactionId);
        if (savedGoogleMerchantId) setGoogleMerchantId(savedGoogleMerchantId);
        if (savedTransactionResult) setTransactionResult(savedTransactionResult);
      })
      .catch(() => undefined);

    getVictimCaseOverviewForCurrentSession()
      .then((overview) => {
        if (!overview) {
          setContextHint("Case context unavailable. Working with local draft context.");
          return;
        }
        const summary = String(overview.profile?.incidentSummary || "").trim();
        setContextHint(
          `Loaded ${overview.fragments.length} prior fragments${summary ? ", incident summary synced" : ""}. Evidence search will use full case context.`
        );
      })
      .catch(() => setContextHint("Could not sync full case context right now."));
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

  const runCameraSearch = async () => {
    const locationLabel = incidentLocation.trim();
    if (!locationLabel) {
      setResult("Enter the location of the incident first so Khojak can search nearby cameras.");
      return;
    }

    setCameraSearchLoading(true);
    try {
      const radius = Number(cameraRadius) || 1200;
      const cameraSearch = await findNearbyCamerasForCurrentCase(locationLabel, radius);
      setCameraResult({
        hint: cameraSearch.hint || "Camera search completed.",
        center: cameraSearch.center ? { displayName: cameraSearch.center.displayName } : undefined,
        cameras: cameraSearch.cameras,
      });
      const nextResult = [
        `Camera search for: ${locationLabel}`,
        cameraSearch.hint || "",
        cameraSearch.cameras.length
          ? cameraSearch.cameras.map((camera, index) => `${index + 1}. ${camera.name} | ${camera.type} | ${camera.distanceMeters}m | ${camera.source}`).join("\n")
          : "No camera-related OSM objects found in the search radius.",
      ].join("\n\n");
      setResult(nextResult);
      void saveScreenDraft("khojak.result", nextResult);
    } catch {
      const fallback = "Nearby camera lookup failed. Try a clearer landmark or smaller radius.";
      setResult(fallback);
      void saveScreenDraft("khojak.result", fallback);
    } finally {
      setCameraSearchLoading(false);
    }
  };

  const runTransactionLookup = async () => {
    const transactionId = merchantTransactionId.trim();
    if (!transactionId) {
      setTransactionResult("Enter the merchant transaction ID first.");
      return;
    }

    setTransactionLoading(true);
    try {
      const lookup = await lookupMerchantTransactionForCurrentCase({
        transactionId,
        googleMerchantId: googleMerchantId.trim() || undefined,
      });
      const formatted = lookup.transaction
        ? JSON.stringify(lookup.transaction, null, 2)
        : lookup.hint || "No transaction data returned.";
      setTransactionResult(formatted);
      void saveScreenDraft("khojak.transactionResult", formatted);
    } catch {
      const fallback = "Transaction lookup failed. Keep the merchant transaction ID and request later with the correct merchant account.";
      setTransactionResult(fallback);
      void saveScreenDraft("khojak.transactionResult", fallback);
    } finally {
      setTransactionLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Khojak Evidence Seeker</Text>
        <View style={styles.contextBanner}>
          <Text style={styles.contextTitle}>Shared Case Context</Text>
          <Text style={styles.contextBody}>{contextHint}</Text>
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Location-Based Camera Search</Text>
          <Text style={styles.panelBody}>Enter where the incident may have happened. Khojak will use Overpass to look for nearby camera-related OSM data.</Text>
          <TextInput
            value={incidentLocation}
            onChangeText={(value) => {
              setIncidentLocation(value);
              void saveScreenDraft("khojak.location", value);
            }}
            placeholder="Area, road, landmark, or neighborhood"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
          />
          <TextInput
            value={cameraRadius}
            onChangeText={(value) => {
              setCameraRadius(value);
              void saveScreenDraft("khojak.radius", value);
            }}
            placeholder="Search radius in meters"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            keyboardType="numeric"
          />
          <Pressable style={styles.button} onPress={runCameraSearch}>
            <Text style={styles.buttonLabel}>{cameraSearchLoading ? "Searching cameras..." : "Find Nearby Cameras"}</Text>
          </Pressable>
          <Text style={styles.smallBody}>{cameraResult?.hint || "Khojak will surface nearby camera pointers here."}</Text>
          {cameraResult?.cameras?.length ? (
            <View style={styles.inlineList}>
              {cameraResult.cameras.map((camera) => (
                <View key={camera.id} style={styles.listItem}>
                  <Text style={styles.listItemTitle}>{camera.name}</Text>
                  <Text style={styles.listItemBody}>{`${camera.type} • ${camera.distanceMeters}m • ${camera.source}`}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>UPI / Money / Transport Payment Trace</Text>
          <Text style={styles.panelBody}>Enter the merchant transaction ID from a cab, hotel, food, toll, or other transport-related payment. Khojak will keep the details ready for evidence review.</Text>
          <TextInput
            value={merchantTransactionId}
            onChangeText={(value) => {
              setMerchantTransactionId(value);
              void saveScreenDraft("khojak.transactionId", value);
            }}
            placeholder="Merchant transaction ID"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
          />
          <TextInput
            value={googleMerchantId}
            onChangeText={(value) => {
              setGoogleMerchantId(value);
              void saveScreenDraft("khojak.googleMerchantId", value);
            }}
            placeholder="Google merchant ID (if available)"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
          />
          <Pressable style={styles.button} onPress={runTransactionLookup}>
            <Text style={styles.buttonLabel}>{transactionLoading ? "Checking transaction..." : "Check Transaction"}</Text>
          </Pressable>
          <Text style={styles.smallBody}>{transactionResult || "Transaction details will appear here."}</Text>
        </View>
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
  contextBanner: {
    backgroundColor: "#EEF6F0",
    borderWidth: 1,
    borderColor: "#B7D8C0",
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  contextTitle: {
    color: "#2F6141",
    fontSize: 12,
    fontWeight: "800",
  },
  contextBody: {
    color: "#3F6D4E",
    fontSize: 12,
    lineHeight: 17,
  },
  panel: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  panelTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 15,
  },
  panelBody: {
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 18,
  },
  input: { backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  smallBody: { color: colors.mutedInk, fontSize: 12, lineHeight: 17 },
  inlineList: { gap: 8 },
  listItem: { backgroundColor: "#FEF5E7", borderRadius: 12, padding: 10, gap: 2 },
  listItemTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  listItemBody: { color: "#8B6914", fontSize: 12, lineHeight: 16 },
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
