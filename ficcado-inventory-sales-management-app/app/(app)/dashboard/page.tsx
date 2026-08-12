'use client';

/**
 * app/(app)/dashboard/page.tsx
 *
 * Dashboard home — shows Today's Sale vs Overall Sale summary,
 * recent Sales Log feed, and quick-access cards for each module.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardStats {
  todaySales:                number;
  todayRevenue:              number;
  todayUnpaidRevenue:        number;
  todayUnpaidSales:          number;
  todayItemsSold:            number;
  totalItems:                number;
  lowStockCount:             number;
  pendingReplacement:        number;
  pendingRefunds:            number;
  overallSales:              number;
  overallRevenue:            number;
  overallUnpaidRevenue:      number;
  overallUnpaidSales:        number;
  totalPendingReplacements:  number;
  totalPendingRefunds:      number;
}

interface SalesLogItem {
  sno: string;
  module: string;
  operation: string;
  relatedInvoiceNumber: string;
  message: string;
  createdAt: string;
  createdBy: string;
}

const MODULE_CARDS = [
  { label: 'Items',             href: '/dashboard/items',         icon: '◈', description: 'Manage clothing items & pricing' },
  { label: 'Inventory',         href: '/dashboard/inventory',     icon: '▦', description: 'Track stock levels by size' },
  { label: 'Warehouse',         href: '/dashboard/warehouse',     icon: '⬡', description: 'Manage warehouse locations' },
  { label: 'Sales',             href: '/dashboard/sales',         icon: '◆', description: 'Create & manage sales orders' },
  { label: 'Replacements',      href: '/dashboard/replacement',   icon: '⟳', description: 'Handle item replacements' },
  { label: 'Returns & Refunds', href: '/dashboard/return-refund', icon: '↩', description: 'Process returns and refunds' },
  { label: 'Sales Log',         href: '/dashboard/sales-log',     icon: '📋', description: 'Detailed narrative transaction audit log' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesLogs, setSalesLogs] = useState<SalesLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'today' | 'overall'>('today');
  const [unreadLogCount, setUnreadLogCount] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then((r) => r.json()),
      fetch('/api/sales-log?limit=10').then((r) => r.json()).catch(() => ({ logs: [] })),
    ])
      .then(([statsData, logsData]) => {
        if (statsData.stats) setStats(statsData.stats);
        if (logsData.logs) {
          setSalesLogs(logsData.logs);
          // Calculate unread logs since last visit
          const lastReadTime = localStorage.getItem('ficcado_last_read_sales_log_time');
          if (lastReadTime) {
            const count = logsData.logs.filter((l: SalesLogItem) => new Date(l.createdAt).getTime() > new Date(lastReadTime).getTime()).length;
            setUnreadLogCount(count);
          } else if (logsData.logs.length > 0) {
            setUnreadLogCount(logsData.logs.length);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-subtitle">{today}</div>
        </div>
        <Link href="/dashboard/sales/new" className="btn btn-primary">
          + New Sale
        </Link>
      </div>

      {/* ── Mobile Navigation Hub Grid (Visible only on Mobile Viewports) ──────── */}
      <div className="mobile-only" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          Quick Navigation
        </h2>
        <div className="mobile-nav-grid">
          <Link href="/dashboard/sales" className="mobile-nav-card">
            <span className="nav-card-icon" style={{ color: 'var(--color-brand-primary)' }}>◆</span>
            <span className="nav-card-title">Sales</span>
          </Link>
          <Link href="/dashboard/replacement" className="mobile-nav-card">
            <span className="nav-card-icon" style={{ color: 'var(--color-warning)' }}>⟳</span>
            <span className="nav-card-title">Replacement</span>
          </Link>
          <Link href="/dashboard/return-refund" className="mobile-nav-card">
            <span className="nav-card-icon" style={{ color: 'var(--color-error)' }}>↩</span>
            <span className="nav-card-title">Return & Refund</span>
          </Link>
          <Link href="/dashboard/sales-log" className="mobile-nav-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span className="nav-card-icon" style={{ color: 'var(--color-brand-primary)' }}>📋</span>
              {unreadLogCount > 0 && (
                <span style={{
                  backgroundColor: 'var(--color-error)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '2px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                }}>
                  {unreadLogCount} NEW
                </span>
              )}
            </div>
            <span className="nav-card-title">Sales Log</span>
          </Link>
          <Link href="/dashboard/inventory-history" className="mobile-nav-card">
            <span className="nav-card-icon" style={{ color: 'var(--color-success)' }}>📊</span>
            <span className="nav-card-title">Stock History</span>
          </Link>
          <Link href="/dashboard/notes" className="mobile-nav-card">
            <span className="nav-card-icon" style={{ color: 'var(--color-brand-primary)' }}>✎</span>
            <span className="nav-card-title">Keep Notes</span>
          </Link>
          <Link href="/dashboard/profile" className="mobile-nav-card" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="nav-card-icon" style={{ color: 'var(--color-ink-muted)' }}>👤</span>
              <span className="nav-card-title">My Profile & Settings</span>
            </div>
          </Link>
        </div>
      </div>

      {/* A6: View Mode Dropdown Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label htmlFor="sales-view-toggle" style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-ink-muted)' }}>
            Filter Sales View:
          </label>
          <select
            id="sales-view-toggle"
            className="form-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'today' | 'overall')}
            style={{ width: 170, fontWeight: 600 }}
          >
            <option value="today">Today&apos;s Sale</option>
            <option value="overall">Overall Sale</option>
          </select>
        </div>
      </div>

      {/* Stats row */}
      {viewMode === 'today' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
          <StatCard label="Revenue Today (Paid)" value={`₹${(stats?.todayRevenue ?? 0).toLocaleString('en-IN')}`} accent="primary" loading={loading} />
          <StatCard label="Unpaid Sale Today"    value={`₹${(stats?.todayUnpaidRevenue ?? 0).toLocaleString('en-IN')}`} subtext={`${stats?.todayUnpaidSales ?? 0} unpaid orders`} accent={stats?.todayUnpaidSales ? 'warning' : 'neutral'} loading={loading} />
          <StatCard label="Sales Count Today"    value={String(stats?.todaySales ?? 0)}     accent="neutral" loading={loading} />
          <StatCard label="Total Items Sold"     value={String(stats?.todayItemsSold ?? 0)} accent="neutral" loading={loading} />
          <StatCard label="Low Stock Alerts"     value={String(stats?.lowStockCount ?? 0)}  accent={stats?.lowStockCount ? 'warning' : 'neutral'} loading={loading} />
          <StatCard label="Pending Replacements" value={String(stats?.pendingReplacement ?? 0)} accent={stats?.pendingReplacement ? 'warning' : 'neutral'} loading={loading} />
          <StatCard label="Pending Return/Refund" value={String(stats?.pendingRefunds ?? 0)} accent={stats?.pendingRefunds ? 'error' : 'neutral'} loading={loading} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
          <StatCard label="Total Revenue (Paid)" value={`₹${(stats?.overallRevenue ?? 0).toLocaleString('en-IN')}`} accent="primary" loading={loading} />
          <StatCard label="Total Unpaid Sale"   value={`₹${(stats?.overallUnpaidRevenue ?? 0).toLocaleString('en-IN')}`} subtext={`${stats?.overallUnpaidSales ?? 0} unpaid orders`} accent={stats?.overallUnpaidSales ? 'warning' : 'neutral'} loading={loading} />
          <StatCard label="Total Sales Made"          value={String(stats?.overallSales ?? 0)} accent="neutral" loading={loading} />
          <StatCard label="Total Pending Replacements" value={String(stats?.totalPendingReplacements ?? 0)} accent={stats?.totalPendingReplacements ? 'warning' : 'neutral'} loading={loading} />
          <StatCard label="Total Pending Return/Refund" value={String(stats?.totalPendingRefunds ?? 0)} accent={stats?.totalPendingRefunds ? 'error' : 'neutral'} loading={loading} />
        </div>
      )}

      {/* Desktop Modules Grid */}
      <div className="desktop-only">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          Modules
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
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

      {/* Inventory History Summary Card */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, color: 'var(--color-success)' }}>📊</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Inventory History & Stock Adjustments</div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Track all stock movements, manual adjustments & sales deductions</div>
            </div>
          </div>
          <Link href="/dashboard/inventory-history" className="btn btn-ghost btn-sm">
            View History →
          </Link>
        </div>
      </div>

      {/* B3.B: Latest Sales Log Feed Widget */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📋</span> Latest Sales Activity Log
            {unreadLogCount > 0 && (
              <span style={{
                backgroundColor: 'var(--color-error)',
                color: '#fff',
                borderRadius: 10,
                padding: '2px 7px',
                fontSize: 11,
                fontWeight: 700,
              }}>
                {unreadLogCount} New
              </span>
            )}
          </h2>
          <Link href="/dashboard/sales-log" style={{ fontSize: 13, color: 'var(--color-brand-primary)', fontWeight: 600, textDecoration: 'none' }}>
            View Full Sales Log →
          </Link>
        </div>

        {salesLogs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', padding: '12px 0' }}>
            No recent sales log activity recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {salesLogs.slice(0, 10).map((log) => (
              <div
                key={log.sno}
                style={{
                  padding: '10px 12px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  fontSize: 12.5,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--color-ink-muted)', fontSize: 11 }}>
                  <span>
                    <strong style={{ color: 'var(--color-brand-primary)' }}>{log.module}</strong> ({log.operation})
                    {log.relatedInvoiceNumber && ` — Invoice: ${log.relatedInvoiceNumber}`}
                  </span>
                  <span>{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                </div>
                <div style={{ color: 'var(--color-ink)', lineHeight: 1.4 }}>
                  {log.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, subtext, accent, loading = false }: { label: string; value: string; subtext?: string; accent: 'primary' | 'warning' | 'error' | 'neutral'; loading?: boolean }) {
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
        {loading ? <span style={{ fontSize: 16, color: 'var(--color-ink-muted)' }}>…</span> : value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2, fontWeight: 500 }}>
        {label}
      </div>
      {subtext && !loading && (
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>
          {subtext}
        </div>
      )}
    </div>
  );
}
