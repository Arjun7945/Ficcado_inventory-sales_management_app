'use client';

/**
 * components/AppSidebar.tsx
 *
 * Main navigation sidebar — visible to all logged-in admins.
 * Part 4 (B1): Online presence indicator simplified — displays names and avatars only,
 * with zero session duration or relative last-active text.
 */

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';

interface NavItem {
  label:    string;
  href:     string;
  icon:     string;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',         href: '/dashboard',                   icon: '⊞', section: 'OVERVIEW' },
  { label: 'Items',             href: '/dashboard/items',             icon: '◈', section: 'MODULES' },
  { label: 'Inventory',         href: '/dashboard/inventory',         icon: '▦' },
  { label: 'Warehouse',         href: '/dashboard/warehouse',         icon: '⬡' },
  { label: 'Reconciliation',    href: '/dashboard/reconciliation',    icon: '⚖' },
  { label: 'Sales',             href: '/dashboard/sales',             icon: '◆' },
  { label: 'Replacements',      href: '/dashboard/replacement',       icon: '⟳' },
  { label: 'Returns & Refunds', href: '/dashboard/return-refund',     icon: '↩' },
  { label: 'Damaged Products',  href: '/dashboard/damaged-products',  icon: '⚠️' },
  { label: 'Customers',         href: '/dashboard/customers',         icon: '👥', section: 'RECORDS' },
  { label: 'Activity Log',      href: '/dashboard/activity',          icon: '◉' },
  { label: 'Sales Log',         href: '/dashboard/sales-log',         icon: '📋' },
  { label: 'Inventory History', href: '/dashboard/inventory-history', icon: '📊' },
  { label: 'Keep Notes',        href: '/dashboard/notes',             icon: '✎' },
  { label: 'Admin Control',     href: '/dashboard/admin',             icon: '⚙', section: 'ADMIN' },
  { label: 'My Profile',        href: '/dashboard/profile',           icon: '👤' },
];

interface OnlineAdmin {
  name:         string;
  lastActiveAt: string;
  initial:      string;
}

interface AppSidebarProps {
  adminName:  string;
  adminRole:  string;
  onLogout:   () => void;
}

