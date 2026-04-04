import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "QuickExit">;

export function QuickExitScreen({ navigation }: Props) {
  const { isSignedIn } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.title}>Discreet Mode</Text>
        <Text style={styles.subtitle}>This screen can be replaced with a neutral utility shell in production.</Text>
        <Text style={styles.placeholder}>Notes</Text>
        <Text style={styles.body}>Your shopping list
- Milk
- Pens
- Phone charger</Text>
      </View>

      <Pressable
        style={styles.back}
        onPress={() => navigation.replace(isSignedIn ? "Dashboard" : "SafeEntry")}
      > 
        <Text style={styles.backText}>Return to Saakshi</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.fog,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  panel: {
    marginTop: 30,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#1F2A3D",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedInk,
    fontSize: 14,
    lineHeight: 20,
  },
  placeholder: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    color: colors.mutedInk,
    fontSize: 16,
    lineHeight: 24,
  },
  back: {
    paddingVertical: 16,
  },
  backText: {
    textAlign: "center",
    color: colors.accentStrong,
    fontSize: 15,
    fontWeight: "700",
  },
});
