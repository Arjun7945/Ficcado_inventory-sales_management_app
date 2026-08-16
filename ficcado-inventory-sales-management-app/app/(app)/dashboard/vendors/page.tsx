'use client';

/**
 * app/(app)/dashboard/vendors/page.tsx
 *
 * Vendor Management Page (B5 — Phase 78).
 * List, create, and edit vendors. Click a vendor to see its payment history
 * and log new payments. Total Amount Paid is auto-computed.
 *
 * Vendor Type = "Other" shows a mandatory "What type of vendor is this?" field.
 * The typed text is displayed as the effective vendor type everywhere.
 */

import { useState, useEffect } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { formatISTDateTime } from '@/lib/dateUtils';

const VENDOR_TYPES = ['Courier Partner', 'Designer', 'Printing', 'Marketing', 'Other'];

interface VendorEntry {
  rowIndex:        number;
  sno:             string;
  vendorName:      string;
  vendorType:      string;
  customVendorType:string;
  displayType:     string;
  phoneNumbers?:   string[];
  emailId?:        string;
  contactDetails:  string;
  purposeUse:      string;
  totalAmountPaid: string;
  createdAt:       string;
  createdBy:       string;
}

interface PaymentEntry {
  sno:       string;
  amount:    string;
  date:      string;
  note:      string;
  createdAt: string;
  createdBy: string;
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<{ message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create/Edit Modal
  const [showModal, setShowModal]             = useState(false);
  const [editingVendor, setEditingVendor]     = useState<VendorEntry | null>(null);
  const [vendorName, setVendorName]           = useState('');
  const [vendorType, setVendorType]           = useState(VENDOR_TYPES[0]);
  const [customVendorType, setCustomVendorType] = useState('');
  const [phoneNumbers, setPhoneNumbers]       = useState<string[]>(['']);
  const [emailId, setEmailId]                 = useState('');
  const [purposeUse, setPurposeUse]           = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [formError, setFormError]             = useState<string | null>(null);

  // Detail / Payment Log view
  const [selectedVendor, setSelectedVendor]   = useState<VendorEntry | null>(null);
  const [payments, setPayments]               = useState<PaymentEntry[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [payAmount, setPayAmount]             = useState('');
  const [payDate, setPayDate]                 = useState(() => new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote]                 = useState('');
  const [loggingPayment, setLoggingPayment]   = useState(false);
  const [payError, setPayError]               = useState<string | null>(null);

  async function loadVendors() {
    setLoading(true);
    try {
      const res  = await fetch('/api/vendors');
      const data = await res.json();
      setVendors(data.vendors ?? []);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadVendors(); }, []);

  async function openDetail(vendor: VendorEntry) {
    setSelectedVendor(vendor);
    setPayments([]);
    setPayError(null);
    setPayAmount('');
    setPayNote('');
    setLoadingPayments(true);
    try {
      const res  = await fetch(`/api/vendors/${vendor.sno}/payments`);
      const data = await res.json();
      setPayments(data.payments ?? []);
    } catch { /* silent */ }
    finally { setLoadingPayments(false); }
  }

  function openCreate() {
    setEditingVendor(null);
    setVendorName('');
    setVendorType(VENDOR_TYPES[0]);
    setCustomVendorType('');
    setPhoneNumbers(['']);
    setEmailId('');
    setPurposeUse('');
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(v: VendorEntry) {
    setEditingVendor(v);
    setVendorName(v.vendorName);
    setVendorType(v.vendorType);
    setCustomVendorType(v.customVendorType || '');
    setPhoneNumbers(v.phoneNumbers && v.phoneNumbers.length > 0 ? v.phoneNumbers : (v.contactDetails ? [v.contactDetails] : ['']));
    setEmailId(v.emailId || '');
    setPurposeUse(v.purposeUse);
    setFormError(null);
    setShowModal(true);
  }

  function handleAddPhoneNumber() {
    setPhoneNumbers((prev) => [...prev, '']);
  }

  function handleRemovePhoneNumber(index: number) {
    setPhoneNumbers((prev) => prev.filter((_, i) => i !== index));
  }

  function handlePhoneNumberChange(index: number, val: string) {
    setPhoneNumbers((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  }

  async function handleSubmitVendor(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!vendorName.trim()) { setFormError('Vendor Name is required.'); return; }
    if (vendorType === 'Other' && !customVendorType.trim()) {
      setFormError('"What type of vendor is this?" is required.'); return;
    }
    const cleanPhones = phoneNumbers.map((p) => p.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      const url    = editingVendor ? `/api/vendors/${editingVendor.sno}` : '/api/vendors';
      const method = editingVendor ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName,
          vendorType,
          customVendorType,
          phoneNumbers: cleanPhones,
          emailId: emailId.trim(),
          purposeUse,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed.'); return; }
      setShowModal(false);
      setSuccess(editingVendor ? 'Vendor updated.' : 'Vendor added.');
      loadVendors();
    } catch {
      setFormError("Couldn't connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogPayment(e: React.FormEvent) {
    e.preventDefault();
    setPayError(null);
    if (!payAmount || isNaN(parseFloat(payAmount))) { setPayError('Enter a valid amount.'); return; }
    setLoggingPayment(true);
    try {
      const res  = await fetch(`/api/vendors/${selectedVendor!.sno}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount, date: payDate, note: payNote }),
      });
      const data = await res.json();
      if (!res.ok) { setPayError(data.error || 'Failed to log payment.'); return; }
      // Update the vendor's total in the local list
      setVendors((prev) => prev.map((v) =>
        v.sno === selectedVendor!.sno ? { ...v, totalAmountPaid: String(data.newTotal) } : v
      ));
      setSelectedVendor((prev) => prev ? { ...prev, totalAmountPaid: String(data.newTotal) } : null);
      setPayAmount('');
      setPayNote('');
      // Refresh payments list
      const pr   = await fetch(`/api/vendors/${selectedVendor!.sno}/payments`);
      const pd   = await pr.json();
      setPayments(pd.payments ?? []);
    } catch {
      setPayError("Couldn't log payment.");
    } finally {
      setLoggingPayment(false);
    }
  }

  const totalPaid = vendors.reduce((sum, v) => sum + (parseFloat(v.totalAmountPaid) || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendor Management</h1>
          <div className="page-subtitle">{vendors.length} vendors · ₹{totalPaid.toLocaleString('en-IN')} total paid</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadVendors} disabled={loading}>⟳ Refresh</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Vendor</button>
        </div>
      </div>

      {error   && <ErrorMessage message={error.message}   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success} variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Vendor Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingGecko label="Loading vendors…" /></div>
        ) : vendors.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>🤝</div>
            <div className="empty-state-title">No vendors added yet</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Click &quot;+ Add Vendor&quot; to register a vendor.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vendor Name</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Purpose/Use</th>
                  <th style={{ textAlign: 'right' }}>Total Paid</th>
                  <th>Added By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.sno}>
                    <td style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{v.sno}</td>
                    <td style={{ fontWeight: 700 }}>{v.vendorName}</td>
                    <td><span className="badge badge-neutral">{v.displayType || v.vendorType}</span></td>
                    <td style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>
                      <div>{v.phoneNumbers && v.phoneNumbers.length > 0 ? v.phoneNumbers.join(', ') : (v.contactDetails || '—')}</div>
                      {v.emailId && <div style={{ fontSize: 11.5, color: 'var(--color-brand-primary)' }}>{v.emailId}</div>}
                    </td>
                    <td style={{ fontSize: 12.5, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.purposeUse || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-brand-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      ₹{parseFloat(v.totalAmountPaid || '0').toLocaleString('en-IN')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{v.createdBy}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(v)}>View / Pay</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(v)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Vendor Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                {editingVendor ? 'Edit Vendor' : 'Add Vendor'}
              </h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmitVendor}>
              <div className="modal-body">
                {formError && <ErrorMessage message={formError} variant="error" />}
                <div className="form-group">
                  <label className="form-label">Vendor Name *</label>
                  <input type="text" className="form-input" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. BlueDart Courier" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor Type *</label>
                  <select className="form-select" value={vendorType} onChange={(e) => { setVendorType(e.target.value); if (e.target.value !== 'Other') setCustomVendorType(''); }} required>
                    {VENDOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {vendorType === 'Other' && (
                  <div className="form-group">
                    <label className="form-label">What type of vendor is this? *</label>
                    <input type="text" className="form-input" value={customVendorType} onChange={(e) => setCustomVendorType(e.target.value)} placeholder="e.g. Fabric supplier, Packaging vendor…" required />
                    <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 4 }}>
                      This text will be displayed as the vendor type everywhere.
                    </div>
                  </div>
                )}
                
                {/* Contact Number(s) Repeatable Field */}
                <div className="form-group">
                  <label className="form-label">Contact Number(s) <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>(optional)</span></label>
                  {phoneNumbers.map((phone, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input
                        type="tel"
                        className="form-input"
                        value={phone}
                        onChange={(e) => handlePhoneNumberChange(idx, e.target.value)}
                        placeholder={idx === 0 ? 'Primary contact phone number' : 'Alternate contact number'}
                      />
                      {phoneNumbers.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--color-error)' }}
                          onClick={() => handleRemovePhoneNumber(idx)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 12, padding: '4px 8px' }}
                    onClick={handleAddPhoneNumber}
                  >
                    + Add another number
                  </button>
                </div>

                {/* Email ID Field */}
                <div className="form-group">
                  <label className="form-label">Email ID <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>(optional)</span></label>
                  <input
                    type="email"
                    className="form-input"
                    value={emailId}
                    onChange={(e) => setEmailId(e.target.value)}
                    placeholder="e.g. vendor@company.com"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Purpose / Use <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>(optional)</span></label>
                  <textarea className="form-textarea" rows={2} value={purposeUse} onChange={(e) => setPurposeUse(e.target.value)} placeholder="What this vendor is engaged for…" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <LoadingGecko size="inline" label="Saving…" /> : (editingVendor ? 'Save Changes' : 'Add Vendor')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendor Detail + Payment Log Modal */}
      {selectedVendor && (
        <div className="modal-backdrop" onClick={() => setSelectedVendor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{selectedVendor.vendorName}</h2>
                <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>
                  {selectedVendor.displayType} • Total Paid: <strong style={{ color: 'var(--color-brand-primary)' }}>₹{parseFloat(selectedVendor.totalAmountPaid || '0').toLocaleString('en-IN')}</strong>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setSelectedVendor(null)}>×</button>
            </div>
            <div className="modal-body">
              {/* Log Payment Form */}
              <div className="card" style={{ background: 'var(--color-bg)', padding: 16, border: '1px solid var(--color-border)', marginBottom: 20 }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 12, color: 'var(--color-brand-primary)' }}>Log a Payment</h3>
                {payError && <ErrorMessage message={payError} variant="error" />}
                <form onSubmit={handleLogPayment}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 10, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Amount (₹) *</label>
                      <input type="number" className="form-input" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" required />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Date *</label>
                      <input type="date" className="form-input" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Note (what this payment is for)</label>
                      <input type="text" className="form-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. March delivery batch…" />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={loggingPayment} style={{ marginBottom: 1 }}>
                      {loggingPayment ? <LoadingGecko size="inline" label="" /> : 'Log Payment'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Payment History */}
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 10 }}>Payment History</h3>
              {loadingPayments ? (
                <div style={{ padding: 24, textAlign: 'center' }}><LoadingGecko label="Loading payments…" /></div>
              ) : payments.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>
                  No payments logged yet for this vendor.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Date</th>
                        <th>Note</th>
                        <th>Logged By</th>
                        <th>Logged At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.sno}>
                          <td style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{p.sno}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-brand-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            ₹{parseFloat(p.amount || '0').toLocaleString('en-IN')}
                          </td>
                          <td style={{ fontSize: 12.5 }}>{p.date}</td>
                          <td style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>{p.note || '—'}</td>
                          <td style={{ fontSize: 12 }}>{p.createdBy}</td>
                          <td style={{ fontSize: 11.5, color: 'var(--color-ink-muted)' }}>{formatISTDateTime(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700, padding: '10px 12px', borderTop: '2px solid var(--color-border)' }}>
                          Total: ₹{payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toLocaleString('en-IN')}
                        </td>
                        <td colSpan={4} style={{ borderTop: '2px solid var(--color-border)' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedVendor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
