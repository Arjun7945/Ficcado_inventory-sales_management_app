'use client';

/**
 * app/(app)/dashboard/admin/page.tsx
 * Admin Control Centre — manage admins, Sheet Configuration, and system setup.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface AdminUser {
  sno: string;
  adminName: string;
  phone: string;
  email: string;
  notifications: string;
  createdAt: string;
}

interface SheetConfigEntry {
  moduleKey: string;
  displayName: string;
  spreadsheetId: string;
  tabName: string;
}

export default function AdminControlPage() {
  const [activeTab, setActiveTab] = useState<'admins' | 'sheets'>('admins');
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [sheets, setSheets] = useState<SheetConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  // New admin state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailId, setEmailId] = useState('');
  const [password, setPassword] = useState('');
  const [submittingAdmin, setSubmittingAdmin] = useState(false);
  const [adminFormError, setAdminFormError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [admRes, sheetRes] = await Promise.all([
        fetch('/api/admins').then((r) => r.json()),
        fetch('/api/sheet-config').then((r) => r.json()),
      ]);

      if (admRes.admins) setAdmins(admRes.admins);
      if (sheetRes.configs) setSheets(sheetRes.configs);
    } catch {
      setError({ message: "Couldn't load admin data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminFormError(null);

    if (!adminName.trim()) { setAdminFormError('Admin name is required'); return; }
    if (!/^\d{10}$/.test(phoneNumber)) { setAdminFormError('Enter a 10-digit phone number'); return; }
    if (!emailId.includes('@')) { setAdminFormError('Enter a valid email address'); return; }
    if (password.length < 8) { setAdminFormError('Password must be at least 8 characters'); return; }

    setSubmittingAdmin(true);
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName, phoneNumber, emailId, password, notifications: 'Enabled' }),
      });
      const data = await res.json();
      if (!res.ok) { setAdminFormError(data.error || 'Failed to create admin'); return; }

      setShowAdminModal(false);
      setAdminName(''); setPhoneNumber(''); setEmailId(''); setPassword('');
      loadData();
    } catch {
      setAdminFormError("Couldn't connect to server.");
    } finally {
      setSubmittingAdmin(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label="Loading Admin Control Centre…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Control Centre</h1>
          <div className="page-subtitle">Manage system administrators and Google Sheet mappings</div>
        </div>
        {activeTab === 'admins' && (
          <button className="btn btn-primary" onClick={() => setShowAdminModal(true)}>
            + Add Admin
          </button>
        )}
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      <div className="tab-list">
        <div
          className={`tab-item ${activeTab === 'admins' ? 'active' : ''}`}
          onClick={() => setActiveTab('admins')}
        >
          Admin Accounts ({admins.length})
        </div>
        <div
          className={`tab-item ${activeTab === 'sheets' ? 'active' : ''}`}
          onClick={() => setActiveTab('sheets')}
        >
          Sheet Configuration ({sheets.length})
        </div>
      </div>

      {activeTab === 'admins' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {admins.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 28 }}>⚙</div>
              <div className="empty-state-title">No additional admin accounts</div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
                Click "+ Add Admin" to invite team members.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Admin Name</th>
                    <th>Email ID</th>
                    <th>Phone Number</th>
                    <th>Notifications</th>
                    <th>Date Added</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((adm) => (
                    <tr key={adm.email + adm.sno}>
                      <td style={{ fontWeight: 600 }}>{adm.adminName}</td>
                      <td>{adm.email}</td>
                      <td>{adm.phone}</td>
                      <td>
                        <span className={`badge ${adm.notifications === 'Enabled' ? 'badge-success' : 'badge-neutral'}`}>
                          {adm.notifications}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                        {adm.createdAt ? new Date(adm.createdAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sheets' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Display Name</th>
                  <th>Spreadsheet ID</th>
                  <th>Tab Name</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((sh) => (
                  <tr key={sh.moduleKey}>
                    <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{sh.moduleKey}</td>
                    <td>{sh.displayName}</td>
                    <td className="tabular-nums" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                      {sh.spreadsheetId}
                    </td>
                    <td>
                      <span className="badge badge-neutral">{sh.tabName}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdminModal && (
        <div className="modal-backdrop" onClick={() => setShowAdminModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Add Admin Account</h2>
              <button className="btn-icon" onClick={() => setShowAdminModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateAdmin}>
              <div className="modal-body">
                {adminFormError && <ErrorMessage message={adminFormError} variant="error" />}

                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. Rohith Kumar"
                    autoFocus
                  />
                </div>

                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      type="tel"
                      className="form-input"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="10 digits"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      className="form-input"
                      value={emailId}
                      onChange={(e) => setEmailId(e.target.value)}
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Temporary Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAdminModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submittingAdmin}>
                  {submittingAdmin ? <LoadingGecko size="inline" label="Creating…" /> : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
