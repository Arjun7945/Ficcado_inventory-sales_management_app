'use client';

/**
 * app/page.tsx — Bootstrap router.
 *
 * On load, calls /api/bootstrap/status to decide which screen to show:
 *  - Not claimed → /claim (Superadmin claim screen)
 *  - Claimed but setup not complete → /wizard (Setup Wizard)
 *  - Setup complete → /login (Normal admin login)
 *
 * Shows the gecko loading animation while checking status.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

export default function RootPage() {
  const router = useRouter();
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch('/api/bootstrap/status');
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setError(parseApiError(data));
          return;
        }

        if (!data.claimed) {
          router.replace('/claim');
        } else if (!data.setupComplete) {
          router.replace('/wizard');
        } else {
          router.replace('/login');
        }
      } catch (err) {
        if (!cancelled) {
          setError({
            message: "Couldn't connect to the server.",
            hint:    'Check your internet connection and refresh the page.',
          });
        }
      }
    }

    checkStatus();
    return () => { cancelled = true; };
  }, [router]);

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg)',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 480, width: '100%' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.20em',
              color: 'var(--color-brand-primary)',
              textTransform: 'uppercase',
              marginBottom: 24,
              textAlign: 'center',
            }}
          >
            WWW.FICCADO.STORE
          </div>
          <ErrorMessage
            message={error.message}
            hint={error.hint}
            variant="error"
          />
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <LoadingGecko size="full" label="Starting Ficcado…" />;
}
