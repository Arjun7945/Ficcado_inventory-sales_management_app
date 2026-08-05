'use client';
/**
 * components/NotificationBell.tsx
 *
 * Notification bell icon showing unread activity count.
 * Clicking opens a slide-down panel with recent activity log entries.
 * Human-readable format: "Rohith updated Sales Management on FIC-215 on 02/08/2026 at 5:14 PM"
 */
import React, { useState, useEffect, useRef } from 'react';

interface ActivityEntry {
  id:         string;
  adminName:  string;
  action:     string;
  module:     string;
  recordId:   string;
  timestamp:  string;
  read:       boolean;
}

function formatActivityMessage(entry: ActivityEntry): string {
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const actionWord = entry.action === 'created' ? 'added a record to'
    : entry.action === 'updated'  ? 'updated'
    : entry.action === 'deleted'  ? 'deleted a record from'
    : entry.action;
  const recordPart = entry.recordId ? ` — '${entry.recordId}'` : '';
  return `${entry.adminName} ${actionWord} ${entry.module}${recordPart} on ${dateStr} at ${timeStr}`;
}

export default function NotificationBell() {
  const [entries, setEntries]       = useState<ActivityEntry[]>([]);
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [readIds, setReadIds]       = useState<Set<string>>(new Set());
  const panelRef                    = useRef<HTMLDivElement>(null);
  const buttonRef                   = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Load stored read IDs from localStorage
    try {
      const stored = localStorage.getItem('ficcado_read_notifications');
      if (stored) setReadIds(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  async function loadNotifications() {
    setLoading(true);
    try {
      const res = await fetch('/api/activity?limit=30');
      if (res.ok) {
        const data = await res.json();
        const rows: any[] = data.entries || [];
        setEntries(rows.map((r, i) => ({
          id:        r.timestamp + i,
          adminName: r.adminName || 'Unknown',
          action:    r.action    || 'acted',
          module:    r.module    || r.moduleKey || 'a sheet',
          recordId:  r.recordId  || '',
          timestamp: r.timestamp || new Date().toISOString(),
          read:      false,
        })));
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && panelRef.current && !panelRef.current.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function markAllRead() {
    const allIds = new Set(entries.map((e) => e.id));
    setReadIds(allIds);
    try { localStorage.setItem('ficcado_read_notifications', JSON.stringify([...allIds])); } catch {}
  }

  const unreadCount = entries.filter((e) => !readIds.has(e.id)).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => { setOpen((v) => !v); if (!open) loadNotifications(); }}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 8,
          color: 'var(--color-ink-muted)',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s',
        }}
        title="Activity notifications"
        aria-label="View activity notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 2, right: 2,
            background: 'var(--color-error, #e53935)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            borderRadius: '50%',
            minWidth: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            zIndex: 1000,
            background: 'var(--color-surface, #1a1f2e)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            width: 340,
            maxHeight: 440,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Activity</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-brand-primary)', fontWeight: 600 }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 12 }}>Loading…</div>}
            {!loading && entries.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 12 }}>
                No activity yet.
              </div>
            )}
            {!loading && entries.map((entry) => {
              const isRead = readIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--color-border)',
                    background: isRead ? 'transparent' : 'rgba(43,98,198,0.07)',
                    cursor: 'default',
                  }}
                  onClick={() => {
                    setReadIds((prev) => {
                      const next = new Set(prev); next.add(entry.id);
                      try { localStorage.setItem('ficcado_read_notifications', JSON.stringify([...next])); } catch {}
                      return next;
                    });
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--color-ink)', lineHeight: 1.5 }}>
                    {formatActivityMessage(entry)}
                  </div>
                  {!isRead && (
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--color-brand-primary)', marginTop: 4 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
