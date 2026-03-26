import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function classifyFragment(content: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this memory fragment and extract time clues, location clues, and sensory details. 
    Fragment: "${content}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING },
          location: { type: Type.STRING },
          sensory: { type: Type.ARRAY, items: { type: Type.STRING } },
          emotion: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text);
}

export async function analyzeImage(base64Image: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Image.split(',')[1], mimeType: "image/png" } },
        { text: "Analyze this drawing/image and extract any visual clues related to time, location, or sensory details. Also, identify the emotional tone." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING },
          location: { type: Type.STRING },
          sensory: { type: Type.ARRAY, items: { type: Type.STRING } },
          emotion: { type: Type.STRING },
          description: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text);
}

export async function searchEvidence(query: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Search for digital evidence or public records related to: "${query}". 
    Focus on weather data, transit records, or local events that could verify this timeline.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });
  return response.text;
}

export async function generateAdversarialAnalysis(fragments: any[], evidence: any[]) {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are an adversarial AI system. 
    Fragments: ${JSON.stringify(fragments)}
    Evidence: ${JSON.stringify(evidence)}
    
    1. Act as VIRODHI (Attack Engine): Find weaknesses in the story, predict cross-questions.
    2. Act as RAKSHA (Defense Engine): Build legal/neuroscience-backed responses, pull Supreme Court judgments.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          virodhi: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                threatLevel: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                predictableDefense: { type: Type.STRING }
              }
            }
          },
          raksha: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          },
          strengthScore: { type: Type.NUMBER }
        }
      }
    }
  });
  return JSON.parse(response.text);
}

export async function generateCrossExamination(fragments: any[]) {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are a defense lawyer cross-examining a witness. 
    Fragments: ${JSON.stringify(fragments)}
    
    1. Generate a tough, adversarial question based on these fragments.
    2. Provide AI coaching on how to respond firmly and calmly.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          coaching: { type: Type.STRING },
          threatType: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text);
}
