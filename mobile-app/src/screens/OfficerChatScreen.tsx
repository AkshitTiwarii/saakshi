import React, { useEffect, useMemo, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { getVictimSession, getWebSocketBaseUrl, loadScreenDraft, saveScreenDraft } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

type ChatMessage = {
  messageId: string;
  caseId: string;
  officerId: string;
  officerName: string;
  officerPost: string;
  role: string;
  message: string;
  createdAt: string;
  direction: "officer-to-victim" | "victim-to-officer" | "system";
};

export function OfficerChatScreen({ navigation }: Props) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting live case channel...");
  const [caseLabel, setCaseLabel] = useState("Loading case...");
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    Promise.all([loadScreenDraft("chat.draft")])
      .then(([savedDraft]) => {
        if (savedDraft) setDraft(savedDraft);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const session = getVictimSession();
    const caseId = session?.caseId || "demo-case-001";
    setCaseLabel(session?.caseNumber ? `Case ${session.caseNumber}` : `Case ${caseId}`);

    const socketUrl = `${getWebSocketBaseUrl()}/ws/officer-chat?caseId=${encodeURIComponent(caseId)}&role=victim`;
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => setStatus("Live officer channel connected.");
    socket.onclose = () => setStatus("Live officer channel disconnected.");
    socket.onerror = () => setStatus("Live officer channel error.");
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data || "{}")) as {
          type?: string;
          messages?: ChatMessage[];
          message?: ChatMessage;
          error?: string;
        };

        if (parsed.type === "history" && Array.isArray(parsed.messages)) {
          setMessages(parsed.messages.slice(-12));
          requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
          return;
        }

        if (parsed.type === "message" && parsed.message) {
          setMessages((current) => [...current, parsed.message!].slice(-12));
          requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
          return;
        }

        if (parsed.type === "error" && parsed.error) {
          setStatus(parsed.error);
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const officerMessageCount = useMemo(
    () => messages.filter((message) => message.direction === "officer-to-victim").length,
    [messages]
  );

  const getInitial = (value: string) => {
    const normalized = String(value || "").trim();
    return normalized ? normalized.slice(0, 1).toUpperCase() : "?";
  };

  const toTimeLabel = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const sendReply = () => {
    const text = draft.trim();
    const socket = socketRef.current;
    const session = getVictimSession();
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

    socket.send(
      JSON.stringify({
        type: "message",
        caseId: session?.caseId || "demo-case-001",
        officerId: session?.victimUniqueId || "victim-user",
        officerName: session?.displayName || "Victim",
        officerPost: "Victim",
        role: "victim",
        message: text,
        createdAt: new Date().toISOString(),
        direction: "victim-to-officer",
      })
    );

    setDraft("");
    void saveScreenDraft("chat.draft", "");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Case Chat</Text>
        <Text style={styles.subtitle}>{caseLabel}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>

      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{officerMessageCount} officer message(s) in this thread</Text>
      </View>

      <View style={styles.threadWrap}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.threadContent} keyboardShouldPersistTaps="handled">
          <View style={styles.threadCard}>
            {messages.length === 0 ? (
              <Text style={styles.emptyText}>No messages yet. Officer updates will appear here in real time.</Text>
            ) : (
              messages.map((message) => (
                <View
                  key={message.messageId}
                  style={[
                    styles.messageRow,
                    message.direction === "victim-to-officer" ? styles.messageRowRight : styles.messageRowLeft,
                  ]}
                >
                  {message.direction !== "victim-to-officer" && (
                    <View style={styles.avatarOfficer}>
                      <Text style={styles.avatarText}>{getInitial(message.officerName || message.officerPost)}</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.messageBubble,
                      message.direction === "victim-to-officer" ? styles.victimBubble : styles.officerBubble,
                    ]}
                  >
                    <Text style={styles.messageName}>
                      {message.officerName} • {message.officerPost} • {message.officerId}
                    </Text>
                    <Text style={styles.messageText}>{message.message}</Text>
                    <Text style={styles.messageTime}>{toTimeLabel(message.createdAt)}</Text>
                  </View>

                  {message.direction === "victim-to-officer" && (
                    <View style={styles.avatarVictim}>
                      <Text style={styles.avatarText}>{getInitial(message.officerName || "V")}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <View style={styles.composerCard}>
        <TextInput
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            void saveScreenDraft("chat.draft", value);
          }}
          placeholder="Type your reply to the officer..."
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
          multiline
        />
        <Pressable style={styles.button} onPress={sendReply}>
          <Text style={styles.buttonLabel}>Send Message</Text>
        </Pressable>
      </View>

      <BottomNav current="Chat" onNavigate={(route) => navigation.navigate(route as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 16, paddingTop: 14 },
  header: { backgroundColor: colors.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 2 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "900" },
  subtitle: { color: colors.mutedInk, fontSize: 12 },
  status: { color: colors.sageDeep, fontSize: 11, fontWeight: "700" },
  systemRow: { alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  systemText: { color: colors.mutedInk, fontSize: 11, fontWeight: "700" },
  threadWrap: { flex: 1 },
  threadContent: { paddingBottom: 8 },
  threadCard: { backgroundColor: colors.white, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 8 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  messageRowLeft: { justifyContent: "flex-start" },
  messageRowRight: { justifyContent: "flex-end" },
  avatarOfficer: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#E8F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarVictim: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#FFE9DE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  messageBubble: { maxWidth: "82%", borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, gap: 2, borderWidth: 1 },
  officerBubble: { backgroundColor: "#F7FAF4", borderColor: "#DCE8D7" },
  victimBubble: { backgroundColor: "#FFF4ED", borderColor: "#F0D9CB" },
  messageName: { color: colors.mutedInk, fontSize: 10, fontWeight: "800" },
  messageText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  messageTime: { color: colors.mutedInk, fontSize: 10, marginTop: 2, textAlign: "right" },
  emptyText: { color: colors.mutedInk, fontSize: 13, lineHeight: 18 },
  composerCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    marginTop: 10,
    marginBottom: 96,
  },
  input: { backgroundColor: colors.white, borderRadius: 12, padding: 12, minHeight: 90, color: colors.ink, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
});