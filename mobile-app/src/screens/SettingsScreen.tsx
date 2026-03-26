import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const [pin, setPin] = useState("");
  const [panic, setPanic] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

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

      <Pressable style={styles.button} onPress={() => navigation.navigate("Docs") }>
        <Text style={styles.buttonLabel}>Open Case Documents</Text>
      </Pressable>

      <BottomNav current="Settings" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20, gap: 12 },
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
});
