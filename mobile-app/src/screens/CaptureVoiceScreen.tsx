import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { RootStackParamList } from "../../App";
import { colors } from "../theme/colors";
import {
  analyzeVoiceWithGoogleNlp,
  classifyFragmentForCurrentCase,
  generateModeAwareCoachReply,
  loadScreenDraft,
  persistVoiceChatMessage,
  saveScreenDraft,
  saveVictimDetails,
  transcribeAudioForCurrentCase,
} from "../services/apiClient";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureVoice">;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: ".3gp",
    outputFormat: Audio.AndroidOutputFormat.THREE_GPP,
    audioEncoder: Audio.AndroidAudioEncoder.AMR_WB,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 23850,
  },
  ios: {
    extension: ".caf",
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

export function CaptureVoiceScreen({ navigation }: Props) {
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("When you are ready, process your transcript.");
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string>("audio/3gpp");
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [nlpSummary, setNlpSummary] = useState<{
    provider: string;
    sentimentLabel: string;
    time: string[];
    location: string[];
    people: string[];
  } | null>(null);

  useEffect(() => {
    Promise.all([loadScreenDraft("voice.transcript"), loadScreenDraft("voice.chat")])
      .then(([savedTranscript, savedChat]) => {
        if (savedTranscript) setTranscript(savedTranscript);
        if (savedChat) {
          try {
            setChat(JSON.parse(savedChat));
          } catch {
            setChat([]);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  const onChangeTranscript = (value: string) => {
    setTranscript(value);
    void saveScreenDraft("voice.transcript", value);
  };

  const processVoice = async () => {
    if (!transcript.trim()) return;
    setProcessing(true);
    const startedAt = Date.now();
    try {
      const [ai, nlp] = await Promise.all([
        classifyFragmentForCurrentCase(transcript),
        analyzeVoiceWithGoogleNlp(transcript),
      ]);

      setNlpSummary({
        provider: nlp.provider,
        sentimentLabel: nlp.sentiment.label,
        time: nlp.clues.time,
        location: nlp.clues.location,
        people: nlp.clues.people,
      });

      setStatus(
        [
          ai.emotion,
          ai.time,
          ai.location,
          `NLP: ${nlp.sentiment.label}`,
          `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
        ]
          .filter(Boolean)
          .join(" • ") || "Voice processed in local mode."
      );
      await persistVoiceChatMessage({ role: "user", mode: "neutral", text: transcript });
    } finally {
      setProcessing(false);
    }
  };

  const submitVoiceTestimony = async () => {
    const clean = transcript.trim();
    if (!clean && !recordingUri) {
      setStatus("Record audio or add transcript first, then submit.");
      return;
    }

    setSubmitting(true);
    try {
      const saveResult = await saveVictimDetails({
        profile: {},
        fragments: [
          `[voice] ${clean || "(audio captured; transcript pending)"}`,
          `[voice-meta] durationMs=${recordingDurationMs}`,
          `[voice-meta] transcriptProvided=${clean ? "yes" : "no"}`,
        ],
        source: "mobile-capture-voice",
        forceCloudSync: true,
      }).catch(() => null);

      const hashText = saveResult?.integrity?.latestHash
        ? ` Hash ${saveResult.integrity.latestHash.slice(0, 12)}...`
        : "";
      setStatus(
        saveResult?.localOnly
          ? `Voice testimony saved locally only (backend sync failed).${hashText}`
          : `Voice testimony synced to case (${Number(saveResult?.fragmentCount || 0)} total fragments).${hashText}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus("Microphone access is required for voice recording.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(RECORDING_OPTIONS);
      await rec.startAsync();
      setRecording(rec);
      setRecordingUri(null);
      setRecordingMimeType("audio/3gpp");
      setRecordingDurationMs(0);
      setStatus("Recording... Tap Stop when done.");
    } catch (error) {
      const message = String((error as Error)?.message || "").trim();
      setStatus(
        message
          ? `Could not start recording: ${message}`
          : "Could not start recording. You can still type transcript manually."
      );
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const status = await recording.getStatusAsync();
      const uri = recording.getURI();
      if (uri) {
        setRecordingUri(uri);
      }
      setRecordingDurationMs((status.durationMillis as number) || 0);
      setStatus("Recording saved. Tap Transcribe Audio.");
    } catch {
      setStatus("Recording could not be finalized. Please try again.");
    } finally {
      setRecording(null);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
  };

  const transcribeRecording = async () => {
    if (!recordingUri) {
      setStatus("Record audio first.");
      return;
    }

    setTranscribing(true);
    try {
      setStatus("Transcribing audio...");
      const audioBase64 = await FileSystem.readAsStringAsync(recordingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const mimeType = recordingUri.endsWith(".webm")
        ? "audio/webm"
        : recordingUri.endsWith(".3gp")
        ? "audio/3gpp"
        : recordingUri.endsWith(".caf")
        ? "audio/x-caf"
        : recordingMimeType;

      const stt = await transcribeAudioForCurrentCase({
        audioBase64,
        mimeType,
        languageCode: "en-IN",
        durationMs: recordingDurationMs,
      });

      if (stt.transcript.trim()) {
        setTranscript(stt.transcript.trim());
        void saveScreenDraft("voice.transcript", stt.transcript.trim());
        setStatus(`Transcribed via ${stt.provider}. Review and process.`);
      } else {
        setStatus(
          `No speech could be extracted (${stt.provider}, conf ${Math.round((stt.confidence || 0) * 100)}%). Speak closer to mic and retry.`
        );
      }
    } catch (error) {
      const message = String((error as Error)?.message || "").trim();
      setStatus(
        message
          ? `Transcription failed: ${message}`
          : "Transcription failed. You can still paste or type transcript."
      );
    } finally {
      setTranscribing(false);
    }
  };

  const sendToAssistant = async () => {
    if (!chatInput.trim()) return;
    const userMessage = chatInput.trim();
    setChatInput("");
    setChat((prev) => {
      const next = [...prev, { role: "user" as const, text: userMessage }];
      void saveScreenDraft("voice.chat", JSON.stringify(next));
      return next;
    });

    try {
      const reply = await generateModeAwareCoachReply({ mode: "neutral", text: userMessage });
      setChat((prev) => {
        const next = [...prev, { role: "assistant" as const, text: reply }];
        void saveScreenDraft("voice.chat", JSON.stringify(next));
        return next;
      });
      await persistVoiceChatMessage({ role: "user", mode: "neutral", text: userMessage });
      await persistVoiceChatMessage({ role: "assistant", mode: "neutral", text: reply });
    } catch {
      setChat((prev) => {
        const next = [...prev, { role: "assistant" as const, text: "Assistant unavailable right now. Your chat is saved locally." }];
        void saveScreenDraft("voice.chat", JSON.stringify(next));
        return next;
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Voice Capture</Text>
        <View style={styles.pill}><Text style={styles.pillText}>Safe pace mode: pause whenever you need</Text></View>

        <View style={styles.voiceTools}>
          <Pressable
            style={[styles.secondaryButton, recording ? styles.stopButton : null]}
            onPress={recording ? stopRecording : startRecording}
            disabled={processing || transcribing}
          >
            <Text style={styles.secondaryButtonLabel}>{recording ? "Stop Recording" : "Start Voice Recording"}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, !recordingUri ? styles.disabledButton : null]}
            onPress={transcribeRecording}
            disabled={!recordingUri || !!recording || processing || transcribing}
          >
            <Text style={styles.secondaryButtonLabel}>{transcribing ? "Transcribing..." : "Transcribe Audio"}</Text>
          </Pressable>
        </View>

        {!!recordingUri && (
          <Text style={styles.recordingMeta}>
            Recorded: {(recordingDurationMs / 1000).toFixed(1)}s
          </Text>
        )}

        <TextInput
          value={transcript}
          onChangeText={onChangeTranscript}
          placeholder="Paste or type your transcript here"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
          multiline
        />
        <Pressable style={[styles.button, processing ? styles.disabledButton : null]} onPress={processVoice} disabled={processing || transcribing}>
          <Text style={styles.buttonLabel}>{processing ? "Processing..." : "Process Voice Notes"}</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, ((!transcript.trim() && !recordingUri) || submitting) ? styles.disabledButton : null]}
          onPress={submitVoiceTestimony}
          disabled={(!transcript.trim() && !recordingUri) || submitting}
        >
          <Text style={styles.buttonSecondaryLabel}>{submitting ? "Submitting..." : "Submit Voice Statement"}</Text>
        </Pressable>
        <Text style={styles.status}>{status}</Text>

        {nlpSummary && (
          <View style={styles.nlpCard}>
            <Text style={styles.nlpTitle}>Detected Language Signals</Text>
            <Text style={styles.nlpMeta}>Source: {nlpSummary.provider} · Sentiment: {nlpSummary.sentimentLabel}</Text>
            <Text style={styles.nlpLine}>Time clues: {nlpSummary.time.join(", ") || "Not found yet"}</Text>
            <Text style={styles.nlpLine}>Location clues: {nlpSummary.location.join(", ") || "Not found yet"}</Text>
            <Text style={styles.nlpLine}>People/org clues: {nlpSummary.people.join(", ") || "Not found yet"}</Text>
          </View>
        )}

        <View style={styles.chatPanel}>
          <Text style={styles.chatTitle}>Support Assistant</Text>
          <Text style={styles.chatSub}>Guidance is saved automatically so you can continue later.</Text>
          {chat.map((item, idx) => (
            <View key={`${item.role}-${idx}`} style={[styles.bubble, item.role === "assistant" ? styles.assistant : styles.user]}>
              <Text style={styles.bubbleText}>{item.text}</Text>
            </View>
          ))}
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask: can you help me phrase this memory?"
            placeholderTextColor={colors.mutedInk}
            style={styles.chatInput}
          />
          <Pressable style={styles.button} onPress={sendToAssistant}>
            <Text style={styles.buttonLabel}>Send Message</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 172, flexGrow: 1 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  pill: { alignSelf: "flex-start", backgroundColor: colors.panelAlt, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.cloud },
  pillText: { color: colors.accentStrong, fontSize: 12, fontWeight: "700" },
  voiceTools: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.sageDeep,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  stopButton: {
    backgroundColor: colors.danger,
  },
  disabledButton: {
    opacity: 0.6,
  },
  recordingMeta: {
    color: colors.mutedInk,
    fontSize: 12,
    marginTop: -2,
  },
  input: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 14,
    minHeight: 160,
    color: colors.ink,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.cloud,
  },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.accentStrong },
  buttonSecondary: {
    backgroundColor: colors.sageDeep,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonSecondaryLabel: { color: colors.white, fontWeight: "700", fontSize: 15 },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 16 },
  status: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
  nlpCard: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.cloud,
  },
  nlpTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  nlpMeta: {
    color: colors.mutedInk,
    fontSize: 12,
  },
  nlpLine: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  chatPanel: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.cloud,
  },
  chatTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
  },
  chatSub: {
    color: colors.mutedInk,
    fontSize: 12,
  },
  bubble: {
    borderRadius: 12,
    padding: 10,
  },
  assistant: {
    backgroundColor: "#F8E8E1",
  },
  user: {
    backgroundColor: "#F2F5EE",
  },
  bubbleText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  chatInput: {
    borderWidth: 1,
    borderColor: colors.cloud,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.white,
  },
});
