import { auth } from '../firebase';

function getRequestContext() {
  const actorId = auth.currentUser?.uid || 'demo-survivor-1';
  const caseId = auth.currentUser?.uid ? `case-${auth.currentUser.uid}` : 'demo-case-001';
  return { actorId, caseId };
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const { actorId, caseId } = getRequestContext();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': actorId,
      'x-user-role': 'survivor',
      'x-case-id': caseId,
    },
    body: JSON.stringify({ ...(body as Record<string, unknown>), caseId }),
  });

  if (!response.ok) {
    const maybeJson = await response.json().catch(() => ({}));
    const message = typeof maybeJson?.error === 'string' ? maybeJson.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function classifyFragment(content: string) {
  return postJSON<{
    time?: string;
    location?: string;
    sensory?: string[];
    emotion?: string;
  }>('/api/ai/classify-fragment', { content });
}

export async function analyzeImage(base64Image: string) {
  return postJSON<{
    time?: string;
    location?: string;
    sensory?: string[];
    emotion?: string;
    description?: string;
  }>('/api/ai/analyze-image', { base64Image });
}

export async function searchEvidence(query: string) {
  const result = await postJSON<{ text: string }>('/api/ai/search-evidence', { query });
  return result.text;
}

export async function generateAdversarialAnalysis(fragments: any[], evidence: any[]) {
  return postJSON<{
    virodhi: Array<{
      threatLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      description: string;
      predictableDefense: string;
    }>;
    raksha: Array<{
      type: string;
      title: string;
      description: string;
    }>;
    strengthScore: number;
  }>('/api/ai/adversarial-analysis', { fragments, evidence });
}

export async function generateCrossExamination(fragments: any[]) {
  return postJSON<{
    question: string;
    coaching: string;
    threatType: string;
  }>('/api/ai/cross-examination', { fragments });
}
