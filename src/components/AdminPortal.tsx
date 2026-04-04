import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ShieldCheck, UserRoundPlus, UserRoundX } from 'lucide-react';

type AssignedOfficer = {
  designationId: string;
  officerId: string;
  role: 'police' | 'lawyer' | 'admin';
  designatedAt: string;
  expiresAt?: string;
};

type AdminCase = {
  caseId: string;
  caseNumber: string;
  victimUniqueId: string;
  createdAt: string;
  isAssigned: boolean;
  fragmentCount: number;
  victimProfileUpdatedAt: string | null;
  victimDisplayName: string | null;
  victimEmail: string | null;
  victimPhone: string | null;
  emergencyContact: string | null;
  incidentSummary: string | null;
  latestFragmentPreview: string | null;
  latestIntegrityHash: string | null;
  integrityEntryCount: number;
  lastUpdateSource: string | null;
  assignedTo: AssignedOfficer[];
};

type OverviewResponse = {
  stats: {
    activeCaseCount: number;
    assignedCaseCount: number;
    unassignedCaseCount: number;
  };
  generatedAt: string;
  cases: AdminCase[];
};

async function parseApiResponse(resp: Response) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected server response (${resp.status}).`);
  }
}

export function AdminPortal() {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [officerId, setOfficerId] = useState('OFF-IND-221');
  const [role, setRole] = useState<'police' | 'lawyer' | 'admin'>('police');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [newVictimUniqueId, setNewVictimUniqueId] = useState('');
  const [newVictimEmail, setNewVictimEmail] = useState('');
  const [newVictimDisplayName, setNewVictimDisplayName] = useState('');

  useEffect(() => {
    const cached = window.sessionStorage.getItem('saakshi_admin_token') || '';
    if (cached) setAdminToken(cached);
  }, []);

  const apiJson = async (url: string, init: RequestInit = {}) => {
    const resp = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'x-admin-session': adminToken } : {}),
        ...(init.headers || {}),
      },
    });
    const data = await parseApiResponse(resp);
    if (!resp.ok) {
      throw new Error(data?.error || `Request failed (${resp.status})`);
    }
    return data;
  };

  const loadOverview = async () => {
    if (!adminToken) return;
    setBusy(true);
    setError('');
    try {
      const data = (await apiJson('/api/admin/cases-overview')) as OverviewResponse;
      setOverview(data);
      if (!selectedCaseId && data.cases.length > 0) {
        setSelectedCaseId(data.cases[0].caseId);
      }
    } catch (e: any) {
      setError(e.message || 'Unable to load overview');
      setOverview(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) return;
    const id = window.setInterval(() => {
      loadOverview();
    }, 15000);
    return () => window.clearInterval(id);
  }, [adminToken]);

  const loginAdmin = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = (await apiJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: adminEmail.trim(),
          password: adminPassword,
        }),
        headers: {},
      })) as { token: string; admin: { email: string } };

      setAdminToken(data.token);
      window.sessionStorage.setItem('saakshi_admin_token', data.token);
      setNotice(`Signed in as ${data.admin.email}`);
    } catch (e: any) {
      setError(e.message || 'Admin login failed');
    } finally {
      setBusy(false);
    }
  };

  const logoutAdmin = async () => {
    try {
      await apiJson('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore logout API errors and clear local session.
    }
    window.sessionStorage.removeItem('saakshi_admin_token');
    setAdminToken('');
    setOverview(null);
    setSelectedCaseId('');
    setNotice('Signed out');
  };

  const createCase = async () => {
    if (!newVictimUniqueId.trim()) {
      setError('Victim unique ID is required to create a case.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = (await apiJson('/api/admin/create-case', {
        method: 'POST',
        body: JSON.stringify({
          victimUniqueId: newVictimUniqueId.trim(),
          email: newVictimEmail.trim() || undefined,
          displayName: newVictimDisplayName.trim() || undefined,
        }),
      })) as {
        caseAssignment?: { caseId: string; caseNumber: string };
        isNew: boolean;
        message?: string;
      };

      if (data.caseAssignment?.caseId) {
        setSelectedCaseId(data.caseAssignment.caseId);
      }
      setNotice(data.message || (data.isNew ? 'Case created.' : 'Case already existed.'));
      await loadOverview();
    } catch (e: any) {
      setError(e.message || 'Failed to create case');
    } finally {
      setBusy(false);
    }
  };

  const selectedCase = useMemo(
    () => overview?.cases.find((c) => c.caseId === selectedCaseId),
    [overview, selectedCaseId]
  );

  const assignOfficer = async () => {
    if (!selectedCaseId || !officerId.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const resp = await fetch('/api/admin/designate-officer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-admin-session': adminToken } : {}),
        },
        body: JSON.stringify({
          caseId: selectedCaseId,
          officerId: officerId.trim(),
          role,
          expiresAt: expiresAt || undefined,
        }),
      });
      const data = await parseApiResponse(resp);
      if (!resp.ok) throw new Error(data?.error || 'Designation failed');
      setNotice(`Assigned ${officerId.trim()} to ${selectedCase?.caseNumber || selectedCaseId}`);
      await loadOverview();
    } catch (e: any) {
      setError(e.message || 'Failed to assign officer');
    } finally {
      setBusy(false);
    }
  };

  const unassignOfficer = async (designationId: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const resp = await fetch('/api/admin/unassign-officer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-admin-session': adminToken } : {}),
        },
        body: JSON.stringify({
          designationId,
          reason: 'Unassigned from admin portal',
        }),
      });
      const data = await parseApiResponse(resp);
      if (!resp.ok) throw new Error(data?.error || 'Unassignment failed');
      setNotice(`Unassigned ${data.officerId} from case`);
      await loadOverview();
    } catch (e: any) {
      setError(e.message || 'Failed to unassign officer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h1 className="text-3xl font-black text-slate-900">Admin Case Control Center</h1>
          <p className="text-slate-600 mt-2">Assign and unassign officers, monitor active cases, and track case freshness timestamps.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700">Admin Email</label>
              <input
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="mt-1 w-full px-4 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Password</label>
              <input
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                type="password"
                className="mt-1 w-full px-4 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div className="flex items-end gap-2">
              {!adminToken ? (
                <button
                  onClick={loginAdmin}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold"
                  disabled={busy}
                >
                  Sign In
                </button>
              ) : (
                <button
                  onClick={logoutAdmin}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>

        {!adminToken && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">
            Admin session is required. Sign in first to load case controls.
          </div>
        )}

        {overview && adminToken && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Active cases</div>
              <div className="text-3xl font-black text-slate-900">{overview.stats.activeCaseCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Assigned</div>
              <div className="text-3xl font-black text-emerald-700">{overview.stats.assignedCaseCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Unassigned</div>
              <div className="text-3xl font-black text-amber-700">{overview.stats.unassignedCaseCount}</div>
            </div>
          </div>
        )}

        {adminToken && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="text-xl font-bold text-slate-900">Create Case (Admin Bootstrap)</h2>
            <p className="text-sm text-slate-600">Use this when victim onboarding has not yet created a backend case entry.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={newVictimUniqueId}
                onChange={(e) => setNewVictimUniqueId(e.target.value)}
                placeholder="Victim unique ID"
                className="w-full px-4 py-2 rounded-lg border border-slate-300"
              />
              <input
                value={newVictimEmail}
                onChange={(e) => setNewVictimEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full px-4 py-2 rounded-lg border border-slate-300"
              />
              <input
                value={newVictimDisplayName}
                onChange={(e) => setNewVictimDisplayName(e.target.value)}
                placeholder="Display name (optional)"
                className="w-full px-4 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <button
              onClick={createCase}
              disabled={busy || !newVictimUniqueId.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50"
            >
              {busy ? 'Working...' : 'Create Case'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Cases</h2>
              <button
                onClick={loadOverview}
                className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-3 max-h-[520px] overflow-auto pr-1">
              {(overview?.cases || []).map((caseItem) => (
                <button
                  key={caseItem.caseId}
                  onClick={() => setSelectedCaseId(caseItem.caseId)}
                  className={`w-full text-left border rounded-xl p-4 transition ${
                    selectedCaseId === caseItem.caseId ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-extrabold text-slate-900">{caseItem.caseNumber}</div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${caseItem.isAssigned ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {caseItem.isAssigned ? 'ASSIGNED' : 'UNASSIGNED'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-700 mt-1">Victim: {caseItem.victimUniqueId}</div>
                  <div className="text-xs text-slate-600">Name: {caseItem.victimDisplayName || 'Not provided'}</div>
                  <div className="text-xs text-slate-600">Email: {caseItem.victimEmail || 'Not provided'}</div>
                  <div className="text-xs text-slate-600">Phone: {caseItem.victimPhone || 'Not provided'}</div>
                  <div className="text-xs text-slate-600">Emergency: {caseItem.emergencyContact || 'Not provided'}</div>
                  <div className="text-xs text-slate-500 mt-1">Created: {new Date(caseItem.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Profile Updated: {caseItem.victimProfileUpdatedAt ? new Date(caseItem.victimProfileUpdatedAt).toLocaleString() : 'Not updated yet'}</div>
                  <div className="text-xs text-slate-500">Fragments: {caseItem.fragmentCount}</div>
                  <div className="text-xs text-slate-500">Integrity entries: {caseItem.integrityEntryCount}</div>
                  <div className="text-xs text-slate-500">Last source: {caseItem.lastUpdateSource || 'unknown'}</div>
                  {caseItem.latestIntegrityHash && (
                    <div className="text-[10px] text-slate-500 break-all">Hash: {caseItem.latestIntegrityHash}</div>
                  )}
                  {caseItem.latestFragmentPreview && (
                    <div className="text-xs text-slate-600 mt-1 italic">"{caseItem.latestFragmentPreview}"</div>
                  )}
                  {caseItem.incidentSummary && (
                    <div className="text-xs text-slate-700 mt-1">Summary: {caseItem.incidentSummary}</div>
                  )}
                </button>
              ))}
              {adminToken && (overview?.cases || []).length === 0 && (
                <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl p-4">
                  No cases available yet. Create a victim case first via mobile or victim onboarding flow.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Assignment Controls</h2>

            <div>
              <label className="text-sm font-semibold text-slate-700">Selected Case</label>
              <div className="mt-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
                {selectedCase ? `${selectedCase.caseNumber} (${selectedCase.caseId})` : 'Select a case from left panel'}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Officer ID</label>
              <input
                value={officerId}
                onChange={(e) => setOfficerId(e.target.value)}
                className="mt-1 w-full px-4 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'police' | 'lawyer' | 'admin')}
                className="mt-1 w-full px-4 py-2 rounded-lg border border-slate-300"
              >
                <option value="police">police</option>
                <option value="lawyer">lawyer</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Expires At (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1 w-full px-4 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <button
              onClick={assignOfficer}
              disabled={!selectedCaseId || busy || !adminToken}
              className="w-full bg-indigo-600 text-white font-semibold px-4 py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Activity size={16} className="animate-spin" /> : <UserRoundPlus size={16} />}
              Assign Officer
            </button>

            {selectedCase && selectedCase.assignedTo.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck size={16} />
                  Current Assignees
                </h3>
                <div className="mt-2 space-y-2">
                  {selectedCase.assignedTo.map((d) => (
                    <div key={d.designationId} className="text-xs border border-slate-200 rounded-lg p-2 bg-slate-50">
                      <div className="font-semibold text-slate-700">{d.officerId} ({d.role})</div>
                      <div className="text-slate-500">Designated: {new Date(d.designatedAt).toLocaleString()}</div>
                      <button
                        onClick={() => unassignOfficer(d.designationId)}
                        className="mt-2 text-rose-700 text-xs font-semibold flex items-center gap-1"
                      >
                        <UserRoundX size={14} /> Unassign
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notice && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{notice}</div>}
            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
