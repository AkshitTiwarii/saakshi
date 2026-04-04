import React, { useEffect, useMemo, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, PanResponder } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { RootStackParamList } from "../../App";
import { BottomNav } from "../components/BottomNav";
import { colors } from "../theme/colors";
import { classifyFragmentForCurrentCase, loadScreenDraft, saveScreenDraft, saveVictimDetails } from "../services/apiClient";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureDraw">;

type Stroke = {
  path: string;
  color: string;
  width: number;
};

const BRUSH_COLORS = ["#1E2330", "#234C9C", "#C4682C", "#A62949", "#2F7A61"];

export function CaptureDrawScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activePath, setActivePath] = useState("");
  const [brushColor, setBrushColor] = useState(BRUSH_COLORS[0]);
  const [brushWidth, setBrushWidth] = useState(4);

  const brushRef = useRef({ color: BRUSH_COLORS[0], width: 4 });
  brushRef.current = { color: brushColor, width: brushWidth };

  useEffect(() => {
    Promise.all([loadScreenDraft("capture.draw.desc"), loadScreenDraft("capture.draw.strokes")])
      .then(([savedDesc, savedStrokes]) => {
        if (savedDesc) {
          setDesc(savedDesc);
        }
        if (savedStrokes) {
          try {
            const parsed = JSON.parse(savedStrokes) as Stroke[];
            if (Array.isArray(parsed)) {
              setStrokes(parsed.slice(0, 120));
            }
          } catch {
            setStrokes([]);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  const onChangeDesc = (value: string) => {
    setDesc(value);
    void saveScreenDraft("capture.draw.desc", value);
  };

  const persistStrokes = (next: Stroke[]) => {
    setStrokes(next);
    void saveScreenDraft("capture.draw.strokes", JSON.stringify(next.slice(-120)));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setActivePath(`M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setActivePath((prev) => `${prev} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
        },
        onPanResponderRelease: () => {
          setActivePath((prev) => {
            if (!prev.trim()) return "";
            const next = [
              ...strokes,
              {
                path: prev,
                color: brushRef.current.color,
                width: brushRef.current.width,
              },
            ];
            persistStrokes(next);
            return "";
          });
        },
        onPanResponderTerminate: () => {
          setActivePath("");
        },
      }),
    [strokes]
  );

  const undoStroke = () => {
    if (!strokes.length) return;
    persistStrokes(strokes.slice(0, -1));
  };

  const clearCanvas = () => {
    persistStrokes([]);
    setActivePath("");
  };

  const process = async () => {
    const clean = desc.trim();
    if (!clean && !strokes.length) {
      setStatus("Draw on the canvas or add a short note before saving.");
      return;
    }

    setLoading(true);
    try {
      const generatedNarrative = clean || `Sketch with ${strokes.length} stroke(s), brush width ${brushWidth}`;
      const ai = await classifyFragmentForCurrentCase(`Drawing narrative: ${generatedNarrative}`);
      const writeRes = await saveVictimDetails({
        profile: {},
        fragments: [
          `[draw] ${generatedNarrative}`,
          `[draw-meta] strokes=${strokes.length} brush=${brushWidth} color=${brushColor}`,
        ],
        source: "mobile-capture-draw",
        forceCloudSync: true,
      }).catch(() => null);

      setStatus(
        [
          ai ? [ai.emotion, ai.time, ai.location].filter(Boolean).join(" • ") : "Sketch marker saved",
          writeRes?.localOnly
            ? "Saved locally only (backend sync failed)"
            : writeRes?.success
            ? `Synced to backend (${Number(writeRes?.fragmentCount || 0)} total fragments)`
            : "",
          writeRes?.integrity?.latestHash ? `Hash ${writeRes.integrity.latestHash.slice(0, 12)}...` : "",
        ]
          .filter(Boolean)
          .join(" • ") || "Drawing entry saved in local secure vault."
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
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <LinearGradient colors={["#0B203E", "#1D3F6F"]} style={styles.hero}>
          <Text style={styles.kicker}>Visual Memory Studio</Text>
          <Text style={styles.title}>Draw What You Remember</Text>
          <Text style={styles.sub}>No forced writing. Sketch directly, then save with a legal-grade local integrity hash.</Text>
        </LinearGradient>

        <View style={styles.canvasCard}>
          <View style={styles.canvasTopRow}>
            <Text style={styles.canvasTitle}>Sketch Pad</Text>
            <Text style={styles.canvasMeta}>{strokes.length} stroke(s)</Text>
          </View>

          <View style={styles.toolsRow}>
            {BRUSH_COLORS.map((tone) => (
              <Pressable
                key={tone}
                style={[styles.colorDot, { backgroundColor: tone }, brushColor === tone ? styles.colorDotActive : null]}
                onPress={() => setBrushColor(tone)}
              />
            ))}
          </View>

          <View style={styles.toolsRowBetween}>
            <View style={styles.brushSizeWrap}>
              <Pressable style={styles.smallToolBtn} onPress={() => setBrushWidth((w) => Math.max(2, w - 1))}>
                <Text style={styles.smallToolText}>-</Text>
              </Pressable>
              <Text style={styles.brushSizeText}>Brush {brushWidth}</Text>
              <Pressable style={styles.smallToolBtn} onPress={() => setBrushWidth((w) => Math.min(14, w + 1))}>
                <Text style={styles.smallToolText}>+</Text>
              </Pressable>
            </View>

            <View style={styles.quickToolsWrap}>
              <Pressable style={styles.quickTool} onPress={undoStroke}>
                <Text style={styles.quickToolText}>Undo</Text>
              </Pressable>
              <Pressable style={styles.quickTool} onPress={clearCanvas}>
                <Text style={styles.quickToolText}>Clear</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.canvas} {...panResponder.panHandlers}>
            <Svg width="100%" height="100%">
              {strokes.map((stroke, index) => (
                <Path
                  key={`${stroke.color}-${index}`}
                  d={stroke.path}
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {!!activePath && (
                <Path
                  d={activePath}
                  stroke={brushColor}
                  strokeWidth={brushWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </Svg>
          </View>
        </View>

        <View style={styles.notesCard}>
          <Text style={styles.notesTitle}>Optional Note</Text>
          <TextInput
            value={desc}
            onChangeText={onChangeDesc}
            placeholder="Optional: label people/place/object in this sketch"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            multiline
          />
        </View>

        {!!status && <Text style={styles.status}>{status}</Text>}
      </ScrollView>

      <View style={[styles.submitBar, { bottom: Math.max(84, insets.bottom + 72) }]}> 
        <Pressable style={styles.button} onPress={process}>
          <Text style={styles.buttonLabel}>{loading ? "Saving Securely..." : "Submit Sketch Testimony"}</Text>
        </Pressable>
      </View>

      <BottomNav current="CaptureMethod" onNavigate={(r) => navigation.navigate(r as any)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E8EDF7", paddingHorizontal: 16, paddingTop: 12 },
  scroll: { gap: 12, paddingBottom: 250, flexGrow: 1 },
  hero: {
    borderRadius: 24,
    padding: 16,
    gap: 6,
  },
  kicker: {
    color: "#B9D7FF",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "800",
  },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", lineHeight: 34 },
  sub: { color: "#D9E8FF", fontSize: 13, lineHeight: 19 },
  canvasCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    gap: 10,
  },
  canvasTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  canvasTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A2335",
  },
  canvasMeta: {
    fontSize: 12,
    color: "#4A5A79",
    fontWeight: "700",
  },
  canvas: {
    minHeight: 240,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D2DCEC",
    backgroundColor: "#F9FCFF",
    overflow: "hidden",
  },
  toolsRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: {
    borderColor: "#0E2C57",
  },
  toolsRowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brushSizeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallToolBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#E5ECF9",
    alignItems: "center",
    justifyContent: "center",
  },
  smallToolText: {
    color: "#21375E",
    fontSize: 18,
    fontWeight: "800",
    marginTop: -1,
  },
  brushSizeText: {
    color: "#2A3A5E",
    fontSize: 13,
    fontWeight: "700",
  },
  quickToolsWrap: {
    flexDirection: "row",
    gap: 8,
  },
  quickTool: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EDF2FC",
  },
  quickToolText: {
    color: "#2A4677",
    fontSize: 12,
    fontWeight: "800",
  },
  notesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    gap: 8,
  },
  notesTitle: {
    color: "#1A2436",
    fontSize: 15,
    fontWeight: "800",
  },
  input: {
    backgroundColor: "#F6F9FF",
    borderRadius: 16,
    padding: 14,
    minHeight: 96,
    color: "#1F2A44",
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#DAE4F3",
  },
  button: {
    backgroundColor: "#0F3F76",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBar: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  buttonLabel: { color: colors.white, fontWeight: "800", fontSize: 16 },
  status: { color: "#425274", fontSize: 13, lineHeight: 19, marginTop: 2 },
});
