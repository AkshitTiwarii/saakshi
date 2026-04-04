import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { LEGAL_DOCUMENT_PACK } from "../constants/saakshi";

type Props = NativeStackScreenProps<RootStackParamList, "Docs">;

export function DocsScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Case Documents</Text>
      <Text style={styles.sub}>Auto-generated in English + your selected regional language.</Text>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {LEGAL_DOCUMENT_PACK.map((doc) => (
          <View key={doc.id} style={styles.card}>
            <Text style={styles.cardTitle}>{doc.title}</Text>
            <Text style={styles.cardStatus}>{doc.status}</Text>
            <Text style={styles.cardDetail}>{doc.detail}</Text>
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.button} onPress={() => navigation.navigate("Dashboard") }>
        <Text style={styles.buttonLabel}>Back to Dashboard</Text>
      </Pressable>

      <BottomNav current="Settings" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  scrollContent: { gap: 10, paddingBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#1F2A3D",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  cardStatus: { color: colors.mutedInk, marginTop: 4 },
  cardDetail: { color: colors.mutedInk, marginTop: 6, fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
});
