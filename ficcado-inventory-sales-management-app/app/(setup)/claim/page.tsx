'use client';

/**
 * app/(setup)/claim/page.tsx
 *
 * "Claim This Installation" screen — shown ONCE to the first visitor of a
 * freshly deployed, unconfigured Ficcado instance.
 *
 * Superadmin sets their username + password here.
 * Once claimed, this screen is never shown again.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingGecko, { GeckoLogoSVG } from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { validate, ClaimSchema } from '@/lib/validation';

export default function ClaimPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', claimCode: '' });
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

    // Client-side validation
    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    const { valid, errors: valErrors } = validate(ClaimSchema, {
      username:  form.username,
      password:  form.password,
      claimCode: form.claimCode || undefined,
    });

    if (!valid) {
      setErrors(valErrors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/bootstrap/claim', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          username:  form.username,
          password:  form.password,
          claimCode: form.claimCode || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setApiError(parseApiError(data));
        return;
      }

      // Success — proceed to Setup Wizard
      router.push('/wizard');
    } catch (err) {
      setApiError({ message: "Couldn't complete the claim. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingGecko size="full" label="Setting up your Superadmin account…" />;
  }

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
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          {/* Gecko mark */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <GeckoLogoSVG width={64} height={80} isWalking={false} />
          </div>

          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.22em',
              color: 'var(--color-brand-primary)',
              textTransform: 'uppercase',
              marginBottom: 20,
            }}
          >
            WWW.FICCADO.STORE
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              fontWeight: 700,
              color: 'var(--color-ink)',
              marginBottom: 8,
            }}
          >
            Claim This Installation
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', lineHeight: 1.6 }}>
            You&apos;re the first to reach this Ficcado instance. Set up your
            Superadmin account to get started.
          </p>
        </div>

        {/* Security note */}
        <div
          style={{
            background: 'rgba(43,98,198,0.07)',
            border: '1px solid rgba(43,98,198,0.20)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 24,
            fontSize: 12.5,
            color: 'var(--color-ink-muted)',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--color-brand-primary)' }}>Security note:</strong>{' '}
          Keep this URL private until you&apos;ve completed this step — anyone who reaches
          it first can claim Superadmin. Once claimed, this screen is locked permanently.
        </div>

        {/* Form */}
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
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username"
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

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className={`form-input ${errors.password ? 'error' : ''}`}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
              />
              {errors.password && <div className="form-error">{errors.password}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                placeholder="Re-enter your password"
                value={form.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
              />
              {errors.confirmPassword && <div className="form-error">{errors.confirmPassword}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="claimCode">
                Installation Claim Code{' '}
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  (optional)
                </span>
              </label>
              <input
                id="claimCode"
                name="claimCode"
                type="text"
                className={`form-input ${errors.claimCode ? 'error' : ''}`}
                placeholder="Leave blank if not required"
                value={form.claimCode}
                onChange={handleChange}
              />
              <div className="form-hint">
                Only needed if INSTALL_CLAIM_CODE is set in the environment.
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '11px 16px' }}
            >
              Claim Superadmin →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
