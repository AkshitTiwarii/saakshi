import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "../theme/colors";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, style, disabled = false }: PrimaryButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && !disabled ? styles.buttonPressed : null, disabled ? styles.buttonDisabled : null, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accentStrong,
    shadowColor: "#492518",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  buttonPressed: {
    backgroundColor: colors.accentStrong,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
