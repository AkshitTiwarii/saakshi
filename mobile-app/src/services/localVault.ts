import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";

const VAULT_FILE = `${FileSystem.documentDirectory || ""}saakshi-local-vault-v1.json`;

export type VictimSessionSnapshot = {
  victimUniqueId: string;
  caseId: string;
  caseNumber: string;
  email?: string;
  displayName?: string;
  lastProvisionedAt?: string;
};

type CaseIntegrityEntry = {
  entryId: string;
  source: string;
  createdAt: string;
  fragmentCount: number;
  payloadHash: string;
  prevHash: string;
  currentHash: string;
  uploaded: boolean;
};

type LocalCaseState = {
  caseId: string;
  fragments: string[];
  chain: CaseIntegrityEntry[];
};

type LocalVaultState = {
  session: VictimSessionSnapshot | null;
  drafts: Record<string, string>;
  cases: Record<string, LocalCaseState>;
};

const EMPTY_VAULT: LocalVaultState = {
  session: null,
  drafts: {},
  cases: {},
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeState(raw: unknown): LocalVaultState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_VAULT };
  const record = raw as Partial<LocalVaultState>;
  return {
    session: record.session || null,
    drafts: record.drafts || {},
    cases: record.cases || {},
  };
}

async function readVault(): Promise<LocalVaultState> {
  if (!VAULT_FILE) return { ...EMPTY_VAULT };
  try {
    const file = await FileSystem.readAsStringAsync(VAULT_FILE);
    return normalizeState(JSON.parse(file));
  } catch {
    return { ...EMPTY_VAULT };
  }
}

async function writeVault(vault: LocalVaultState) {
  if (!VAULT_FILE) return;
  await FileSystem.writeAsStringAsync(VAULT_FILE, JSON.stringify(vault));
}

async function sha256(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export async function getStoredSession() {
  const vault = await readVault();
  return vault.session;
}

export async function setStoredSession(session: VictimSessionSnapshot) {
  const vault = await readVault();
  vault.session = session;
  await writeVault(vault);
}

export async function setDraftValue(key: string, value: string) {
  const vault = await readVault();
  vault.drafts[key] = value;
  await writeVault(vault);
}

export async function getDraftValue(key: string) {
  const vault = await readVault();
  return vault.drafts[key] || "";
}

export async function appendLocalCaseFragments(params: {
  caseId: string;
  source: string;
  fragments: string[];
  markUploaded?: boolean;
}) {
  const safeFragments = params.fragments.map((fragment) => fragment.trim()).filter(Boolean);
  const vault = await readVault();
  const existing = vault.cases[params.caseId] || {
    caseId: params.caseId,
    fragments: [],
    chain: [],
  };

  const createdAt = nowIso();
  const payloadHash = await sha256(JSON.stringify({ fragments: safeFragments, source: params.source, createdAt }));
  const prevHash = existing.chain.length ? existing.chain[existing.chain.length - 1].currentHash : "GENESIS";
  const currentHash = await sha256(`${prevHash}:${payloadHash}:${createdAt}:${params.source}`);

  const entry: CaseIntegrityEntry = {
    entryId: `local-${currentHash.slice(0, 18)}`,
    source: params.source,
    createdAt,
    fragmentCount: safeFragments.length,
    payloadHash,
    prevHash,
    currentHash,
    uploaded: !!params.markUploaded,
  };

  existing.fragments = [...existing.fragments, ...safeFragments];
  existing.chain = [...existing.chain, entry];
  vault.cases[params.caseId] = existing;
  await writeVault(vault);

  return {
    caseId: params.caseId,
    latestHash: entry.currentHash,
    profileHash: payloadHash,
    previousHash: entry.prevHash,
    localChainLength: existing.chain.length,
  };
}

export async function getCaseLocalSnapshot(caseId: string) {
  const vault = await readVault();
  return vault.cases[caseId] || {
    caseId,
    fragments: [],
    chain: [],
  };
}
