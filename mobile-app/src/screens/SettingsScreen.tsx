import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { exportCaseReportForCurrentCase, getVictimSession } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const { user } = useUser();
  const [pin, setPin] = useState("");
  const [panic, setPanic] = useState(true);
  const [exporting, setExporting] = useState(false);
  const victimSession = getVictimSession();

  const userName = user?.fullName || user?.firstName || "Not set";
  const email = user?.primaryEmailAddress?.emailAddress || "Not set";
  const lastLoggedIn = user?.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Not available";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Account & Safety</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{userName}</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{email}</Text>
          <Text style={styles.label}>Case ID</Text>
          <Text style={styles.value}>{victimSession?.caseId || "Provisioning in progress"}</Text>
          <Text style={styles.label}>Case Number</Text>
          <Text style={styles.value}>{victimSession?.caseNumber || "Provisioning in progress"}</Text>
          <Text style={styles.label}>Age</Text>
          <Text style={styles.value}>{user?.unsafeMetadata?.age ? String(user.unsafeMetadata.age) : "Not provided"}</Text>
          <Text style={styles.label}>Last Logged In</Text>
          <Text style={styles.value}>{lastLoggedIn}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Safety PIN</Text>
          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder="Set 4-digit PIN"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
          />
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.label}>Enable Panic Quick Exit</Text>
          <Switch value={panic} onValueChange={setPanic} />
        </View>

        <Pressable style={styles.buttonGhost} onPress={() => navigation.navigate("QuickExit") }>
          <Text style={styles.buttonGhostLabel}>Open App Mask</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={() => navigation.navigate("Docs") }>
          <Text style={styles.buttonLabel}>Open Case Documents</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={async () => {
            if (!victimSession) {
              Alert.alert("Case unavailable", "Complete onboarding before exporting report.");
              return;
            }
            setExporting(true);
            try {
              const report = await exportCaseReportForCurrentCase({ audience: "victim" });
              Alert.alert(
                "Report Generated",
                `Report hash: ${report.reportHash.slice(0, 20)}...\n\nOpen download link now?`,
                [
                  { text: "Later", style: "cancel" },
                  { text: "Open", onPress: () => Linking.openURL(report.downloadUrl) },
                ]
              );
            } catch (error) {
              Alert.alert("Export failed", (error as Error).message || "Unable to export report.");
            } finally {
              setExporting(false);
            }
          }}
        >
          <Text style={styles.buttonLabel}>{exporting ? "Generating report..." : "Export Calibrated PDF Report"}</Text>
        </Pressable>

        <Pressable
          style={styles.buttonDanger}
          onPress={async () => {
            await signOut();
            navigation.reset({ index: 0, routes: [{ name: "SafeEntry" }] });
          }}
        >
          <Text style={styles.buttonDangerLabel}>Log Out</Text>
        </Pressable>
      </ScrollView>

      <BottomNav current="Settings" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
    paddingBottom: 132,
  },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 14, gap: 8 },
  cardRow: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { color: colors.ink, fontWeight: "700" },
  value: { color: colors.mutedInk, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.cloud,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
  },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  buttonGhost: {
    backgroundColor: "#EDEFF4",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonGhostLabel: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 15,
  },
  buttonDanger: {
    backgroundColor: "#3A0D14",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonDangerLabel: {
    color: "#FFE5E9",
    fontWeight: "700",
    fontSize: 15,
  },
});
