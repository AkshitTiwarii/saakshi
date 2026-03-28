import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { classifyFragmentForCurrentCase, loadScreenDraft, saveScreenDraft, saveVictimDetails } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureUpload">;

type UploadItem = {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size?: number;
  kind: "image" | "video" | "audio" | "document";
};

export function CaptureUploadScreen({ navigation }: Props) {
  const [fileNote, setFileNote] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pickerBusy, setPickerBusy] = useState(false);

  useEffect(() => {
    Promise.all([loadScreenDraft("capture.upload.note"), loadScreenDraft("capture.upload.items")])
      .then(([savedNote, savedItems]) => {
        if (savedNote) {
          setFileNote(savedNote);
        }
        if (savedItems) {
          try {
            const parsed = JSON.parse(savedItems) as UploadItem[];
            if (Array.isArray(parsed)) {
              setItems(parsed.slice(0, 20));
            }
          } catch {
            setItems([]);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  const onChangeFileNote = (value: string) => {
    setFileNote(value);
    void saveScreenDraft("capture.upload.note", value);
  };

  const setAndPersistItems = (next: UploadItem[]) => {
    setItems(next);
    void saveScreenDraft("capture.upload.items", JSON.stringify(next.slice(0, 20)));
  };

  const addItems = (incoming: UploadItem[]) => {
    const next = [...incoming, ...items].slice(0, 20);
    setAndPersistItems(next);
  };

  const guessKind = (mimeType: string): UploadItem["kind"] => {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return "document";
  };

  const pickMedia = async () => {
    setPickerBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setResult("Media permission denied. Enable gallery access and try again.");
        return;
      }

      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (pick.canceled || !pick.assets?.length) {
        return;
      }

      const normalized: UploadItem[] = pick.assets.map((asset, index) => {
        const mimeType = String(asset.mimeType || "application/octet-stream");
        return {
          id: `${asset.assetId || asset.uri}-${index}`,
          name: asset.fileName || `media-${Date.now()}-${index}`,
          uri: asset.uri,
          mimeType,
          size: asset.fileSize,
          kind: guessKind(mimeType),
        };
      });

      addItems(normalized);
      setResult(`${normalized.length} media file(s) selected.`);
    } catch {
      setResult("Could not open media picker. Please retry.");
    } finally {
      setPickerBusy(false);
    }
  };

  const pickDocuments = async () => {
    setPickerBusy(true);
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "video/*", "audio/*", "application/pdf", "text/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (pick.canceled || !pick.assets?.length) {
        return;
      }

      const normalized: UploadItem[] = pick.assets.map((asset, index) => {
        const mimeType = String(asset.mimeType || "application/octet-stream");
        return {
          id: `${asset.uri}-${index}`,
          name: asset.name || `document-${Date.now()}-${index}`,
          uri: asset.uri,
          mimeType,
          size: asset.size,
          kind: guessKind(mimeType),
        };
      });

      addItems(normalized);
      setResult(`${normalized.length} document(s) selected.`);
    } catch {
      setResult("Could not open document picker. Please retry.");
    } finally {
      setPickerBusy(false);
    }
  };

  const removeItem = (id: string) => {
    setAndPersistItems(items.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    setAndPersistItems([]);
    setResult("Selection cleared.");
  };

  const process = async () => {
    const clean = fileNote.trim();
    if (!items.length && !clean) {
      setResult("Select at least one file, or add a note before saving.");
      return;
    }

    setLoading(true);
    try {
      const descriptor = clean || `Uploaded ${items.length} artifact(s)`;
      const ai = await classifyFragmentForCurrentCase(`Uploaded artifact summary: ${descriptor}`);
      const writeRes = await saveVictimDetails({
        profile: {},
        fragments: [
          `[upload] ${descriptor}`,
          ...items.map((item) => `[upload-file] ${item.kind} | ${item.name} | ${item.mimeType} | ${(item.size || 0).toString()} bytes | ${item.uri}`),
        ],
        source: "mobile-capture-upload",
      }).catch(() => null);

      setResult(
        [
          ai ? [ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") : "Artifact marker saved",
          writeRes?.integrity?.latestHash ? `Hash ${writeRes.integrity.latestHash.slice(0, 12)}...` : "",
        ]
          .filter(Boolean)
          .join(" • ") || "Upload entry secured in local vault."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={["#3A2557", "#62306E"]} style={styles.hero}>
          <Text style={styles.kicker}>Evidence Intake</Text>
          <Text style={styles.title}>Upload Real Artifacts</Text>
          <Text style={styles.sub}>Select photos, videos, audio, PDFs, or docs. Every save writes a local integrity hash-chain entry.</Text>
        </LinearGradient>

        <View style={styles.actionCard}>
          <Text style={styles.actionHint}>Pick one or more artifacts, then submit to case evidence.</Text>
          <Pressable style={styles.pickerBtn} onPress={pickMedia} disabled={pickerBusy}>
            <Text style={styles.pickerBtnLabel}>{pickerBusy ? "Opening..." : "Pick Photos / Videos"}</Text>
          </Pressable>
          <Pressable style={styles.pickerBtnSoft} onPress={pickDocuments} disabled={pickerBusy}>
            <Text style={styles.pickerBtnSoftLabel}>{pickerBusy ? "Opening..." : "Pick Audio / Docs / PDF"}</Text>
          </Pressable>
        </View>

        <View style={styles.selectedCard}>
          <View style={styles.selectedHeader}>
            <Text style={styles.selectedTitle}>Selected Files</Text>
            <Pressable onPress={clearAll}>
              <Text style={styles.clearLabel}>Clear all</Text>
            </Pressable>
          </View>

          {items.length === 0 && <Text style={styles.emptyHint}>No files selected yet.</Text>}

          {items.map((item) => (
            <View key={item.id} style={styles.fileRow}>
              <View style={styles.fileTextWrap}>
                <Text style={styles.fileName}>{item.name}</Text>
                <Text style={styles.fileMeta}>{`${item.kind.toUpperCase()} • ${item.mimeType}${item.size ? ` • ${Math.max(1, Math.round(item.size / 1024))} KB` : ""}`}</Text>
              </View>
              <Pressable style={styles.removeBtn} onPress={() => removeItem(item.id)}>
                <Text style={styles.removeBtnLabel}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Optional Context Note</Text>
          <TextInput
            value={fileNote}
            onChangeText={onChangeFileNote}
            placeholder="Optional: what this file proves"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            multiline
          />
        </View>

        <Pressable style={styles.button} onPress={process}>
          <Text style={styles.buttonLabel}>{loading ? "Saving Securely..." : "Submit Uploaded Evidence"}</Text>
        </Pressable>
        {!!result && <Text style={styles.result}>{result}</Text>}
      </ScrollView>

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EBEDF7", paddingHorizontal: 16, paddingTop: 12 },
  scroll: { gap: 12, paddingBottom: 194, flexGrow: 1 },
  hero: {
    borderRadius: 24,
    padding: 16,
    gap: 6,
  },
  kicker: {
    color: "#E1CBFF",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "800",
  },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", lineHeight: 34 },
  sub: { color: "#EEDFFF", fontSize: 13, lineHeight: 19 },
  actionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    gap: 10,
  },
  actionHint: {
    color: "#4A5673",
    fontSize: 12,
    fontWeight: "700",
  },
  pickerBtn: {
    backgroundColor: "#4D2F89",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  pickerBtnLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  pickerBtnSoft: {
    backgroundColor: "#F2ECFC",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  pickerBtnSoftLabel: {
    color: "#522D77",
    fontSize: 14,
    fontWeight: "800",
  },
  selectedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    gap: 8,
  },
  selectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedTitle: {
    color: "#1B2338",
    fontWeight: "800",
    fontSize: 15,
  },
  clearLabel: {
    color: "#9B2D4A",
    fontWeight: "700",
    fontSize: 12,
  },
  emptyHint: {
    color: "#586583",
    fontSize: 13,
  },
  fileRow: {
    borderWidth: 1,
    borderColor: "#DEE4F1",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fileTextWrap: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    color: "#1F2740",
    fontSize: 13,
    fontWeight: "700",
  },
  fileMeta: {
    color: "#5A6685",
    fontSize: 11,
  },
  removeBtn: {
    borderRadius: 999,
    backgroundColor: "#FDEFF2",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  removeBtnLabel: {
    color: "#9F2A49",
    fontSize: 11,
    fontWeight: "800",
  },
  noteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    gap: 8,
  },
  noteTitle: {
    color: "#1A2436",
    fontSize: 15,
    fontWeight: "800",
  },
  input: {
    backgroundColor: "#F7FAFF",
    borderRadius: 16,
    padding: 14,
    minHeight: 94,
    color: "#1F2A44",
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#DCE6F4",
  },
  button: {
    backgroundColor: "#3E2C77",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonLabel: { color: colors.white, fontWeight: "800", fontSize: 16 },
  result: { color: "#3F4C6A", fontSize: 13, lineHeight: 19, marginTop: 2 },
});
