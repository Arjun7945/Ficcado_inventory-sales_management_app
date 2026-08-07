/**
 * app/api/customer-info/route.ts
 *
 * GET /api/customer-info?phone={phone} -> Look up single customer by phone number.
 * GET /api/customer-info               -> List all customer information records.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

const COL_CI = {
  sno:            0,
  customerName:   1,
  phoneNumber:    2,
  address:        3,
  emailId:        4,
  totalOrders:    5,
  invoiceNumbers: 6,
  createdAt:      7,
  createdBy:      8,
  updatedAt:      9,
  updatedBy:      10,
};

export async function GET(request: Request) {
  try {
    await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get('phone') ?? '').trim();

  try {
    const rows = await readAllRows('customer_info');

    // ── Single Customer Lookup by Phone ─────────────────────────────────────
    if (phone && phone.length >= 5) {
      const match = rows.slice(1).find(
        (r) => (r[COL_CI.phoneNumber] ?? '').trim() === phone
      );

      if (!match) {
        return Response.json({ found: false });
      }

      return Response.json({
        found: true,
        customer: {
          name:           match[COL_CI.customerName]   ?? '',
          phone:          match[COL_CI.phoneNumber]    ?? '',
          address:        match[COL_CI.address]        ?? '',
          email:          match[COL_CI.emailId]        ?? '',
          totalOrders:    match[COL_CI.totalOrders]    ?? '0',
          invoiceNumbers: match[COL_CI.invoiceNumbers] ?? '',
        },
      });
    }

    // ── List All Customers ──────────────────────────────────────────────────
    const customers = rows.slice(1).map((r, idx) => ({
      sno:            r[COL_CI.sno]            || String(idx + 1),
      name:           r[COL_CI.customerName]   || '',
      phone:          r[COL_CI.phoneNumber]    || '',
      address:        r[COL_CI.address]        || '',
      email:          r[COL_CI.emailId]        || '',
      totalOrders:    r[COL_CI.totalOrders]    || '0',
      invoiceNumbers: r[COL_CI.invoiceNumbers] || '',
      createdAt:      r[COL_CI.createdAt]      || '',
      createdBy:      r[COL_CI.createdBy]      || '',
      updatedAt:      r[COL_CI.updatedAt]      || '',
    })).filter((c) => c.phone || c.name);

    return Response.json({
      success: true,
      customers,
    });
  } catch (err: any) {
    const message = err?.message || 'customer_info module may not be configured yet.';
    return Response.json({ success: false, customers: [], error: message });
  }
}

export async function PUT(request: Request) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { phone, name, address, email } = body;
    if (!phone) {
      return Response.json({ error: 'Phone number is required to update customer record.' }, { status: 400 });
    }

    const rows = await readAllRows('customer_info');
    const idx = rows.slice(1).findIndex((r) => (r[COL_CI.phoneNumber] ?? '').trim() === phone.trim());
    if (idx === -1) {
      return Response.json({ error: `Customer record for phone '${phone}' not found.` }, { status: 404 });
    }

    const rowIndex = idx + 2;
    const existingRow = rows[idx + 1];
    const now = new Date().toISOString();

    const updatedRow = [
      existingRow[COL_CI.sno] || String(idx + 1),
      name !== undefined ? name : existingRow[COL_CI.customerName],
      existingRow[COL_CI.phoneNumber],
      address !== undefined ? address : existingRow[COL_CI.address],
      email !== undefined ? email : existingRow[COL_CI.emailId],
      existingRow[COL_CI.totalOrders] || '0',
      existingRow[COL_CI.invoiceNumbers] || '',
      existingRow[COL_CI.createdAt] || now,
      existingRow[COL_CI.createdBy] || admin.name,
      now,
      admin.name,
    ];

    const { updateRow } = await import('@/lib/google/moduleSheet');
    const { logActivity } = await import('@/lib/activityLogger');

    await updateRow('customer_info', rowIndex, updatedRow);
    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Customer Information',
      moduleKey: 'customer_info',
      recordId: phone,
      customMessage: `Administrator '${admin.name}' updated profile details for customer '${name || existingRow[COL_CI.customerName]}' (Phone: ${phone}) on ${new Date().toLocaleString('en-IN')}.`,
    }).catch(() => {});

    return Response.json({ success: true, message: `Customer record updated successfully.` });
  } catch (err: any) {
    return Response.json({ error: 'Failed to update customer record.', detail: err?.message }, { status: 500 });
  }
}
