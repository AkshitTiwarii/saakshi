import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth, useOAuth, useSignIn, useSignUp } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { RootStackParamList } from "../../App";
import { PrimaryButton } from "../components/PrimaryButton";
import { colors } from "../theme/colors";
import { getConsentPolicies, getHealth } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "SafeEntry">;

WebBrowser.maybeCompleteAuthSession();

export function SafeEntryScreen({ navigation }: Props) {
  const [statusText, setStatusText] = useState("Connecting...");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingEmailVerification, setPendingEmailVerification] = useState(false);
  const [infoText, setInfoText] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const { isSignedIn } = useAuth();
  const { signIn, setActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const isClerkReady = isSignInLoaded && isSignUpLoaded;

  useEffect(() => {
    void WebBrowser.warmUpAsync?.();

    return () => {
      void WebBrowser.coolDownAsync?.();
    };
  }, []);

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

  const handleSignIn = async () => {
    if (!isClerkReady || !signIn || !setActive) return;
    if (!email.trim() || !password) {
      setAuthError("Enter email and password to sign in.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setInfoText("");
    try {
      const attempt = await signIn.create({ identifier: email.trim() });
      let finalAttempt = attempt;

      if (attempt.status === "needs_first_factor") {
        finalAttempt = await signIn.attemptFirstFactor({
          strategy: "password",
          password,
        });
      }

      if (finalAttempt.status === "complete") {
        await setActive({ session: finalAttempt.createdSessionId });
        setInfoText("Sign-in successful. Preparing your guided workspace...");
        return;
      }

      if (finalAttempt.status === "needs_second_factor") {
        setAuthError("This account requires second-factor verification. Use Google sign-in below or complete 2FA.");
        return;
      }

      if (finalAttempt.status === "needs_new_password") {
        setAuthError("Password reset is required for this account. Please reset your password from Clerk.");
        return;
      }

      setAuthError("Unable to complete sign-in. Try Google sign-in below.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-in failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isClerkReady) return;

    setAuthBusy(true);
    setAuthError("");
    setInfoText("");

    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: "saakshi",
      });

      const result = await startOAuthFlow({ redirectUrl });

      if (result.createdSessionId) {
        await result.setActive?.({ session: result.createdSessionId });
        setInfoText("Google sign-in successful. Preparing your guided workspace...");
        return;
      }

      setAuthError("Google sign-in did not complete. Please retry.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignUp = async () => {
    if (!isClerkReady || !signUp) return;
    if (!email.trim() || !password) {
      setAuthError("Enter email and password to sign up.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setInfoText("");
    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingEmailVerification(true);
      setInfoText("Verification code sent to your email.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-up failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleVerifySignUp = async () => {
    if (!isClerkReady || !signUp || !setActive) return;
    if (!verificationCode.trim()) {
      setAuthError("Enter the verification code sent to your email.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const verification = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (verification.status !== "complete") {
        setAuthError("Verification is not complete yet.");
        return;
      }

      await setActive({ session: verification.createdSessionId });
      setInfoText("Account verified. Preparing your guided workspace...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.orbA} />
      <View style={styles.orbB} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Text style={styles.brand}>SAAKSHI</Text>
          <Text style={styles.title}>Guided and secure from the first tap.</Text>
          <Text style={styles.subtitle}>Before dashboard access, we provision your case and walk you through a calm evidence flow.</Text>
        </View>

        <View style={styles.flowCard}>
          <Text style={styles.flowHeading}>How this app works</Text>
          <Text style={styles.flowLine}>1. Emotional check-in calibrates pace.</Text>
          <Text style={styles.flowLine}>2. Capture memories in any format.</Text>
          <Text style={styles.flowLine}>3. AI analysis strengthens case strategy.</Text>
          <Text style={styles.flowLine}>4. Officer access is admin-designated only.</Text>
        </View>

        {!isSignedIn && (
          <View style={styles.footer}>
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeTab, authMode === "signin" && styles.modeTabActive]}
                onPress={() => {
                  setAuthMode("signin");
                  setAuthError("");
                }}
              >
                <Text style={[styles.modeLabel, authMode === "signin" && styles.modeLabelActive]}>Sign In</Text>
              </Pressable>
              <Pressable
                style={[styles.modeTab, authMode === "signup" && styles.modeTabActive]}
                onPress={() => {
                  setAuthMode("signup");
                  setAuthError("");
                }}
              >
                <Text style={[styles.modeLabel, authMode === "signup" && styles.modeLabelActive]}>Create Account</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={colors.mutedInk}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.mutedInk}
              value={password}
              onChangeText={setPassword}
            />

            {pendingEmailVerification && authMode === "signup" && (
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                placeholder="Email verification code"
                placeholderTextColor={colors.mutedInk}
                value={verificationCode}
                onChangeText={setVerificationCode}
              />
            )}

            {authMode === "signin" ? (
              <>
                <PrimaryButton
                  label={authBusy ? "Signing in..." : "Sign In and Start"}
                  onPress={handleSignIn}
                  disabled={authBusy || !isClerkReady}
                />
                <PrimaryButton
                  label={authBusy ? "Opening Google..." : "Continue with Google"}
                  onPress={handleGoogleSignIn}
                  disabled={authBusy || !isClerkReady}
                  style={styles.googleButton}
                />
              </>
            ) : (
              <PrimaryButton
                label={authBusy ? "Creating account..." : "Create Account"}
                onPress={handleSignUp}
                disabled={authBusy || !isClerkReady}
              />
            )}

            {pendingEmailVerification && authMode === "signup" && (
              <PrimaryButton
                label={authBusy ? "Verifying..." : "Verify Email Code"}
                onPress={handleVerifySignUp}
                disabled={authBusy || !isClerkReady}
              />
            )}
          </View>
        )}

        {isSignedIn && (
          <View style={styles.footer}>
            <PrimaryButton label="Continue Guided Intake" onPress={() => navigation.navigate("EmotionalCheckIn")} />
            <PrimaryButton label="Open Dashboard" onPress={() => navigation.navigate("Dashboard")} />
          </View>
        )}

        <Text style={styles.statusText}>{statusText}</Text>
        {!!infoText && <Text style={styles.infoText}>{infoText}</Text>}
        {!!authError && <Text style={styles.errorText}>{authError}</Text>}
        <Pressable onPress={() => navigation.navigate("QuickExit")}> 
          <Text style={styles.discreet}>Quick Exit</Text>
        </Pressable>
      </ScrollView>
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
  scroll: {
    paddingBottom: 24,
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
    marginTop: 96,
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 18,
    shadowColor: "#1F2A3D",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  brand: {
    color: colors.accent,
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: "800",
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 39,
  },
  subtitle: {
    color: colors.mutedInk,
    fontSize: 15,
    lineHeight: 22,
  },
  flowCard: {
    marginTop: 20,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  flowHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  flowLine: {
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 16,
    marginBottom: 16,
    gap: 16,
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  modeTabActive: {
    backgroundColor: colors.accentSoft,
  },
  modeLabel: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: "700",
  },
  modeLabelActive: {
    color: colors.accentStrong,
  },
  statusText: {
    textAlign: "center",
    color: colors.mutedInk,
    fontSize: 12,
    opacity: 0.9,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  infoText: {
    textAlign: "center",
    color: colors.accent,
    fontSize: 12,
  },
  discreet: {
    textAlign: "center",
    color: colors.mutedInk,
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    textAlign: "center",
    color: "#B43A52",
    fontSize: 12,
  },
  googleButton: {
    backgroundColor: "#2A3F6E",
  },
});
