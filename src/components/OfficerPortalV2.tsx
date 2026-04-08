import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
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
  CheckCircle2,
  XCircle,
} from 'lucide-react';

type CaseAssignment = {
  caseId: string;
  caseNumber: string;
  victimUniqueId: string;
  createdAt: string;
  designationId?: string;
  role?: string;
};

type AccessCheckResult = {
  approved: boolean;
  reason: string;
  failedAt?: string;
  designationId?: string;
};

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
  integrity?: {
    totalEntries: number;
    latestHash?: string | null;
    latestEntryAt?: string | null;
  };
};

function summarizeTestimonyBuckets(fragments: string[] = []) {
  const counts = {
    writing: 0,
    voice: 0,
    drawing: 0,
    upload: 0,
    other: 0,
  };

  for (const fragment of fragments) {
    const raw = String(fragment || '').trim().toLowerCase();
    const tag = raw.match(/^\[([^\]]+)\]/)?.[1] || '';

    if (tag.includes('voice')) counts.voice += 1;
    else if (tag.includes('draw')) counts.drawing += 1;
    else if (tag.includes('upload')) counts.upload += 1;
    else if (tag.includes('write') || tag.includes('text') || tag.includes('case-summary') || tag.includes('dashboard-case-brief')) counts.writing += 1;
    else counts.other += 1;
  }

  return counts;
}

