import React, { useEffect, useRef } from "react";
import { Animated, Easing, SafeAreaView, StyleSheet, Text, View } from "react-native";

type Props = {
  message?: string;
};

export function PreloaderScreen({ message = "Preparing secure workspace..." }: Props) {
  const spinFast = useRef(new Animated.Value(0)).current;
  const spinSlow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fast = Animated.loop(
      Animated.timing(spinFast, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const slow = Animated.loop(
      Animated.timing(spinSlow, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    fast.start();
    slow.start();
    pulseLoop.start();

    return () => {
      fast.stop();
      slow.stop();
      pulseLoop.stop();
    };
  }, [pulse, spinFast, spinSlow]);

  const rotateFast = spinFast.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const rotateSlow = spinSlow.interpolate({
    inputRange: [0, 1],
    outputRange: ["360deg", "0deg"],
  });

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.08],
  });

  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loaderWrap}>
        <Animated.View
          style={[
            styles.outerAura,
            {
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.ringPrimary,
            {
              transform: [{ rotate: rotateFast }],
            },
          ]}
        >
          <View style={[styles.blob, styles.blobOne]} />
          <View style={[styles.blob, styles.blobTwo]} />
          <View style={[styles.blob, styles.blobThree]} />
        </Animated.View>

        <Animated.View
          style={[
            styles.ringSecondary,
            {
              transform: [{ rotate: rotateSlow }],
            },
          ]}
        >
          <View style={[styles.dot, styles.dotOne]} />
          <View style={[styles.dot, styles.dotTwo]} />
          <View style={[styles.dot, styles.dotThree]} />
          <View style={[styles.dot, styles.dotFour]} />
        </Animated.View>

        <View style={styles.core} />
      </View>

      <Text style={styles.brand}>SAAKSHI</Text>
      <Text style={styles.message}>{message}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0C1320",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loaderWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  outerAura: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: "rgba(255, 191, 72, 0.16)",
    shadowColor: "#FFBF48",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 8,
  },
  ringPrimary: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 999,
    borderTopWidth: 1.5,
    borderTopColor: "#FFBF48",
    borderBottomWidth: 1.5,
    borderBottomColor: "#BE4A1D",
  },
  ringSecondary: {
    position: "absolute",
    width: 82,
    height: 82,
    borderRadius: 999,
  },
  core: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#BE4A1D",
    shadowColor: "#FFBF48",
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 5,
  },
  blob: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: "#FFBF48",
  },
  blobOne: {
    top: 6,
    left: 39,
  },
  blobTwo: {
    bottom: 8,
    left: 10,
    backgroundColor: "#D0642A",
  },
  blobThree: {
    bottom: 10,
    right: 10,
    backgroundColor: "#FF8F33",
  },
  dot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: "#FFBF48",
  },
  dotOne: { top: 0, left: 36 },
  dotTwo: { top: 36, right: 0, backgroundColor: "#FF9D3F" },
  dotThree: { bottom: 0, left: 36, backgroundColor: "#BE4A1D" },
  dotFour: { top: 36, left: 0, backgroundColor: "#E1702F" },
  brand: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFD8A8",
    letterSpacing: 2.4,
  },
  message: {
    color: "#DDE6F5",
    fontSize: 13,
    textAlign: "center",
    maxWidth: 230,
    lineHeight: 18,
  },
});
