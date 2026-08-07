'use client';

/**
 * app/(setup)/wizard/page.tsx
 *
 * 4-step Setup Wizard — accessible to Superadmin after claiming installation.
 *
 * Step 1: Confirm Google Sheets API access
 * Step 2: Register all 12 module sheets (Automated Auto-Setup [Default] or Custom Link)
 * Step 3: Configure Gmail email sending
 * Step 4: Create the first regular admin(s)
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

type StepStatus = 'pending' | 'active' | 'complete' | 'error';
type ModuleKey =
  | 'items'
  | 'inventory'
  | 'warehouse'
  | 'sales'
  | 'replacement'
  | 'return_refund'
  | 'admin_info'
  | 'keep_notes'
  | 'activity_log'
  | 'damaged_products'
  | 'inventory_history'
  | 'customer_info';

const MODULE_KEYS: ModuleKey[] = [
  'items', 'inventory', 'warehouse', 'sales', 'replacement',
  'return_refund', 'admin_info', 'keep_notes', 'activity_log',
  'damaged_products', 'inventory_history', 'customer_info',
];

const MODULE_LABELS: Record<ModuleKey, string> = {
  items:             'Items Management',
  inventory:         'Inventory Management',
  warehouse:         'Warehouse Management',
  sales:             'Sales Management',
  replacement:       'Replacement Management',
  return_refund:     'Return / Refund Management',
  admin_info:        'Admin Information',
  keep_notes:        'Keep Notes',
  activity_log:      'Activity Log',
  damaged_products:  'Damaged Products Management',
  inventory_history: 'Inventory History Tracker',
  customer_info:     'Customer Information Management',
};

interface ModuleSheetEntry {
  spreadsheetId?: string;
  tabName?: string;
  status?: 'pending' | 'done' | 'error';
  message?: string;
}

export default function WizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(['active', 'pending', 'pending', 'pending']);
  const [loading, setLoading] = useState(false);

  // Step 1 state
  const [googleTestResult, setGoogleTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Step 2 state
  const [step2Mode, setStep2Mode] = useState<'automated' | 'custom'>('automated');
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState('');
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);
  const [autoCreateResult, setAutoCreateResult] = useState<{ success?: boolean; message?: string; spreadsheetUrl?: string } | null>(null);

  const [moduleEntries, setModuleEntries] = useState<Record<ModuleKey, ModuleSheetEntry>>(
    Object.fromEntries(MODULE_KEYS.map((k) => [k, {}])) as Record<ModuleKey, ModuleSheetEntry>
  );

  // Step 3 state
  const [emailForm, setEmailForm] = useState({ senderAddress: 'arjunpslxi@gmail.com', appPassword: '', testSend: true });
  const [emailResult, setEmailResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Step 4 state
  const [firstAdmin, setFirstAdmin] = useState({ name: '', phone: '', email: '', password: '' });
  const [adminResult, setAdminResult] = useState<{ success?: boolean; message?: string } | null>(null);

  function updateStepStatus(stepNum: number, status: StepStatus) {
    setStepStatuses((prev) => {
      const next = [...prev];
      next[stepNum - 1] = status;
      return next;
    });
  }

  function copyServiceAccountEmail() {
    navigator.clipboard.writeText('ficcado-sheets-service@ficcado-inventory-app.iam.gserviceaccount.com');
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2500);
  }

  // ── Step 1 Action ─────────────────────────────────────────────────────────
  async function runGoogleTest() {
    setLoading(true);
    setGoogleTestResult(null);
    try {
      const res = await fetch('/api/setup/google-test', { method: 'POST' });
      const data = await res.json();
      setGoogleTestResult(data);
      if (res.ok && data.success) {
        updateStepStatus(1, 'complete');
      } else {
        updateStepStatus(1, 'error');
      }
    } catch {
      setGoogleTestResult({ success: false, message: 'Could not connect to server.' });
      updateStepStatus(1, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Helper to extract Spreadsheet ID if full URL is pasted ─────────────
  function cleanSpreadsheetId(input: string): string {
    const trimmed = input.trim();
    const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : trimmed;
  }

  // ── Step 2 Actions ─────────────────────────────────────────────────────────
  async function handleAutoCreateAll() {
    const rawId = spreadsheetIdInput.trim();
    if (!rawId) {
      setAutoCreateResult({
        success: false,
        message: 'Please paste your Google Spreadsheet ID or URL.',
      });
      return;
    }

    const spreadsheetId = cleanSpreadsheetId(rawId);
    const adminEmail = adminEmailInput.trim();

    setLoading(true);
    setAutoCreateResult(null);

    try {
      const res = await fetch('/api/setup/register-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto-create-all',
          spreadsheetId,
          adminEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const parsed = parseApiError(data);
        setAutoCreateResult({
          success: false,
          message: parsed.message + (data.detail ? `: ${data.detail}` : ''),
        });
        return;
      }

      setAutoCreateResult({
        success: true,
        message: data.message ?? 'Successfully created all 12 module tabs & registered headers!',
        spreadsheetUrl: data.spreadsheetUrl,
      });

      const finalId = data.spreadsheetId || spreadsheetId;

      // Update module status UI
      setModuleEntries((prev) => {
        const next = { ...prev };
        MODULE_KEYS.forEach((k) => {
          next[k] = { spreadsheetId: finalId, tabName: k, status: 'done', message: 'Auto-created' };
        });
        return next;
      });

      updateStepStatus(2, 'complete');
    } catch {
      setAutoCreateResult({ success: false, message: 'Failed to connect to server.' });
    } finally {
      setLoading(false);
    }
  }

  function setModuleField(key: ModuleKey, field: 'spreadsheetId' | 'tabName', value: string) {
    setModuleEntries((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  async function registerSingleModule(key: ModuleKey) {
    const entry = moduleEntries[key];
    const rawId = entry.spreadsheetId ?? '';
    const tabName = entry.tabName ?? '';

    if (!rawId || !tabName) {
      setModuleEntries((prev) => ({
        ...prev,
        [key]: { ...prev[key], status: 'error', message: 'Spreadsheet ID and Tab name are required.' },
      }));
      return;
    }

    const spreadsheetId = cleanSpreadsheetId(rawId);

    setModuleEntries((prev) => ({
      ...prev,
      [key]: { ...prev[key], status: 'pending', message: 'Verifying…' },
    }));

    try {
      const res = await fetch('/api/setup/register-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleKey: key,
          action: 'link',
          spreadsheetId,
          tabName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setModuleEntries((prev) => ({
          ...prev,
          [key]: { ...prev[key], status: 'error', message: data.error ?? 'Failed to link.' },
        }));
      } else {
        setModuleEntries((prev) => ({
          ...prev,
          [key]: { ...prev[key], status: 'done', message: 'Successfully linked' },
        }));
      }
    } catch {
      setModuleEntries((prev) => ({
        ...prev,
        [key]: { ...prev[key], status: 'error', message: 'Network error.' },
      }));
    }
  }

  // ── Step 3 Action ─────────────────────────────────────────────────────────
  async function saveEmailConfig() {
    setLoading(true);
    setEmailResult(null);
    try {
      const res = await fetch('/api/setup/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm),
      });

      const data = await res.json();
      setEmailResult(data);
      if (res.ok && data.success) {
        updateStepStatus(3, 'complete');
      } else {
        updateStepStatus(3, 'error');
      }
    } catch {
      setEmailResult({ success: false, message: 'Could not connect to server.' });
      updateStepStatus(3, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4 Action ─────────────────────────────────────────────────────────
  async function completeSetup() {
    setLoading(true);
    setAdminResult(null);
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstAdmin }),
      });

      const data = await res.json();
      setAdminResult(data);
      if (res.ok && data.success) {
        updateStepStatus(4, 'complete');
        setTimeout(() => router.push('/dashboard'), 1500);
      } else {
        updateStepStatus(4, 'error');
      }
    } catch {
      setAdminResult({ success: false, message: 'Could not complete setup.' });
      updateStepStatus(4, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          letterSpacing: '0.1em',
          color: 'var(--color-brand-primary)',
          fontWeight: 700,
          marginBottom: 6,
        }}>WWW.FICCADO.STORE</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
          Setup Wizard
        </h1>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>
          Configure Ficcado operational sheets before your admins start using it.
        </p>
      </div>

      {/* Step indicators */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
        position: 'relative',
      }}>
        {[
          { num: 1, label: 'Google Access' },
          { num: 2, label: 'Module Sheets' },
          { num: 3, label: 'Email' },
          { num: 4, label: 'First Admin' },
        ].map((s, idx) => {
          const status = stepStatuses[idx];
          const isActive = currentStep === s.num;
          return (
            <div
              key={s.num}
              onClick={() => setCurrentStep(s.num)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.6,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: status === 'complete' ? 'var(--color-success)' : isActive ? 'var(--color-brand-primary)' : 'var(--color-border)',
                color: '#fff',
                fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>
                {status === 'complete' ? '✓' : s.num}
              </div>
              <span style={{ fontWeight: isActive ? 600 : 400, fontSize: 13 }}>{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Step 1 ─────────────────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Step 1 — Confirm Google Sheets API Access</h2>
          </div>
          <p style={{ color: 'var(--color-ink-muted)', marginBottom: 20, fontSize: 14 }}>
            Verify that your service account key environment variable (<code>GOOGLE_SERVICE_ACCOUNT_KEY</code>)
            can connect to Google Sheets API and access your system bootstrap sheet.
          </p>

          {googleTestResult && !loading && (
            <ErrorMessage
              message={googleTestResult.message ?? ''}
              variant={googleTestResult.success ? 'success' : 'error'}
            />
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={runGoogleTest} disabled={loading}>
              {loading ? <LoadingGecko size="inline" label="" /> : 'Test Connection'}
            </button>
            {googleTestResult?.success && (
              <button className="btn btn-ghost" onClick={() => setCurrentStep(2)}>
                Next: Module Sheets →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2 ─────────────────────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Step 2 — Register Module Sheets</h2>
          </div>

          {/* Mode Switcher Tabs */}
          <div style={{
            display: 'flex',
            gap: 10,
            marginBottom: 24,
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: 12,
          }}>
            <button
              className={`btn ${step2Mode === 'automated' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStep2Mode('automated')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              ⚡ Auto-Setup All 12 Tabs (Default)
            </button>
            <button
              className={`btn ${step2Mode === 'custom' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStep2Mode('custom')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              🛠 Custom Link Existing
            </button>
          </div>

          {/* Mode 1: Automated Auto-Setup */}
          {step2Mode === 'automated' && (
            <div style={{ background: 'rgba(43,98,198,0.03)', padding: 22, borderRadius: 12, border: '1px solid rgba(43,98,198,0.12)', marginBottom: 20 }}>
              
              {/* 3-Step Guide Card */}
              <div style={{
                background: '#ffffff',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '18px 20px',
                marginBottom: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📋</span> One-Time 3-Step Setup Guide
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Step 1 */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', background: 'var(--color-brand-secondary)',
                      color: 'var(--color-brand-primary)', fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1
                    }}>1</div>
                    <div style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.4 }}>
                      Open <a href="https://sheets.new" target="_blank" rel="noreferrer" style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>Google Sheets (sheets.new)</a> and create a blank spreadsheet (or use an existing one).
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', background: 'var(--color-brand-secondary)',
                      color: 'var(--color-brand-primary)', fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1
                    }}>2</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--color-ink)', marginBottom: 8, lineHeight: 1.4 }}>
                        Click <strong>Share</strong> (top right) and add this Service Account email as <strong>Editor</strong>:
                      </div>
                      
                      {/* One-Click Copy Box */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        flexWrap: 'wrap',
                      }}>
                        <code style={{
                          fontSize: 11.5,
                          fontFamily: 'monospace',
                          color: 'var(--color-brand-primary)',
                          fontWeight: 600,
                          flex: 1,
                          wordBreak: 'break-all',
                        }}>
                          ficcado-sheets-service@ficcado-inventory-app.iam.gserviceaccount.com
                        </code>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={copyServiceAccountEmail}
                          style={{ flexShrink: 0, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}
                        >
                          {emailCopied ? '✓ Copied to Clipboard!' : '📋 Copy Email'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', background: 'var(--color-brand-secondary)',
                      color: 'var(--color-brand-primary)', fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1
                    }}>3</div>
                    <div style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.4 }}>
                      Copy your Spreadsheet URL or ID from the address bar, paste it below, and click <strong>Auto-Setup All 12 Tabs</strong>!
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Inputs */}
              <div className="grid-form-2" style={{ marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Google Spreadsheet ID or URL *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. https://docs.google.com/spreadsheets/d/10WYAbZ..."
                    value={spreadsheetIdInput}
                    onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Your Gmail Address <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>(optional - for Editor invite)</span></label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. admin@gmail.com"
                    value={adminEmailInput}
                    onChange={(e) => setAdminEmailInput(e.target.value)}
                  />
                </div>
              </div>

              {autoCreateResult && (
                <div style={{ marginBottom: 14 }}>
                  <ErrorMessage
                    message={autoCreateResult.message ?? ''}
                    variant={autoCreateResult.success ? 'success' : 'error'}
                  />
                  {autoCreateResult.success && autoCreateResult.spreadsheetUrl && (
                    <div style={{ marginTop: 10, fontSize: 13, background: '#fff', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--color-success)' }}>
                      🔗 <strong>Target Google Spreadsheet: </strong><br />
                      <a href={autoCreateResult.spreadsheetUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-brand-primary)', fontWeight: 600, wordBreak: 'break-all' }}>
                        {autoCreateResult.spreadsheetUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={handleAutoCreateAll}
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
              >
                {loading ? <LoadingGecko size="inline" label="Creating 12 Tabs & Headers…" /> : '✨ Auto-Setup All 12 Tabs with Pre-Formatted Headers'}
              </button>
            </div>
          )}

          {/* Mode 2: Custom Create / Link Existing */}
          {step2Mode === 'custom' && (
            <div>
              <p style={{ color: 'var(--color-ink-muted)', marginBottom: 16, fontSize: 13 }}>
                Paste the Spreadsheet ID + Tab Name for each individual module. Ensure the service account has Editor permissions.
              </p>

              {MODULE_KEYS.map((key) => {
                const entry = moduleEntries[key];
                return (
                  <div key={key} style={{
                    borderBottom: '1px solid var(--color-border)',
                    paddingBottom: 14, marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{MODULE_LABELS[key]}</div>
                      {entry.status === 'done' && <span className="badge badge-success">✓ Done</span>}
                      {entry.status === 'error' && <span className="badge badge-error">✕ Error</span>}
                    </div>

                    {entry.message && (
                      <div style={{ fontSize: 12, color: entry.status === 'done' ? 'var(--color-success)' : 'var(--color-error)', marginBottom: 6 }}>
                        {entry.message}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Spreadsheet ID"
                        value={entry.spreadsheetId ?? ''}
                        onChange={(e) => setModuleField(key, 'spreadsheetId', e.target.value)}
                        style={{ flex: 1, minWidth: 160 }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Tab name"
                        value={entry.tabName ?? ''}
                        onChange={(e) => setModuleField(key, 'tabName', e.target.value)}
                        style={{ width: 140 }}
                      />
                      <button className="btn btn-secondary btn-sm" onClick={() => registerSingleModule(key)}>
                        Apply
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setCurrentStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => { updateStepStatus(2, 'complete'); setCurrentStep(3); }}>
              Next: Email Configuration →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 ─────────────────────────────────────────────────────────── */}
      {currentStep === 3 && (
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Step 3 — Email Configuration</h2>
          </div>
          <p style={{ color: 'var(--color-ink-muted)', marginBottom: 20, fontSize: 14 }}>
            Configure the Gmail account used to send customer order confirmation emails and daily reports. Use a Gmail App Password
            (not your regular password) for SMTP access.
          </p>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Sender Email (Gmail) *</label>
            <input
              type="email"
              className="form-input"
              value={emailForm.senderAddress}
              onChange={(e) => setEmailForm({ ...emailForm, senderAddress: e.target.value })}
              placeholder="e.g. ficcado@gmail.com"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Gmail App Password (16 characters) *</label>
            <input
              type="password"
              className="form-input"
              value={emailForm.appPassword}
              onChange={(e) => setEmailForm({ ...emailForm, appPassword: e.target.value })}
              placeholder="xxxx xxxx xxxx xxxx"
            />
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4 }}>
              Encrypted with AES-256 before saving to system meta sheet.
            </div>
          </div>

          {emailResult && !loading && (
            <ErrorMessage
              message={emailResult.message ?? ''}
              variant={emailResult.success ? 'success' : 'error'}
            />
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={() => setCurrentStep(2)}>← Back</button>
            <button className="btn btn-primary" onClick={saveEmailConfig} disabled={loading}>
              {loading ? <LoadingGecko size="inline" label="" /> : 'Save Email Config'}
            </button>
            {emailResult?.success && (
              <button className="btn btn-ghost" onClick={() => setCurrentStep(4)}>
                Next: First Admin →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4 ─────────────────────────────────────────────────────────── */}
      {currentStep === 4 && (
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Step 4 — Create First Admin</h2>
          </div>
          <p style={{ color: 'var(--color-ink-muted)', marginBottom: 20, fontSize: 14 }}>
            Create the first operational admin account. This admin will be logged into the Admin Information Sheet.
          </p>

          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">Admin Name *</label>
              <input
                type="text"
                className="form-input"
                value={firstAdmin.name}
                onChange={(e) => setFirstAdmin({ ...firstAdmin, name: e.target.value })}
                placeholder="Full Name"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="tel"
                className="form-input"
                value={firstAdmin.phone}
                onChange={(e) => setFirstAdmin({ ...firstAdmin, phone: e.target.value })}
                placeholder="10 digits"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Email ID (for reports) *</label>
            <input
              type="email"
              className="form-input"
              value={firstAdmin.email}
              onChange={(e) => setFirstAdmin({ ...firstAdmin, email: e.target.value })}
              placeholder="admin@ficcado.store"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Admin Login Password *</label>
            <input
              type="password"
              className="form-input"
              value={firstAdmin.password}
              onChange={(e) => setFirstAdmin({ ...firstAdmin, password: e.target.value })}
              placeholder="Min 8 characters"
            />
          </div>

          {adminResult && !loading && (
            <ErrorMessage
              message={adminResult.message ?? ''}
              variant={adminResult.success ? 'success' : 'error'}
            />
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={() => setCurrentStep(3)}>← Back</button>
            <button className="btn btn-primary" onClick={completeSetup} disabled={loading}>
              {loading ? <LoadingGecko size="inline" label="Completing Setup…" /> : 'Complete Setup & Launch Dashboard →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
