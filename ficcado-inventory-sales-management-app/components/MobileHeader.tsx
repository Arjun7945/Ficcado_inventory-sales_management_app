'use client';

/**
 * components/MobileHeader.tsx
 *
 * Minimal top header for mobile viewports (<= 768px).
 * Displays Ficcado logo mark, brand title, compact online presence indicator,
 * and quick shortcut logout icon.
 */

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface OnlineAdmin {
  name:         string;
  lastActiveAt: string;
  initial:      string;
}

interface MobileHeaderProps {
  adminName: string;
  onLogout:  () => void;
}

export default function MobileHeader({ adminName, onLogout }: MobileHeaderProps) {
  const [showPresence, setShowPresence]   = useState(false);
  const [onlineAdmins, setOnlineAdmins] = useState<OnlineAdmin[]>([]);
  const [loading, setLoading]           = useState(false);
  const popoverRef                       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPresence(false);
      }
    }
    if (showPresence) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPresence]);

  async function handlePresenceClick() {
    if (showPresence) {
      setShowPresence(false);
      return;
    }
    setLoading(true);
    setShowPresence(true);
    try {
      const res = await fetch('/api/presence');
      const data = await res.json();
      setOnlineAdmins(data.onlineAdmins ?? []);
    } catch {
      setOnlineAdmins([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <header className="mobile-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <svg width="24" height="28" viewBox="0 0 160 200" fill="none">
            <path d="M75 130 C75 150, 95 165, 90 190 C85 198, 72 175, 78 150 Z" fill="#B4D1EF" />
            <path d="M76 115 C60 100, 62 70, 72 50 C80 34, 98 28, 104 38 C108 46, 92 58, 84 72 C80 85, 82 105, 76 115 Z" fill="#B4D1EF" />
            <path d="M72 56 C60 48, 52 42, 54 30 C56 22, 60 24, 64 34 Z" fill="#B4D1EF" />
            <path d="M76 120 C64 128, 50 138, 48 148 C46 156, 52 152, 62 138 Z" fill="#B4D1EF" />
            <path d="M75 58 C85 64, 88 80, 80 100 C74 116, 78 135, 76 142 C70 148, 65 125, 72 105 C78 90, 74 70, 75 58 Z" fill="#2B62C6" />
            <path d="M82 66 C98 62, 114 65, 122 55 C126 50, 122 46, 110 56 Z" fill="#2B62C6" />
            <path d="M78 98 C94 96, 112 102, 120 94 C124 90, 120 86, 108 94 Z" fill="#2B62C6" />
            <path d="M76 130 C64 140, 52 152, 50 164 C48 172, 54 168, 62 152 Z" fill="#2B62C6" />
          </svg>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '0.04em',
            color: 'var(--color-ink)',
          }}>Ficcado</span>
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Compact Online Indicator */}
        <div style={{ position: 'relative' }} ref={popoverRef}>
          <button
            onClick={handlePresenceClick}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(47, 125, 79, 0.1)',
              border: '1px solid rgba(47, 125, 79, 0.25)',
              borderRadius: 16,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
            title="Click to see online admins"
          >
            <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <span style={{
                display: 'block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#2F7D4F',
              }} />
              <span style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                backgroundColor: '#2F7D4F',
                opacity: 0.4,
                animation: 'pulse-ring 2s ease-out infinite',
              }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#2F7D4F' }}>Online</span>
          </button>

          {showPresence && (
            <div style={{
              position: 'absolute',
              top: '110%',
              right: 0,
              zIndex: 999,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              minWidth: 200,
              padding: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
                CURRENTLY ONLINE
              </div>
              {loading ? (
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', padding: '4px 0' }}>Loading…</div>
              ) : onlineAdmins.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', padding: '4px 0' }}>No other admins online</div>
              ) : (
                onlineAdmins.map((a) => (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      backgroundColor: 'var(--color-brand-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 11, color: 'var(--color-brand-primary)'
                    }}>
                      {a.initial}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{a.name}</div>
                    <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2F7D4F' }} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Header Logout Shortcut */}
        <button
          onClick={onLogout}
          type="button"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-ink-muted)',
            borderRadius: 4,
          }}
          title="Log out"
          aria-label="Log out"
        >
          <span style={{ fontSize: 16 }}>↪</span>
        </button>
      </div>
    </header>
  );
}
