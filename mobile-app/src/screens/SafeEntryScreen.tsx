import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { PrimaryButton } from "../components/PrimaryButton";
import { colors } from "../theme/colors";
import { getConsentPolicies, getHealth } from "../services/apiClient";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "SafeEntry">;

export function SafeEntryScreen({ navigation }: Props) {
  const [statusText, setStatusText] = useState("Connecting...");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [health, policy] = await Promise.all([getHealth(), getConsentPolicies()]);
        if (mounted) {
          setStatusText(`Server ${health.status} · Policy ${policy.version}`);
        }
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : "Connection failed";
          setStatusText(`Offline mode: ${message}`);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.orbA} />
      <View style={styles.orbB} />

      <View style={styles.content}>
        <Text style={styles.brand}>SAAKSHI</Text>
        <Text style={styles.title}>You are safe here.</Text>
        <Text style={styles.subtitle}>Start quietly. Pause anytime.</Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Continue quietly" onPress={() => navigation.navigate("Dashboard")} />
        <Text style={styles.statusText}>{statusText}</Text>
        <Pressable onPress={() => navigation.navigate("QuickExit")}> 
          <Text style={styles.discreet}>Quick Exit</Text>
        </Pressable>

        <BottomNav
          current="SafeEntry"
          onNavigate={(route) => navigation.navigate(route as any)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.fog,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  orbA: {
    position: "absolute",
    top: -80,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: colors.mistLavender,
    opacity: 0.55,
  },
  orbB: {
    position: "absolute",
    bottom: -90,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: colors.warmSand,
    opacity: 0.48,
  },
  content: {
    marginTop: 140,
    gap: 12,
  },
  brand: {
    color: colors.accent,
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: "800",
  },
  title: {
    color: colors.ink,
    fontSize: 38,
    fontWeight: "800",
    lineHeight: 42,
  },
  subtitle: {
    color: colors.mutedInk,
    fontSize: 17,
    lineHeight: 24,
  },
  footer: {
    marginBottom: 28,
    gap: 16,
  },
  statusText: {
    textAlign: "center",
    color: colors.mutedInk,
    fontSize: 12,
    opacity: 0.9,
  },
  discreet: {
    textAlign: "center",
    color: colors.mutedInk,
    fontSize: 14,
    fontWeight: "600",
  },
});
