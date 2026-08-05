'use client';

/**
 * app/(setup)/wizard/page.tsx
 *
 * 4-step Setup Wizard — only accessible to the Superadmin after claiming.
 *
 * Step 1: Confirm Google Sheets API access
 * Step 2: Register all 9 module sheets (link existing or auto-create)
 * Step 3: Configure Gmail email sending
 * Step 4: Create the first regular admin(s)
 *
 * Re-enterable: the Superadmin can return and redo any step at any time.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

type StepStatus = 'pending' | 'active' | 'complete' | 'error';
type ModuleKey = 'items' | 'inventory' | 'warehouse' | 'sales' | 'replacement' | 'return_refund' | 'admin_info' | 'keep_notes' | 'activity_log';

const MODULE_KEYS: ModuleKey[] = [
  'items', 'inventory', 'warehouse', 'sales', 'replacement',
  'return_refund', 'admin_info', 'keep_notes', 'activity_log',
];

const MODULE_LABELS: Record<ModuleKey, string> = {
  items:         'Items Management',
  inventory:     'Inventory Management',
  warehouse:     'Warehouse Management',
  sales:         'Sales Management',
  replacement:   'Replacement Management',
  return_refund: 'Return / Refund Management',
  admin_info:    'Admin Information',
  keep_notes:    'Keep Notes',
  activity_log:  'Activity Log',
};

interface ModuleSheetEntry {
  action: 'none' | 'create' | 'link';
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
  const [moduleEntries, setModuleEntries] = useState<Record<ModuleKey, ModuleSheetEntry>>(
    Object.fromEntries(MODULE_KEYS.map((k) => [k, { action: 'none' }])) as Record<ModuleKey, ModuleSheetEntry>
  );

  // Step 3 state
  const [emailForm, setEmailForm] = useState({ senderAddress: 'arjunpslxi@gmail.com', appPassword: '', testSend: true });
  const [emailResult, setEmailResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Step 4 state
  const [adminForm, setAdminForm] = useState({ adminName: '', phoneNumber: '', emailId: '', password: '' });
  const [adminErrors, setAdminErrors] = useState<Record<string, string>>({});
  const [adminCreated, setAdminCreated] = useState(false);

  const [apiError, setApiError] = useState<{ message: string; hint?: string } | null>(null);

  function updateStepStatus(step: number, status: StepStatus) {
    setStepStatuses((prev) => {
      const next = [...prev];
      next[step - 1] = status;
      return next;
    });
  }

  // ── Step 1: Test Google Connection ───────────────────────────────────────────
  async function runGoogleTest() {
    setLoading(true);
    setGoogleTestResult(null);
    setApiError(null);
    try {
      const res = await fetch('/api/setup/google-test', { method: 'POST' });
      const data = await res.json();
      setGoogleTestResult(data);
      if (data.success) {
        updateStepStatus(1, 'complete');
      } else {
        updateStepStatus(1, 'error');
      }
    } catch {
      setGoogleTestResult({ success: false, message: "Couldn't reach the server. Check your connection." });
      updateStepStatus(1, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Register module sheets ──────────────────────────────────────────
  function setModuleAction(key: ModuleKey, action: 'create' | 'link') {
    setModuleEntries((prev) => ({ ...prev, [key]: { ...prev[key], action, status: 'pending' } }));
  }

  function setModuleField(key: ModuleKey, field: 'spreadsheetId' | 'tabName', value: string) {
    setModuleEntries((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function registerModule(key: ModuleKey) {
    const entry = moduleEntries[key];
    if (entry.action === 'none') return;

    setModuleEntries((prev) => ({ ...prev, [key]: { ...prev[key], status: 'pending', message: undefined } }));

    try {
      const body: Record<string, string> = { moduleKey: key, action: entry.action };
      if (entry.action === 'link') {
        body.spreadsheetId = entry.spreadsheetId ?? '';
        body.tabName = entry.tabName ?? '';
      }

      const res = await fetch('/api/setup/register-sheet', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      setModuleEntries((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          status:  data.success ? 'done' : 'error',
          message: data.message ?? data.error,
          spreadsheetId: data.spreadsheetId ?? prev[key].spreadsheetId,
          tabName:       data.tabName ?? prev[key].tabName,
        },
      }));
    } catch {
      setModuleEntries((prev) => ({
        ...prev,
        [key]: { ...prev[key], status: 'error', message: "Couldn't register — check your connection." },
      }));
    }
  }

  async function registerAllModules() {
    for (const key of MODULE_KEYS) {
      if (moduleEntries[key].action !== 'none') {
        await registerModule(key);
      }
    }
  }

  // ── Step 3: Email config ────────────────────────────────────────────────────
  async function saveEmailConfig(testSend: boolean) {
    setLoading(true);
    setEmailResult(null);
    try {
      const res = await fetch('/api/setup/email-config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...emailForm, testSend }),
      });
      const data = await res.json();
      setEmailResult(data);
      if (data.success) updateStepStatus(3, 'complete');
      else updateStepStatus(3, 'error');
    } catch {
      setEmailResult({ success: false, message: "Couldn't save email config." });
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: Create first admin ──────────────────────────────────────────────
  async function createFirstAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminErrors({});
    setApiError(null);

    if (!adminForm.adminName) {
      setAdminErrors((prev) => ({ ...prev, adminName: 'Admin name is required' }));
      return;
    }
    if (!/^\d{10}$/.test(adminForm.phoneNumber)) {
      setAdminErrors((prev) => ({ ...prev, phoneNumber: 'Enter a 10-digit phone number' }));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminForm.emailId)) {
      setAdminErrors((prev) => ({ ...prev, emailId: 'Enter a valid email address' }));
      return;
    }
    if (adminForm.password.length < 8) {
      setAdminErrors((prev) => ({ ...prev, password: 'Password must be at least 8 characters' }));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admins', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...adminForm, notifications: 'Enabled' }),
      });
      const data = await res.json();

      if (!res.ok) {
        setApiError(parseApiError(data));
        return;
      }

      setAdminCreated(true);
      updateStepStatus(4, 'complete');

      // Mark setup complete
      await fetch('/api/setup/complete', { method: 'POST' });

    } catch {
      setApiError({ message: "Couldn't create the admin. Check your connection." });
    } finally {
      setLoading(false);
    }
  }

  const allDone = adminCreated;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 680 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.22em', color: 'var(--color-brand-primary)',
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            WWW.FICCADO.STORE
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700 }}>
            Setup Wizard
          </h1>
          <p style={{ color: 'var(--color-ink-muted)', marginTop: 6, fontSize: 14 }}>
            Configure Ficcado before your admins start using it.
          </p>
        </div>

        {/* Step indicators */}
        <div className="wizard-steps" style={{ marginBottom: 32 }}>
          {['Google Access', 'Module Sheets', 'Email', 'First Admin'].map((label, i) => (
            <div key={i} className="wizard-step">
              <div className={`wizard-step-number ${stepStatuses[i]}`}>{i + 1}</div>
              <div className="wizard-step-label" style={{ fontWeight: currentStep === i + 1 ? 600 : undefined }}>
                {label}
              </div>
              {i < 3 && <div className="wizard-step-connector" />}
            </div>
          ))}
        </div>

        {/* ── Step 1 ─────────────────────────────────────────────────────────── */}
        {currentStep === 1 && (
          <div className="card">
            <div className="card-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Step 1 — Confirm Google Access</h2>
            </div>
            <p style={{ color: 'var(--color-ink-muted)', marginBottom: 20, fontSize: 14 }}>
              Verify the service account credentials work by doing a live connection test.
              The app will auto-create the <strong>Ficcado-System-Config</strong> spreadsheet if it doesn&apos;t exist yet.
            </p>

            {loading && <LoadingGecko size="inline" label="Testing connection…" />}

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
            <p style={{ color: 'var(--color-ink-muted)', marginBottom: 20, fontSize: 14 }}>
              For each module, either paste an existing Google Spreadsheet ID + tab name, or click{' '}
              <strong>Create for me</strong> to auto-create a new sheet with the correct headers.
            </p>

            {MODULE_KEYS.map((key) => {
              const entry = moduleEntries[key];
              return (
                <div key={key} style={{
                  borderBottom: '1px solid var(--color-border)',
                  paddingBottom: 16, marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{MODULE_LABELS[key]}</div>
                    {entry.status === 'done' && <span className="badge badge-success">✓ Done</span>}
                    {entry.status === 'error' && <span className="badge badge-error">✕ Error</span>}
                  </div>

                  {entry.message && (
                    <div style={{ fontSize: 12.5, color: entry.status === 'done' ? 'var(--color-success)' : 'var(--color-error)', marginBottom: 8 }}>
                      {entry.message}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className={`btn btn-sm ${entry.action === 'create' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setModuleAction(key, 'create')}
                    >
                      Create for me
                    </button>
                    <button
                      className={`btn btn-sm ${entry.action === 'link' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setModuleAction(key, 'link')}
                    >
                      Link existing
                    </button>

                    {entry.action === 'link' && (
                      <>
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
                      </>
                    )}

                    {entry.action !== 'none' && entry.status !== 'done' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => registerModule(key)}>
                        Apply
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setCurrentStep(1)}>← Back</button>
              <button className="btn btn-primary" onClick={async () => { await registerAllModules(); }}>
                Apply All Selected
              </button>
              <button className="btn btn-ghost" onClick={() => { updateStepStatus(2, 'complete'); setCurrentStep(3); }}>
                Next: Email →
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
              Configure the Gmail account used to send daily reports. Use a Gmail App Password
              (not your regular password) for SMTP access.
            </p>

            <div className="form-group">
              <label className="form-label">Sender Email</label>
              <input
                type="email"
                className="form-input"
                value={emailForm.senderAddress}
                onChange={(e) => setEmailForm((p) => ({ ...p, senderAddress: e.target.value }))}
                placeholder="arjunpslxi@gmail.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gmail App Password</label>
              <input
                type="password"
                className="form-input"
                value={emailForm.appPassword}
                onChange={(e) => setEmailForm((p) => ({ ...p, appPassword: e.target.value }))}
                placeholder="xxxx xxxx xxxx xxxx"
              />
              <div className="form-hint">
                Generate an App Password at myaccount.google.com → Security → App Passwords.
              </div>
            </div>

            {loading && <LoadingGecko size="inline" label="Saving email config…" />}
            {emailResult && !loading && (
              <ErrorMessage
                message={emailResult.message ?? ''}
                variant={emailResult.success ? 'success' : 'error'}
              />
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setCurrentStep(2)}>← Back</button>
              <button className="btn btn-secondary" onClick={() => saveEmailConfig(true)} disabled={loading}>
                Test & Save
              </button>
              <button className="btn btn-primary" onClick={() => saveEmailConfig(false)} disabled={loading}>
                Save Without Testing
              </button>
              {emailResult?.success && (
                <button className="btn btn-ghost" onClick={() => setCurrentStep(4)}>
                  Next: Create Admin →
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => { updateStepStatus(3, 'complete'); setCurrentStep(4); }}>
                Skip for now →
              </button>
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
              Create at least one regular admin who will use the app day-to-day.
              You can add more from Admin Control Centre later.
            </p>

            {apiError && <ErrorMessage message={apiError.message} hint={apiError.hint} variant="error" onDismiss={() => setApiError(null)} />}

            {adminCreated ? (
              <div>
                <ErrorMessage message="First admin created successfully." variant="success" />
                <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={() => router.push('/login')}>
                    Go to Login →
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={createFirstAdmin} noValidate>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Admin Name</label>
                    <input type="text" className={`form-input ${adminErrors.adminName ? 'error' : ''}`}
                      value={adminForm.adminName}
                      onChange={(e) => setAdminForm((p) => ({ ...p, adminName: e.target.value }))}
                      placeholder="Full name"
                    />
                    {adminErrors.adminName && <div className="form-error">{adminErrors.adminName}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input type="tel" className={`form-input ${adminErrors.phoneNumber ? 'error' : ''}`}
                      value={adminForm.phoneNumber}
                      onChange={(e) => setAdminForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                      placeholder="10-digit number"
                    />
                    {adminErrors.phoneNumber && <div className="form-error">{adminErrors.phoneNumber}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input type="email" className={`form-input ${adminErrors.emailId ? 'error' : ''}`}
                      value={adminForm.emailId}
                      onChange={(e) => setAdminForm((p) => ({ ...p, emailId: e.target.value }))}
                      placeholder="admin@example.com"
                    />
                    {adminErrors.emailId && <div className="form-error">{adminErrors.emailId}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input type="password" className={`form-input ${adminErrors.password ? 'error' : ''}`}
                      value={adminForm.password}
                      onChange={(e) => setAdminForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Min 8 characters"
                    />
                    {adminErrors.password && <div className="form-error">{adminErrors.password}</div>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-ghost" type="button" onClick={() => setCurrentStep(3)}>← Back</button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <LoadingGecko size="inline" label="" /> : 'Create Admin & Finish'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
