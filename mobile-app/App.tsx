import React from "react";
import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ClerkLoaded, ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { SafeAreaView, StyleSheet, Text } from "react-native";
import { SafeEntryScreen } from "./src/screens/SafeEntryScreen";
import { EmotionalCheckInScreen } from "./src/screens/EmotionalCheckInScreen";
import { CaptureMethodScreen } from "./src/screens/CaptureMethodScreen";
import { QuickExitScreen } from "./src/screens/QuickExitScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CaptureWriteScreen } from "./src/screens/CaptureWriteScreen";
import { CaptureVoiceScreen } from "./src/screens/CaptureVoiceScreen";
import { CaptureDrawScreen } from "./src/screens/CaptureDrawScreen";
import { CaptureUploadScreen } from "./src/screens/CaptureUploadScreen";
import { KhojakScreen } from "./src/screens/KhojakScreen";
import { WarRoomScreen } from "./src/screens/WarRoomScreen";
import { PareekshaScreen } from "./src/screens/PareekshaScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { DocsScreen } from "./src/screens/DocsScreen";
import { WorkspaceWebScreen } from "./src/screens/WorkspaceWebScreen";
import { PreloaderScreen } from "./src/screens/PreloaderScreen";
import { hydrateVictimSessionFromLocal, registerVictimFromIdentity } from "./src/services/apiClient";

export type RootStackParamList = {
  SafeEntry: undefined;
  EmotionalCheckIn: undefined;
  CaptureMethod: { mood?: string } | undefined;
  Dashboard: undefined;
  CaptureWrite: { mood?: string } | undefined;
  CaptureVoice: { mood?: string } | undefined;
  CaptureDraw: { mood?: string } | undefined;
  CaptureUpload: { mood?: string } | undefined;
  Khojak: undefined;
  WarRoom: undefined;
  Pareeksha: undefined;
  Settings: undefined;
  Docs: undefined;
  WebWorkspace: undefined;
  QuickExit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore token cache persistence failures and let Clerk continue in-memory.
    }
  },
};

function MobileNavigator() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const [bootReady, setBootReady] = useState(false);
  const [bootMessage, setBootMessage] = useState("Preparing secure workspace...");

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!isLoaded) {
        return;
      }

      const minDelay = new Promise((resolve) => setTimeout(resolve, 1400));

      try {
        await hydrateVictimSessionFromLocal();
        if (isSignedIn) {
          setBootMessage("Securing your case vault...");
          if (!isUserLoaded || !user) {
            return;
          }

          const email =
            user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || undefined;

          await Promise.all([
            registerVictimFromIdentity({
              victimUniqueId: user.id,
              email,
              displayName: user.fullName || user.firstName || undefined,
            }),
            minDelay,
          ]);
        } else {
          setBootMessage("Loading safe entry...");
          await minDelay;
        }
      } catch {
        setBootMessage("Offline mode enabled...");
      } finally {
        if (!cancelled) {
          setBootReady(true);
        }
      }
    };

    setBootReady(false);
    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, isUserLoaded, user]);

  if (!isLoaded || !bootReady || (isSignedIn && !isUserLoaded)) {
    return <PreloaderScreen message={bootMessage} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={isSignedIn ? "Dashboard" : "SafeEntry"}
        screenOptions={{ headerShown: false, animation: "fade" }}
      >
        <Stack.Screen name="SafeEntry" component={SafeEntryScreen} />
        <Stack.Screen name="QuickExit" component={QuickExitScreen} />

        {isSignedIn && (
          <>
            <Stack.Screen name="EmotionalCheckIn" component={EmotionalCheckInScreen} />
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="CaptureMethod" component={CaptureMethodScreen} />
            <Stack.Screen name="CaptureWrite" component={CaptureWriteScreen} />
            <Stack.Screen name="CaptureVoice" component={CaptureVoiceScreen} />
            <Stack.Screen name="CaptureDraw" component={CaptureDrawScreen} />
            <Stack.Screen name="CaptureUpload" component={CaptureUploadScreen} />
            <Stack.Screen name="Khojak" component={KhojakScreen} />
            <Stack.Screen name="WarRoom" component={WarRoomScreen} />
            <Stack.Screen name="Pareeksha" component={PareekshaScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Docs" component={DocsScreen} />
            <Stack.Screen name="WebWorkspace" component={WorkspaceWebScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const expoExtra = (Constants.expoConfig?.extra || {}) as {
    clerkPublishableKey?: string;
  };

  const publishableKey =
    ((globalThis as any)?.process?.env?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY as string | undefined) ||
    expoExtra.clerkPublishableKey ||
    "";

  if (!publishableKey) {
    return (
      <SafeAreaView style={styles.missingKeyContainer}>
        <Text style={styles.missingKeyTitle}>Clerk key missing</Text>
        <Text style={styles.missingKeyBody}>
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment to enable sign-in/sign-up.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <MobileNavigator />
      </ClerkLoaded>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  missingKeyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  missingKeyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2A44",
  },
  missingKeyBody: {
    textAlign: "center",
    color: "#495A78",
    fontSize: 14,
    lineHeight: 20,
  },
});
