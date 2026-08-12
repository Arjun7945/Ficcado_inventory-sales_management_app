'use client';

/**
 * app/(app)/dashboard/admin/page.tsx
 * Admin Control Centre — full CRUD for admins, Sheet Configuration editing with test-connection,
 * reporting (on-demand XLSX download + email send), daily report schedule config,
 * and Email Configuration management (Part 6 B1).
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
  salesCreated?: number;
  salesClosed?: number;
  revenueGenerated?: number;
}

interface SheetConfigEntry {
  moduleKey:     string;
  displayName:   string;
  spreadsheetId: string;
  tabName:       string;
}

const REPORT_MODULES = [
  { key: 'items',             label: 'Items Management' },
  { key: 'inventory',         label: 'Inventory Management' },
  { key: 'warehouse',         label: 'Warehouse Management' },
  { key: 'sales',             label: 'Sales Management' },
  { key: 'replacement',       label: 'Replacement Management' },
  { key: 'return_refund',     label: 'Return & Refund Management' },
  { key: 'customer_info',     label: 'Customer Information' },
  { key: 'inventory_history', label: 'Inventory History' },
  { key: 'damaged_products',  label: 'Damaged Products' },
  { key: 'notes',             label: 'Notes Management' },
  { key: 'activity_logs',     label: 'Activity Logs' },
  { key: 'sales_log',         label: 'Sales Log Audit' },
];

export default function AdminControlPage() {
  const [activeTab, setActiveTab] = useState<'admins' | 'sheets' | 'reports' | 'email'>('admins');
  const [admins, setAdmins]       = useState<AdminUser[]>([]);
  const [sheets, setSheets]       = useState<SheetConfigEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<{ message: string } | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  // New admin modal
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminName, setAdminName]           = useState('');
  const [phoneNumber, setPhoneNumber]       = useState('');
  const [emailId, setEmailId]               = useState('');
  const [password, setPassword]             = useState('');
  const [submittingAdmin, setSubmittingAdmin] = useState(false);
  const [adminFormError, setAdminFormError] = useState<string | null>(null);

  // View/Edit Admin Modal
  const [editingAdmin, setEditingAdmin]       = useState<AdminUser | null>(null);
  const [editAdminName, setEditAdminName]     = useState('');
  const [editPhone, setEditPhone]             = useState('');
  const [editEmail, setEditEmail]             = useState('');
  const [editNotifications, setEditNotifications] = useState('Enabled');
  const [savingAdminEdit, setSavingAdminEdit] = useState(false);

  function openEditAdminModal(adm: AdminUser) {
    setEditingAdmin(adm);
    setEditAdminName(adm.adminName);
    setEditPhone(adm.phone);
    setEditEmail(adm.email);
    setEditNotifications(adm.notifications || 'Enabled');
    setAdminFormError(null);
  }

  async function handleSaveAdminEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAdmin) return;
    setAdminFormError(null);
    if (!editAdminName.trim()) { setAdminFormError('Admin name is required'); return; }
    if (!/^\d{10}$/.test(editPhone)) { setAdminFormError('Enter a 10-digit phone number'); return; }
    if (!editEmail.includes('@')) { setAdminFormError('Enter a valid email address'); return; }

    setSavingAdminEdit(true);
    try {
      const res = await fetch(`/api/admins/${encodeURIComponent(editingAdmin.adminName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminName: editAdminName,
          phoneNumber: editPhone,
          emailId: editEmail,
          notifications: editNotifications,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAdminFormError(data.error || 'Failed to update admin details'); return; }
      setSuccess(`Admin '${editAdminName}' details updated.`);
      setEditingAdmin(null);
      loadData();
    } catch {
      setAdminFormError("Couldn't save admin changes.");
    } finally {
      setSavingAdminEdit(false);
    }
  }

  // Sheet config editing
  const [editingSheet, setEditingSheet]   = useState<SheetConfigEntry | null>(null);
  const [sheetEditId, setSheetEditId]     = useState('');
  const [sheetEditTab, setSheetEditTab]   = useState('');
  const [sheetEditName, setSheetEditName] = useState('');
  const [testingConn, setTestingConn]     = useState(false);
  const [testResult, setTestResult]       = useState<{ ok: boolean; message: string } | null>(null);
  const [savingSheet, setSavingSheet]     = useState(false);

  // Reports
  const [downloadingModule, setDownloadingModule]   = useState<string | null>(null);
  const [sendingEmail, setSendingEmail]             = useState(false);
  const [reportFrom, setReportFrom]                 = useState('');
  const [reportTo, setReportTo]                     = useState('');
  const [sendTestEmail, setSendTestEmail]           = useState(false);

  // Email Configuration State (Part 6 B1)
  const [currentSenderAddress, setCurrentSenderAddress] = useState<string | null>(null);
  const [hasEmailPassword, setHasEmailPassword]         = useState(false);
  const [showEmailConfigModal, setShowEmailConfigModal] = useState(false);
  const [emailNewAddress, setEmailNewAddress]           = useState('');
  const [emailNewPassword, setEmailNewPassword]         = useState('');
  const [confirmOverwrite, setConfirmOverwrite]         = useState(false);
  const [expandGmailGuide, setExpandGmailGuide]         = useState(false);
  const [emailSaving, setEmailSaving]                   = useState(false);
  const [emailFormError, setEmailFormError]             = useState<string | null>(null);
  const [emailFormSuccess, setEmailFormSuccess]         = useState<string | null>(null);

  async function loadEmailConfig() {
    try {
      const res  = await fetch('/api/setup/email-config');
      const data = await res.json();
      if (res.ok) {
        setCurrentSenderAddress(data.senderAddress);
        setHasEmailPassword(data.hasPassword);
      }
    } catch {
      // Non-critical; email config display degrades gracefully
    }
  }

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

  useEffect(() => { loadData(); loadEmailConfig(); }, []);

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminFormError(null);
    if (!adminName.trim())         { setAdminFormError('Admin name is required'); return; }
    if (!/^\d{10}$/.test(phoneNumber)) { setAdminFormError('Enter a 10-digit phone number'); return; }
    if (!emailId.includes('@'))    { setAdminFormError('Enter a valid email address'); return; }
    if (password.length < 8)       { setAdminFormError('Password must be at least 8 characters'); return; }

    setSubmittingAdmin(true);
    try {
      const res  = await fetch('/api/admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminName, phoneNumber, emailId, password, notifications: 'Enabled' }) });
      const data = await res.json();
      if (!res.ok) { setAdminFormError(data.detail ? `${data.error} — ${data.detail}` : (data.error || 'Failed to create admin')); return; }
      setShowAdminModal(false);
      setAdminName(''); setPhoneNumber(''); setEmailId(''); setPassword('');
      setSuccess('Admin account created successfully.');
      loadData();
    } catch {
      setAdminFormError("Couldn't connect to server.");
    } finally {
      setSubmittingAdmin(false);
    }
  }

  async function handleDeleteAdmin(adm: AdminUser) {
    if (!confirm(`Delete admin '${adm.adminName}'? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admins/${encodeURIComponent(adm.adminName)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(`Admin '${adm.adminName}' deleted.`);
      loadData();
    } catch { setError({ message: "Couldn't delete admin." }); }
  }

  function openSheetEdit(sh: SheetConfigEntry) {
    setEditingSheet(sh);
    setSheetEditId(sh.spreadsheetId);
    setSheetEditTab(sh.tabName);
    setSheetEditName(sh.displayName);
    setTestResult(null);
  }

  async function handleTestConnection() {
    if (!sheetEditId.trim() || !sheetEditTab.trim()) {
      setTestResult({ ok: false, message: 'Enter a Spreadsheet ID and Tab Name first.' });
      return;
    }
    setTestingConn(true);
    setTestResult(null);
    try {
      const res  = await fetch('/api/sheet-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: sheetEditId, tabName: sheetEditTab }),
      });
      const data = await res.json();
      setTestResult({ ok: res.ok, message: data.message || data.error || 'Unknown result' });
    } catch {
      setTestResult({ ok: false, message: "Couldn't reach server." });
    } finally {
      setTestingConn(false);
    }
  }

  async function handleSaveSheet() {
    if (!editingSheet) return;
    if (!sheetEditId.trim())  { setTestResult({ ok: false, message: 'Spreadsheet ID is required.' }); return; }
    if (!sheetEditTab.trim()) { setTestResult({ ok: false, message: 'Tab name is required.' }); return; }

    setSavingSheet(true);
    try {
      const res  = await fetch('/api/sheet-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKey: editingSheet.moduleKey, displayName: sheetEditName || editingSheet.displayName, spreadsheetId: sheetEditId, tabName: sheetEditTab }),
      });
      const data = await res.json();
      if (!res.ok) { setTestResult({ ok: false, message: data.error || 'Save failed.' }); return; }
      setSuccess(`Sheet config for '${editingSheet.displayName}' updated.`);
      setEditingSheet(null);
      loadData();
    } catch { setTestResult({ ok: false, message: "Couldn't save changes." }); }
    finally { setSavingSheet(false); }
  }

  async function handleDownloadReport(moduleKey: string) {
    setDownloadingModule(moduleKey);
    try {
      const params = new URLSearchParams();
      if (reportFrom) params.append('from', reportFrom);
      if (reportTo)   params.append('to',   reportTo);
      const url   = `/api/reports/${moduleKey}${params.toString() ? '?' + params.toString() : ''}`;
      const res   = await fetch(url);
      if (!res.ok) {
        const err = await res.json();
        setError({ message: err.error || 'Failed to generate report.' });
        return;
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href  = URL.createObjectURL(blob);
      link.download = `Ficcado-${moduleKey}-report.xlsx`;
      link.click();
    } catch { setError({ message: "Couldn't generate report." }); }
    finally { setDownloadingModule(null); }
  }

  async function handleSendReport() {
    setSendingEmail(true);
    try {
      const res  = await fetch('/api/email/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(data.message || 'Report emailed to all admins.');
    } catch { setError({ message: "Couldn't send email report." }); }
    finally { setSendingEmail(false); }
  }

  async function handleSendTestEmail() {
    setSendTestEmail(true);
    try {
      const res  = await fetch('/api/email/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(data.message || 'Test email sent successfully.');
    } catch { setError({ message: "Couldn't send test email." }); }
    finally { setSendTestEmail(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Control Centre</h1>
          <div className="page-subtitle">Manage administrators, Google Sheet mappings, and reports</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
            ⟳ Refresh
          </button>
          {activeTab === 'admins' && (
            <button className="btn btn-primary" onClick={() => setShowAdminModal(true)}>+ Add Admin</button>
          )}
        </div>
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Tabs */}
      <div className="tab-list">
        {(['admins', 'sheets', 'reports', 'email'] as const).map((tab) => (
          <div key={tab} className={`tab-item ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'admins' ? `Admin Accounts (${admins.length})` : tab === 'sheets' ? `Sheet Config (${sheets.length})` : tab === 'email' ? '✉ Email Config' : '📊 Reports'}
          </div>
        ))}
      </div>

      {/* ADMINS TAB */}
      {activeTab === 'admins' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <LoadingGecko label="Loading admin accounts directory…" />
            </div>
          ) : admins.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 28 }}>⚙</div>
              <div className="empty-state-title">No additional admin accounts</div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Click "+ Add Admin" to invite team members.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Admin Name</th>
                    <th>Email ID</th>
                    <th>Phone Number</th>
                    <th style={{ textAlign: 'center' }}>Sales Created</th>
                    <th style={{ textAlign: 'center' }}>Sales Closed</th>
                    <th style={{ textAlign: 'right' }}>Revenue Generated</th>
                    <th>Notifications</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((adm) => (
                    <tr key={adm.email + adm.sno}>
                      <td style={{ fontWeight: 600 }}>{adm.adminName}</td>
                      <td>{adm.email}</td>
                      <td>{adm.phone}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-info">{adm.salesCreated ?? 0}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-success">{adm.salesClosed ?? 0}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-brand-primary)' }} className="tabular-nums">
                        ₹{(adm.revenueGenerated ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className={`badge ${adm.notifications === 'Enabled' ? 'badge-success' : 'badge-neutral'}`}>
                          {adm.notifications}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditAdminModal(adm)}>
                            View / Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAdmin(adm)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SHEETS TAB */}
      {activeTab === 'sheets' && (
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Display Name</th>
                    <th>Spreadsheet ID</th>
                    <th>Tab Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((sh) => (
                    <tr key={sh.moduleKey}>
                      <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{sh.moduleKey}</td>
                      <td>{sh.displayName}</td>
                      <td className="tabular-nums" style={{ fontSize: 12, fontFamily: 'monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sh.spreadsheetId}
                      </td>
                      <td><span className="badge badge-neutral">{sh.tabName}</span></td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => openSheetEdit(sh)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sheet Edit Panel */}
          {editingSheet && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16 }}>
                Edit Sheet Config: {editingSheet.displayName}
              </h3>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input type="text" className="form-input" value={sheetEditName} onChange={(e) => setSheetEditName(e.target.value)} />
              </div>
              <div className="grid-form-2">
                <div className="form-group">
                  <label className="form-label">Spreadsheet ID</label>
                  <input type="text" className="form-input" value={sheetEditId} onChange={(e) => { setSheetEditId(e.target.value); setTestResult(null); }} placeholder="Google Sheets file ID" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tab / Sheet Name</label>
                  <input type="text" className="form-input" value={sheetEditTab} onChange={(e) => { setSheetEditTab(e.target.value); setTestResult(null); }} placeholder="Exact tab name" />
                </div>
              </div>
              {testResult && (
                <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 12, background: testResult.ok ? 'rgba(76,175,80,0.12)' : 'rgba(229,57,53,0.12)', color: testResult.ok ? '#4CAF50' : '#e53935', fontSize: 13 }}>
                  {testResult.ok ? '✓' : '✗'} {testResult.message}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={handleTestConnection} disabled={testingConn}>
                  {testingConn ? <LoadingGecko size="inline" label="Testing…" /> : '🔗 Test Connection'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveSheet} disabled={savingSheet}>
                  {savingSheet ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Changes'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingSheet(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        <div>
          {/* Date range filter */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 12 }}>Date Range Filter (optional)</h3>
            <div className="grid-form-2">
              <div className="form-group">
                <label className="form-label">From Date</label>
                <input type="date" className="form-input" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">To Date</label>
                <input type="date" className="form-input" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Per-module downloads */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 12 }}>📥 Download Reports</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {REPORT_MODULES.map((m) => (
                <button
                  key={m.key}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'center', gap: 8 }}
                  onClick={() => handleDownloadReport(m.key)}
                  disabled={downloadingModule === m.key}
                >
                  {downloadingModule === m.key ? <LoadingGecko size="inline" label="Generating…" /> : <>📊 {m.label}</>}
                </button>
              ))}
            </div>
          </div>

          {/* Email actions */}
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 12 }}>✉️ Email Reports</h3>
            <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 16 }}>
              Sends a full report (all modules) to all admins who have email notifications enabled, using the Gmail address configured in the Setup Wizard.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleSendReport} disabled={sendingEmail}>
                {sendingEmail ? <LoadingGecko size="inline" label="Sending…" /> : '📧 Send Full Report Now'}
              </button>
              <button className="btn btn-ghost" onClick={handleSendTestEmail} disabled={typeof sendTestEmail === 'boolean' && sendTestEmail}>
                {sendTestEmail ? <LoadingGecko size="inline" label="Sending…" /> : '🔧 Send Test Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL CONFIG TAB (Part 6 B1) */}
      {activeTab === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {emailFormError   && <ErrorMessage message={emailFormError}   variant="error"   onDismiss={() => setEmailFormError(null)} />}
          {emailFormSuccess && <ErrorMessage message={emailFormSuccess} variant="success" onDismiss={() => setEmailFormSuccess(null)} />}

          {/* Current Config Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 8 }}>
                  Gmail Sending Configuration
                </h2>
                <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 12 }}>
                  The Gmail address used to send order confirmation emails and reports to customers and admins.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-ink-muted)', letterSpacing: '0.06em', minWidth: 120 }}>Sender Address</span>
                    {currentSenderAddress ? (
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>{currentSenderAddress}</span>
                    ) : (
                      <span className="badge badge-warning">Not configured</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-ink-muted)', letterSpacing: '0.06em', minWidth: 120 }}>App Password</span>
                    {hasEmailPassword ? (
                      <span className="badge badge-success">✓ Password on file (not displayed for security)</span>
                    ) : (
                      <span className="badge badge-warning">No password stored</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEmailNewAddress('');
                  setEmailNewPassword('');
                  setConfirmOverwrite(false);
                  setExpandGmailGuide(false);
                  setEmailFormError(null);
                  setEmailFormSuccess(null);
                  setShowEmailConfigModal(true);
                }}
              >
                ✎ Update Email Configuration
              </button>
            </div>
          </div>

          {/* Update Email Config Modal */}
          {showEmailConfigModal && (
            <div className="modal-backdrop" onClick={() => setShowEmailConfigModal(false)}>
              <div
                className="modal"
                style={{ maxWidth: 560 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Update Email Configuration</h2>
                  <button className="btn-icon" onClick={() => setShowEmailConfigModal(false)}>×</button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {emailFormError   && <ErrorMessage message={emailFormError}   variant="error"   onDismiss={() => setEmailFormError(null)} />}
                  {emailFormSuccess && <ErrorMessage message={emailFormSuccess} variant="success" onDismiss={() => setEmailFormSuccess(null)} />}

                  {/* Overwrite warning */}
                  <div style={{
                    background: 'rgba(184,134,43,0.10)',
                    border: '1px solid rgba(184,134,43,0.40)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    fontSize: 13,
                    color: '#7a5a18',
                  }}>
                    <strong>⚠ Warning:</strong> Updating this will permanently delete the current app password. You&apos;ll need to generate a new one for the new email address if you haven&apos;t already.
                  </div>

                  <div className="form-group">
                    <label className="form-label">New Gmail Sender Address *</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="e.g. yourstore@gmail.com"
                      value={emailNewAddress}
                      onChange={(e) => setEmailNewAddress(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">New Gmail App Password * <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)', textTransform: 'none' }}>(16-character, not your regular Gmail password)</span></label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Paste the 16-character app password here"
                      value={emailNewPassword}
                      onChange={(e) => setEmailNewPassword(e.target.value)}
                    />
                  </div>

                  {/* In-app Gmail App Password Guide */}
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setExpandGmailGuide((v) => !v)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--color-bg)',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--color-brand-primary)',
                        textAlign: 'left',
                      }}
                    >
                      <span>🔐 How do I get a Gmail App Password?</span>
                      <span style={{ fontSize: 11 }}>{expandGmailGuide ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {expandGmailGuide && (
                      <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid var(--color-border)' }}>
                        <ol style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.8, paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <li>Sign in to the <strong>Gmail account</strong> you want to send emails from.</li>
                          <li>Go to your <strong>Google Account → Security</strong> settings and turn on <strong>2-Step Verification</strong> if it isn&apos;t already on (you&apos;ll need a phone number to confirm).</li>
                          <li>Once 2-Step Verification is on, search <strong>&quot;App Passwords&quot;</strong> in your Google Account settings to find the App Passwords page.</li>
                          <li>Click <strong>Create a new app password</strong> and give it a name like <em>&quot;Ficcado App&quot;</em>.</li>
                          <li>Google will show a <strong>16-character password</strong> — copy it immediately since it can&apos;t be viewed again later (you can only regenerate a new one).</li>
                          <li>Paste that 16-character password into the <em>App Password</em> field above, along with the Gmail address it belongs to.</li>
                        </ol>
                      </div>
                    )}
                  </div>

                  {/* Explicit confirmation checkbox */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={confirmOverwrite}
                      onChange={(e) => setConfirmOverwrite(e.target.checked)}
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <span>I understand this will permanently overwrite the existing app password, and I have a valid new app password ready to save.</span>
                  </label>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowEmailConfigModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={emailSaving || !confirmOverwrite}
                    onClick={async () => {
                      setEmailFormError(null);
                      setEmailFormSuccess(null);

                      if (!emailNewAddress.trim() || !emailNewPassword.trim()) {
                        setEmailFormError('Both the new email address and app password are required.');
                        return;
                      }
                      if (!confirmOverwrite) {
                        setEmailFormError('Please confirm you understand the old password will be permanently overwritten.');
                        return;
                      }

                      setEmailSaving(true);
                      try {
                        const res  = await fetch('/api/setup/email-config', {
                          method:  'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body:    JSON.stringify({
                            senderAddress: emailNewAddress.trim(),
                            appPassword:   emailNewPassword.trim(),
                            testSend:      true,
                          }),
                        });
                        const data = await res.json();

                        if (!res.ok) {
                          setEmailFormError(data.error || 'Failed to update email configuration.');
                          return;
                        }

                        setEmailFormSuccess(data.message || 'Email configuration updated successfully.');
                        setCurrentSenderAddress(emailNewAddress.trim());
                        setHasEmailPassword(true);
                        setShowEmailConfigModal(false);
                        setSuccess('Email configuration updated and connection verified.');
                      } catch {
                        setEmailFormError("Couldn't connect to server. Please try again.");
                      } finally {
                        setEmailSaving(false);
                      }
                    }}
                  >
                    {emailSaving
                      ? <LoadingGecko size="inline" label="Testing & Saving…" />
                      : '✓ Test Connection & Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Admin Modal */}
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
                  <input type="text" className="form-input" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="e.g. Rohith Kumar" autoFocus />
                </div>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input type="tel" className="form-input" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="10 digits" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input type="email" className="form-input" value={emailId} onChange={(e) => setEmailId(e.target.value)} placeholder="admin@example.com" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Temporary Password</label>
                  <input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
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

      {/* VIEW / EDIT ADMIN MODAL */}
      {editingAdmin && (
        <div className="modal-overlay" onClick={() => setEditingAdmin(null)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Admin Profile & Performance Details</h2>
              <button className="modal-close" onClick={() => setEditingAdmin(null)}>×</button>
            </div>

            <form onSubmit={handleSaveAdminEdit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {adminFormError && <ErrorMessage message={adminFormError} variant="error" onDismiss={() => setAdminFormError(null)} />}

                {/* Performance Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, background: 'var(--color-bg)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontWeight: 600 }}>SALES CREATED</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-brand-primary)' }}>{editingAdmin.salesCreated ?? 0}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontWeight: 600 }}>SALES CLOSED</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-success)' }}>{editingAdmin.salesClosed ?? 0}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontWeight: 600 }}>TOTAL REVENUE</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }} className="tabular-nums">
                      ₹{(editingAdmin.revenueGenerated ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" value={editAdminName} onChange={(e) => setEditAdminName(e.target.value)} required />
                </div>

                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input type="tel" className="form-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} required placeholder="10 digits" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input type="email" className="form-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Notifications</label>
                  <select className="form-select" value={editNotifications} onChange={(e) => setEditNotifications(e.target.value)}>
                    <option value="Enabled">Enabled — Receive daily XLSX reports by email</option>
                    <option value="Disabled">Disabled — Do not receive email reports</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingAdmin(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingAdminEdit}>
                  {savingAdminEdit ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Admin Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
