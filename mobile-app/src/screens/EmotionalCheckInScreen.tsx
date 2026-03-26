import React, { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { evaluateConsentForAnalysis } from "../services/apiClient";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "EmotionalCheckIn">;

const moods = [
  { key: "numb", emoji: "😶", label: "Numb" },
  { key: "anxious", emoji: "😟", label: "Anxious" },
  { key: "overwhelmed", emoji: "😢", label: "Overwhelmed" },
  { key: "angry", emoji: "😡", label: "Angry" },
];

export function EmotionalCheckInScreen({ navigation }: Props) {
  const [loadingMood, setLoadingMood] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>("");

  const handleMood = async (moodKey: string) => {
    try {
      setErrorText("");
      setLoadingMood(moodKey);
      const caseId = "demo-case-001";
      const result = await evaluateConsentForAnalysis(caseId);
      if (!result.allowed) setErrorText(`Consent note: ${result.reason}`);
      navigation.navigate("CaptureMethod", { mood: moodKey });
    } catch (error) {
      setErrorText("Backend consent check unavailable. Continuing in local mode.");
      navigation.navigate("CaptureMethod", { mood: moodKey });
    } finally {
      setLoadingMood(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>How are you feeling now?</Text>
        <Text style={styles.subtitle}>One tap is enough. You do not need to explain.</Text>
      </View>

      <View style={styles.list}>
        {moods.map((mood) => (
          <Pressable
            key={mood.key}
            style={styles.moodCard}
            onPress={() => handleMood(mood.key)}
          >
            <Text style={styles.emoji}>{mood.emoji}</Text>
            <Text style={styles.moodLabel}>{loadingMood === mood.key ? "Checking..." : mood.label}</Text>
          </Pressable>
        ))}
      </View>

      {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

      <BottomNav
        current="EmotionalCheckIn"
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
  header: {
    marginTop: 40,
    marginBottom: 30,
    gap: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.mutedInk,
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: 14,
  },
  moodCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emoji: {
    fontSize: 28,
  },
  moodLabel: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
  },
  errorText: {
    color: "#B43A52",
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
  },
});
