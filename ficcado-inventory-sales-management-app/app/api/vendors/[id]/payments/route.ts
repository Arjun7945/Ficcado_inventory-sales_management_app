/**
 * app/api/vendors/[id]/payments/route.ts
 *
 * GET  /api/vendors/[id]/payments — list payments for this vendor
 * POST /api/vendors/[id]/payments — log a new payment; auto-updates Total Amount Paid on vendor row
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const { id } = await params;

  try {
    const [vendorRows, paymentRows] = await Promise.all([
      readAllRows('vendors'),
      readAllRows('vendor_payments'),
    ]);

    const vMap = buildHeaderMap(vendorRows[0] ?? []);
    const vRow = vendorRows.slice(1).find((r) => getCellByHeader(r, vMap, 'S.No') === id);
    if (!vRow) return Response.json({ error: `Vendor #${id} not found.` }, { status: 404 });
    const vendorName = getCellByHeader(vRow, vMap, 'Vendor Name');

    if (paymentRows.length < 2) return Response.json({ payments: [] });
    const pMap = buildHeaderMap(paymentRows[0]);
    const payments = paymentRows.slice(1)
      .filter((r) => getCellByHeader(r, pMap, 'Vendor Name') === vendorName)
      .map((r, i) => ({
        sno:       getCellByHeader(r, pMap, 'S.No') || String(i + 1),
        amount:    getCellByHeader(r, pMap, 'Amount'),
        date:      getCellByHeader(r, pMap, 'Date'),
        note:      getCellByHeader(r, pMap, 'Note'),
        createdAt: getCellByHeader(r, pMap, 'Created At'),
        createdBy: getCellByHeader(r, pMap, 'Created By'),
      }));

    return Response.json({ payments });
  } catch (err: any) {
    return Response.json({ error: 'Failed to load payments.', detail: err?.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;
  const { id } = await params;

  try {
    const { amount, date, note } = await request.json();
    if (!amount || isNaN(parseFloat(String(amount)))) {
      return Response.json({ error: 'A valid Amount is required.' }, { status: 400 });
    }
    if (!date) {
      return Response.json({ error: 'Payment Date is required.' }, { status: 400 });
    }

    const [vendorRows, paymentRows] = await Promise.all([
      readAllRows('vendors'),
      readAllRows('vendor_payments'),
    ]);

    const vMap   = buildHeaderMap(vendorRows[0] ?? []);
    const vRowIdx = vendorRows.slice(1).findIndex((r) => getCellByHeader(r, vMap, 'S.No') === id);
    if (vRowIdx === -1) return Response.json({ error: `Vendor #${id} not found.` }, { status: 404 });
    const vendorRow  = vendorRows[vRowIdx + 1];
    const vendorName = getCellByHeader(vendorRow, vMap, 'Vendor Name');

    // Append payment entry
    const sno = String(Math.max(paymentRows.length - 1, 0) + 1);
    const now  = new Date().toISOString();
    const newPaymentRow = [
      sno,
      vendorName,
      String(parseFloat(String(amount))),
      date,
      note?.trim() ?? '',
      now,
      admin.name,
    ];
    await appendRows('vendor_payments', [newPaymentRow]);

    // Recompute Total Amount Paid for this vendor
    const currentTotal = parseFloat(getCellByHeader(vendorRow, vMap, 'Total Amount Paid') || '0') || 0;
    const newTotal     = currentTotal + parseFloat(String(amount));

    const updatedVendorRow = [
      getCellByHeader(vendorRow, vMap, 'S.No'),
      vendorName,
      getCellByHeader(vendorRow, vMap, 'Vendor Type'),
      getCellByHeader(vendorRow, vMap, 'Custom Vendor Type'),
      getCellByHeader(vendorRow, vMap, 'Contact Details'),
      getCellByHeader(vendorRow, vMap, 'Purpose/Use'),
      String(newTotal),
      getCellByHeader(vendorRow, vMap, 'Created At'),
      getCellByHeader(vendorRow, vMap, 'Created By'),
      now,
      admin.name,
    ];
    await updateRow('vendors', vRowIdx + 2, updatedVendorRow);

    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Vendor Management',
      moduleKey: 'vendors',
      recordId: id,
      customMessage: `Admin '${admin.name}' logged a payment of ₹${amount} to vendor '${vendorName}' on ${date}. New total: ₹${newTotal}.`,
    }).catch(() => {});

    return Response.json({ success: true, newTotal });
  } catch (err: any) {
    return Response.json({ error: 'Failed to log payment.', detail: err?.message }, { status: 500 });
  }
}
