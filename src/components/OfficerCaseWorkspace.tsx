import React, { useEffect, useState } from 'react';
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
  integrity?: {
    totalEntries: number;
    latestHash?: string | null;
    latestEntryAt?: string | null;
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
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
