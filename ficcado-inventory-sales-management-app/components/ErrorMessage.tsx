'use client';

/**
 * components/ErrorMessage.tsx
 *
 * Shared server-error surface (Phase 8a).
 * Shows a plain-language explanation of what failed and what to do next.
 * Never shows raw HTTP status codes or stack traces.
 */

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
export function parseApiError(err: unknown, status?: number): { message: string; hint?: string } {
  if (!err) return { message: "An unexpected error occurred. Please try again." };

  if (typeof err === 'string') {
    if (err === '[object Event]') {
      return { message: "A network connection error occurred. Please check your internet connection and try again." };
    }
    if (err.includes('Not authenticated') || err.includes('Authentication required')) {
      return {
        message: 'Your admin session has expired or you are not logged in.',
        hint:    'Please log in again or complete setup to continue.',
      };
    }
    return { message: err };
  }

  // Handle browser DOM Event objects (e.g., failed network fetch or image load events)
  if (
    (typeof Event !== 'undefined' && err instanceof Event) ||
    (typeof err === 'object' && err !== null && ('nativeEvent' in err || ('target' in err && 'type' in err)))
  ) {
    return { message: "Network connection error. Please check your internet connection and try again." };
  }

  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;

    if (typeof e.message === 'string' && e.message === '[object Event]') {
      return { message: "Network connection error. Please check your internet connection and try again." };
    }

    // Validation errors map
    if (e.errors && typeof e.errors === 'object') {
      const msgs = Object.values(e.errors as Record<string, string>).filter(Boolean);
      if (msgs.length > 0) {
        return { message: msgs.join('. ') };
      }
    }

    // Conflict (version mismatch)
    if (status === 409 || e.status === 409 || e.type === 'conflict') {
      return {
        message: `This record was updated by ${e.updatedBy ?? 'another admin'} at ${e.updatedAt ?? 'an unknown time'} — reload to see the changes before saving yours.`,
        hint:    'Reload this record to see the latest version.',
      };
    }

    // Not authenticated
    const errText = String(e.error || e.message || '');
    if (status === 401 || e.status === 401 || errText.includes('Not authenticated') || errText.includes('Authentication required')) {
      return {
        message: 'Your admin session has expired or is invalid.',
        hint:    'Please click "Logout" at the bottom left and log in again to continue.',
      };
    }

    // Not authorised
    if (status === 403 || e.status === 403) {
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
      return { message: String(e.error), hint: (e.hint || e.detail) as string | undefined };
    }

    if (typeof e.message === 'string') {
      return { message: String(e.message), hint: e.detail as string | undefined };
    }
  }

  return { message: "Something went wrong. Check your connection and try again." };
}
