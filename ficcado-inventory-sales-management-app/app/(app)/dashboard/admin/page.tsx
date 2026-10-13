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

  // Global Sheet Config Update State (Part 8)
  const [newGlobalSpreadsheetId, setNewGlobalSpreadsheetId] = useState('');
  const [checkingSheet, setCheckingSheet]                   = useState(false);
  const [updatingSheet, setUpdatingSheet]                   = useState(false);
  const [sheetUpdateError, setSheetUpdateError]             = useState<string | null>(null);

  // Prompt modal state for existing tabs
  const [showPromptModal, setShowPromptModal]               = useState(false);
  const [promptTargetId, setPromptTargetId]                 = useState('');
  const [existingTabsFound, setExistingTabsFound]           = useState<string[]>([]);
  const [selectedOption, setSelectedOption]                 = useState<'remove' | 'reuse' | null>(null);
  const [removeConfirmText, setRemoveConfirmText]           = useState('');

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

  async function handleStartGlobalUpdate() {
    setSheetUpdateError(null);
    const targetId = newGlobalSpreadsheetId.trim();
    if (!targetId) {
      setSheetUpdateError('Enter a valid Google Spreadsheet ID or URL first.');
      return;
    }

    const currentGlobalId = sheets[0]?.spreadsheetId || '';

    setCheckingSheet(true);
    try {
      const res = await fetch('/api/sheet-config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', rawSpreadsheetId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSheetUpdateError(data.error || 'Failed to check spreadsheet access.');
        return;
      }

      if (data.isFresh) {
        // Fresh spreadsheet path — generate tabs automatically
        await handleExecuteFresh(data.spreadsheetId, currentGlobalId);
      } else {
        // Existing tabs path — prompt admin with 3 options
        setPromptTargetId(data.spreadsheetId);
        setExistingTabsFound(data.existingTabs || []);
        setSelectedOption(null);
        setRemoveConfirmText('');
        setShowPromptModal(true);
      }
    } catch {
      setSheetUpdateError("Couldn't reach server to verify spreadsheet.");
    } finally {
      setCheckingSheet(false);
    }
  }

  async function handleExecuteFresh(targetId: string, oldId: string) {
    setUpdatingSheet(true);
    setSheetUpdateError(null);
    try {
      const res = await fetch('/api/sheet-config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-fresh', rawSpreadsheetId: targetId, oldSpreadsheetId: oldId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSheetUpdateError(data.error || 'Failed to generate tabs in spreadsheet.');
        return;
      }
      setSuccess(data.message || 'Spreadsheet updated successfully.');
      setNewGlobalSpreadsheetId('');
      loadData();
    } catch {
      setSheetUpdateError("Couldn't execute tab generation.");
    } finally {
      setUpdatingSheet(false);
    }
  }

  async function handleExecuteRemoveRegenerate() {
    if (removeConfirmText.trim() !== 'REMOVE') return;
    const oldId = sheets[0]?.spreadsheetId || '';
    setUpdatingSheet(true);
    setSheetUpdateError(null);
    try {
      const res = await fetch('/api/sheet-config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove-and-regenerate',
          rawSpreadsheetId: promptTargetId,
          confirmationText: removeConfirmText.trim(),
          oldSpreadsheetId: oldId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSheetUpdateError(data.error || 'Failed to remove and regenerate tabs.');
        return;
      }
      setSuccess(data.message || 'Spreadsheet tabs removed and regenerated.');
      setShowPromptModal(false);
      setNewGlobalSpreadsheetId('');
      loadData();
    } catch {
      setSheetUpdateError("Couldn't execute remove & regenerate operation.");
    } finally {
      setUpdatingSheet(false);
    }
  }

  async function handleExecuteUseExisting() {
    const oldId = sheets[0]?.spreadsheetId || '';
    setUpdatingSheet(true);
    setSheetUpdateError(null);
    try {
      const res = await fetch('/api/sheet-config/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'use-existing',
          rawSpreadsheetId: promptTargetId,
          oldSpreadsheetId: oldId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSheetUpdateError(data.error || 'Failed to update Spreadsheet ID.');
        return;
      }
      setSuccess(data.message || 'Spreadsheet ID reference updated.');
      setShowPromptModal(false);
      setNewGlobalSpreadsheetId('');
      loadData();
    } catch {
      setSheetUpdateError("Couldn't update Spreadsheet ID reference.");
    } finally {
      setUpdatingSheet(false);
    }
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
          <>
            {/* Mobile View Card List */}
            <div className="mobile-only mobile-card-list" style={{ padding: 12 }}>
              {admins.map((adm) => (
                <div key={adm.email + adm.sno} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{adm.adminName}</span>
                    <span className={`badge ${adm.notifications === 'Enabled' ? 'badge-success' : 'badge-neutral'}`}>
                      {adm.notifications}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>✉ {adm.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>📞 {adm.phone}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                    <span>Sales: <strong>{adm.salesClosed ?? 0} closed</strong></span>
                    <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                      ₹{(adm.revenueGenerated ?? 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="mobile-data-card-actions">
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => openEditAdminModal(adm)}>View / Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAdmin(adm)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="desktop-only" style={{ overflowX: 'auto' }}>
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
          </>
          )}
        </div>
      )}

      {/* SHEETS TAB */}
      {activeTab === 'sheets' && (
        <div>
          {/* Update Spreadsheet ID Section */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6, color: 'var(--color-ink)' }}>
              Update Spreadsheet ID
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 16 }}>
              Enter a new Google Spreadsheet ID to update the single data source for all application modules. Make sure the spreadsheet is shared with the service account as Editor first.
            </p>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">New Spreadsheet ID or Full URL</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, minWidth: 280 }}
                  value={newGlobalSpreadsheetId}
                  onChange={(e) => { setNewGlobalSpreadsheetId(e.target.value); setSheetUpdateError(null); }}
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms or full URL"
                  disabled={checkingSheet || updatingSheet}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleStartGlobalUpdate}
                  disabled={checkingSheet || updatingSheet || !newGlobalSpreadsheetId.trim()}
                >
                  {checkingSheet ? (
                    <LoadingGecko size="inline" label="Verifying access…" />
                  ) : updatingSheet ? (
                    <LoadingGecko size="inline" label="Updating tabs…" />
                  ) : (
                    'Update and Regenerate'
                  )}
                </button>
              </div>
            </div>

            {updatingSheet && !showPromptModal && (
              <div style={{ padding: 16, textAlign: 'center', background: 'var(--color-bg)', borderRadius: 8, marginTop: 12 }}>
                <LoadingGecko label="Generating all the tabs — please wait until the new spreadsheet's tabs are ready." />
              </div>
            )}

            {sheetUpdateError && (
              <div style={{ marginTop: 12 }}>
                <ErrorMessage message={sheetUpdateError} variant="error" onDismiss={() => setSheetUpdateError(null)} />
              </div>
            )}
          </div>

          {/* Read-Only Table */}
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
                      <td
                        className="tabular-nums"
                        style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                          maxWidth: 240,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--color-brand-primary)',
                        }}
                      >
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

          {/* 3-Option Modal for Existing Tabs */}
          {showPromptModal && (
            <div className="modal-backdrop" onClick={() => { if (!updatingSheet) setShowPromptModal(false); }}>
              <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-ink)' }}>
                    Spreadsheet Contains Existing Tabs
                  </h2>
                  <button className="btn-icon" onClick={() => setShowPromptModal(false)} disabled={updatingSheet}>×</button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: 'var(--color-bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, color: 'var(--color-ink-muted)' }}>
                    <div>Target spreadsheet ID:</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--color-brand-primary)', wordBreak: 'break-all', marginTop: 2, marginBottom: 6 }}>
                      {promptTargetId}
                    </div>
                    <div>
                      Found <strong>{existingTabsFound.length}</strong> existing tab(s). Choose how you would like to proceed:
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Option 1: Remove all & regenerate */}
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        border: selectedOption === 'remove' ? '2px solid var(--color-error)' : '1px solid var(--color-border)',
                        background: selectedOption === 'remove' ? 'rgba(176, 64, 58, 0.04)' : 'var(--color-surface)',
                        cursor: updatingSheet ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => { if (!updatingSheet) setSelectedOption('remove'); }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: 'var(--color-error)' }}>
                        <input
                          type="radio"
                          name="spreadsheet_option"
                          checked={selectedOption === 'remove'}
                          onChange={() => setSelectedOption('remove')}
                          disabled={updatingSheet}
                          style={{ accentColor: 'var(--color-error)', width: 16, height: 16 }}
                        />
                        1. Remove all & regenerate
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 6, marginLeft: 26, lineHeight: 1.5 }}>
                        Delete every existing tab in that spreadsheet, then create fresh required module tabs from scratch. <strong style={{ color: 'var(--color-error)' }}>This action is destructive and permanent.</strong>
                      </p>

                      {selectedOption === 'remove' && (
                        <div style={{ marginTop: 14, marginLeft: 26, padding: 12, background: 'rgba(176, 64, 58, 0.08)', borderRadius: 6, border: '1px solid rgba(176, 64, 58, 0.3)' }} onClick={(e) => e.stopPropagation()}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-error)', display: 'block', marginBottom: 8 }}>
                            Type "REMOVE" to confirm deletion of all existing tabs:
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="text"
                              className="form-input"
                              style={{ textTransform: 'uppercase', flex: 1, letterSpacing: '0.05em', fontWeight: 600 }}
                              placeholder="REMOVE"
                              value={removeConfirmText}
                              onChange={(e) => setRemoveConfirmText(e.target.value)}
                              disabled={updatingSheet}
                            />
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={handleExecuteRemoveRegenerate}
                              disabled={updatingSheet || removeConfirmText.trim() !== 'REMOVE'}
                            >
                              {updatingSheet ? <LoadingGecko size="inline" label="Regenerating…" /> : 'Confirm & Regenerate'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Option 2: Don't remove & use it */}
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        border: selectedOption === 'reuse' ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                        background: selectedOption === 'reuse' ? 'rgba(43, 98, 198, 0.04)' : 'var(--color-surface)',
                        cursor: updatingSheet ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => { if (!updatingSheet) setSelectedOption('reuse'); }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                        <input
                          type="radio"
                          name="spreadsheet_option"
                          checked={selectedOption === 'reuse'}
                          onChange={() => setSelectedOption('reuse')}
                          disabled={updatingSheet}
                          style={{ accentColor: 'var(--color-brand-primary)', width: 16, height: 16 }}
                        />
                        2. Don't remove & use it
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 6, marginLeft: 26, lineHeight: 1.5 }}>
                        Keep every existing tab and its data completely untouched. Simply update the app&apos;s global Spreadsheet ID reference going forward.
                      </p>

                      {selectedOption === 'reuse' && (
                        <div style={{ marginTop: 14, marginLeft: 26 }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={handleExecuteUseExisting}
                            disabled={updatingSheet}
                          >
                            {updatingSheet ? <LoadingGecko size="inline" label="Updating ID…" /> : 'Use Existing Spreadsheet'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Option 3: Cancel operation */}
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        cursor: updatingSheet ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => { if (!updatingSheet) setShowPromptModal(false); }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                        <span style={{ fontSize: 14 }}>✕</span>
                        3. Cancel operation
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setShowPromptModal(false)}
                    disabled={updatingSheet}
                  >
                    Cancel
                  </button>
                </div>
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
                    <option value="Enabled">Enabled — Receive all email notifications (Team notes, reports, etc.)</option>
                    <option value="Disabled">Disabled — Do not receive any email notifications</option>
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
