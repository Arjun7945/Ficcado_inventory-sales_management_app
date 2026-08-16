'use client';

/**
 * app/(app)/dashboard/announcements/page.tsx
 *
 * Extraordinary Announcements & Customer Emails Workspace (Phase 79 — B6).
 * Redesigned according to Ficcado DESIGN.md:
 *  - 4 Interactive Audience Segment Cards (All, Repeat, New, Custom)
 *  - Structured Customer Selection Table with Pagination (10/page) & Real-time Search
 *  - High-Speed Parallel Email Dispatch with SMTP connection pooling
 *  - Real-time Markdown rendering preview
 *  - Drag & Drop file attachment dropzone with file format icons & payload size gauge
 *  - Past Broadcast History log
 */

import { useState, useEffect } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { formatISTDateTime } from '@/lib/dateUtils';
import { renderEmailMarkdown } from '@/lib/emailMarkdown';

interface CustomerOption {
  name:        string;
  phone:       string;
  email:       string;
  totalOrders: number;
}

interface BroadcastLog {
  sno:             string;
  subject:         string;
  targetAudience:  string;
  recipientsCount: string;
  sentCount:       string;
  failedCount:     string;
  createdAt:       string;
  createdBy:       string;
}

interface AttachedFileItem {
  id:          string;
  filename:    string;
  sizeBytes:   number;
  contentType: string;
  base64Data:  string;
}

const MAX_TOTAL_ATTACHMENT_MB = 15;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileIcon(type: string): string {
  if (type.includes('pdf')) return '📄';
  if (type.includes('image')) return '🖼️';
  if (type.includes('zip') || type.includes('rar')) return '📦';
  return '📎';
}

