import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Fingerprint, ShieldCheck } from 'lucide-react';

type DetailedCase = {
  caseId: string;
  caseNumber: string;
  victimUniqueId: string;
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
      } catch (e: any) {
        setError(e.message || 'Unable to load case workspace');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [caseId, officerId]);

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
                <div className="mt-3 text-sm text-slate-700 space-y-2">
                  <div>Name: {details.victimProfile?.displayName || 'n/a'}</div>
                  <div>Email: {details.victimProfile?.email || 'n/a'}</div>
                  <div>Phone: {details.victimProfile?.phone || 'n/a'}</div>
                  <div>Emergency Contact: {details.victimProfile?.emergencyContact || 'n/a'}</div>
                  <div>Summary: {details.victimProfile?.incidentSummary || 'n/a'}</div>
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
                </div>
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
