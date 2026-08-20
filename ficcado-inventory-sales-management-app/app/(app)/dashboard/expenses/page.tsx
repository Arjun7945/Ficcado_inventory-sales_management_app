'use client';

/**
 * app/(app)/dashboard/expenses/page.tsx
 *
 * Expense Management Page (B4 — Phase 77).
 * All admins can see all expense entries (shared, transparent log).
 * Any admin can create an expense for themselves.
 * Only the creating admin can edit or delete their own entry.
 *
 * When Category = "Other", a required "What type of expense is this?"
 * free-text field appears — the typed text becomes the displayed category.
 */

import { useState, useEffect } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { formatISTDateTime } from '@/lib/dateUtils';

const EXPENSE_CATEGORIES = [
  'Fuel Expense',
  'Printing Exp',
  'Travel Exp',
  'Food Exp',
  'Tip Exp',
  'Purchase on Goods Exp',
  'Advertising Exp',
  'Other',
];

interface ExpenseEntry {
  rowIndex:        number;
  sno:             string;
  adminName:       string;
  category:        string;
  customCategory:  string;
  displayCategory: string;  // "Other" replaced by customCategory text
  description:     string;
  amount:          string;
  dateOfExpense:   string;
  createdAt:       string;
  createdBy:       string;
  updatedAt:       string;
  updatedBy:       string;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<{ message: string } | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<string>('');