export default function AppSidebar({ adminName, adminRole, onLogout }: AppSidebarProps) {
  const pathname = usePathname();

  // ── Online presence state ──────────────────────────────────────────────────
  const [showPresencePopover, setShowPresencePopover] = useState(false);
  const [onlineAdmins, setOnlineAdmins]               = useState<OnlineAdmin[]>([]);
  const [presenceLoading, setPresenceLoading]         = useState(false);
  const heartbeatRef                                   = useRef<ReturnType<typeof setInterval> | null>(null);
  const popoverRef                                     = useRef<HTMLDivElement>(null);

  /** Send heartbeat (fire-and-forget — never blocks the UI). */
  function sendHeartbeat() {
    fetch('/api/presence', { method: 'POST' }).catch(() => {});
  }

  useEffect(() => {
    // Initial heartbeat on mount
    sendHeartbeat();

    // Recurring heartbeat every 60 seconds
    heartbeatRef.current = setInterval(sendHeartbeat, 60_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPresencePopover(false);
      }
    }
    if (showPresencePopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPresencePopover]);

  async function handlePresenceClick() {
    if (showPresencePopover) {
      setShowPresencePopover(false);
      return;
    }
    setPresenceLoading(true);
    setShowPresencePopover(true);
    try {
      const res = await fetch('/api/presence');
      const data = await res.json();
      setOnlineAdmins(data.onlineAdmins ?? []);
    } catch {
      setOnlineAdmins([]);
    } finally {
      setPresenceLoading(false);
    }
  }

  return (
    <aside className="app-sidebar">
      {/* Brand logo area */}
      <div style={{
        padding: '20px 20px 0',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="28" height="34" viewBox="0 0 160 200" fill="none">
              <path d="M75 130 C75 150, 95 165, 90 190 C85 198, 72 175, 78 150 Z" fill="#B4D1EF" />
              <path d="M76 115 C60 100, 62 70, 72 50 C80 34, 98 28, 104 38 C108 46, 92 58, 84 72 C80 85, 82 105, 76 115 Z" fill="#B4D1EF" />
              <path d="M72 56 C60 48, 52 42, 54 30 C56 22, 60 24, 64 34 Z" fill="#B4D1EF" />
              <path d="M76 120 C64 128, 50 138, 48 148 C46 156, 52 152, 62 138 Z" fill="#B4D1EF" />
              <path d="M75 58 C85 64, 88 80, 80 100 C74 116, 78 135, 76 142 C70 148, 65 125, 72 105 C78 90, 74 70, 75 58 Z" fill="#2B62C6" />
              <path d="M82 66 C98 62, 114 65, 122 55 C126 50, 122 46, 110 56 Z" fill="#2B62C6" />
              <path d="M78 98 C94 96, 112 102, 120 94 C124 90, 120 86, 108 94 Z" fill="#2B62C6" />
              <path d="M76 130 C64 140, 52 152, 50 164 C48 172, 54 168, 62 152 Z" fill="#2B62C6" />
            </svg>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.05em',
                color: 'var(--color-ink)',
              }}>Ficcado</div>
              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', letterSpacing: '0.06em' }}>
                INVENTORY & SALES
              </div>
            </div>
          </div>
          <NotificationBell />
        </div>

        {/* ── Online presence indicator ─────────────────────────────────── */}
        <div style={{ position: 'relative' }} ref={popoverRef}>
          <button
            onClick={handlePresenceClick}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         6,
              background:  'none',
              border:      'none',
              cursor:      'pointer',
              padding:     '6px 0 10px',
              width:       '100%',
              textAlign:   'left',
            }}
            title="Click to see who's online"
          >
            {/* Pulsing green dot */}
            <span style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
              <span style={{
                display:         'block',
                width:           10,
                height:          10,
                borderRadius:    '50%',
                backgroundColor: '#2F7D4F',
              }} />
              <span style={{
                position:        'absolute',
                inset:           0,
                borderRadius:    '50%',
                backgroundColor: '#2F7D4F',
                opacity:         0.4,
                animation:       'pulse-ring 2s ease-out infinite',
              }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#2F7D4F' }}>Online</span>
          </button>

          {/* Presence popover (B1: Names & Avatars only — no duration/relative timestamps) */}
          {showPresencePopover && (
            <div style={{
              position:        'absolute',
              top:             '100%',
              left:            0,
              zIndex:          999,
              background:      'var(--color-surface)',
              border:          '1px solid var(--color-border)',
              borderRadius:    8,
              boxShadow:       '0 8px 24px rgba(0,0,0,0.12)',
              minWidth:        220,
              padding:         12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
                CURRENTLY ONLINE
              </div>

              {presenceLoading ? (
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', padding: '4px 0' }}>Loading…</div>
              ) : onlineAdmins.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', padding: '4px 0' }}>
                  No other admins online.
                </div>
              ) : (
                onlineAdmins.map((a) => (
                  <div key={a.name} style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         8,
                    padding:     '6px 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <div style={{
                      width:           28,
                      height:          28,
                      borderRadius:    '50%',
                      backgroundColor: 'var(--color-brand-secondary)',
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      fontWeight:      700,
                      fontSize:        12,
                      color:           'var(--color-brand-primary)',
                      flexShrink:      0,
                    }}>
                      {a.initial}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>
                      {a.name}
                    </div>
                    <span style={{
                      marginLeft:      'auto',
                      width:           7,
                      height:          7,
                      borderRadius:    '50%',
                      backgroundColor: '#2F7D4F',
                      flexShrink:      0,
                    }} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_ITEMS.map((item) => (
          <React.Fragment key={item.href}>
            {item.section && (
              <div className="nav-section-label">{item.section}</div>
            )}
            <Link
              href={item.href}
              className={`nav-item ${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? 'active' : ''}`}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          </React.Fragment>
        ))}
      </nav>

      {/* User info + logout */}
      <div style={{
        padding: '14px 16px',
        borderTop: '1px solid var(--color-border)',
      }}>
        <Link href="/dashboard/profile" style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}
               className="nav-item" role="link">
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              backgroundColor: 'var(--color-brand-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
              color: 'var(--color-brand-primary)',
              flexShrink: 0,
            }}>
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {adminName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', textTransform: 'capitalize' }}>
                {adminRole}
              </div>
            </div>
          </div>
        </Link>
        <button
          onClick={onLogout}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }}
        >
          Log out
        </button>
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.4; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </aside>
  );
}
