import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Brain,
  Briefcase,
  ChevronRight,
  Clock,
  FileSearch,
  Fingerprint,
  Gavel,
  HeartPulse,
  Lock,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

type OfficerRole = 'Lawyer' | 'Police Officer' | 'Law Enforcement Agent';
type ActorRole = 'lawyer' | 'police' | 'admin';
type PortalPurpose = 'analysis' | 'legal_export' | 'police_share' | 'lawyer_share';

type ConsentEvaluationResult = {
  allowed: boolean;
  reason: string;
  redactions: string[];
  policyVersion: string;
};

type ConsentGrantRecord = {
  grantId: string;
  caseId: string;
  grantedByActorId: string;
  granteeActorId?: string;
  granteeRole: string;
  purpose: string;
  requestedFields: string[];
  redactions: string[];
  policyVersion: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt?: string;
  expiresAt?: string;
};

type LiveCase = {
  id: string;
  caseNumber: string;
  victimUniqueId: string;
  status: string;
  priority: 'High' | 'Medium' | 'Low';
  region: string;
  lastUpdated: string;
  assignedRoles: OfficerRole[];
  designatedOfficerIds: string[];
  evidenceSummary: string[];
  timeline: Array<{ at: string; event: string }>;
  emotionalInsights: {
    dominantEmotion: string;
    confidence: number;
    trend: string;
    nlpSummary: string;
  };
  integrity: {
    merkleRoot: string;
    latestHash: string;
    anchoredAt: string;
    tamperDetected: boolean;
  };
  assistants: {
    virodhiStatus: string;
    pareekshaStatus: string;
    judgeNotes: string;
    lawyerNotes: string;
  };
  uid: string;
  strengthScore: number;
};

type CaseDoc = Record<string, unknown>;

const roleIcon: Record<OfficerRole, React.ReactNode> = {
  Lawyer: <Briefcase size={16} />,
  'Police Officer': <Shield size={16} />,
  'Law Enforcement Agent': <ShieldCheck size={16} />,
};

const roleToActorRole: Record<OfficerRole, ActorRole> = {
  Lawyer: 'lawyer',
  'Police Officer': 'police',
  'Law Enforcement Agent': 'police',
};

const roleDefaultPurpose: Record<OfficerRole, PortalPurpose> = {
  Lawyer: 'lawyer_share',
  'Police Officer': 'police_share',
  'Law Enforcement Agent': 'analysis',
};

function toDateValue(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    const seconds = Number((raw as { seconds?: unknown }).seconds);
    if (!Number.isNaN(seconds)) return new Date(seconds * 1000);
  }
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateLabel(raw: unknown): string {
  const dateValue = toDateValue(raw);
  if (!dateValue) return 'Not available';
  return dateValue.toLocaleString();
}

function normalizeRoles(rawRoles: unknown): OfficerRole[] {
  if (!Array.isArray(rawRoles)) return ['Police Officer'];
  const mapped = rawRoles
    .map((value) => String(value).toLowerCase())
    .map((token) => {
      if (token.includes('lawyer')) return 'Lawyer';
      if (token.includes('enforcement') || token.includes('agent')) return 'Law Enforcement Agent';
      if (token.includes('police')) return 'Police Officer';
      return null;
    })
    .filter((value): value is OfficerRole => value !== null);

  return mapped.length ? Array.from(new Set(mapped)) : ['Police Officer'];
}

