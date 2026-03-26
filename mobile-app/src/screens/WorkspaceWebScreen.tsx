import React, { useMemo, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "WebWorkspace">;

export function WorkspaceWebScreen({ navigation }: Props) {
  const initialUrl = useMemo(() => {
    if (Platform.OS === "android") return "http://10.0.2.2:3000";
    return "http://localhost:3000";
  }, []);

  const webRef = useRef<WebView>(null);
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [activeUrl, setActiveUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Website Workspace</Text>
        <Text style={styles.sub}>Full web app running inside Android/iOS app</Text>
      </View>

      <View style={styles.controls}>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://10.0.2.2:3000"
          placeholderTextColor={colors.mutedInk}
        />
        <Pressable style={styles.btnPrimary} onPress={() => setActiveUrl(urlInput.trim())}>
          <Text style={styles.btnPrimaryText}>Load</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={() => webRef.current?.reload()}>
          <Text style={styles.btnGhostText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.webWrap}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading website workspace...</Text>
          </View>
        )}
        <WebView
          ref={webRef}
          source={{ uri: activeUrl }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          startInLoadingState
        />
      </View>

      <BottomNav current="WebWorkspace" onNavigate={(route) => navigation.navigate(route as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 12, paddingTop: 10 },
  topBar: { marginBottom: 8 },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  sub: { color: colors.mutedInk, fontSize: 12, marginTop: 2 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btnPrimaryText: { color: colors.white, fontWeight: "700", fontSize: 12 },
  btnGhost: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btnGhostText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  webWrap: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: colors.white,
  },
  loadingOverlay: {
    position: "absolute",
    zIndex: 1,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    gap: 8,
  },
  loadingText: { color: colors.mutedInk, fontSize: 12, fontWeight: "600" },
});