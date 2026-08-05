'use client';

/**
 * app/(auth)/login/page.tsx
 *
 * Admin login page. Both Superadmin and regular admins log in here.
 * Redirects to /dashboard on success.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingGecko, { GeckoLogoSVG } from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<{ message: string; hint?: string } | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (errors[e.target.name]) {
      setErrors((prev) => { const next = { ...prev }; delete next[e.target.name]; return next; });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    const newErrors: Record<string, string> = {};
    if (!form.username.trim()) newErrors.username = 'Username or email is required';
    if (!form.password)        newErrors.password  = 'Password is required';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setApiError(parseApiError(data));
        return;
      }

      router.push('/dashboard');
    } catch {
      setApiError({ message: "Couldn't connect to the server. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label="Logging in…" />;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <GeckoLogoSVG width={64} height={80} isWalking={false} />
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.22em', color: 'var(--color-brand-primary)',
            textTransform: 'uppercase', marginBottom: 16,
          }}>
            WWW.FICCADO.STORE
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
            Admin Login
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-ink-muted)' }}>
            Inventory & Sales Management
          </p>
        </div>

        <div className="card" style={{ padding: '24px 28px' }}>
          {apiError && (
            <ErrorMessage
              message={apiError.message}
              hint={apiError.hint}
              variant="error"
              onDismiss={() => setApiError(null)}
            />
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="login-username">Username or Email</label>
              <input
                id="login-username"
                name="username"
                type="text"
                className={`form-input ${errors.username ? 'error' : ''}`}
                placeholder="e.g. ficcado-admin"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                autoFocus
              />
              {errors.username && <div className="form-error">{errors.username}</div>}
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                className={`form-input ${errors.password ? 'error' : ''}`}
                placeholder="Your password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
              />
              {errors.password && <div className="form-error">{errors.password}</div>}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
            >
              Log In →
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--color-ink-muted)' }}>
          Ficcado Inventory & Sales Management · Internal use only
        </p>
      </div>
    </div>
  );
}
