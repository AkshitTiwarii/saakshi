import React, { useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { getHealth, getVictimSession, loadScreenDraft, saveScreenDraft, saveVictimDetails } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

const cards = [
  { title: "Capture", route: "CaptureMethod" as const, desc: "Speak, write, draw, or upload", tone: ["#B25F47", "#924631"] as const },
  { title: "Khojak", route: "Khojak" as const, desc: "Find supporting evidence", tone: ["#7F9B76", "#5F7D57"] as const },
  { title: "Raksha", route: "Raksha" as const, desc: "Plan legal next steps", tone: ["#8A4D3D", "#6A3528"] as const },
  { title: "Pareeksha", route: "Pareeksha" as const, desc: "Prepare with confidence", tone: ["#6B8290", "#4D646F"] as const },
  { title: "Command", route: "WebWorkspace" as const, desc: "Case overview and sync", tone: ["#736357", "#57483E"] as const },
  { title: "Account", route: "Settings" as const, desc: "Privacy and safety", tone: ["#5A4B40", "#3E342E"] as const },
];

export function DashboardScreen({ navigation }: Props) {
  const [status, setStatus] = useState("Checking backend...");
  const [caseLabel, setCaseLabel] = useState("");
  const [incidentSummary, setIncidentSummary] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [savingBrief, setSavingBrief] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();

    getHealth()
      .then((h) => setStatus(`Backend ${h.status}`))
      .catch(() => setStatus("Backend unavailable (local mode)"));

    const session = getVictimSession();
    if (session?.caseNumber) {
      setCaseLabel(`Your case: ${session.caseNumber}`);
    }

    Promise.all([
      loadScreenDraft("dashboard.caseBrief.summary"),
      loadScreenDraft("dashboard.caseBrief.phone"),
      loadScreenDraft("dashboard.caseBrief.emergency"),
    ])
      .then(([savedSummary, savedPhone, savedEmergency]) => {
        if (savedSummary) setIncidentSummary(savedSummary);
        if (savedPhone) setPhone(savedPhone);
        if (savedEmergency) setEmergencyContact(savedEmergency);
      })
      .catch(() => undefined);
  }, [fade]);

  const saveCaseBrief = async () => {
    const session = getVictimSession();
    if (!session) {
      Alert.alert("Case unavailable", "Complete onboarding before saving case details.");
      return;
    }

    setSavingBrief(true);
    try {
      const result = await saveVictimDetails({
        profile: {
          incidentSummary: incidentSummary.trim() || undefined,
          phone: phone.trim() || undefined,
          emergencyContact: emergencyContact.trim() || undefined,
        },
        fragments: incidentSummary.trim() ? [`[dashboard-case-brief] ${incidentSummary.trim()}`] : [],
        source: "mobile-dashboard-case-brief",
        forceCloudSync: true,
      });

      Alert.alert(
        "Case brief saved",
        result.localOnly
          ? "Saved locally. Connect internet and save again for admin/officer sync."
          : "Saved securely with integrity chain and synced to backend."
      );
    } catch (error) {
      Alert.alert("Save failed", (error as Error).message || "Unable to save case details.");
    } finally {
      setSavingBrief(false);
    }
  };

  const cardRows: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    cardRows.push(cards.slice(i, i + 2));
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroTopWave} />
        <View style={styles.heroInline}> 
          <Text style={styles.brand}>SAAKSHI</Text>
          <Text style={styles.title}>Your Safe Case Space</Text>
          <Text style={styles.status}>{status}</Text>
          {!!caseLabel && <Text style={styles.status}>{caseLabel}</Text>}
        </View>

        <View style={styles.heroActions}>
          <Pressable style={styles.heroButton} onPress={() => navigation.navigate("EmotionalCheckIn")}>
            <Text style={styles.heroButtonText}>Start Gentle Intake</Text>
          </Pressable>
          <Pressable style={styles.heroGhostButton} onPress={() => navigation.navigate("WebWorkspace")}>
            <Text style={styles.heroGhostLabel}>Open Case Command Center</Text>
          </Pressable>
        </View>

        <View style={styles.caseBriefCard}>
          <Text style={styles.caseBriefTitle}>Case Details You Want To Share</Text>
          <Text style={styles.caseBriefSub}>Share only what feels safe. Your notes are protected with integrity hash-chain tracking.</Text>

          <TextInput
            value={incidentSummary}
            onChangeText={(value) => {
              setIncidentSummary(value);
              void saveScreenDraft("dashboard.caseBrief.summary", value);
            }}
            placeholder="Describe what happened, in your own words, at your pace"
            placeholderTextColor={colors.mutedInk}
            style={styles.caseBriefSummaryInput}
            multiline
          />

          <View style={styles.caseBriefRow}>
            <TextInput
              value={phone}
              onChangeText={(value) => {
                setPhone(value);
                void saveScreenDraft("dashboard.caseBrief.phone", value);
              }}
              placeholder="Preferred contact number"
              placeholderTextColor={colors.mutedInk}
              style={styles.caseBriefInput}
              keyboardType="phone-pad"
            />
            <TextInput
              value={emergencyContact}
              onChangeText={(value) => {
                setEmergencyContact(value);
                void saveScreenDraft("dashboard.caseBrief.emergency", value);
              }}
              placeholder="Trusted emergency contact"
              placeholderTextColor={colors.mutedInk}
              style={styles.caseBriefInput}
              keyboardType="phone-pad"
            />
          </View>

          <Pressable style={styles.caseBriefButton} onPress={saveCaseBrief}>
            <Text style={styles.caseBriefButtonText}>{savingBrief ? "Saving securely..." : "Save My Case Notes"}</Text>
          </Pressable>
        </View>

        <Animated.View style={[styles.grid, { opacity: fade }]}> 
          {cardRows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.row}>
              {row.map((card) => (
                <Pressable key={card.title} style={styles.cardWrap} onPress={() => navigation.navigate(card.route)}>
                  <LinearGradient colors={card.tone} style={styles.card}>
                    <Text style={styles.cardTitle}>{card.title}</Text>
                    <Text style={styles.cardDesc}>{card.desc}</Text>
                  </LinearGradient>
                </Pressable>
              ))}
              {row.length === 1 && <View style={styles.cardWrap} />}
            </View>
          ))}
        </Animated.View>
      </ScrollView>

      <BottomNav current="Dashboard" onNavigate={(route) => navigation.navigate(route as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 16, paddingTop: 14 },
  scroll: { paddingBottom: 176, flexGrow: 1 },
  heroTopWave: {
    height: 130,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 110,
    backgroundColor: colors.warmSand,
  },
  heroInline: {
    marginTop: -42,
    marginBottom: 10,
  },
  brand: { color: colors.sageDeep, fontSize: 18, letterSpacing: 2.2, fontWeight: "800" },
  title: { color: colors.ink, marginTop: 8, fontSize: 44, lineHeight: 48, fontWeight: "800" },
  status: { color: colors.mutedInk, marginTop: 6, fontSize: 12 },
  heroActions: {
    marginBottom: 12,
    gap: 8,
  },
  heroButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.accentStrong,
  },
  heroButtonText: { color: colors.white, fontWeight: "800", fontSize: 13, letterSpacing: 0.3 },
  heroGhostButton: {
    backgroundColor: colors.panel,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cloud,
    paddingVertical: 11,
    alignItems: "center",
  },
  heroGhostLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  grid: { gap: 12 },
  caseBriefCard: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cloud,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  caseBriefTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  caseBriefSub: {
    color: colors.mutedInk,
    fontSize: 12,
  },
  caseBriefSummaryInput: {
    borderWidth: 1,
    borderColor: colors.cloud,
    borderRadius: 12,
    minHeight: 86,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlignVertical: "top",
    color: colors.ink,
    backgroundColor: colors.white,
  },
  caseBriefRow: {
    flexDirection: "row",
    gap: 8,
  },
  caseBriefInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.cloud,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  caseBriefButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.accentStrong,
  },
  caseBriefButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  row: { flexDirection: "row", gap: 12 },
  cardWrap: { flex: 1 },
  card: { borderRadius: 18, padding: 16, minHeight: 102 },
  cardTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  cardDesc: { color: "#F7FAFF", fontSize: 13, marginTop: 4 },
});
