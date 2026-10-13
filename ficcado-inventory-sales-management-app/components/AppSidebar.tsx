'use client';

/**
 * components/AppSidebar.tsx
 *
 * Ficcado Side Dash (Sidebar Navigation) — Collapsible Grouped Architecture (Phase 90–92).
 * Features:
 *  - 6 Collapsible logical groups + 1 top ungrouped Dashboard item.
 *  - Auto-expands group matching the current active route.
 *  - Remembers open/closed group states in localStorage per admin.
 *  - Unified, consistent SVG line icon system across all 20 destinations.
 *  - Pinned Top Brand Header & Pinned Bottom Admin Footer (never scroll away).
 */

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';

type NavIconName =
  | 'dashboard'
  | 'sales'
  | 'replacements'
  | 'returns'
  | 'damaged'
  | 'items'
  | 'inventory'
  | 'warehouse'
  | 'reconciliation'
  | 'expenses'
  | 'vendors'
  | 'profitability'
  | 'customers'
  | 'announcements'
  | 'activity'
  | 'sales_log'
  | 'inventory_history'
  | 'notes'
  | 'admin'
  | 'profile';

function NavIcon({ name, size = 18 }: { name: NavIconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'dashboard':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'sales':
      return (
        <svg {...props}>
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 01-8 0" />
        </svg>
      );
    case 'replacements':
      return (
        <svg {...props}>
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0115-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 01-15 6.7L3 16" />
        </svg>
      );
    case 'returns':
      return (
        <svg {...props}>
          <polyline points="9 14 4 9 9 4" />
          <path d="M20 20v-7a4 4 0 00-4-4H4" />
        </svg>
      );
    case 'damaged':
      return (
        <svg {...props}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'items':
      return (
        <svg {...props}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case 'inventory':
      return (
        <svg {...props}>
          <path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'warehouse':
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <path d="M9 8h1" />
          <path d="M9 12h1" />
          <path d="M9 16h1" />
          <path d="M14 8h1" />
          <path d="M14 12h1" />
          <path d="M14 16h1" />
          <path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" />
        </svg>
      );
    case 'reconciliation':
      return (
        <svg {...props}>
          <path d="M16 16l3-8 3 8a3 3 0 01-6 0z" />
          <path d="M2 16l3-8 3 8a3 3 0 01-6 0z" />
          <path d="M7 21h10" />
          <path d="M12 3v18" />
          <path d="M3 7h18" />
        </svg>
      );
    case 'expenses':
      return (
        <svg {...props}>
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      );
    case 'vendors':
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case 'profitability':
      return (
        <svg {...props}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case 'customers':
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case 'announcements':
      return (
        <svg {...props}>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M19.07 4.93a10 10 0 010 14.14" />
          <path d="M15.54 8.46a5 5 0 010 7.07" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...props}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'sales_log':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'inventory_history':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'notes':
      return (
        <svg {...props}>
          <path d="M15.5 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8.5L15.5 3z" />
          <path d="M14 3v6h6" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...props}>
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

interface NavItemDef {
  label: string;
  href:  string;
  icon:  NavIconName;
}

interface NavGroupDef {
  id:    string;
  title: string;
  items: NavItemDef[];
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'sales_orders',
    title: 'Sales & Orders',
    items: [
      { label: 'Sales',             href: '/dashboard/sales',            icon: 'sales' },
      { label: 'Replacements',      href: '/dashboard/replacement',      icon: 'replacements' },
      { label: 'Returns & Refunds', href: '/dashboard/return-refund',    icon: 'returns' },
      { label: 'Damaged Products',  href: '/dashboard/damaged-products', icon: 'damaged' },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    items: [
      { label: 'Items',          href: '/dashboard/items',          icon: 'items' },
      { label: 'Inventory',      href: '/dashboard/inventory',      icon: 'inventory' },
      { label: 'Warehouse',      href: '/dashboard/warehouse',      icon: 'warehouse' },
      { label: 'Reconciliation', href: '/dashboard/reconciliation', icon: 'reconciliation' },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    items: [
      { label: 'Expenses',      href: '/dashboard/expenses',               icon: 'expenses' },
      { label: 'Vendors',       href: '/dashboard/vendors',                icon: 'vendors' },
      { label: 'Profitability', href: '/dashboard/reports/profitability',  icon: 'profitability' },
    ],
  },
  {
    id: 'customers_comms',
    title: 'Customers & Comms',
    items: [
      { label: 'Customers',     href: '/dashboard/customers',     icon: 'customers' },
      { label: 'Announcements', href: '/dashboard/announcements', icon: 'announcements' },
    ],
  },
  {
    id: 'records',
    title: 'Records',
    items: [
      { label: 'Activity Log',      href: '/dashboard/activity',          icon: 'activity' },
      { label: 'Sales Log',         href: '/dashboard/sales-log',         icon: 'sales_log' },
      { label: 'Inventory History', href: '/dashboard/inventory-history', icon: 'inventory_history' },
      { label: 'Keep Notes',        href: '/dashboard/notes',             icon: 'notes' },
    ],
  },
  {
    id: 'admin',
    title: 'Admin',
    items: [
      { label: 'Admin Control', href: '/dashboard/admin',   icon: 'admin' },
      { label: 'My Profile',    href: '/dashboard/profile', icon: 'profile' },
    ],
  },
];

/** In-scope navigation routes for mobile mode */
const MOBILE_IN_SCOPE_HREFS = new Set([
  '/dashboard',
  '/dashboard/sales',
  '/dashboard/replacement',
  '/dashboard/return-refund',
  '/dashboard/sales-log',
  '/dashboard/inventory-history',
  '/dashboard/notes',
  '/dashboard/profile',
]);

interface OnlineAdmin {
  name:         string;
  lastActiveAt: string;
  initial:      string;
}

interface AppSidebarProps {
  adminName:     string;
  adminRole:     string;
  onLogout:      () => void;
  isOpenMobile?: boolean;
  onCloseMobile?:() => void;
}

export default function AppSidebar({ adminName, adminRole, onLogout }: AppSidebarProps) {
  const pathname = usePathname();

  // Mobile viewport detection
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  useEffect(() => {
    function checkMobile() {
      setIsMobileScreen(window.innerWidth <= 768);
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ── Collapsible Group Open/Close State (Phase 90) ──────────────────────────
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    sales_orders: true, // Default sales_orders open
  });

  // Load saved group state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ficcado_sidebar_open_groups');
      if (stored) {
        setOpenGroups(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Auto-expand group containing current route on route change
  useEffect(() => {
    const matchingGroup = NAV_GROUPS.find((g) =>
      g.items.some((item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)))
    );
    if (matchingGroup) {
      setOpenGroups((prev) => {
        if (prev[matchingGroup.id]) return prev;
        const next = { ...prev, [matchingGroup.id]: true };
        try { localStorage.setItem('ficcado_sidebar_open_groups', JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [pathname]);

  function toggleGroup(groupId: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try { localStorage.setItem('ficcado_sidebar_open_groups', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // ── Online presence state ──────────────────────────────────────────────────
  const [showPresencePopover, setShowPresencePopover] = useState(false);
  const [onlineAdmins, setOnlineAdmins]               = useState<OnlineAdmin[]>([]);
  const [presenceLoading, setPresenceLoading]         = useState(false);
  const heartbeatRef                                   = useRef<ReturnType<typeof setInterval> | null>(null);
  const popoverRef                                     = useRef<HTMLDivElement>(null);

  function sendHeartbeat() {
    fetch('/api/presence', { method: 'POST' }).catch(() => {});
  }

  useEffect(() => {
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 60_000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

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
      {/* ── PINNED TOP BRAND HEADER (Phase 92) ─────────────────────────────────── */}
      <div style={{
        padding: '16px 18px 10px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 6,
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

        {/* Online presence indicator */}
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
              padding:     '4px 0 2px',
              width:       '100%',
              textAlign:   'left',
            }}
            title="Click to see who's online"
          >
            <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <span style={{
                display:         'block',
                width:           8,
                height:          8,
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

          {/* Presence popover */}
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
                      width:           26,
                      height:          26,
                      borderRadius:    '50%',
                      backgroundColor: 'var(--color-brand-secondary)',
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      fontWeight:      700,
                      fontSize:        11,
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
                      width:           6,
                      height:          6,
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

      {/* ── MIDDLE SCROLLABLE NAVIGATION AREA (Phases 90 & 91) ────────────────── */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
        {/* Top Ungrouped Item: Dashboard */}
        <Link
          href="/dashboard"
          className={`nav-item ${pathname === '/dashboard' ? 'active' : ''}`}
          style={{ marginBottom: 8 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, flexShrink: 0 }}>
            <NavIcon name="dashboard" />
          </span>
          Dashboard
        </Link>

        {/* Collapsible Groups */}
        {NAV_GROUPS.map((group) => {
          // Filter in-scope items if on mobile screen
          const groupItems = isMobileScreen
            ? group.items.filter((i) => MOBILE_IN_SCOPE_HREFS.has(i.href))
            : group.items;

          if (groupItems.length === 0) return null;

          const isOpen = Boolean(openGroups[group.id]);
          const hasActiveChild = group.items.some((i) => pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href)));

          return (
            <div key={group.id} style={{ marginBottom: 4 }}>
              {/* Group Accordion Header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  width:          '100%',
                  padding:        '8px 16px',
                  background:     'none',
                  border:         'none',
                  fontSize:       11,
                  fontWeight:     700,
                  letterSpacing:  '0.06em',
                  color:          hasActiveChild ? 'var(--color-brand-primary)' : 'var(--color-ink-muted)',
                  textTransform:  'uppercase',
                  cursor:         'pointer',
                  textAlign:      'left',
                  transition:     'color 0.15s',
                }}
              >
                <span>{group.title}</span>
                <span style={{
                  display: 'inline-block',
                  fontSize: 10,
                  transition: 'transform 0.2s',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  color: 'var(--color-ink-muted)',
                }}>
                  ▶
                </span>
              </button>

              {/* Group Children */}
              {isOpen && (
                <div style={{ paddingLeft: 4 }}>
                  {groupItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, flexShrink: 0 }}>
                          <NavIcon name={item.icon} />
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── PINNED BOTTOM USER FOOTER (Phase 92) ─────────────────────────────── */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <Link href="/dashboard/profile" style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}
               className="nav-item" role="link">
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: 'var(--color-brand-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
              color: 'var(--color-brand-primary)',
              flexShrink: 0,
            }}>
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {adminName}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--color-ink-muted)', textTransform: 'capitalize' }}>
                {adminRole}
              </div>
            </div>
          </div>
        </Link>
        <button
          onClick={onLogout}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
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