function mapCaseDocument(id: string, data: CaseDoc): LiveCase {
  const rawCaseNumber = data.caseNumber || data.caseId || data.title || id;
  const rawUid = String(data.uid || data.victimUniqueId || data.survivorUid || 'unknown-user');
  const integrityData = (data.integrity as Record<string, unknown> | undefined) ?? {};
  const assistantData = (data.assistants as Record<string, unknown> | undefined) ?? {};
  const emotionalData = (data.emotionalInsights as Record<string, unknown> | undefined) ?? {};
  const timelineRaw = Array.isArray(data.timeline) ? data.timeline : [];

  const timeline = timelineRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const objectEntry = entry as Record<string, unknown>;
      return {
        at: String(objectEntry.at || objectEntry.time || 'Unknown time'),
        event: String(objectEntry.event || objectEntry.note || objectEntry.description || 'No event detail.'),
      };
    })
    .filter((entry): entry is { at: string; event: string } => entry !== null)
    .slice(0, 6);

  const evidenceSummary = Array.isArray(data.evidenceSummary)
    ? data.evidenceSummary.map((item) => String(item))
    : [];

  return {
    id,
    caseNumber: String(rawCaseNumber),
    victimUniqueId: String(data.victimUniqueId || rawUid),
    uid: rawUid,
    status: String(data.status || 'In Progress'),
    priority: (String(data.priority || 'Medium') as 'High' | 'Medium' | 'Low'),
    region: String(data.region || data.location || 'Unassigned Region'),
    lastUpdated: formatDateLabel(data.updatedAt || data.lastUpdated || data.createdAt),
    assignedRoles: normalizeRoles(data.assignedRoles || data.allowedRoles),
    designatedOfficerIds: Array.isArray(data.designatedOfficerIds)
      ? data.designatedOfficerIds.map((entry) => String(entry))
      : [],
    evidenceSummary,
    timeline,
    emotionalInsights: {
      dominantEmotion: String(emotionalData.dominantEmotion || 'Not available'),
      confidence: Number(emotionalData.confidence || 0),
      trend: String(emotionalData.trend || 'Not available'),
      nlpSummary: String(emotionalData.nlpSummary || 'No emotional NLP summary available for this case yet.'),
    },
    integrity: {
      merkleRoot: String(integrityData.merkleRoot || 'Not anchored'),
      latestHash: String(integrityData.latestHash || 'Not available'),
      anchoredAt: String(integrityData.anchoredAt || 'Not available'),
      tamperDetected: Boolean(integrityData.tamperDetected),
    },
    assistants: {
      virodhiStatus: String(assistantData.virodhiStatus || 'Not available'),
      pareekshaStatus: String(assistantData.pareekshaStatus || 'Not available'),
      judgeNotes: String(assistantData.judgeNotes || 'No Virodhi notes yet.'),
      lawyerNotes: String(assistantData.lawyerNotes || 'No Pareeksha notes yet.'),
    },
    strengthScore: Number(data.strengthScore || 0),
  };
}

function checkGrantActive(
  grants: ConsentGrantRecord[],
  params: { actorId: string; actorRole: ActorRole; purpose: PortalPurpose },
) {
  const now = Date.now();

  return grants.some((grant) => {
    if (grant.status !== 'active') return false;
    if (grant.purpose !== params.purpose) return false;
    if (grant.granteeRole !== params.actorRole) return false;
    if (grant.granteeActorId && grant.granteeActorId !== params.actorId) return false;
    if (!grant.expiresAt) return true;
    return new Date(grant.expiresAt).getTime() > now;
  });
}

