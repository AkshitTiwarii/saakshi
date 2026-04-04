import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Fingerprint, ShieldCheck } from 'lucide-react';

type DetailedCase = {
  caseId: string;
  caseNumber: string;
  victimUniqueId: string;
  status?: string;
  createdAt?: string;
  createdByAdminId?: string;
  victimProfile?: {
    email?: string;
    displayName?: string;
    phone?: string;
    emergencyContact?: string;
    incidentSummary?: string;
    updatedAt?: string;
  } | null;
  victimFragments?: string[];
  metadata?: Record<string, unknown>;
  captureSummary?: {
    totalFragments: number;
    writingCount: number;
    voiceCount: number;
    drawingCount: number;
    uploadCount: number;
    otherCount: number;
    latestSource?: string | null;
  };
  intelligence?: {
    legalSuggestions?: Array<{ code: string; title: string; why: string }>;
    contradictionRisks?: Array<{ level: string; title: string; detail: string; mitigation?: string }>;
    evidenceLeads?: Array<{ type: string; source: string; query: string; confidence: number; rationale?: string }>;
    fakeVictimAssessment?: {
      probability: number;
      band: string;
      flags: string[];
      disclaimer?: string;
    };
    mlPredictions?: {
      legal?: Record<string, unknown> | null;
      temporal?: Record<string, unknown> | null;
      trauma?: Record<string, unknown> | null;
      distress?: Record<string, unknown> | null;
      providerStatus?: Record<string, string>;
    };
  };
  integrity?: {
    totalEntries: number;
    latestHash?: string | null;
    latestEntryAt?: string | null;
  };
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

type IntegrityVerificationResult = {
  caseId: string;
  caseNumber: string;
  officerId: string;
  verification: {
    chainValid: boolean;
    totalEntries: number;
    latestHash: string;
    profileDigest: string;
    fragmentsDigest: string;
    anchorEvidence: {
      queueEntriesForCase: number;
      profileAnchored: boolean;
      fragmentsAnchored: boolean;
    };
    chainChecks: Array<{
      entryId: string;
      payloadType: string;
      createdAt: string;
      expectedPrevHash: string;
      actualPrevHash: string;
      linked: boolean;
    }>;
    batchProofs: Array<{
      batchType: string;
      itemCount: number;
      batchHash: string;
      pass: boolean;
      reasons: string[];
    }>;
  };
};

type RakshaSummarySnapshot = {
  createdAt: string;
  source?: string;
  statement?: string;
  strengthScore?: number | null;
  readinessScore?: number | null;
  aiSummary?: string;
  virodhi?: string[];
  raksha?: string[];
  legalSuggestions?: string[];
  contradictionRisks?: string[];
  lawModelSummary?: string;
  temporalWindow?: string;
  traumaBand?: string;
  distressBand?: string;
  fakeVictimBand?: string;
};

function parseRakshaSummarySnapshots(fragments: string[] = []): RakshaSummarySnapshot[] {
  const snapshots: RakshaSummarySnapshot[] = [];

  for (const fragment of fragments) {
    const text = String(fragment || "").trim();
    if (!text) continue;

    const match = text.match(/^\[([^\]]+)\]\s*(.*)$/);
    const tag = String(match?.[1] || "").toLowerCase();
    if (tag !== "raksha-summary-v1") continue;

    const payloadText = String(match?.[2] || "").trim();
    if (!payloadText) continue;

    try {
      const parsed = JSON.parse(payloadText) as Partial<RakshaSummarySnapshot>;
      snapshots.push({
        createdAt: String(parsed.createdAt || new Date(0).toISOString()),
        source: String(parsed.source || "mobile-raksha"),
        statement: String(parsed.statement || "").trim(),
        strengthScore: typeof parsed.strengthScore === "number" ? parsed.strengthScore : null,
        readinessScore: typeof parsed.readinessScore === "number" ? parsed.readinessScore : null,
        aiSummary: String(parsed.aiSummary || "").trim(),
        virodhi: Array.isArray(parsed.virodhi) ? parsed.virodhi.map((item) => String(item)) : [],
        raksha: Array.isArray(parsed.raksha) ? parsed.raksha.map((item) => String(item)) : [],
        legalSuggestions: Array.isArray(parsed.legalSuggestions) ? parsed.legalSuggestions.map((item) => String(item)) : [],
        contradictionRisks: Array.isArray(parsed.contradictionRisks) ? parsed.contradictionRisks.map((item) => String(item)) : [],
        lawModelSummary: String(parsed.lawModelSummary || "").trim(),
        temporalWindow: String(parsed.temporalWindow || "").trim(),
        traumaBand: String(parsed.traumaBand || "").trim(),
        distressBand: String(parsed.distressBand || "").trim(),
        fakeVictimBand: String(parsed.fakeVictimBand || "").trim(),
      });
    } catch {
      // Ignore malformed summary fragments to keep officer workspace stable.
    }
  }

  return snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function OfficerCaseWorkspace() {
  const navigate = useNavigate();
  const { caseId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const officerId = searchParams.get('officerId') || '';

  const [details, setDetails] = useState<DetailedCase | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reportStatus, setReportStatus] = useState('');
  const [reportDownloadUrl, setReportDownloadUrl] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyResult, setVerifyResult] = useState<IntegrityVerificationResult | null>(null);
  const [grants, setGrants] = useState<ConsentGrantRecord[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!caseId || !officerId) {
        setError('Missing caseId/officerId for secure case workspace');
        setLoading(false);
        return;
      }

      try {
        const resp = await fetch(
          `/api/case/${encodeURIComponent(caseId)}/details?officerId=${encodeURIComponent(officerId)}`
        );
        const text = await resp.text();
        const data = JSON.parse(text);
        if (!resp.ok) {
          throw new Error(data?.error || 'Failed to load case workspace');
        }
        setDetails(data as DetailedCase);
        const grantsResp = await fetch(`/api/consent/grants/${encodeURIComponent(caseId)}`);
        if (grantsResp.ok) {
          const grantsData = await grantsResp.json();
          setGrants(Array.isArray(grantsData?.grants) ? grantsData.grants : []);
        } else {
          setGrants([]);
        }
      } catch (e: any) {
        setError(e.message || 'Unable to load case workspace');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [caseId, officerId]);

  const fragmentGroups = useMemo(() => {
    const source = details?.victimFragments || [];
    const buckets = {
      writing: [] as string[],
      voice: [] as string[],
      drawing: [] as string[],
      upload: [] as string[],
      other: [] as string[],
    };

    for (const fragment of source) {
      const text = String(fragment || '').trim();
      if (!text) continue;

      const match = text.match(/^\[([^\]]+)\]\s*(.*)$/i);
      const tag = (match?.[1] || '').toLowerCase();
      const body = (match?.[2] || text).trim() || text;

      if (tag.includes('voice')) buckets.voice.push(body);
      else if (tag.includes('draw')) buckets.drawing.push(body);
      else if (tag.includes('upload')) buckets.upload.push(body);
      else if (tag.includes('text') || tag.includes('write') || tag.includes('case-summary') || tag.includes('dashboard-case-brief')) buckets.writing.push(body);
      else buckets.other.push(text);
    }

    return buckets;
  }, [details?.victimFragments]);

  const captureSummary = details?.captureSummary || {
    totalFragments: details?.victimFragments?.length || 0,
    writingCount: fragmentGroups.writing.length,
    voiceCount: fragmentGroups.voice.length,
    drawingCount: fragmentGroups.drawing.length,
    uploadCount: fragmentGroups.upload.length,
    otherCount: fragmentGroups.other.length,
    latestSource: String(details?.metadata?.source || 'n/a'),
  };

  const keyValuePairs = [
    { label: 'Case Number', value: details?.caseNumber || 'n/a' },
    { label: 'Case ID', value: details?.caseId || 'n/a' },
    { label: 'Victim UID', value: details?.victimUniqueId || 'n/a' },
    { label: 'Created At', value: details?.createdAt || 'n/a' },
    { label: 'Created By', value: details?.createdByAdminId || 'n/a' },
    { label: 'Status', value: details?.status || 'n/a' },
    { label: 'Display Name', value: details?.victimProfile?.displayName || 'n/a' },
    { label: 'Email', value: details?.victimProfile?.email || 'n/a' },
    { label: 'Phone', value: details?.victimProfile?.phone || 'n/a' },
    { label: 'Emergency Contact', value: details?.victimProfile?.emergencyContact || 'n/a' },
    { label: 'Incident Summary', value: details?.victimProfile?.incidentSummary || 'n/a' },
    { label: 'Last Updated', value: details?.victimProfile?.updatedAt || 'n/a' },
  ];

  const exportOfficerReport = async () => {
    if (!caseId || !officerId) return;
    setReportLoading(true);
    setReportStatus('');
    setReportDownloadUrl('');
    try {
      const resp = await fetch('/api/report/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': officerId,
          'x-user-role': 'officer',
          'x-case-id': caseId,
        },
        body: JSON.stringify({
          caseId,
          audience: 'officer',
          officerId,
        }),
      });
      const text = await resp.text();
      const data = JSON.parse(text);
      if (!resp.ok) {
        throw new Error(data?.error || 'Failed to export report');
      }
      setReportStatus(`Report generated. Hash: ${(data?.reportHash || '').slice(0, 24)}...`);
      setReportDownloadUrl(data?.downloadUrl || '');
    } catch (e: any) {
      setReportStatus(e.message || 'Report export failed');
    } finally {
      setReportLoading(false);
    }
  };

  const verifyIntegrity = async () => {
    if (!caseId || !officerId) return;
    setVerifyLoading(true);
    setVerifyError('');
    try {
      const resp = await fetch(
        `/api/case/${encodeURIComponent(caseId)}/verify-integrity?officerId=${encodeURIComponent(officerId)}`
      );
      const text = await resp.text();
      const data = JSON.parse(text);
      if (!resp.ok) {
        throw new Error(data?.error || 'Integrity verification failed');
      }
      setVerifyResult(data as IntegrityVerificationResult);
    } catch (e: any) {
      setVerifyError(e.message || 'Integrity verification failed');
      setVerifyResult(null);
    } finally {
      setVerifyLoading(false);
    }
  };

  const testimonyBuckets = useMemo(() => {
    const source = details?.victimFragments || [];
    const buckets: {
      writing: string[];
      voice: string[];
      drawing: string[];
      upload: string[];
      other: string[];
    } = {
      writing: [],
      voice: [],
      drawing: [],
      upload: [],
      other: [],
    };

    for (const fragment of source) {
      const text = String(fragment || '').trim();
      if (!text) continue;

      const match = text.match(/^\[([^\]]+)\]\s*(.*)$/i);
      const tag = (match?.[1] || '').toLowerCase();
      const body = (match?.[2] || text).trim() || text;

      if (tag.includes('voice')) {
        buckets.voice.push(body);
      } else if (tag.includes('draw')) {
        buckets.drawing.push(body);
      } else if (tag.includes('upload')) {
        buckets.upload.push(body);
      } else if (
        tag.includes('text') ||
        tag.includes('write') ||
        tag.includes('case-summary') ||
        tag.includes('dashboard-case-brief')
      ) {
        buckets.writing.push(body);
      } else {
        buckets.other.push(text);
      }
    }

    return buckets;
  }, [details?.victimFragments]);

  const rakshaSummaries = useMemo(
    () => parseRakshaSummarySnapshots(details?.victimFragments || []),
    [details?.victimFragments]
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Officer Case Workspace</h1>
            <p className="text-slate-600 mt-1">Secure, post-verification view for designated officers.</p>
          </div>
          <button
            onClick={() => navigate('/officer-portal')}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        {loading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-600">Loading case workspace...</div>
        )}

        {!!error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700">{error}</div>
        )}

        {!loading && !error && details && (
          <>
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-2xl font-black text-slate-900">{details.caseNumber}</h2>
              <p className="text-slate-700 mt-2">Case ID: {details.caseId}</p>
              <p className="text-slate-700">Victim UID: {details.victimUniqueId}</p>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Fragments</div>
                  <div className="text-xl font-black text-slate-900">{captureSummary.totalFragments}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Integrity Entries</div>
                  <div className="text-xl font-black text-slate-900">{details.integrity?.totalEntries || 0}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Consent Grants</div>
                  <div className="text-xl font-black text-slate-900">{grants.filter((grant) => grant.status === 'active').length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Latest Hash</div>
                  <div className="text-xs font-mono text-slate-800 break-all mt-1">{details.integrity?.latestHash || 'n/a'}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={exportOfficerReport}
                  disabled={reportLoading}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-70"
                >
                  {reportLoading ? 'Generating PDF...' : 'Export Calibrated PDF'}
                </button>
                <button
                  onClick={verifyIntegrity}
                  disabled={verifyLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-70"
                >
                  {verifyLoading ? 'Verifying...' : 'Verify Integrity'}
                </button>
                {!!reportDownloadUrl && (
                  <a
                    href={reportDownloadUrl}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                  >
                    Download Report
                  </a>
                )}
              </div>
              {!!reportStatus && <p className="text-sm text-slate-600 mt-3">{reportStatus}</p>}
              {!!verifyError && <p className="text-sm text-rose-700 mt-2">{verifyError}</p>}
              <p className="text-xs text-slate-500 mt-3">The PDF export uses a structured forensic layout with section headers, summary cards, and explicit integrity footer.</p>
            </div>

            {verifyResult && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900">Integrity Verification Proof</h3>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div>
                      Chain Status:{' '}
                      <span className={verifyResult.verification.chainValid ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                        {verifyResult.verification.chainValid ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <div>Total entries: {verifyResult.verification.totalEntries}</div>
                    <div className="break-all">Latest hash: {verifyResult.verification.latestHash}</div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div>Anchor queue entries: {verifyResult.verification.anchorEvidence.queueEntriesForCase}</div>
                    <div>Profile digest anchored: {verifyResult.verification.anchorEvidence.profileAnchored ? 'Yes' : 'No'}</div>
                    <div>Fragments digest anchored: {verifyResult.verification.anchorEvidence.fragmentsAnchored ? 'Yes' : 'No'}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900 mb-2">Per Testimony Batch Proof</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {verifyResult.verification.batchProofs.map((proof) => (
                      <div key={proof.batchType} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900 capitalize">{proof.batchType}</div>
                          <span className={proof.pass ? 'text-emerald-700 font-semibold text-xs' : 'text-rose-700 font-semibold text-xs'}>
                            {proof.pass ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 mt-1">Items: {proof.itemCount}</div>
                        <div className="text-xs text-slate-700 break-all">Batch hash: {proof.batchHash}</div>
                        {proof.reasons.length > 0 && (
                          <div className="text-xs text-slate-600 mt-2">
                            {proof.reasons.join(' | ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900 mb-2">Chain Link Checks</div>
                  <div className="space-y-2">
                    {verifyResult.verification.chainChecks.map((check) => (
                      <div key={check.entryId} className="text-xs border border-slate-200 rounded-lg p-2 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{check.payloadType}</span>
                          <span className={check.linked ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                            {check.linked ? 'Linked' : 'Broken'}
                          </span>
                        </div>
                        <div className="text-slate-600">At: {check.createdAt}</div>
                        {!check.linked && (
                          <div className="text-rose-700 mt-1">Prev-hash mismatch detected for this entry.</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900">Victim Profile</h3>
                <div className="mt-3 text-sm text-slate-700 space-y-3">
                  {keyValuePairs.map((entry) => (
                    <div key={entry.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">{entry.label}</div>
                      <div className="mt-1 text-slate-800 whitespace-pre-wrap break-words">{entry.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Fingerprint size={16} /> Integrity
                </h3>
                <div className="mt-3 text-sm text-slate-700 space-y-2">
                  <div>Total Entries: {details.integrity?.totalEntries || 0}</div>
                  <div>Latest Entry: {details.integrity?.latestEntryAt || 'n/a'}</div>
                  <div className="break-all">Latest Hash: {details.integrity?.latestHash || 'n/a'}</div>
                  <div>Latest Source: {String(details.metadata?.source || 'n/a')}</div>
                  <div>Last Updated Source: {String(details.metadata?.lastUpdatedAt || 'n/a')}</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900">Capture Summary</h3>
              <p className="text-xs text-slate-500 mt-1">Derived from uploaded tags and case payload metadata.</p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Writing: {captureSummary.writingCount}</div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Voice: {captureSummary.voiceCount}</div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Drawing: {captureSummary.drawingCount}</div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Uploads: {captureSummary.uploadCount}</div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Other: {captureSummary.otherCount}</div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Source: {captureSummary.latestSource || 'n/a'}</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900">Raksha Chat Timeline</h3>
              <p className="text-xs text-slate-500 mt-1">Saved adversarial summaries from survivor runs, formatted as a readable officer review thread.</p>

              {rakshaSummaries.length === 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No Raksha summary snapshots saved yet.
                </div>
              )}

              <div className="mt-4 space-y-5">
                {rakshaSummaries.map((snapshot, index) => (
                  <div key={`${snapshot.createdAt}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500 mb-2">
                      Run at: {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'n/a'} | Source: {snapshot.source || 'n/a'}
                    </div>

                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 text-white px-4 py-3 text-sm leading-relaxed shadow-sm">
                        {snapshot.statement || 'No statement captured for this run.'}
                      </div>
                    </div>

                    <div className="mt-3 flex justify-start">
                      <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-3 text-sm text-slate-700 shadow-sm space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="rounded-lg bg-slate-100 px-2 py-1">Strength: {snapshot.strengthScore ?? 'n/a'}</div>
                          <div className="rounded-lg bg-slate-100 px-2 py-1">Readiness: {snapshot.readinessScore ?? 'n/a'}</div>
                          <div className="rounded-lg bg-slate-100 px-2 py-1">Trauma: {snapshot.traumaBand || 'n/a'}</div>
                          <div className="rounded-lg bg-slate-100 px-2 py-1">Distress: {snapshot.distressBand || 'n/a'}</div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Summary</div>
                          <div className="mt-1">{snapshot.aiSummary || 'No summary available.'}</div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-rose-600">Virodhi Pressure Points</div>
                            <div className="mt-1 space-y-1">
                              {(snapshot.virodhi || []).slice(0, 4).map((item, itemIdx) => (
                                <div key={`v-${itemIdx}`} className="text-xs">- {item}</div>
                              ))}
                              {(snapshot.virodhi || []).length === 0 && <div className="text-xs text-slate-500">- none</div>}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Raksha Counter Strategy</div>
                            <div className="mt-1 space-y-1">
                              {(snapshot.raksha || []).slice(0, 4).map((item, itemIdx) => (
                                <div key={`r-${itemIdx}`} className="text-xs">- {item}</div>
                              ))}
                              {(snapshot.raksha || []).length === 0 && <div className="text-xs text-slate-500">- none</div>}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legal Suggestions</div>
                            <div className="mt-1 space-y-1">
                              {(snapshot.legalSuggestions || []).slice(0, 4).map((item, itemIdx) => (
                                <div key={`l-${itemIdx}`} className="text-xs">- {item}</div>
                              ))}
                              {(snapshot.legalSuggestions || []).length === 0 && <div className="text-xs text-slate-500">- none</div>}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contradiction Risks</div>
                            <div className="mt-1 space-y-1">
                              {(snapshot.contradictionRisks || []).slice(0, 4).map((item, itemIdx) => (
                                <div key={`c-${itemIdx}`} className="text-xs">- {item}</div>
                              ))}
                              {(snapshot.contradictionRisks || []).length === 0 && <div className="text-xs text-slate-500">- none</div>}
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-slate-500">
                          Law model: {snapshot.lawModelSummary || 'n/a'}
                        </div>
                        <div className="text-xs text-slate-500">
                          Temporal window: {snapshot.temporalWindow || 'n/a'} | Fake-victim band: {snapshot.fakeVictimBand || 'n/a'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck size={16} /> Victim Fragments
              </h3>
              <div className="mt-3 space-y-2">
                {(details.victimFragments || []).length === 0 && (
                  <p className="text-sm text-slate-600">No fragments submitted yet.</p>
                )}
                {(details.victimFragments || []).map((item, idx) => (
                  <div key={`${idx}-${item.slice(0, 12)}`} className="text-sm text-slate-700 border border-slate-200 rounded-lg p-3 bg-slate-50">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900">Consent Grants</h3>
              <div className="mt-3 space-y-2">
                {grants.length === 0 && <p className="text-sm text-slate-600">No consent grants found for this case.</p>}
                {grants.map((grant) => (
                  <div key={grant.grantId} className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">{grant.granteeRole} · {grant.purpose}</div>
                    <div className="text-xs mt-1">Grant ID: {grant.grantId}</div>
                    <div className="text-xs">Status: {grant.status}</div>
                    <div className="text-xs break-all">Expires: {grant.expiresAt || 'n/a'}</div>
                    <div className="text-xs mt-1">Requested fields: {(grant.requestedFields || []).join(', ') || 'n/a'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900">Metadata & Raw Payload</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="font-semibold text-slate-900">Metadata JSON</div>
                  <pre className="mt-2 text-[11px] leading-5 whitespace-pre-wrap break-words overflow-auto max-h-72">
                    {JSON.stringify(details.metadata || {}, null, 2)}
                  </pre>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="font-semibold text-slate-900">Captured Fragment List</div>
                  <pre className="mt-2 text-[11px] leading-5 whitespace-pre-wrap break-words overflow-auto max-h-72">
                    {JSON.stringify(details.victimFragments || [], null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900">Testimonies By Type</h3>
              <p className="text-xs text-slate-500 mt-1">Officer-ready grouping for writing, voice, drawing, and uploaded evidence.</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900">Writing ({testimonyBuckets.writing.length})</div>
                  <div className="mt-2 space-y-2">
                    {testimonyBuckets.writing.slice(0, 8).map((item, idx) => (
                      <div key={`wr-${idx}`} className="text-xs text-slate-700">{idx + 1}. {item}</div>
                    ))}
                    {testimonyBuckets.writing.length === 0 && <div className="text-xs text-slate-500">No writing testimony yet.</div>}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900">Voice ({testimonyBuckets.voice.length})</div>
                  <div className="mt-2 space-y-2">
                    {testimonyBuckets.voice.slice(0, 8).map((item, idx) => (
                      <div key={`vo-${idx}`} className="text-xs text-slate-700">{idx + 1}. {item}</div>
                    ))}
                    {testimonyBuckets.voice.length === 0 && <div className="text-xs text-slate-500">No voice testimony yet.</div>}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900">Drawing ({testimonyBuckets.drawing.length})</div>
                  <div className="mt-2 space-y-2">
                    {testimonyBuckets.drawing.slice(0, 8).map((item, idx) => (
                      <div key={`dr-${idx}`} className="text-xs text-slate-700">{idx + 1}. {item}</div>
                    ))}
                    {testimonyBuckets.drawing.length === 0 && <div className="text-xs text-slate-500">No drawing testimony yet.</div>}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900">Uploads ({testimonyBuckets.upload.length})</div>
                  <div className="mt-2 space-y-2">
                    {testimonyBuckets.upload.slice(0, 8).map((item, idx) => (
                      <div key={`up-${idx}`} className="text-xs text-slate-700">{idx + 1}. {item}</div>
                    ))}
                    {testimonyBuckets.upload.length === 0 && <div className="text-xs text-slate-500">No uploaded evidence testimony yet.</div>}
                  </div>
                </div>
              </div>

              {testimonyBuckets.other.length > 0 && (
                <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="text-sm font-semibold text-slate-900">Other Tagged Fragments ({testimonyBuckets.other.length})</div>
                  <div className="mt-2 space-y-2">
                    {testimonyBuckets.other.slice(0, 8).map((item, idx) => (
                      <div key={`ot-${idx}`} className="text-xs text-slate-700">{idx + 1}. {item}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900">Legal Suggestions</h3>
                <div className="mt-3 space-y-2">
                  {(details.intelligence?.legalSuggestions || []).length === 0 && (
                    <p className="text-sm text-slate-600">No legal suggestions available.</p>
                  )}
                  {(details.intelligence?.legalSuggestions || []).map((item, idx) => (
                    <div key={`${item.code}-${idx}`} className="text-sm text-slate-700 border border-slate-200 rounded-lg p-3 bg-slate-50">
                      <div className="font-semibold">{item.code}: {item.title}</div>
                      <div className="text-xs mt-1">{item.why}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900">Victim Authenticity Risk Guard</h3>
                <div className="mt-3 text-sm text-slate-700 space-y-2">
                  <div>Probability: {details.intelligence?.fakeVictimAssessment?.probability ?? 'n/a'}</div>
                  <div>Band: {details.intelligence?.fakeVictimAssessment?.band ?? 'n/a'}</div>
                  <div>Flags: {(details.intelligence?.fakeVictimAssessment?.flags || []).join(', ') || 'none'}</div>
                  <div className="text-xs text-slate-500">
                    {details.intelligence?.fakeVictimAssessment?.disclaimer || 'Assistive signal only. Final legal decisions require human review.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900">ML Prediction Snapshot</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="font-semibold">Provider Status</div>
                  <div className="text-xs mt-2 space-y-1">
                    {Object.entries(details.intelligence?.mlPredictions?.providerStatus || {}).map(([key, value]) => (
                      <div key={key}>{key}: {value}</div>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="font-semibold">Legal Model</div>
                  <div className="text-xs mt-2">Summary: {String((details.intelligence?.mlPredictions?.legal as any)?.summary || 'n/a')}</div>
                  <div className="text-xs">Confidence: {String((details.intelligence?.mlPredictions?.legal as any)?.confidence || 'n/a')}</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="font-semibold">Temporal Model</div>
                  <div className="text-xs mt-2">Rationale: {String((details.intelligence?.mlPredictions?.temporal as any)?.rationale || 'n/a')}</div>
                  <div className="text-xs">Window: {String((details.intelligence?.mlPredictions?.temporal as any)?.start_date || (details.intelligence?.mlPredictions?.temporal as any)?.startDate || 'n/a')} - {String((details.intelligence?.mlPredictions?.temporal as any)?.end_date || (details.intelligence?.mlPredictions?.temporal as any)?.endDate || 'n/a')}</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="font-semibold">Trauma & Distress Models</div>
                  <div className="text-xs mt-2">Trauma band: {String((details.intelligence?.mlPredictions?.trauma as any)?.band || 'n/a')}</div>
                  <div className="text-xs">Distress band: {String((details.intelligence?.mlPredictions?.distress as any)?.band || 'n/a')}</div>
                  <div className="text-xs">Distress score: {String((details.intelligence?.mlPredictions?.distress as any)?.score || 'n/a')}</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-900">Evidence Leads & Contradiction Risks</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">Evidence Leads</div>
                  {(details.intelligence?.evidenceLeads || []).map((lead, idx) => (
                    <div key={`${lead.type}-${idx}`} className="text-xs text-slate-700 border border-slate-200 rounded-lg p-3 bg-slate-50 mb-2">
                      <div className="font-semibold">{lead.type} ({lead.source})</div>
                      <div>{lead.query}</div>
                      <div>Confidence: {lead.confidence}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">Contradiction Risks</div>
                  {(details.intelligence?.contradictionRisks || []).map((risk, idx) => (
                    <div key={`${risk.title}-${idx}`} className="text-xs text-slate-700 border border-slate-200 rounded-lg p-3 bg-slate-50 mb-2">
                      <div className="font-semibold">{risk.level}: {risk.title}</div>
                      <div>{risk.detail}</div>
                      {risk.mitigation && <div className="mt-1">Mitigation: {risk.mitigation}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
