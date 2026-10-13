/**
 * app/api/vendors/[id]/payments/route.ts
 *
 * GET  /api/vendors/[id]/payments — list payments for this vendor
 * POST /api/vendors/[id]/payments — log a new payment; auto-updates Total Amount Paid on vendor row (with header mapping)
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_PAYMENT_HEADERS = MODULE_REGISTRY.vendor_payments.headers;
const EXPECTED_VENDOR_HEADERS  = MODULE_REGISTRY.vendors.headers;

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

    if (paymentRows.length === 0 || (paymentRows[0] && paymentRows[0].length < EXPECTED_PAYMENT_HEADERS.length)) {
      await updateRow('vendor_payments', 1, EXPECTED_PAYMENT_HEADERS).catch(() => {});
    }

    const vMap   = buildHeaderMap(vendorRows[0] ?? []);
    const vRowIdx = vendorRows.slice(1).findIndex((r) => getCellByHeader(r, vMap, 'S.No') === id);
    if (vRowIdx === -1) return Response.json({ error: `Vendor #${id} not found.` }, { status: 404 });
    const vendorRow  = vendorRows[vRowIdx + 1];
    const vendorName = getCellByHeader(vendorRow, vMap, 'Vendor Name');

    // Append payment entry using formatRowFromHeaderMap
    const sno = String(Math.max(paymentRows.length - 1, 0) + 1);
    const now = new Date().toISOString();
    const paymentObj = {
      'S.No':       sno,
      'Vendor Name': vendorName,
      'Amount':      String(parseFloat(String(amount))),
      'Date':        date,
      'Note':        note?.trim() ?? '',
      'Created At':  now,
      'Created By':  admin.name,
    };
    const newPaymentRow = formatRowFromHeaderMap(paymentObj, EXPECTED_PAYMENT_HEADERS);
    await appendRows('vendor_payments', [newPaymentRow]);

    // Recompute Total Amount Paid for this vendor using formatRowFromHeaderMap
    const currentTotal = parseFloat(getCellByHeader(vendorRow, vMap, 'Total Amount Paid') || '0') || 0;
    const newTotal     = currentTotal + parseFloat(String(amount));

    const vendorObj = {
      'S.No':               getCellByHeader(vendorRow, vMap, 'S.No'),
      'Vendor Name':        vendorName,
      'Vendor Type':        getCellByHeader(vendorRow, vMap, 'Vendor Type'),
      'Custom Vendor Type': getCellByHeader(vendorRow, vMap, 'Custom Vendor Type'),
      'Contact Number(s)':  getCellByHeader(vendorRow, vMap, 'Contact Number(s)', getCellByHeader(vendorRow, vMap, 'Contact Details')),
      'Email ID':           getCellByHeader(vendorRow, vMap, 'Email ID'),
      'Purpose/Use':        getCellByHeader(vendorRow, vMap, 'Purpose/Use'),
      'Total Amount Paid':  String(newTotal),
      'Created At':         getCellByHeader(vendorRow, vMap, 'Created At'),
      'Created By':         getCellByHeader(vendorRow, vMap, 'Created By'),
      'Updated At':         now,
      'Updated By':         admin.name,
    };

    const updatedVendorRow = formatRowFromHeaderMap(vendorObj, EXPECTED_VENDOR_HEADERS);
    await updateRow('vendors', vRowIdx + 2, updatedVendorRow);

    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Vendor Payment Log',
      moduleKey: 'vendor_payments',
      recordId: sno,
      customMessage: `Admin '${admin.name}' logged vendor payment of ₹${amount} for vendor '${vendorName}'.`,
    }).catch(() => {});

    return Response.json({ success: true, newTotal });
  } catch (err: any) {
    return Response.json({ error: 'Failed to log payment.', detail: err?.message }, { status: 500 });
  }
}