export function OfficerPortalV2() {
  const navigate = useNavigate();
  const [officerId, setOfficerId] = useState('OFF-IND-221');
  const [role, setRole] = useState('Police Officer');
  const actorRole = role === 'Lawyer' ? 'lawyer' : 'police';
  const [assignedCases, setAssignedCases] = useState<CaseAssignment[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [accessResult, setAccessResult] = useState<AccessCheckResult | null>(null);
  const [caseDetails, setCaseDetails] = useState<DetailedCase | null>(null);
  const [error, setError] = useState('');

  // Load assigned cases when officer ID changes
  useEffect(() => {
    const loadCases = async () => {
      if (!officerId.trim()) {
        setAssignedCases([]);
        return;
      }

      setIsLoadingCases(true);
      try {
        const resp = await fetch('/api/officer/list-assigned-cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ officerId: officerId.trim(), role: actorRole }),
        });

        if (!resp.ok) {
          throw new Error('Failed to load assigned cases');
        }

        const data = await resp.json();
        setAssignedCases(data.assignedCases || []);
        setError('');
      } catch (err: any) {
        setError(err.message || 'Error loading cases');
        setAssignedCases([]);
      } finally {
        setIsLoadingCases(false);
      }
    };

    loadCases();
  }, [officerId, actorRole]);

  const verifyAccess = async (caseId: string) => {
    setIsVerifying(true);
    setAccessResult(null);

    try {
      const resp = await fetch('/api/officer/verify-case-access-waterproof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officerId: officerId.trim(),
          caseId,
          role: actorRole,
          purpose: actorRole === 'police' ? 'police_share' : 'lawyer_share',
          requestedFields: ['full_case_timeline', 'victim_media', 'ai_analysis'],
        }),
      });

      const data = await resp.json();
      setAccessResult(data);

      if (data.approved) {
        const detailsResp = await fetch(
          `/api/case/${encodeURIComponent(caseId)}/details?officerId=${encodeURIComponent(officerId.trim())}&officerRole=${encodeURIComponent(actorRole)}`
        );
        if (!detailsResp.ok) {
          const errorText = await detailsResp.text().catch(() => '');
          setCaseDetails(null);
          setSelectedCaseId(caseId);
          setAccessResult({
            approved: true,
            reason: errorText || 'Access approved. Case details are temporarily unavailable, opening limited workspace.',
            designationId: data.designationId,
          });
          navigate(
            `/officer-portal/case/${encodeURIComponent(caseId)}?officerId=${encodeURIComponent(
              officerId.trim()
            )}&officerPost=${encodeURIComponent(role)}&officerRole=${encodeURIComponent(actorRole)}`
          );
          return;
        }
        const detailsData = (await detailsResp.json()) as DetailedCase;
        setCaseDetails(detailsData);
        setSelectedCaseId(caseId);

        // Move officer to dedicated secure workspace once all gates pass.
        navigate(
          `/officer-portal/case/${encodeURIComponent(caseId)}?officerId=${encodeURIComponent(
            officerId.trim()
          )}&officerPost=${encodeURIComponent(role)}&officerRole=${encodeURIComponent(actorRole)}`
        );
      } else {
        setSelectedCaseId(null);
        setCaseDetails(null);
      }
    } catch (err: any) {
      setAccessResult({
        approved: false,
        reason: err.message || 'Verification failed',
        failedAt: 'UNKNOWN',
      });
      setCaseDetails(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const selectedCase = assignedCases.find((c) => c.caseId === selectedCaseId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-2">Officer Portal</h1>
          <p className="text-lg text-slate-600">Access cases you're designated for</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Login */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <UserRound size={24} />
                Officer Identity
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Officer ID</label>
                  <input
                    value={officerId}
                    onChange={(e) => setOfficerId(e.target.value)}
                    placeholder="OFF-IND-221"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
                  />
                  <p className="text-xs text-slate-500 mt-1">Your unique officer identifier</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
                  >
                    <option>Police Officer</option>
                    <option>Lawyer</option>
                    <option>Law Enforcement Agent</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  {error}
                </div>
              )}

              {isLoadingCases && (
                <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2 text-indigo-700">
                  <Activity size={16} className="animate-spin" />
                  Loading your assigned cases...
                </div>
              )}

              {!isLoadingCases && assignedCases.length > 0 && (
                <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-semibold">
                  {assignedCases.length} case(s) assigned to you
                </div>
              )}

              {!isLoadingCases && assignedCases.length === 0 && officerId.trim() && !error && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  No cases assigned yet. Contact your administrator.
                </div>
              )}
            </div>
          </motion.div>

          {/* Middle Panel: Assigned Cases */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1"
          >
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Briefcase size={24} />
                Assigned Cases
              </h2>

              <div className="space-y-3">
                {assignedCases.map((caseItem) => (
                  <motion.button
                    key={caseItem.caseId}
                    onClick={() => verifyAccess(caseItem.caseId)}
                    disabled={isVerifying}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      selectedCaseId === caseItem.caseId
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div className="font-bold text-slate-900">{caseItem.caseNumber}</div>
                    <div className="text-xs text-slate-500 mt-1">Victim: {caseItem.victimUniqueId}</div>
                    <div className="text-xs text-slate-500">Created: {new Date(caseItem.createdAt).toLocaleDateString()}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right Panel: Access Verification Result */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-1"
          >
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Lock size={24} />
                Access Status
              </h2>

              {isVerifying && (
                <div className="p-6 text-center">
                  <Activity size={48} className="animate-spin text-indigo-600 mx-auto mb-4" />
                  <p className="text-slate-600 font-semibold">Verifying access...</p>
                  <p className="text-xs text-slate-500 mt-2">Checking: Designation → Role → Policy → Grant</p>
                </div>
              )}

              {!isVerifying && accessResult && (
                <div
                  className={`p-4 rounded-lg border-2 ${
                    accessResult.approved
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {accessResult.approved ? (
                      <CheckCircle2 size={24} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={24} className="text-rose-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className={`font-bold ${accessResult.approved ? 'text-emerald-900' : 'text-rose-900'}`}>
                        {accessResult.approved ? '✅ Access Approved' : '❌ Access Denied'}
                      </div>
                      <div className={`text-sm mt-1 ${accessResult.approved ? 'text-emerald-800' : 'text-rose-800'}`}>
                        {accessResult.reason}
                      </div>
                      {accessResult.failedAt && (
                        <div className="text-xs text-rose-700 mt-2">
                          Failed at: <span className="font-mono font-bold">{accessResult.failedAt}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!isVerifying && !accessResult && (
                <div className="p-6 text-center text-slate-500">
                  <Lock size={40} className="mx-auto mb-3 opacity-30" />
                  <p>Select a case and verify access</p>
                </div>
              )}

              {selectedCase && accessResult?.approved && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg"
                >
                  <h3 className="font-bold text-indigo-900 mb-3">Case Details</h3>
                  <div className="space-y-2 text-sm text-indigo-800">
                    <div>
                      <span className="font-semibold">Case ID:</span> {selectedCase.caseId}
                    </div>
                    <div>
                      <span className="font-semibold">Case Number:</span> {selectedCase.caseNumber}
                    </div>
                    <div>
                      <span className="font-semibold">Victim UID:</span> {selectedCase.victimUniqueId}
                    </div>
                    <div>
                      <span className="font-semibold">Your Role:</span> {selectedCase.role}
                    </div>
                    {caseDetails?.victimProfile?.displayName && (
                      <div>
                        <span className="font-semibold">Victim Name:</span> {caseDetails.victimProfile.displayName}
                      </div>
                    )}
                    {caseDetails?.victimProfile?.email && (
                      <div>
                        <span className="font-semibold">Victim Email:</span> {caseDetails.victimProfile.email}
                      </div>
                    )}
                    {caseDetails?.victimProfile?.incidentSummary && (
                      <div>
                        <span className="font-semibold">Incident Summary:</span> {caseDetails.victimProfile.incidentSummary}
                      </div>
                    )}
                    <div>
                      <span className="font-semibold">Fragments:</span> {caseDetails?.victimFragments?.length || 0}
                    </div>
                    {caseDetails?.victimFragments && (
                      <div>
                        <span className="font-semibold">Testimony Mix:</span>{' '}
                        {(() => {
                          const c = summarizeTestimonyBuckets(caseDetails.victimFragments || []);
                          return `write ${c.writing}, voice ${c.voice}, draw ${c.drawing}, upload ${c.upload}, other ${c.other}`;
                        })()}
                      </div>
                    )}
                    {caseDetails?.integrity?.latestHash && (
                      <div>
                        <span className="font-semibold">Integrity Hash:</span>{' '}
                        <span className="font-mono text-xs">{caseDetails.integrity.latestHash.slice(0, 20)}...</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Information Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck size={18} className="text-indigo-600" />
              <p className="font-semibold text-slate-700">Designation</p>
            </div>
            <p className="text-xs text-slate-600">Your case assignment</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={18} className="text-blue-600" />
              <p className="font-semibold text-slate-700">Role Scope</p>
            </div>
            <p className="text-xs text-slate-600">Your access permissions</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Fingerprint size={18} className="text-purple-600" />
              <p className="font-semibold text-slate-700">Policy</p>
            </div>
            <p className="text-xs text-slate-600">Consent policy check</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <p className="font-semibold text-slate-700">Grant</p>
            </div>
            <p className="text-xs text-slate-600">Active consent grant</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
