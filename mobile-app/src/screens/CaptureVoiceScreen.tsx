import React, { useState } from "react";
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
  persistVoiceChatMessage,
  transcribeAudioForCurrentCase,
} from "../services/apiClient";
import { BottomNav } from "../components/BottomNav";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureVoice">;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: ".3gp",
    outputFormat: Audio.AndroidOutputFormat.THREE_GPP,
    audioEncoder: Audio.AndroidAudioEncoder.AMR_NB,
    sampleRate: 8000,
    numberOfChannels: 1,
    bitRate: 12200,
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
  const [status, setStatus] = useState("Tap process when transcript is ready.");
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [nlpSummary, setNlpSummary] = useState<{
    provider: string;
    sentimentLabel: string;
    time: string[];
    location: string[];
    people: string[];
  } | null>(null);

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
      setRecordingDurationMs(0);
      setStatus("Recording... Tap Stop when done.");
    } catch {
      setStatus("Could not start recording. You can still type transcript manually.");
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

      const mimeType = recordingUri.endsWith(".3gp")
        ? "audio/3gpp"
        : recordingUri.endsWith(".caf")
        ? "audio/wav"
        : "audio/webm";

      const stt = await transcribeAudioForCurrentCase({
        audioBase64,
        mimeType,
        languageCode: "en-IN",
      });

      if (stt.transcript.trim()) {
        setTranscript(stt.transcript.trim());
        setStatus(`Transcribed via ${stt.provider}. Review and process.`);
      } else {
        setStatus("Transcription unavailable right now. You can type transcript manually.");
      }
    } catch {
      setStatus("Transcription failed. You can still paste or type transcript.");
    } finally {
      setTranscribing(false);
    }
  };

  const sendToAssistant = async () => {
    if (!chatInput.trim()) return;
    const userMessage = chatInput.trim();
    setChatInput("");
    setChat((prev) => [...prev, { role: "user", text: userMessage }]);

    const reply = await generateModeAwareCoachReply({ mode: "neutral", text: userMessage });
    setChat((prev) => [...prev, { role: "assistant", text: reply }]);
    await persistVoiceChatMessage({ role: "user", mode: "neutral", text: userMessage });
    await persistVoiceChatMessage({ role: "assistant", mode: "neutral", text: reply });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Voice Capture</Text>
        <View style={styles.pill}><Text style={styles.pillText}>Trauma-safe mode: no pressure timing</Text></View>

        <View style={styles.voiceTools}>
          <Pressable
            style={[styles.secondaryButton, recording ? styles.stopButton : null]}
            onPress={recording ? stopRecording : startRecording}
            disabled={processing || transcribing}
          >
            <Text style={styles.secondaryButtonLabel}>{recording ? "Stop Recording" : "Record Voice"}</Text>
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
          onChangeText={setTranscript}
          placeholder="Paste or type transcript from voice input"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
          multiline
        />
        <Pressable style={[styles.button, processing ? styles.disabledButton : null]} onPress={processVoice} disabled={processing || transcribing}>
          <Text style={styles.buttonLabel}>{processing ? "Processing..." : "Process Voice to Timeline"}</Text>
        </Pressable>
        <Text style={styles.status}>{status}</Text>

        {nlpSummary && (
          <View style={styles.nlpCard}>
            <Text style={styles.nlpTitle}>Google NLP Signals</Text>
            <Text style={styles.nlpMeta}>Source: {nlpSummary.provider} · Sentiment: {nlpSummary.sentimentLabel}</Text>
            <Text style={styles.nlpLine}>Time clues: {nlpSummary.time.join(", ") || "Not found yet"}</Text>
            <Text style={styles.nlpLine}>Location clues: {nlpSummary.location.join(", ") || "Not found yet"}</Text>
            <Text style={styles.nlpLine}>People/org clues: {nlpSummary.people.join(", ") || "Not found yet"}</Text>
          </View>
        )}

        <View style={styles.chatPanel}>
          <Text style={styles.chatTitle}>Voice AI Assistant</Text>
          <Text style={styles.chatSub}>Interactive guidance with automatic chat persistence.</Text>
          {chat.map((item, idx) => (
            <View key={`${item.role}-${idx}`} style={[styles.bubble, item.role === "assistant" ? styles.assistant : styles.user]}>
              <Text style={styles.bubbleText}>{item.text}</Text>
            </View>
          ))}
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask: how to phrase this memory?"
            placeholderTextColor={colors.mutedInk}
            style={styles.chatInput}
          />
          <Pressable style={styles.button} onPress={sendToAssistant}>
            <Text style={styles.buttonLabel}>Send to Assistant</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fog, paddingHorizontal: 20, paddingTop: 20 },
  scroll: { gap: 10, paddingBottom: 120 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  pill: { alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  pillText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  voiceTools: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#1F3B63",
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
    backgroundColor: "#A02334",
  },
  disabledButton: {
    opacity: 0.6,
  },
  recordingMeta: {
    color: colors.mutedInk,
    fontSize: 12,
    marginTop: -2,
  },
  input: { backgroundColor: colors.white, borderRadius: 16, padding: 14, minHeight: 160, color: colors.ink, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  buttonLabel: { color: colors.white, fontWeight: "700", fontSize: 16 },
  status: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
  nlpCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    marginTop: 2,
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
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginTop: 4,
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
    backgroundColor: "#EDF3FF",
  },
  user: {
    backgroundColor: "#F6F6F6",
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
  },
});
