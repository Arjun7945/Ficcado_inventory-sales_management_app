'use client';

/**
 * components/ErrorMessage.tsx
 *
 * Shared server-error surface (Phase 8a).
 * Shows a plain-language explanation of what failed and what to do next.
 * Never shows raw HTTP status codes or stack traces.
 *
 * Per DESIGN.md Section 3.1:
 *  - Be specific, not generic
 *  - Say what to do next
 *  - Match the voice: direct, calm, factual
 */

import React from 'react';

type ErrorVariant = 'error' | 'warning' | 'conflict' | 'success';

interface ErrorMessageProps {
  message:    string;
  hint?:      string;      // Optional "what to do next" action hint
  variant?:   ErrorVariant;
  onDismiss?: () => void;
}

const ICONS: Record<ErrorVariant, string> = {
  error:    '✕',
  warning:  '⚠',
  conflict: '⟳',
  success:  '✓',
};

export default function ErrorMessage({
  message,
  hint,
  variant = 'error',
  onDismiss,
}: ErrorMessageProps) {
  if (!message) return null;

  const className =
    variant === 'error'    ? 'error-banner'    :
    variant === 'warning'  ? 'conflict-banner' :
    variant === 'conflict' ? 'conflict-banner' :
    'success-banner';

  return (
    <div className={className} role="alert">
      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>
        {ICONS[variant]}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{message}</div>
        {hint && (
          <div style={{ fontSize: 12, marginTop: 3, opacity: 0.85 }}>
            {hint}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.6,
            fontSize: 15,
            padding: '0 2px',
            color: 'inherit',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Map API error responses to user-friendly messages.
 * Inspects the error object and returns appropriate message + hint.
 */
export function parseApiError(err: unknown): { message: string; hint?: string } {
  if (typeof err === 'string') return { message: err };

  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;

    // Validation errors map
    if (e.errors && typeof e.errors === 'object') {
      const msgs = Object.values(e.errors as Record<string, string>).filter(Boolean);
      if (msgs.length > 0) {
        return { message: msgs.join('. ') };
      }
    }

    // Conflict (version mismatch)
    if (e.status === 409 || e.type === 'conflict') {
      return {
        message: `This record was updated by ${e.updatedBy ?? 'another admin'} at ${e.updatedAt ?? 'an unknown time'} — reload to see the changes before saving yours.`,
        hint:    'Reload this record to see the latest version.',
      };
    }

    // Not authenticated
    if (e.status === 401) {
      return {
        message: 'Your session has expired.',
        hint:    'Log in again to continue.',
      };
    }

    // Not authorised
    if (e.status === 403) {
      return {
        message: 'You don\'t have permission for this action.',
      };
    }

    // Sheet not configured
    if (typeof e.error === 'string' && e.error.includes('not configured')) {
      return {
        message: String(e.error),
        hint:    'Go to Admin Control Centre → Sheet Configuration to add the missing entry.',
      };
    }

    // Google Sheets unreachable
    if (typeof e.error === 'string' && (e.error.includes('Google Sheets') || e.error.includes('connect'))) {
      return {
        message: String(e.error),
        hint:    'Check your internet connection and try again.',
      };
    }

    // Generic API error with message
    if (typeof e.error === 'string') {
      return { message: String(e.error), hint: e.hint as string | undefined };
    }

    if (typeof e.message === 'string') {
      return { message: String(e.message) };
    }
  }

  return { message: "Something went wrong. Check your connection and try again." };
}
