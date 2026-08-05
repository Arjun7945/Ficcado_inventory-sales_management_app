'use client';

/**
 * app/(app)/dashboard/page.tsx
 *
 * Dashboard home — shows today's sales summary, recent activity,
 * and quick-access cards for each module.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface DashboardStats {
  todaySales:       number;
  todayRevenue:     number;
  totalItems:       number;
  lowStockCount:    number;
  pendingReplacement: number;
  pendingRefunds:   number;
}

const MODULE_CARDS = [
  { label: 'Items',             href: '/dashboard/items',         icon: '◈', description: 'Manage clothing items & pricing' },
  { label: 'Inventory',         href: '/dashboard/inventory',     icon: '▦', description: 'Track stock levels by size' },
  { label: 'Warehouse',         href: '/dashboard/warehouse',     icon: '⬡', description: 'Manage warehouse locations' },
  { label: 'Sales',             href: '/dashboard/sales',         icon: '◆', description: 'Create & manage sales orders' },
  { label: 'Replacements',      href: '/dashboard/replacement',   icon: '⟳', description: 'Handle item replacements' },
  { label: 'Returns & Refunds', href: '/dashboard/return-refund', icon: '↩', description: 'Process returns and refunds' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((data) => {
        if (data.stats) setStats(data.stats);
        // If stats fail (sheet not configured), show zeros
        else setStats({ todaySales: 0, todayRevenue: 0, totalItems: 0, lowStockCount: 0, pendingReplacement: 0, pendingRefunds: 0 });
      })
      .catch(() => setStats({ todaySales: 0, todayRevenue: 0, totalItems: 0, lowStockCount: 0, pendingReplacement: 0, pendingRefunds: 0 }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingGecko size="full" label="Loading dashboard…" />;

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-subtitle">{today}</div>
        </div>
        <Link href="/dashboard/sales/new" className="btn btn-primary">
          + New Sale
        </Link>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label="Sales Today"          value={String(stats?.todaySales ?? 0)}     accent="primary" />
        <StatCard label="Revenue Today"        value={`₹${(stats?.todayRevenue ?? 0).toLocaleString('en-IN')}`} accent="primary" />
        <StatCard label="Total Items"          value={String(stats?.totalItems ?? 0)}     accent="neutral" />
        <StatCard label="Low Stock Alerts"     value={String(stats?.lowStockCount ?? 0)}  accent={stats?.lowStockCount ? 'warning' : 'neutral'} />
        <StatCard label="Pending Replacements" value={String(stats?.pendingReplacement ?? 0)} accent={stats?.pendingReplacement ? 'warning' : 'neutral'} />
        <StatCard label="Pending Refunds"      value={String(stats?.pendingRefunds ?? 0)} accent={stats?.pendingRefunds ? 'error' : 'neutral'} />
      </div>

      {/* Module cards */}
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
        Modules
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {MODULE_CARDS.map((card) => (
          <Link key={card.href} href={card.href} style={{ textDecoration: 'none' }}>
            <div
              className="card"
              style={{
                cursor: 'pointer',
                transition: 'box-shadow 0.15s, transform 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: 24, color: 'var(--color-brand-primary)' }}>{card.icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>{card.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>{card.description}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: 'primary' | 'warning' | 'error' | 'neutral' }) {
  const colors = {
    primary: 'var(--color-brand-primary)',
    warning: 'var(--color-warning)',
    error:   'var(--color-error)',
    neutral: 'var(--color-ink)',
  };

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 24,
        fontWeight: 700,
        color: colors[accent],
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2, fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
}
