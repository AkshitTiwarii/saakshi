import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { BottomNav } from "../components/BottomNav";
import { SUPPORTED_INDIAN_LANGUAGES } from "../constants/saakshi";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureMethod">;

const methods = [
  { id: "speak", label: "Speak", hint: "Voice first" },
  { id: "draw", label: "Draw", hint: "Visual memory" },
  { id: "write", label: "Write", hint: "Text fragments" },
  { id: "upload", label: "Upload", hint: "Photo, audio, document" },
];

export function CaptureMethodScreen({ route, navigation }: Props) {
  const mood = route.params?.mood || "unknown";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [language, setLanguage] = useState("Hindi");
  const [apiResult, setApiResult] = useState<string>("Choose any way to begin. You can switch methods anytime.");

  const handleMethodPress = (methodId: string) => {
    setBusyId(methodId);
    setApiResult("Opening your selected capture workspace...");

    if (methodId === "write") navigation.navigate("CaptureWrite", { mood });
    if (methodId === "speak") navigation.navigate("CaptureVoice", { mood });
    if (methodId === "draw") navigation.navigate("CaptureDraw", { mood });
    if (methodId === "upload") navigation.navigate("CaptureUpload", { mood });

    setTimeout(() => setBusyId(null), 250);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Current mood context: {mood}</Text>
          <Text style={styles.title}>Choose the easiest way to start.</Text>
          <Text style={styles.subtitle}>No rush. No pressure. One detail at a time is enough.</Text>
        </View>

        <View style={styles.flowCard}>
          <Text style={styles.flowTitle}>What Happens Next</Text>
          <Text style={styles.flowLine}>1. Choose method</Text>
          <Text style={styles.flowLine}>2. Add details you are ready to share</Text>
          <Text style={styles.flowLine}>3. Saakshi helps organize clues for timeline and evidence</Text>
        </View>

        <View style={styles.flowCard}>
          <Text style={styles.flowTitle}>Language + Safe Entry</Text>
          <Text style={styles.flowLine}>Speak or write in your language. Your testimony is preserved with timestamped fragments.</Text>
          <View style={styles.languageWrap}>
            {SUPPORTED_INDIAN_LANGUAGES.slice(0, 8).map((item) => (
              <Pressable
                key={item}
                style={[styles.langChip, language === item && styles.langChipActive]}
                onPress={() => setLanguage(item)}
              >
                <Text style={[styles.langLabel, language === item && styles.langLabelActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.flowLine}>Selected language: {language} (22-language support available in app settings)</Text>
          <View style={styles.entryActions}>
            <Pressable
              style={styles.entryButton}
              onPress={() => Linking.openURL("https://wa.me/919999999999?text=Mujhe%20help%20chahiye")}
            >
              <Text style={styles.entryButtonLabel}>WhatsApp Assist</Text>
            </Pressable>
            <Pressable style={styles.entryGhostButton} onPress={() => Linking.openURL("tel:181")}>
              <Text style={styles.entryGhostLabel}>Call Helpline 181</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.list}>
          {methods.map((method) => (
            <Pressable key={method.id} style={styles.card} onPress={() => handleMethodPress(method.id)}>
              <View>
                <Text style={styles.cardTitle}>{busyId === method.id ? "Opening..." : method.label}</Text>
                <Text style={styles.cardHint}>{method.hint}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>

        {!!apiResult && <Text style={styles.apiResult}>{apiResult}</Text>}

        <Pressable style={styles.quickExit} onPress={() => navigation.navigate("QuickExit")}>
          <Text style={styles.quickExitText}>Quick Exit</Text>
        </Pressable>
      </ScrollView>

      <BottomNav
        current="CaptureMethod"
        onNavigate={(route) => navigation.navigate(route as any)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.fog,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  scroll: {
    paddingBottom: 182,
    flexGrow: 1,
    gap: 14,
  },
  header: {
    marginTop: 24,
    gap: 10,
  },
  kicker: {
    color: colors.sageDeep,
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.mutedInk,
    fontSize: 15,
    lineHeight: 22,
  },
  flowCard: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.cloud,
  },
  flowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  flowLine: {
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 18,
  },
  languageWrap: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  langChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.cloud,
  },
  langChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accentStrong,
  },
  langLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  langLabelActive: {
    color: colors.white,
  },
  entryActions: {
    marginTop: 8,
    gap: 8,
  },
  entryButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  entryButtonLabel: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  entryGhostButton: {
    backgroundColor: colors.panelAlt,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cloud,
  },
  entryGhostLabel: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 12,
  },
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: colors.panelAlt,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cloud,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "700",
  },
  cardHint: {
    color: colors.mutedInk,
    fontSize: 14,
    marginTop: 2,
  },
  arrow: {
    color: colors.accentStrong,
    fontSize: 28,
    fontWeight: "700",
  },
  quickExit: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  quickExitText: {
    color: colors.accentStrong,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  apiResult: {
    marginTop: 4,
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 20,
  },
});
