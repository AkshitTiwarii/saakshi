import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import {
  exportCaseReportForCurrentCase,
  grantOfficerExportAccessForCurrentCase,
  getVictimSession,
  loadScreenDraft,
  saveScreenDraft,
  saveVictimDetails,
} from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const { user } = useUser();
  const [pin, setPin] = useState("");
  const [panic, setPanic] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [phone, setPhone] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [incidentSummary, setIncidentSummary] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [grantOfficerId, setGrantOfficerId] = useState("");
  const [grantOfficerRole, setGrantOfficerRole] = useState<"police" | "lawyer">("police");
  const [grantBusy, setGrantBusy] = useState(false);
  const victimSession = getVictimSession();
  const caseNumber = victimSession?.caseNumber || "SAAKSHI-PENDING";
  const saakshiId = caseNumber.replace("SAAK", "SKS");

  const userName = user?.fullName || user?.firstName || "Not set";
  const email = user?.primaryEmailAddress?.emailAddress || "Not set";
  const lastLoggedIn = user?.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Not available";

  useEffect(() => {
    Promise.all([
      loadScreenDraft("settings.phone"),
      loadScreenDraft("settings.emergencyContact"),
      loadScreenDraft("settings.incidentSummary"),
      loadScreenDraft("settings.grantOfficerId"),
      loadScreenDraft("settings.grantOfficerRole"),
    ])
      .then(([savedPhone, savedEmergency, savedSummary, savedGrantOfficerId, savedGrantOfficerRole]) => {
        if (savedPhone) setPhone(savedPhone);
        if (savedEmergency) setEmergencyContact(savedEmergency);
        if (savedSummary) setIncidentSummary(savedSummary);
        if (savedGrantOfficerId) setGrantOfficerId(savedGrantOfficerId);
        if (savedGrantOfficerRole === "police" || savedGrantOfficerRole === "lawyer") {
          setGrantOfficerRole(savedGrantOfficerRole);
        }
      })
      .catch(() => undefined);
  }, []);

  const onGrantOfficerExportAccess = async () => {
    if (!victimSession) {
      Alert.alert("Case unavailable", "Complete onboarding before granting officer access.");
      return;
    }

    const cleanOfficerId = grantOfficerId.trim();
    if (!cleanOfficerId) {
      Alert.alert("Officer ID required", "Enter the officer ID before granting access.");
      return;
    }

    setGrantBusy(true);
    try {
      const grant = await grantOfficerExportAccessForCurrentCase({
        officerId: cleanOfficerId,
        officerRole: grantOfficerRole,
      });

      Alert.alert(
        "Access granted",
        `Grant ${grant.grantId.slice(0, 12)} created for ${grantOfficerRole.toUpperCase()} officer ${cleanOfficerId}.`
      );
    } catch (error) {
      Alert.alert("Grant failed", (error as Error).message || "Unable to grant export access.");
    } finally {
      setGrantBusy(false);
    }
  };

  const onSaveCaseDetails = async () => {
    if (!victimSession) {
      Alert.alert("Case unavailable", "Complete onboarding before saving case details.");
      return;
    }

    setSavingProfile(true);
    try {
      const response = await saveVictimDetails({
        profile: {
          email: user?.primaryEmailAddress?.emailAddress,
          displayName: userName,
          phone: phone.trim() || undefined,
          emergencyContact: emergencyContact.trim() || undefined,
          incidentSummary: incidentSummary.trim() || undefined,
        },
        fragments: incidentSummary.trim() ? [`[case-summary] ${incidentSummary.trim()}`] : [],
        source: "mobile-settings-profile",
        forceCloudSync: true,
      });

      Alert.alert(
        "Case details saved",
        response.localOnly
          ? "Saved locally. Connect internet and save again to sync with admin portal."
          : "Case description and details synced to admin portal."
      );
    } catch (error) {
      Alert.alert("Save failed", (error as Error).message || "Unable to save case details.");
    } finally {
      setSavingProfile(false);
    }
  };

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
          <Text style={styles.label}>SAAKSHI ID</Text>
          <Text style={styles.value}>{saakshiId}</Text>
          <Text style={styles.label}>Age</Text>
          <Text style={styles.value}>{user?.unsafeMetadata?.age ? String(user.unsafeMetadata.age) : "Not provided"}</Text>
          <Text style={styles.label}>Last Logged In</Text>
          <Text style={styles.value}>{lastLoggedIn}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Case Description</Text>
          <TextInput
            value={incidentSummary}
            onChangeText={(value) => {
              setIncidentSummary(value);
              void saveScreenDraft("settings.incidentSummary", value);
            }}
            placeholder="Describe what happened in your own words"
            placeholderTextColor={colors.mutedInk}
            style={styles.inputArea}
            multiline
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              void saveScreenDraft("settings.phone", value);
            }}
            placeholder="Phone number"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Emergency Contact</Text>
          <TextInput
            value={emergencyContact}
            onChangeText={(value) => {
              setEmergencyContact(value);
              void saveScreenDraft("settings.emergencyContact", value);
            }}
            placeholder="Emergency contact number"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            keyboardType="phone-pad"
          />

          <Pressable style={styles.buttonGhost} onPress={onSaveCaseDetails}>
            <Text style={styles.buttonGhostLabel}>{savingProfile ? "Saving details..." : "Save Case Details"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Grant Officer Report Access</Text>
          <Text style={styles.value}>Authorize a specific officer/lawyer to download your legal PDF exports.</Text>

          <Text style={styles.label}>Officer ID</Text>
          <TextInput
            value={grantOfficerId}
            onChangeText={(value) => {
              setGrantOfficerId(value);
              void saveScreenDraft("settings.grantOfficerId", value);
            }}
            placeholder="OFF-IND-221"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
          />

          <Text style={styles.label}>Officer Role</Text>
          <View style={styles.roleRow}>
            <Pressable
              onPress={() => {
                setGrantOfficerRole("police");
                void saveScreenDraft("settings.grantOfficerRole", "police");
              }}
              style={[styles.roleChip, grantOfficerRole === "police" ? styles.roleChipActive : null]}
            >
              <Text style={[styles.roleChipText, grantOfficerRole === "police" ? styles.roleChipTextActive : null]}>Police</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setGrantOfficerRole("lawyer");
                void saveScreenDraft("settings.grantOfficerRole", "lawyer");
              }}
              style={[styles.roleChip, grantOfficerRole === "lawyer" ? styles.roleChipActive : null]}
            >
              <Text style={[styles.roleChipText, grantOfficerRole === "lawyer" ? styles.roleChipTextActive : null]}>Lawyer</Text>
            </Pressable>
          </View>

          <Pressable style={styles.buttonGhost} onPress={onGrantOfficerExportAccess}>
            <Text style={styles.buttonGhostLabel}>{grantBusy ? "Granting access..." : "Grant PDF Export Access"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Safety PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(value) => {
              const digits = value.replace(/[^0-9]/g, "").slice(0, 6);
              setPin(digits);
              void saveScreenDraft("settings.safetyPin", digits);
            }}
            placeholder="Set 6-digit PIN"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
          <Text style={styles.pinHint}>Only you can open sensitive case data with this 6-digit safety PIN.</Text>
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
              await saveVictimDetails({
                profile: {
                  email: user?.primaryEmailAddress?.emailAddress,
                  displayName: userName,
                  phone: phone.trim() || undefined,
                  emergencyContact: emergencyContact.trim() || undefined,
                  incidentSummary: incidentSummary.trim() || undefined,
                },
                fragments: [],
                source: "mobile-settings-export-sync",
                forceCloudSync: true,
              }).catch(() => null);

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
    paddingBottom: 188,
    flexGrow: 1,
  },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#1F2A3D",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardRow: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.ink, fontWeight: "700" },
  value: { color: colors.mutedInk, marginBottom: 2 },
  pinHint: {
    color: colors.mutedInk,
    fontSize: 11,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
  },
  inputArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
    minHeight: 98,
    textAlignVertical: "top",
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
  roleRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#F4F6FB",
  },
  roleChipActive: {
    borderColor: colors.accent,
    backgroundColor: "#E8F0FF",
  },
  roleChipText: {
    color: colors.mutedInk,
    fontWeight: "700",
    fontSize: 13,
  },
  roleChipTextActive: {
    color: colors.accent,
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
