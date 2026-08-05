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

  async function loadProfile() {
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/me');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setMe(data.admin);
      setAdminName(data.admin.name || '');
      setPhone(data.admin.phone || '');
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

  if (loading) return <LoadingGecko size="full" label="Loading your profile…" />;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <div className="page-subtitle">Update your personal details and notification preferences</div>
        </div>
      </div>

      {error   && <ErrorMessage message={error.message} variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}        variant="success" onDismiss={() => setSuccess(null)} />}

      <form onSubmit={handleSave} className="card">
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
