'use client';

/**
 * components/AppSidebar.tsx
 *
 * Main navigation sidebar — visible to all logged-in admins.
 * Superadmin sees additional admin management items.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface NavItem {
  label:    string;
  href:     string;
  icon:     string;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',         href: '/dashboard',         icon: '⊞', section: 'OVERVIEW' },
  { label: 'Items',             href: '/dashboard/items',   icon: '◈', section: 'MODULES' },
  { label: 'Inventory',         href: '/dashboard/inventory', icon: '▦' },
  { label: 'Warehouse',         href: '/dashboard/warehouse', icon: '⬡' },
  { label: 'Sales',             href: '/dashboard/sales',   icon: '◆' },
  { label: 'Replacements',      href: '/dashboard/replacement', icon: '⟳' },
  { label: 'Returns & Refunds', href: '/dashboard/return-refund', icon: '↩' },
  { label: 'Activity Log',      href: '/dashboard/activity', icon: '◉', section: 'RECORDS' },
  { label: 'Keep Notes',        href: '/dashboard/notes',   icon: '✎' },
  { label: 'Admin Control',     href: '/dashboard/admin',   icon: '⚙', section: 'ADMIN' },
];

interface AppSidebarProps {
  adminName:  string;
  adminRole:  string;
  onLogout:   () => void;
}

export default function AppSidebar({ adminName, adminRole, onLogout }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      {/* Brand logo area */}
      <div style={{
        padding: '20px 20px 12px',
        borderBottom: '1px solid var(--color-border)',
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
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_ITEMS.map((item, i) => (
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
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
        <button
          onClick={onLogout}
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }}
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