  // Create/Edit Modal
  const [showModal, setShowModal]       = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [category, setCategory]         = useState(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription]   = useState('');
  const [amount, setAmount]             = useState('');
  const [dateOfExpense, setDateOfExpense] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting]     = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch]                 = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Delete confirm
  const [deletingEntry, setDeletingEntry] = useState<ExpenseEntry | null>(null);
  const [deleting, setDeleting]           = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [expRes, authRes] = await Promise.all([
        fetch('/api/expenses').then((r) => r.json()),
        fetch('/api/auth/me').then((r) => r.json()).catch(() => ({})),
      ]);
      setExpenses(expRes.expenses ?? []);
      if (authRes.admin?.name) setCurrentAdmin(authRes.admin.name);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  function openCreate() {
    setEditingEntry(null);
    setCategory(EXPENSE_CATEGORIES[0]);
    setCustomCategory('');
    setDescription('');
    setAmount('');
    setDateOfExpense(new Date().toISOString().slice(0, 10));
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(entry: ExpenseEntry) {
    setEditingEntry(entry);
    setCategory(entry.category);
    setCustomCategory(entry.customCategory || '');
    setDescription(entry.description);
    setAmount(entry.amount);
    setDateOfExpense(entry.dateOfExpense || new Date().toISOString().slice(0, 10));
    setFormError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (category === 'Other' && !customCategory.trim()) {
      setFormError('"What type of expense is this?" is required when Category is Other.');
      return;
    }
    if (!description.trim()) { setFormError('Description is required.'); return; }
    if (!amount || isNaN(parseFloat(amount))) { setFormError('Enter a valid amount.'); return; }

    setSubmitting(true);
    try {
      const url    = editingEntry ? `/api/expenses/${editingEntry.sno}` : '/api/expenses';
      const method = editingEntry ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, customCategory, description, amount, dateOfExpense }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to save expense.'); return; }
      setShowModal(false);
      setSuccess(editingEntry ? 'Expense updated successfully.' : 'Expense logged successfully.');
      loadData();
    } catch {
      setFormError("Couldn't connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deletingEntry) return;
    setDeleting(true);
    try {
      const res  = await fetch(`/api/expenses/${deletingEntry.sno}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError({ message: data.error || 'Delete failed.' }); return; }
      setSuccess('Expense deleted.');
      setDeletingEntry(null);
      loadData();
    } catch {
      setError({ message: "Couldn't delete expense." });
    } finally {
      setDeleting(false);
    }
  }

  // Stats
  const totalAmount    = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const myTotal        = expenses.filter((e) => e.createdBy === currentAdmin)
                                  .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const filteredExpenses = expenses.filter((e) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.adminName || '').toLowerCase().includes(q) ||
      (e.createdBy || '').toLowerCase().includes(q);
    const matchCat = !categoryFilter ||
      (e.category || '').toLowerCase() === categoryFilter.toLowerCase() ||
      (e.displayCategory || '').toLowerCase() === categoryFilter.toLowerCase();
    return matchSearch && matchCat;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expense Management</h1>
          <div className="page-subtitle">{expenses.length} expense entries · Shared across all admins</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>⟳ Refresh</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Log Expense</button>
        </div>
      </div>

      {error   && <ErrorMessage message={error.message}   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success} variant="success" onDismiss={() => setSuccess(null)} />}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-brand-primary)', fontVariantNumeric: 'tabular-nums' }}>
            ₹{totalAmount.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2, fontWeight: 500 }}>Total Expenses (All Admins)</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-warning)', fontVariantNumeric: 'tabular-nums' }}>
            ₹{myTotal.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2, fontWeight: 500 }}>My Expenses</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
            {expenses.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2, fontWeight: 500 }}>Total Entries</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input
            type="text"
            className="form-input"
            placeholder="Search by description or admin name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 220 }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {Array.from(new Set([...EXPENSE_CATEGORIES, ...expenses.map(e => e.displayCategory).filter(Boolean)])).map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Expense Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingGecko label="Loading expenses…" /></div>
        ) : filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>💳</div>
            <div className="empty-state-title">No matching expenses found</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              {search || categoryFilter ? 'Try clearing your search or category filter.' : 'Click "+ Log Expense" to record a business expense.'}
            </div>
          </div>
        ) : (
          <>
            {/* Mobile View Card List */}
            <div className="mobile-only mobile-card-list" style={{ padding: 12 }}>
              {filteredExpenses.map((e) => (
                <div key={e.sno} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{e.displayCategory || e.category}</span>
                    <span className="tabular-nums" style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-brand-primary)' }}>
                      ₹{parseFloat(e.amount || '0').toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-ink)' }}>{e.description}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-ink-muted)' }}>
                    <span>Admin: {e.adminName}</span>
                    <span>Date: {e.dateOfExpense}</span>
                  </div>
                  {e.createdBy === currentAdmin && (
                    <div className="mobile-data-card-actions">
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => openEdit(e)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeletingEntry(e)}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="desktop-only" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Admin</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Date of Expense</th>
                    <th>Logged At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((e) => (
                    <tr key={e.sno}>
                      <td style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{e.sno}</td>
                      <td>
                        <span className="badge badge-info">
                          {e.adminName}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{e.displayCategory || e.category}</span>
                      </td>
                      <td style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.description}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-brand-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        ₹{parseFloat(e.amount || '0').toLocaleString('en-IN')}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{e.dateOfExpense}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{formatISTDateTime(e.createdAt)}</td>
                      <td>
                        {e.createdBy === currentAdmin ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}>Edit</button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingEntry(e)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Read-only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                {editingEntry ? 'Edit Expense' : 'Log New Expense'}
              </h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <ErrorMessage message={formError} variant="error" />}

                <div className="form-group">
                  <label className="form-label">Expense Category *</label>
                  <select
                    className="form-select"
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); if (e.target.value !== 'Other') setCustomCategory(''); }}
                    required
                  >
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Conditional "What type of expense?" — only when Other */}
                {category === 'Other' && (
                  <div className="form-group">
                    <label className="form-label">What type of expense is this? *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="e.g. Equipment purchase, Office supplies…"
                      required
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 4 }}>
                      This text will be displayed as the category everywhere, not just &quot;Other&quot;.
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What was the expense for?"
                    required
                  />
                </div>

                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Amount (₹) *</label>
                    <input
                      type="number"
                      className="form-input"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date of Expense *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={dateOfExpense}
                      onChange={(e) => setDateOfExpense(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <LoadingGecko size="inline" label="Saving…" /> : (editingEntry ? 'Save Changes' : 'Log Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deletingEntry && (
        <div className="modal-backdrop" onClick={() => setDeletingEntry(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--color-error)' }}>
                Delete Expense?
              </h2>
              <button className="btn-icon" onClick={() => setDeletingEntry(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Delete expense <strong>#{deletingEntry.sno}</strong> — <em>{deletingEntry.displayCategory}</em> — ₹{parseFloat(deletingEntry.amount || '0').toLocaleString('en-IN')}?
                This cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeletingEntry(null)}>Cancel</button>
              <button
                className="btn"
                style={{ background: 'var(--color-error)', color: '#fff' }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? <LoadingGecko size="inline" label="Deleting…" /> : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
