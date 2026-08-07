'use client';

/**
 * app/(app)/dashboard/customers/page.tsx
 *
 * Customer Information Management Page.
 * Strictly adheres to Ficcado Design System & Brand Guide (docs/DESIGN.md).
 */

import { useState, useEffect } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface CustomerRecord {
  sno:            string;
  name:           string;
  phone:          string;
  address:        string;
  email:          string;
  totalOrders:    string;
  invoiceNumbers: string;
  createdAt:      string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<{ message: string; hint?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected customer View/Edit & Order History state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [customerOrders, setCustomerOrders]     = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders]       = useState(false);
  const [editName, setEditName]                 = useState('');
  const [editEmail, setEditEmail]               = useState('');
  const [editAddress, setEditAddress]           = useState('');
  const [savingProfile, setSavingProfile]       = useState(false);
  const [saveError, setSaveError]               = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess]           = useState<string | null>(null);

  async function openCustomerDetailModal(c: CustomerRecord) {
    setSelectedCustomer(c);
    setEditName(c.name);
    setEditEmail(c.email);
    setEditAddress(c.address);
    setSaveError(null);
    setSaveSuccess(null);
    setLoadingOrders(true);

    try {
      const res = await fetch('/api/sales');
      const data = await res.json();
      if (data.sales) {
        const matchingOrders = data.sales.filter((s: any) => {
          const phoneMatch = s.customerPhone && c.phone && s.customerPhone.trim() === c.phone.trim();
          const invMatch = c.invoiceNumbers && c.invoiceNumbers.includes(s.invoiceNumber);
          return phoneMatch || invMatch;
        });
        setCustomerOrders(matchingOrders);
      }
    } catch {
      setCustomerOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }

  async function handleSaveCustomerProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSaveError(null);
    setSaveSuccess(null);
    setSavingProfile(true);

    try {
      const res = await fetch('/api/customer-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedCustomer.phone,
          name: editName,
          email: editEmail,
          address: editAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save customer details.');
        return;
      }
      setSaveSuccess('Customer profile updated successfully.');
      setSelectedCustomer((prev) => prev ? { ...prev, name: editName, email: editEmail, address: editAddress } : null);
      fetchCustomers();
    } catch {
      setSaveError("Couldn't save customer details.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function fetchCustomers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customer-info');
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(parseApiError(data));
      } else {
        setCustomers(data.customers ?? []);
      }
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.invoiceNumbers.toLowerCase().includes(q)
    );
  });

  const totalCustomers = customers.length;
  const customersWithEmail = customers.filter((c) => c.email.trim().length > 0).length;
  const totalOrdersPlaced = customers.reduce((sum, c) => sum + (parseInt(c.totalOrders, 10) || 0), 0);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Customer Information Management</h1>
          <div className="page-subtitle">View profiles, purchase history, and contact information across all sales</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchCustomers} disabled={loading}>
          ⟳ Refresh
        </button>
      </div>

      {error && <ErrorMessage message={error.message} hint={error.hint} onDismiss={() => setError(null)} />}

      {/* KPI Stats Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total Registered Customers</div>
          <div className="stat-value">{totalCustomers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Orders Placed</div>
          <div className="stat-value">{totalOrdersPlaced}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Customers with Email</div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{customersWithEmail}</div>
        </div>
      </div>

      {/* Search Bar Panel */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="search-bar" style={{ width: '100%', flex: 1 }}>
            <span style={{ color: 'var(--color-ink-muted)', fontSize: 16 }}>🔍</span>
            <input
              type="text"
              placeholder="Search customers by Name, Phone Number, Email, Address, or Invoice Number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearchQuery('')}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Customer Directory Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <LoadingGecko label="Loading Customer Directory…" />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-ink-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-ink)', marginBottom: 6 }}>
              {searchQuery ? 'No matching customers found' : 'No customer records yet'}
            </div>
            <p style={{ fontSize: 13.5, margin: 0, color: 'var(--color-ink-muted)' }}>
              {searchQuery
                ? 'Try adjusting your search terms.'
                : 'Customer profiles are automatically created and updated whenever a sale is logged.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50, textAlign: 'center' }}>#</th>
                  <th>Customer Name</th>
                  <th>Phone Number</th>
                  <th>Email Address</th>
                  <th>Delivery Address</th>
                  <th style={{ textAlign: 'center' }}>Total Orders</th>
                  <th>Related Invoices</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c, idx) => (
                  <tr key={c.phone || idx}>
                    <td style={{ textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13, fontWeight: 600 }}>
                      {c.sno || idx + 1}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                      {c.name || '—'}
                    </td>
                    <td>
                      <code style={{
                        fontSize: 12.5,
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: 'var(--color-brand-primary)',
                        background: 'rgba(43,98,198,0.06)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                        {c.phone || '—'}
                      </code>
                    </td>
                    <td>
                      {c.email ? (
                        <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{c.email}</span>
                      ) : (
                        <span className="badge badge-warning">No Email</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--color-ink-muted)', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.address || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-success" style={{ fontWeight: 700, padding: '3px 10px' }}>
                        {c.totalOrders || '1'} order(s)
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--color-ink-muted)', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.invoiceNumbers ? (
                        <span style={{ fontFamily: 'monospace', color: 'var(--color-brand-primary)', fontWeight: 600 }}>
                          {c.invoiceNumbers}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openCustomerDetailModal(c)}>
                        View & Edit Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DEDICATED CUSTOMER VIEW/EDIT & ORDER HISTORY MODAL */}
      {selectedCustomer && (
        <div className="modal-overlay" onClick={() => setSelectedCustomer(null)}>
          <div className="modal" style={{ maxWidth: 960, width: '92vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ fontSize: 18 }}>Customer Profile & Order History</h2>
                <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>
                  Phone: <strong>{selectedCustomer.phone}</strong> • Total Orders: <strong>{selectedCustomer.totalOrders}</strong>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedCustomer(null)}>×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {saveSuccess && <ErrorMessage message={saveSuccess} variant="success" onDismiss={() => setSaveSuccess(null)} />}
              {saveError && <ErrorMessage message={saveError} variant="error" onDismiss={() => setSaveError(null)} />}

              {/* Edit Customer Profile Card */}
              <form onSubmit={handleSaveCustomerProfile} className="card" style={{ background: 'var(--color-bg)', padding: 18, border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 14, color: 'var(--color-brand-primary)' }}>
                  ✏ Edit Customer Profile Information
                </h3>
                <div className="grid-form-3" style={{ marginBottom: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Customer Name</label>
                    <input type="text" className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input type="email" className="form-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="customer@example.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number (Primary Key)</label>
                    <input type="text" className="form-input" value={selectedCustomer.phone} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Delivery Address</label>
                  <textarea className="form-textarea" rows={2} value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Full delivery address" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={savingProfile}>
                    {savingProfile ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Customer Changes'}
                  </button>
                </div>
              </form>

              {/* Customer Order History Section */}
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 12, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📦 Purchase & Order History</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-muted)' }}>
                    {customerOrders.length} transaction(s) found
                  </span>
                </h3>

                {loadingOrders ? (
                  <div style={{ padding: 32, textAlign: 'center' }}>
                    <LoadingGecko label="Fetching customer order history…" />
                  </div>
                ) : customerOrders.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-ink-muted)' }}>
                    No recorded order history for this customer yet.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <table className="table" style={{ width: '100%', fontSize: 12.5 }}>
                      <thead>
                        <tr>
                          <th>Invoice No</th>
                          <th>Purchased Item(s) & Sizes</th>
                          <th style={{ textAlign: 'right' }}>Discount</th>
                          <th style={{ textAlign: 'right' }}>Total Amount</th>
                          <th>Order Date</th>
                          <th>Completed Date</th>
                          <th style={{ textAlign: 'center' }}>Payment Mode</th>
                          <th style={{ textAlign: 'center' }}>Pending Dues Status</th>
                          <th>Created By</th>
                          <th>Closed By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerOrders.map((ord, idx) => {
                          const isPaid = ord.paymentStatus === 'Paid';
                          const totalVal = parseFloat(ord.totalAmount || '0') || 0;
                          const discountVal = parseFloat(ord.discount || '0') || 0;

                          return (
                            <tr key={ord.invoiceNumber || idx}>
                              <td style={{ fontWeight: 700 }}>
                                <a href={`/dashboard/sales/${encodeURIComponent(ord.invoiceNumber)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }}>
                                  {ord.invoiceNumber} ↗
                                </a>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{ord.itemNames || '—'}</div>
                                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Size: {ord.sizes || '—'}</div>
                              </td>
                              <td style={{ textAlign: 'right', color: discountVal > 0 ? 'var(--color-error)' : 'var(--color-ink-muted)' }} className="tabular-nums">
                                {discountVal > 0 ? `-₹${discountVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'No Discount'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-brand-primary)' }} className="tabular-nums">
                                ₹{totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td style={{ fontSize: 11.5, color: 'var(--color-ink-muted)' }}>
                                {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('en-IN') : '—'}
                              </td>
                              <td style={{ fontSize: 11.5, color: 'var(--color-ink-muted)' }}>
                                {ord.updatedAt ? new Date(ord.updatedAt).toLocaleDateString('en-IN') : '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="badge badge-neutral" style={{ fontSize: 11 }}>{ord.modeOfPayment || '—'}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {isPaid ? (
                                  <span className="badge badge-success" style={{ fontWeight: 700 }}>No Dues</span>
                                ) : (
                                  <span className="badge badge-warning" style={{ fontWeight: 700, color: 'var(--color-error)' }}>
                                    Payment Pending: ₹{totalVal.toLocaleString('en-IN')}
                                  </span>
                                )}
                              </td>
                              <td style={{ fontSize: 12 }}>{ord.createdBy || '—'}</td>
                              <td style={{ fontSize: 12 }}>{ord.saleClosedBy || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedCustomer(null)}>Close Window</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
