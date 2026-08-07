'use client';
/**
 * app/(app)/dashboard/profile/page.tsx
 * Admin self-service profile page — edit own name, phone, email, notifications.
 */
import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

export default function ProfilePage() {
  const [me, setMe]           = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<any>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [adminName, setAdminName]         = useState('');
  const [phone, setPhone]                 = useState('');
  const [email, setEmail]                 = useState('');
  const [notifications, setNotifications] = useState('Enabled');

  // Change Password state & visibility toggle
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword]       = useState('');
  const [newPassword, setNewPassword]               = useState('');
  const [confirmPassword, setConfirmPassword]       = useState('');
  const [pwdSaving, setPwdSaving]                   = useState(false);
  const [pwdError, setPwdError]                     = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess]                 = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/me');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setMe(data.admin);
      setAdminName(data.admin.name || '');
      setPhone(data.admin.phone || data.admin.phoneNumber || '');
      setEmail(data.admin.email || '');
      setNotifications(data.admin.notifications || 'Enabled');
    } catch { setError({ message: "Couldn't load your profile." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadProfile(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!adminName.trim()) { setError({ message: 'Name is required.' }); return; }
    if (!/^\d{10}$/.test(phone)) { setError({ message: 'Enter a valid 10-digit phone number.' }); return; }
    if (!email.includes('@')) { setError({ message: 'Enter a valid email address.' }); return; }

    setSaving(true);
    try {
      const res  = await fetch(`/api/admins/${encodeURIComponent(me.name)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ adminName, phoneNumber: phone, emailId: email, notifications }),
      });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess('Profile updated successfully.');
      loadProfile();
    } catch { setError({ message: "Couldn't save profile changes." }); }
    finally { setSaving(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null); setPwdSuccess(null);
    if (!currentPassword) { setPwdError('Current password is required.'); return; }
    if (newPassword.length < 8) { setPwdError('New password must be at least 8 characters long.'); return; }
    if (newPassword !== confirmPassword) { setPwdError('New passwords do not match.'); return; }

    setPwdSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.error || 'Failed to change password.'); return; }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdSuccess('Password changed successfully.');
    } catch {
      setPwdError("Couldn't change password. Check your connection.");
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <div className="page-subtitle">Update your personal details, security credentials, and preferences</div>
        </div>
      </div>

      {error   && <ErrorMessage message={error.message} variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}        variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Profile Details Form */}
      <form onSubmit={handleSave} className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, color: 'var(--color-ink)' }}>
          Profile Information
        </h2>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <LoadingGecko label="Fetching your admin profile…" />
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input type="text" className="form-input" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
            </div>
            <div className="grid-form-2">
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input type="tel" className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 digits" />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Notifications</label>
              <select className="form-select" value={notifications} onChange={(e) => setNotifications(e.target.value)}>
                <option value="Enabled">Enabled — receive daily reports by email</option>
                <option value="Disabled">Disabled — do not receive email reports</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setShowChangePassword((prev) => !prev)}
                style={{
                  backgroundColor: showChangePassword ? 'var(--color-ink-muted)' : 'var(--color-error)',
                  color: '#fff',
                  borderColor: showChangePassword ? 'var(--color-ink-muted)' : 'var(--color-error)',
                }}
              >
                {showChangePassword ? '✕ Close Change Password' : '🔒 Change Password'}
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Profile Changes'}
              </button>
            </div>
          </>
        )}
      </form>

      {/* Change Password Form (Toggled via Change Password button) */}
      {showChangePassword && (
        <form onSubmit={handleChangePassword} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 2, color: 'var(--color-ink)' }}>
                Security & Password
              </h2>
              <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
                Update your login password to secure your admin account.
              </div>
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setShowChangePassword(false)}
              title="Close"
            >
              ×
            </button>
          </div>

          {pwdError   && <ErrorMessage message={pwdError}   variant="error"   onDismiss={() => setPwdError(null)} />}
          {pwdSuccess && <ErrorMessage message={pwdSuccess} variant="success" onDismiss={() => setPwdSuccess(null)} />}

          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Min. 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
              {pwdSaving ? <LoadingGecko size="inline" label="Updating Password…" /> : 'Update Password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