export function OfficerPortal() {
  const isDevRuntime =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [officerId, setOfficerId] = useState('');
  const [role, setRole] = useState<OfficerRole>('Police Officer');
  const [purpose, setPurpose] = useState<PortalPurpose>('police_share');
  const [caseInput, setCaseInput] = useState('');
  const [activeCaseNumber, setActiveCaseNumber] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [policyEval, setPolicyEval] = useState<ConsentEvaluationResult | null>(null);
  const [caseGrants, setCaseGrants] = useState<ConsentGrantRecord[]>([]);
  const [portalError, setPortalError] = useState('');
  const [cases, setCases] = useState<LiveCase[]>([]);
  const [fragmentCountsByUid, setFragmentCountsByUid] = useState<Record<string, number>>({});
  const [evidenceCountsByUid, setEvidenceCountsByUid] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsubscribeCases = onSnapshot(query(collection(db, 'cases')), (snapshot) => {
      const mapped = snapshot.docs.map((docSnap) => mapCaseDocument(docSnap.id, docSnap.data() as CaseDoc));
      setCases(mapped);
    });

    const unsubscribeFragments = onSnapshot(query(collection(db, 'fragments')), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((docSnap) => {
        const uid = String((docSnap.data() as CaseDoc).uid || 'unknown-user');
        counts[uid] = (counts[uid] || 0) + 1;
      });
      setFragmentCountsByUid(counts);
    });

    const unsubscribeEvidence = onSnapshot(query(collection(db, 'evidence')), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((docSnap) => {
        const uid = String((docSnap.data() as CaseDoc).uid || 'unknown-user');
        counts[uid] = (counts[uid] || 0) + 1;
      });
      setEvidenceCountsByUid(counts);
    });

    return () => {
      unsubscribeCases();
      unsubscribeFragments();
      unsubscribeEvidence();
    };
  }, []);

  const selectedCase = useMemo(
    () =>
      cases.find(
        (entry) =>
          entry.caseNumber.toLowerCase() === activeCaseNumber.trim().toLowerCase() ||
          entry.victimUniqueId.toLowerCase() === activeCaseNumber.trim().toLowerCase(),
      ) ?? null,
    [activeCaseNumber, cases],
  );

  const actorRole = roleToActorRole[role];
  const designatedMatch = Boolean(
    selectedCase && officerId.trim() && selectedCase.designatedOfficerIds.includes(officerId.trim()),
  );
  const roleInScope = Boolean(selectedCase && selectedCase.assignedRoles.includes(role));
  const grantActive = checkGrantActive(caseGrants, {
    actorId: officerId.trim(),
    actorRole,
    purpose,
  });
  const policyAllowed = policyEval?.allowed === true;

  const accessGranted = Boolean(
    searchSubmitted && selectedCase && designatedMatch && roleInScope && grantActive && policyAllowed,
  );

  const accessMessage = useMemo(() => {
    if (!searchSubmitted) return 'Pick case and officer context to begin secure verification.';
    if (portalError) return portalError;
    if (!selectedCase) return 'Case not found in Firestore records.';
    if (!designatedMatch) return 'Officer ID is not designated for this case.';
    if (!roleInScope) return 'Selected role is not in this case approval scope.';
    if (!policyAllowed) return policyEval?.reason || 'Consent policy did not allow this action.';
    if (!grantActive) return 'No active survivor consent grant found for this role and purpose.';
    return 'Access approved. Protected case dashboard unlocked.';
  }, [
    designatedMatch,
    grantActive,
    policyAllowed,
    policyEval?.reason,
    portalError,
    roleInScope,
    searchSubmitted,
    selectedCase,
  ]);

  const metrics = useMemo(() => {
    const high = cases.filter((entry) => entry.priority === 'High').length;
    const tamper = cases.filter((entry) => entry.integrity.tamperDetected).length;
    return {
      total: cases.length,
      high,
      tamper,
    };
  }, [cases]);

  const quickOpenCase = (value: string) => {
    setCaseInput(value);
    setActiveCaseNumber(value);
    setSearchSubmitted(false);
    setPolicyEval(null);
    setCaseGrants([]);
    setPortalError('');
  };

  const runAccessCheck = async () => {
    setSearchSubmitted(true);
    setPortalError('');
    setPolicyEval(null);
    setCaseGrants([]);

    const normalized = caseInput.trim();
    setActiveCaseNumber(normalized);

    const matchedCase =
      cases.find(
        (entry) =>
          entry.caseNumber.toLowerCase() === normalized.toLowerCase() ||
          entry.victimUniqueId.toLowerCase() === normalized.toLowerCase(),
      ) ?? null;

    if (!normalized) {
      setPortalError('Case number or victim UID is required.');
      return;
    }

    if (!officerId.trim()) {
      setPortalError('Officer ID is required.');
      return;
    }

    if (!matchedCase) {
      setPortalError('Case not found. Verify case number or victim UID.');
      return;
    }

    setIsChecking(true);
    try {
      const evalResp = await fetch('/api/consent/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: officerId.trim(),
          actorRole,
          caseId: matchedCase.caseNumber,
          purpose,
          requestedFields: ['full_case_timeline', 'victim_media', 'ai_analysis'],
        }),
      });

      const evalData = (await evalResp.json()) as ConsentEvaluationResult | { error: string };

      if (!evalResp.ok) {
        setPortalError('Consent policy evaluation failed.');
        return;
      }

      if ('allowed' in evalData) {
        setPolicyEval(evalData);
      }

      const grantsResp = await fetch(`/api/consent/grants/${encodeURIComponent(matchedCase.caseNumber)}`);
      if (grantsResp.ok) {
        const grantsData = (await grantsResp.json()) as { grants?: ConsentGrantRecord[] };
        setCaseGrants(Array.isArray(grantsData.grants) ? grantsData.grants : []);
      }
    } catch {
      setPortalError('Unable to reach consent service. Check server connection.');
    } finally {
      setIsChecking(false);
    }
  };

  const priorityStyle = (value: LiveCase['priority']) => {
    if (value === 'High') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (value === 'Medium') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  };

  return (
    <div className="min-h-screen bg-[#eef2f8] p-3 md:p-5">
      <div className="mx-auto max-w-[1360px] rounded-3xl border border-slate-300 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="border-b border-slate-200 px-5 md:px-7 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Officer Operations</p>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">Case Access Command</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">
              {metrics.total} Live Cases
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700">
              {metrics.tamper} Integrity Alerts
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
              {metrics.high} High Priority
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr]">
          <aside className="border-r border-slate-200 bg-[#f8f9fc] p-4 md:p-5 space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <h2 className="text-lg font-black text-slate-900">Access Workbench</h2>
              <p className="text-sm text-slate-600 mt-1">Verify identity, role scope, policy, and active consent grant.</p>

              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="text-slate-600">Officer ID</span>
                  <input
                    value={officerId}
                    onChange={(event) => setOfficerId(event.target.value)}
                    placeholder="OFF-IND-221"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500"
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-slate-600">Role</span>
                  <select
                    value={role}
                    onChange={(event) => {
                      const nextRole = event.target.value as OfficerRole;
                      setRole(nextRole);
                      setPurpose(roleDefaultPurpose[nextRole]);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500"
                  >
                    <option>Lawyer</option>
                    <option>Police Officer</option>
                    <option>Law Enforcement Agent</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-slate-600">Purpose</span>
                  <select
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value as PortalPurpose)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500"
                  >
                    <option value="analysis">Analysis</option>
                    <option value="police_share">Police Share</option>
                    <option value="lawyer_share">Lawyer Share</option>
                    <option value="legal_export">Legal Export</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-slate-600">Case Number or Victim UID</span>
                  <input
                    value={caseInput}
                    onChange={(event) => setCaseInput(event.target.value)}
                    placeholder="SAAK-2026-1042 or victim UID"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500"
                  />
                </label>

                <button
                  onClick={runAccessCheck}
                  disabled={isChecking}
                  className="w-full rounded-xl bg-[#0f172a] text-white font-semibold py-2.5 flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors disabled:opacity-60"
                >
                  {isChecking ? <Activity size={16} className="animate-spin" /> : <Search size={16} />}
                  {isChecking ? 'Running Checks...' : 'Verify Case Access'}
                </button>
              </div>

              <div
                className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                  accessGranted
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : searchSubmitted
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {accessMessage}
              </div>

              {isDevRuntime && selectedCase && selectedCase.designatedOfficerIds.length > 0 && (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                  Testing officer IDs: {selectedCase.designatedOfficerIds.join(', ')}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <h3 className="text-lg font-black text-slate-900">Live Case Queue</h3>
              <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {cases.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => quickOpenCase(entry.caseNumber)}
                    className="w-full text-left rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-800">{entry.caseNumber}</p>
                      <span className={`text-xs rounded-full border px-2 py-0.5 ${priorityStyle(entry.priority)}`}>
                        {entry.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{entry.region}</p>
                  </button>
                ))}
                {cases.length === 0 && (
                  <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-300 p-3">
                    No cases found in Firestore collection "cases".
                  </p>
                )}
              </div>
            </div>
          </aside>

          <main className="p-4 md:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-xs uppercase tracking-wide text-slate-500">Policy Gate</p>
                <p className={`mt-2 text-sm font-semibold ${policyAllowed ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {policyAllowed ? 'Passed' : searchSubmitted ? 'Pending / Failed' : 'Not Checked'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-xs uppercase tracking-wide text-slate-500">Designation</p>
                <p className={`mt-2 text-sm font-semibold ${designatedMatch ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {designatedMatch ? 'Officer Mapped' : 'No Match'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-xs uppercase tracking-wide text-slate-500">Role Scope</p>
                <p className={`mt-2 text-sm font-semibold ${roleInScope ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {roleInScope ? 'In Scope' : 'Out Of Scope'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-xs uppercase tracking-wide text-slate-500">Consent Grant</p>
                <p className={`mt-2 text-sm font-semibold ${grantActive ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {grantActive ? 'Active' : 'Missing'}
                </p>
              </div>
            </div>

            {!searchSubmitted && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                <FileSearch size={22} className="mx-auto text-slate-400" />
                <p className="mt-3 text-slate-600">Run access verification to unlock live case timeline, AI insights, and integrity data.</p>
              </div>
            )}

            {searchSubmitted && !accessGranted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <p className="font-semibold text-rose-700 flex items-center gap-2">
                  <AlertTriangle size={16} /> Access Blocked
                </p>
                <p className="text-sm text-rose-700 mt-1">{accessMessage}</p>
              </motion.div>
            )}

            {searchSubmitted && accessGranted && selectedCase && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">Case {selectedCase.caseNumber}</h2>
                      <p className="text-sm text-slate-600 mt-1">
                        {selectedCase.status} - {selectedCase.region} - Last update {selectedCase.lastUpdated}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-3 py-1.5 flex items-center gap-2">
                      <BadgeCheck size={14} /> Authorized View
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-xs uppercase text-slate-500">Victim UID</p>
                      <p className="mt-1 font-semibold text-slate-800">{selectedCase.victimUniqueId}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-xs uppercase text-slate-500">Policy Version</p>
                      <p className="mt-1 font-semibold text-slate-800">{policyEval?.policyVersion ?? 'n/a'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-xs uppercase text-slate-500">Fragments</p>
                      <p className="mt-1 font-semibold text-slate-800">{fragmentCountsByUid[selectedCase.uid] || 0}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-xs uppercase text-slate-500">Evidence</p>
                      <p className="mt-1 font-semibold text-slate-800">{evidenceCountsByUid[selectedCase.uid] || 0}</p>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <article className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <HeartPulse size={16} /> Emotional NLP Insights
                    </h3>
                    <p className="mt-2 text-sm text-slate-700">
                      Dominant state: <span className="font-semibold">{selectedCase.emotionalInsights.dominantEmotion}</span>
                    </p>
                    <p className="text-sm text-slate-700">
                      Confidence: <span className="font-semibold">{Math.round(selectedCase.emotionalInsights.confidence * 100)}%</span>
                    </p>
                    <p className="text-sm text-slate-700">Trend: {selectedCase.emotionalInsights.trend}</p>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{selectedCase.emotionalInsights.nlpSummary}</p>
                  </article>

                  <article
                    className={`rounded-2xl border p-4 ${
                      selectedCase.integrity.tamperDetected ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'
                    }`}
                  >
                    <h3 className="font-bold flex items-center gap-2 text-slate-900">
                      <Fingerprint size={16} /> Blockchain Integrity
                    </h3>
                    <p className="text-sm text-slate-700 mt-2">Merkle Root: {selectedCase.integrity.merkleRoot}</p>
                    <p className="text-sm text-slate-700">Latest Hash: {selectedCase.integrity.latestHash}</p>
                    <p className="text-sm text-slate-700">Anchor: {selectedCase.integrity.anchoredAt}</p>
                    <p
                      className={`mt-3 text-sm font-semibold flex items-center gap-2 ${
                        selectedCase.integrity.tamperDetected ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {selectedCase.integrity.tamperDetected ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                      {selectedCase.integrity.tamperDetected
                        ? 'Tamper attempt detected and escalated to security queue.'
                        : 'Hash chain validated and immutable.'}
                    </p>
                  </article>
                </section>

                <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <article className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Brain size={16} /> AI Courtroom Assistants
                    </h3>
                    <div className="mt-3 space-y-3 text-sm text-slate-700">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="font-semibold flex items-center gap-2">
                          <Gavel size={14} /> Virodhi: {selectedCase.assistants.virodhiStatus}
                        </p>
                        <p className="mt-1 text-slate-600">{selectedCase.assistants.judgeNotes}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="font-semibold flex items-center gap-2">
                          <UserRound size={14} /> Pareeksha: {selectedCase.assistants.pareekshaStatus}
                        </p>
                        <p className="mt-1 text-slate-600">{selectedCase.assistants.lawyerNotes}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles size={16} /> Case Timeline
                    </h3>
                    <div className="mt-3 space-y-2">
                      {selectedCase.timeline.map((entry) => (
                        <div key={`${entry.at}-${entry.event}`} className="rounded-lg bg-slate-50 p-3 flex gap-3">
                          <Clock size={14} className="text-slate-500 mt-0.5" />
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">{entry.at}</p>
                            <p className="text-sm text-slate-700 mt-1">{entry.event}</p>
                          </div>
                        </div>
                      ))}
                      {selectedCase.timeline.length === 0 && (
                        <p className="text-sm text-slate-500">No timeline events available in current case document.</p>
                      )}
                    </div>
                  </article>
                </section>

                <section className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Lock size={16} /> Consent And Scope Snapshot
                  </h3>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase text-slate-500">Eligible Roles</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedCase.assignedRoles.map((entry) => (
                          <span key={entry} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 flex items-center gap-1.5">
                            {roleIcon[entry]} {entry}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase text-slate-500">Recent Evidence Pack</p>
                      <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                        {selectedCase.evidenceSummary.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <ChevronRight size={14} className="mt-0.5 text-slate-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                        {selectedCase.evidenceSummary.length === 0 && <li>No evidence summary found in case document.</li>}
                      </ul>
                    </div>
                  </div>
                </section>
              </motion.div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