export default function AnnouncementsPage() {
  const [customers, setCustomers]     = useState<CustomerOption[]>([]);
  const [historyLogs, setHistoryLogs] = useState<BroadcastLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<{ message: string } | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);

  // Audience Segment selection
  const [audienceType, setAudienceType]     = useState<'all' | 'orders_gte' | 'orders_lt' | 'custom'>('all');
  const [minOrders, setMinOrders]           = useState<number>(2);
  const [maxOrders, setMaxOrders]           = useState<number>(2);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);

  // Form state
  const [subject, setSubject]         = useState('');
  const [bodyText, setBodyText]       = useState('');
  const [attachments, setAttachments] = useState<AttachedFileItem[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const [sending, setSending]         = useState(false);

  // Custom Selection Search & Pagination state
  const [customSearchTerm, setCustomSearchTerm] = useState('');
  const [customCurrentPage, setCustomCurrentPage] = useState(1);
  const [customPerPage, setCustomPerPage]         = useState(10);

  async function loadData() {
    setLoading(true);
    try {
      const [custRes, histRes] = await Promise.all([
        fetch('/api/customer-info').then((r) => r.json()),
        fetch('/api/announcements').then((r) => r.json()).catch(() => ({ logs: [] })),
      ]);

      if (custRes.customers) {
        const parsed: CustomerOption[] = custRes.customers.map((c: any) => ({
          name:        c.name || 'Valued Customer',
          phone:       c.phone,
          email:       (c.email || '').trim(),
          totalOrders: parseInt(c.totalOrders || '0', 10) || 0,
        }));
        setCustomers(parsed);
      }
      if (histRes.logs) setHistoryLogs(histRes.logs);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Compute targeted list based on current filters
  const targetedCustomers = customers.filter((c) => {
    if (audienceType === 'orders_gte') return c.totalOrders >= minOrders;
    if (audienceType === 'orders_lt')  return c.totalOrders < maxOrders;
    if (audienceType === 'custom')     return selectedPhones.includes(c.phone);
    return true; // 'all'
  });

  const targetedWithEmail = targetedCustomers.filter((c) => c.email && c.email.includes('@'));
  const skippedNoEmail    = targetedCustomers.length - targetedWithEmail.length;

  const totalAttachmentBytes = attachments.reduce((sum, f) => sum + f.sizeBytes, 0);
  const totalAttachmentMB    = totalAttachmentBytes / (1024 * 1024);
  const isAttachmentOverLimit = totalAttachmentMB > MAX_TOTAL_ATTACHMENT_MB;

  // Custom Selection Table Filtering & Pagination
  const filteredCustomCustomers = customers.filter((c) => {
    if (!customSearchTerm.trim()) return true;
    const term = customSearchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      c.phone.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term)
    );
  });

  const totalCustomPages = Math.ceil(filteredCustomCustomers.length / customPerPage) || 1;
  const paginatedCustomCustomers = filteredCustomCustomers.slice(
    (customCurrentPage - 1) * customPerPage,
    customCurrentPage * customPerPage
  );

  // Selection Batch Actions
  function selectOnlyWithEmail() {
    const emailPhones = customers.filter((c) => c.email && c.email.includes('@')).map((c) => c.phone);
    setSelectedPhones(emailPhones);
  }

  function selectAllFiltered() {
    const filteredPhones = filteredCustomCustomers.map((c) => c.phone);
    setSelectedPhones((prev) => Array.from(new Set([...prev, ...filteredPhones])));
  }

  function deselectAll() {
    setSelectedPhones([]);
  }

  function togglePhone(phone: string) {
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  }

  function toggleSelectPage() {
    const pagePhones = paginatedCustomCustomers.map((c) => c.phone);
    const allSelected = pagePhones.every((p) => selectedPhones.includes(p));

    if (allSelected) {
      setSelectedPhones((prev) => prev.filter((p) => !pagePhones.includes(p)));
    } else {
      setSelectedPhones((prev) => Array.from(new Set([...prev, ...pagePhones])));
    }
  }

  function insertVariable(token: string) {
    setBodyText((prev) => prev + token);
  }

  // Handle file selection
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setReadingFiles(true);
    setError(null);

    const newAttachments: AttachedFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const resStr = reader.result as string;
            const base64Clean = resStr.split(',')[1] || '';
            resolve(base64Clean);
          };
          reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
          reader.readAsDataURL(file);
        });

        newAttachments.push({
          id:          `${file.name}-${Date.now()}-${i}`,
          filename:    file.name,
          sizeBytes:   file.size,
          contentType: file.type || 'application/octet-stream',
          base64Data:  base64,
        });
      } catch (err: any) {
        setError({ message: `Could not process file "${file.name}": ${err?.message}` });
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setReadingFiles(false);
    e.target.value = '';
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!subject.trim()) {
      setError({ message: 'Validation Failed: Email Subject is required. Please type a subject before sending.' });
      return;
    }

    if (!bodyText.trim()) {
      setError({ message: 'Validation Failed: Email Body content is required. Please enter the announcement text.' });
      return;
    }

    if (targetedWithEmail.length === 0) {
      setError({
        message: `Validation Failed: No recipients with valid email addresses match the selected segment. (${targetedCustomers.length} targeted, ${skippedNoEmail} missing email).`,
      });
      return;
    }

    if (isAttachmentOverLimit) {
      setError({
        message: `Validation Failed: Total attachments size is ${totalAttachmentMB.toFixed(2)} MB, exceeding the maximum allowed limit of ${MAX_TOTAL_ATTACHMENT_MB} MB for Gmail. Please remove some files.`,
      });
      return;
    }

    const confirmMsg = `Are you sure you want to broadcast this announcement to ${targetedWithEmail.length} customer(s)?${
      attachments.length > 0 ? `\n\nAttachments (${attachments.length}): ${attachments.map((a) => a.filename).join(', ')}` : ''
    }`;

    if (!confirm(confirmMsg)) return;

    setSending(true);
    try {
      const payloadAttachments = attachments.map((a) => ({
        filename:    a.filename,
        content:     a.base64Data,
        contentType: a.contentType,
        sizeBytes:   a.sizeBytes,
      }));

      const res = await fetch('/api/announcements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audienceType,
          minOrders: audienceType === 'orders_gte' ? minOrders : undefined,
          maxOrders: audienceType === 'orders_lt' ? maxOrders : undefined,
          selectedPhones: audienceType === 'custom' ? selectedPhones : undefined,
          subject,
          bodyText,
          attachments: payloadAttachments,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.error || 'Broadcast Validation Failed.' });
        return;
      }

      setSuccess(`Announcement broadcast complete! Sent: ${data.summary.sentCount}, Failed: ${data.summary.failedCount}, Skipped: ${data.summary.skippedNoEmailCount}.${
        attachments.length > 0 ? ` (${attachments.length} attachment(s) included)` : ''
      }`);
      setSubject('');
      setBodyText('');
      setAttachments([]);
      loadData();
    } catch {
      setError({ message: "Validation Failed: Couldn't connect to server to broadcast emails." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Announcements & Customer Broadcasts</h1>
          <div className="page-subtitle">Craft branded emails, attach brochures & coupons, and target specific customer segments</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
          ⟳ Refresh
        </button>
      </div>

      {/* Gmail Rate Limit Warning Banner */}
      <div style={{
        background: 'rgba(255,160,0,0.08)',
        border: '1px solid var(--color-warning)',
        borderRadius: 10,
        padding: '12px 18px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <div style={{ fontSize: 22 }}>⚡</div>
        <div style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.4 }}>
          <strong>High-Speed Parallel Mail Engine Active:</strong> Multi-threaded SMTP connection pooling dispatches 100+ emails in seconds. Maximum recommended attachment payload is <strong>15 MB</strong> per broadcast.
        </div>
      </div>

      {error   && <ErrorMessage message={error.message}   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success} variant="success" onDismiss={() => setSuccess(null)} />}

      {/* ── Audience Segment Interactive Card Selector ──────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <label className="form-label" style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-brand-primary)', margin: 0 }}>
            SELECT AUDIENCE TARGETING SEGMENT *
          </label>
          <span className="badge badge-primary" style={{ fontSize: 11 }}>
            Targeting {targetedWithEmail.length} customer(s) ({skippedNoEmail} no email)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {/* Card 1: All Customers */}
          <div
            onClick={() => setAudienceType('all')}
            style={{
              padding: 16,
              borderRadius: 10,
              cursor: 'pointer',
              background: audienceType === 'all' ? 'rgba(43,98,198,0.04)' : 'var(--color-bg)',
              border: audienceType === 'all' ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
              boxShadow: audienceType === 'all' ? '0 4px 12px rgba(43,98,198,0.08)' : 'none',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
          >
            {audienceType === 'all' && (
              <span className="badge badge-primary" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10 }}>
                ✓ Active
              </span>
            )}
            <div style={{ fontSize: 24, marginBottom: 6 }}>👥</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-ink)', marginBottom: 2 }}>
              All Customers
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.3 }}>
              Broadcast to entire database ({customers.length} total, {customers.filter((c) => c.email).length} with email)
            </div>
          </div>

          {/* Card 2: Repeat Customers */}
          <div
            onClick={() => setAudienceType('orders_gte')}
            style={{
              padding: 16,
              borderRadius: 10,
              cursor: 'pointer',
              background: audienceType === 'orders_gte' ? 'rgba(43,98,198,0.04)' : 'var(--color-bg)',
              border: audienceType === 'orders_gte' ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
              boxShadow: audienceType === 'orders_gte' ? '0 4px 12px rgba(43,98,198,0.08)' : 'none',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
          >
            {audienceType === 'orders_gte' && (
              <span className="badge badge-primary" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10 }}>
                ✓ Active
              </span>
            )}
            <div style={{ fontSize: 24, marginBottom: 6 }}>🔁</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-ink)', marginBottom: 2 }}>
              Repeat Buyers
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.3, marginBottom: 8 }}>
              Target loyal buyers with Total Orders ≥
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                className="form-input"
                style={{ width: 75, padding: '4px 8px', fontSize: 13, fontWeight: 700 }}
                value={minOrders}
                onChange={(e) => setMinOrders(parseInt(e.target.value, 10) || 1)}
                min="1"
              />
              <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>order(s)</span>
            </div>
          </div>

          {/* Card 3: New Buyers */}
          <div
            onClick={() => setAudienceType('orders_lt')}
            style={{
              padding: 16,
              borderRadius: 10,
              cursor: 'pointer',
              background: audienceType === 'orders_lt' ? 'rgba(43,98,198,0.04)' : 'var(--color-bg)',
              border: audienceType === 'orders_lt' ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
              boxShadow: audienceType === 'orders_lt' ? '0 4px 12px rgba(43,98,198,0.08)' : 'none',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
          >
            {audienceType === 'orders_lt' && (
              <span className="badge badge-primary" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10 }}>
                ✓ Active
              </span>
            )}
            <div style={{ fontSize: 24, marginBottom: 6 }}>🌱</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-ink)', marginBottom: 2 }}>
              New / First-Timers
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.3, marginBottom: 8 }}>
              Target first-time buyers with Total Orders &lt;
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                className="form-input"
                style={{ width: 75, padding: '4px 8px', fontSize: 13, fontWeight: 700 }}
                value={maxOrders}
                onChange={(e) => setMaxOrders(parseInt(e.target.value, 10) || 1)}
                min="1"
              />
              <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>order(s)</span>
            </div>
          </div>

          {/* Card 4: Custom Pick */}
          <div
            onClick={() => setAudienceType('custom')}
            style={{
              padding: 16,
              borderRadius: 10,
              cursor: 'pointer',
              background: audienceType === 'custom' ? 'rgba(43,98,198,0.04)' : 'var(--color-bg)',
              border: audienceType === 'custom' ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
              boxShadow: audienceType === 'custom' ? '0 4px 12px rgba(43,98,198,0.08)' : 'none',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
          >
            {audienceType === 'custom' && (
              <span className="badge badge-primary" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10 }}>
                ✓ Active
              </span>
            )}
            <div style={{ fontSize: 24, marginBottom: 6 }}>🎯</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-ink)', marginBottom: 2 }}>
              Custom Pick
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.3 }}>
              Hand-pick specific customers via interactive table ({selectedPhones.length} selected)
            </div>
          </div>
        </div>
      </div>

      {/* ── Structured Custom Selection Table with Search & Pagination ── */}
      {audienceType === 'custom' && (
        <div className="card" style={{ padding: 18, marginBottom: 24, background: '#FFFFFF' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}>
              <input
                type="text"
                className="form-input"
                placeholder="🔍 Search customer by name, phone, or email…"
                value={customSearchTerm}
                onChange={(e) => {
                  setCustomSearchTerm(e.target.value);
                  setCustomCurrentPage(1);
                }}
                style={{ fontSize: 13, padding: '7px 14px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={selectOnlyWithEmail}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                ✓ Select With Email
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={selectAllFiltered}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                ✓ Select All Filtered
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={deselectAll}
                style={{ fontSize: 12, padding: '4px 10px', color: 'var(--color-error)' }}
              >
                ✕ Deselect All
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Per Page:</span>
                <select
                  className="form-select"
                  value={customPerPage}
                  onChange={(e) => {
                    setCustomPerPage(parseInt(e.target.value, 10));
                    setCustomCurrentPage(1);
                  }}
                  style={{ fontSize: 12, padding: '4px 8px' }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, background: '#FFFFFF' }}>
            {paginatedCustomCustomers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>
                No customers found matching &quot;{customSearchTerm}&quot;.
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={
                          paginatedCustomCustomers.length > 0 &&
                          paginatedCustomCustomers.every((c) => selectedPhones.includes(c.phone))
                        }
                        onChange={toggleSelectPage}
                      />
                    </th>
                    <th>Customer Name</th>
                    <th>Phone Number</th>
                    <th>Email Address</th>
                    <th style={{ textAlign: 'center' }}>Total Orders</th>
                    <th>Email Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomCustomers.map((c) => {
                    const isSelected = selectedPhones.includes(c.phone);
                    const hasEmail   = c.email && c.email.includes('@');
                    return (
                      <tr key={c.phone} style={{ background: isSelected ? 'rgba(43,98,198,0.04)' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePhone(c.phone)}
                          />
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{c.name}</td>
                        <td style={{ fontSize: 12.5, color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' }}>{c.phone}</td>
                        <td style={{ fontSize: 12.5 }}>{c.email || '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.totalOrders}</td>
                        <td>
                          {hasEmail ? (
                            <span className="badge badge-success" style={{ fontSize: 11 }}>Registered Email</span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: 11 }}>No Email</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Pagination Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12.5, color: 'var(--color-ink-muted)' }}>
            <div>
              Showing <strong>{filteredCustomCustomers.length > 0 ? (customCurrentPage - 1) * customPerPage + 1 : 0}</strong>–
              <strong>{Math.min(customCurrentPage * customPerPage, filteredCustomCustomers.length)}</strong> of{' '}
              <strong>{filteredCustomCustomers.length}</strong> customer(s) • <strong style={{ color: 'var(--color-brand-primary)' }}>{selectedPhones.length} selected for broadcast</strong>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={customCurrentPage === 1}
                onClick={() => setCustomCurrentPage((p) => Math.max(p - 1, 1))}
              >
                ← Previous
              </button>
              <span style={{ fontWeight: 600 }}>Page {customCurrentPage} of {totalCustomPages}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={customCurrentPage >= totalCustomPages}
                onClick={() => setCustomCurrentPage((p) => Math.min(p + 1, totalCustomPages))}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 28 }}>
        {/* Main Compose Card */}
        <div className="card">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, marginBottom: 18, borderBottom: '1px solid var(--color-border)', paddingBottom: 10, color: 'var(--color-brand-primary)' }}>
            ✍ Compose Announcement Email
          </h2>

          <form onSubmit={handleSendAnnouncement}>
            {/* Email Subject */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontWeight: 700 }}>Email Subject *</label>
              <input
                type="text"
                className="form-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Special Product Catalog & New Collection Coupon inside!"
                required
              />
            </div>

            {/* Email Body with Personalization Helper */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>Email Content (Markdown Enabled) *</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Insert Tag:</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => insertVariable('{customerName}')}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    + &#123;customerName&#125;
                  </button>
                </div>
              </div>

              <textarea
                className="form-textarea"
                rows={8}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Dear {customerName},&#10;&#10;**Happy Independence Day!**&#10;Please find attached our latest product brochure and greeting letter...&#10;&#10;[Visit Website](http://www.ficcado.store)"
                required
              />
            </div>

            {/* ── File Attachments Section ─────────────────────────────────── */}
            <div className="form-group" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                  <span>📎 Attach Files & Documents</span>
                  <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--color-ink-muted)' }}>
                    (Brochures, Product Images, PDF Coupons, Greeting Letters)
                  </span>
                </label>
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: isAttachmentOverLimit ? 'var(--color-error)' : 'var(--color-ink-muted)',
                }}>
                  Payload: {totalAttachmentMB.toFixed(2)} MB / {MAX_TOTAL_ATTACHMENT_MB} MB
                </span>
              </div>

              {/* Upload Drop Area */}
              <div style={{
                border: `2px dashed ${isAttachmentOverLimit ? 'var(--color-error)' : 'var(--color-border)'}`,
                borderRadius: 10,
                padding: '20px 24px',
                textAlign: 'center',
                background: 'var(--color-surface)',
                transition: 'all 0.2s ease',
              }}>
                <input
                  id="announcement-file-input"
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                />
                <label
                  htmlFor="announcement-file-input"
                  className="btn btn-secondary btn-sm"
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13 }}
                >
                  {readingFiles ? <LoadingGecko size="inline" label="Processing files…" /> : '📁 Select Files to Attach'}
                </label>
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 8 }}>
                  Supports PDF brochures, product photos (JPG/PNG), Word documents, & Excel sheets up to 15 MB.
                </div>
              </div>

              {/* Attached Files List */}
              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#FFFFFF',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                        <span style={{ fontSize: 18 }}>{getFileIcon(att.contentType)}</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.filename}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', flexShrink: 0 }}>
                          ({formatFileSize(att.sizeBytes)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 18,
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                        title="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
                Targeting: <strong style={{ color: 'var(--color-brand-primary)' }}>{targetedWithEmail.length}</strong> recipient(s)
                {skippedNoEmail > 0 && ` (${skippedNoEmail} skipped — no email address)`}
              </div>

              <button type="submit" className="btn btn-primary" disabled={sending || targetedWithEmail.length === 0 || isAttachmentOverLimit} style={{ padding: '10px 20px', fontSize: 14 }}>
                {sending ? <LoadingGecko size="inline" label="Broadcasting emails…" /> : '✉ Broadcast Announcement'}
              </button>
            </div>
          </form>
        </div>

        {/* Audience Summary & Live Preview Sidebar */}
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 14, color: 'var(--color-brand-primary)' }}>
              Segment Summary
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--color-ink-muted)' }}>Total Targeted:</span>
                <strong>{targetedCustomers.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--color-ink-muted)' }}>With Email Address:</span>
                <strong style={{ color: 'var(--color-success)' }}>{targetedWithEmail.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--color-ink-muted)' }}>Skipped (No Email):</span>
                <strong style={{ color: 'var(--color-warning)' }}>{skippedNoEmail}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-ink-muted)' }}>Attached File(s):</span>
                <strong style={{ color: 'var(--color-brand-primary)' }}>{attachments.length} file(s)</strong>
              </div>
            </div>
          </div>

          {/* Live Email Preview Card */}
          {bodyText.trim() && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 10, color: 'var(--color-brand-primary)' }}>
                🔍 Live Email Preview
              </h3>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 8 }}>
                Recipient: <strong>{targetedWithEmail[0]?.name || 'Valued Customer'}</strong> ({targetedWithEmail[0]?.email || 'customer@example.com'})
              </div>
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}>
                {/* Header Banner */}
                <div style={{ background: '#FFFFFF', padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid var(--color-brand-primary)' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-brand-primary)', letterSpacing: 3 }}>
                    F I C C A D O
                  </div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-ink-muted)' }}>
                    Ficcado Apparel Catalog
                  </div>
                </div>
                {/* Body Content */}
                <div
                  style={{
                    padding: 14,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: renderEmailMarkdown(bodyText.replace(/\{customerName\}/g, targetedWithEmail[0]?.name || 'Valued Customer')),
                  }}
                />
              </div>

              {attachments.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--color-brand-primary)', fontWeight: 600, marginTop: 10 }}>
                  📎 {attachments.length} file(s) attached: {attachments.map((a) => a.filename).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Broadcast History Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 15 }}>
          📋 Past Broadcast History
        </div>

        {historyLogs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>
            No announcement broadcasts recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject</th>
                  <th>Audience Segment</th>
                  <th style={{ textAlign: 'center' }}>Targeted</th>
                  <th style={{ textAlign: 'center' }}>Sent</th>
                  <th style={{ textAlign: 'center' }}>Failed</th>
                  <th>Date & Time</th>
                  <th>Sent By</th>
                </tr>
              </thead>
              <tbody>
                {historyLogs.map((log) => (
                  <tr key={log.sno}>
                    <td style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{log.sno}</td>
                    <td style={{ fontWeight: 600 }}>{log.subject}</td>
                    <td><span className="badge badge-neutral">{log.targetAudience}</span></td>
                    <td style={{ textAlign: 'center' }}>{log.recipientsCount}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-success" style={{ fontWeight: 700 }}>{log.sentCount}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {parseInt(log.failedCount, 10) > 0 ? (
                        <span className="badge badge-error" style={{ fontWeight: 700 }}>{log.failedCount}</span>
                      ) : (
                        <span style={{ color: 'var(--color-ink-muted)' }}>0</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{formatISTDateTime(log.createdAt)}</td>
                    <td style={{ fontSize: 12 }}>{log.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
