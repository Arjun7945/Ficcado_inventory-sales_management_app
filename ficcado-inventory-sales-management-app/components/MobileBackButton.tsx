'use client';

/**
 * components/MobileBackButton.tsx
 *
 * Persistent back control for non-Dashboard mobile screens.
 * Uses router history to return to previous route, with fallback to /dashboard.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

interface MobileBackButtonProps {
  label?: string;
  fallbackHref?: string;
}

export default function MobileBackButton({ label = 'Back', fallbackHref = '/dashboard' }: MobileBackButtonProps) {
  const router = useRouter();

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <div className="mobile-back-bar">
      <button
        onClick={handleBack}
        type="button"
        className="btn btn-ghost btn-sm"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 600,
          color: 'var(--color-brand-primary)',
          padding: '4px 8px',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
        <span>{label}</span>
      </button>
    </div>
  );
}
