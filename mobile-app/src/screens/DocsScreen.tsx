import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Docs">;

const sampleDocs = [
  { id: "doc-1", title: "Timeline Notes", status: "Draft" },
  { id: "doc-2", title: "Evidence Sheet", status: "Anchored" },
  { id: "doc-3", title: "Counsel Summary", status: "Ready" },
];

export function DocsScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Case Documents</Text>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sampleDocs.map((doc) => (
          <View key={doc.id} style={styles.card}>
            <Text style={styles.cardTitle}>{doc.title}</Text>
            <Text style={styles.cardStatus}>{doc.status}</Text>
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
  scrollContent: { gap: 10, paddingBottom: 8 },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 14 },
  cardTitle: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  cardStatus: { color: colors.mutedInk, marginTop: 4 },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
});
