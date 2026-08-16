/**
 * app/api/vendors/[id]/route.ts
 *
 * GET    /api/vendors/[id] — get single vendor with payment log
 * PUT    /api/vendors/[id] — update vendor details (with header-mapped formatting)
 * DELETE /api/vendors/[id] — delete vendor
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const PRESET_VENDOR_TYPES = ['Courier Partner', 'Designer', 'Printing', 'Marketing', 'Other'];

const EXPECTED_VENDOR_HEADERS = [
  'S.No',
  'Vendor Name',
  'Vendor Type',
  'Custom Vendor Type',
  'Contact Number(s)',
  'Email ID',
  'Purpose/Use',
  'Total Amount Paid',
  'Created At',
  'Created By',
  'Updated At',
  'Updated By',
];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const { id } = await params;

  try {
    const [vendorRows, paymentRows] = await Promise.all([
      readAllRows('vendors'),
      readAllRows('vendor_payments'),
    ]);

    if (vendorRows.length < 2) return Response.json({ error: 'Vendor not found.' }, { status: 404 });
    const vMap  = buildHeaderMap(vendorRows[0]);
    const vRow  = vendorRows.slice(1).find((r) => getCellByHeader(r, vMap, 'S.No') === id);
    if (!vRow)  return Response.json({ error: `Vendor #${id} not found.` }, { status: 404 });

    const vendorType       = getCellByHeader(vRow, vMap, 'Vendor Type');
    const customVendorType = getCellByHeader(vRow, vMap, 'Custom Vendor Type');
    const contactNumbersRaw = getCellByHeader(vRow, vMap, 'Contact Number(s)', getCellByHeader(vRow, vMap, 'Contact Details'));
    const emailId           = getCellByHeader(vRow, vMap, 'Email ID');
    const phoneNumbers      = contactNumbersRaw ? contactNumbersRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const vendor = {
      sno:             getCellByHeader(vRow, vMap, 'S.No'),
      vendorName:      getCellByHeader(vRow, vMap, 'Vendor Name'),
      vendorType,
      customVendorType,
      displayType:     vendorType === 'Other' && customVendorType ? customVendorType : vendorType,
      phoneNumbers,
      emailId,
      contactDetails:  contactNumbersRaw,
      purposeUse:      getCellByHeader(vRow, vMap, 'Purpose/Use'),
      totalAmountPaid: getCellByHeader(vRow, vMap, 'Total Amount Paid') || '0',
      createdAt:       getCellByHeader(vRow, vMap, 'Created At'),
      createdBy:       getCellByHeader(vRow, vMap, 'Created By'),
    };

    // Payment log for this vendor
    let payments: any[] = [];
    if (paymentRows.length > 1) {
      const pMap = buildHeaderMap(paymentRows[0]);
      payments = paymentRows.slice(1)
        .filter((r) => getCellByHeader(r, pMap, 'Vendor Name') === vendor.vendorName)
        .map((r, i) => ({
          sno:       getCellByHeader(r, pMap, 'S.No') || String(i + 1),
          amount:    getCellByHeader(r, pMap, 'Amount'),
          date:      getCellByHeader(r, pMap, 'Date'),
          note:      getCellByHeader(r, pMap, 'Note'),
          createdAt: getCellByHeader(r, pMap, 'Created At'),
          createdBy: getCellByHeader(r, pMap, 'Created By'),
        }));
    }

    return Response.json({ vendor, payments });
  } catch (err: any) {
    return Response.json({ error: 'Failed to load vendor.', detail: err?.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;
  const { id } = await params;

  try {
    const rows = await readAllRows('vendors');
    if (rows.length < 2) return Response.json({ error: 'No vendors found.' }, { status: 404 });

    // Auto-update header row if outdated
    if (rows[0] && (rows[0].length < EXPECTED_VENDOR_HEADERS.length || rows[0].includes('Contact Details'))) {
      await updateRow('vendors', 1, EXPECTED_VENDOR_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0]);
    const rowIdx    = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id);
    if (rowIdx === -1) return Response.json({ error: `Vendor #${id} not found.` }, { status: 404 });

    const existingRow = rows[rowIdx + 1];
    const body        = await request.json();
    const { vendorName, vendorType, customVendorType, phoneNumbers, emailId, contactDetails, purposeUse } = body;

    if (vendorType && !PRESET_VENDOR_TYPES.includes(vendorType)) {
      return Response.json({ error: 'Invalid Vendor Type.' }, { status: 400 });
    }
    const newType       = vendorType ?? getCellByHeader(existingRow, headerMap, 'Vendor Type');
    const newCustomType = newType === 'Other' ? (customVendorType?.trim() ?? getCellByHeader(existingRow, headerMap, 'Custom Vendor Type')) : '';

    const existingContactsRaw = getCellByHeader(existingRow, headerMap, 'Contact Number(s)', getCellByHeader(existingRow, headerMap, 'Contact Details'));
    const phoneNumbersArr = Array.isArray(phoneNumbers)
      ? phoneNumbers.map((p: any) => String(p).trim()).filter(Boolean)
      : (phoneNumbers !== undefined ? String(phoneNumbers).split(',').map((s) => s.trim()).filter(Boolean) : (contactDetails !== undefined ? [String(contactDetails).trim()] : (existingContactsRaw ? existingContactsRaw.split(',').map(s => s.trim()).filter(Boolean) : [])));
    const newPhoneNumbersStr = phoneNumbersArr.join(', ');
    const newEmailIdStr      = emailId !== undefined ? String(emailId).trim() : getCellByHeader(existingRow, headerMap, 'Email ID');

    const now = new Date().toISOString();

    const rowObj = {
      'S.No':               getCellByHeader(existingRow, headerMap, 'S.No'),
      'Vendor Name':        vendorName?.trim() ?? getCellByHeader(existingRow, headerMap, 'Vendor Name'),
      'Vendor Type':        newType,
      'Custom Vendor Type': newCustomType,
      'Contact Number(s)':  newPhoneNumbersStr,
      'Email ID':           newEmailIdStr,
      'Purpose/Use':        purposeUse?.trim() ?? getCellByHeader(existingRow, headerMap, 'Purpose/Use'),
      'Total Amount Paid':  getCellByHeader(existingRow, headerMap, 'Total Amount Paid') || '0',
      'Created At':         getCellByHeader(existingRow, headerMap, 'Created At'),
      'Created By':         getCellByHeader(existingRow, headerMap, 'Created By'),
      'Updated At':         now,
      'Updated By':         admin.name,
    };

    const updatedRow = formatRowFromHeaderMap(rowObj, EXPECTED_VENDOR_HEADERS);

    await updateRow('vendors', rowIdx + 2, updatedRow);
    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Vendor Management',
      moduleKey: 'vendors',
      recordId: id,
      customMessage: `Admin '${admin.name}' updated vendor #${id}.`,
    }).catch(() => {});

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: 'Failed to update vendor.', detail: err?.message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;
  const { id } = await params;

  try {
    const rows = await readAllRows('vendors');
    if (rows.length < 2) return Response.json({ error: 'No vendors found.' }, { status: 404 });
    const headerMap = buildHeaderMap(rows[0]);
    const rowIdx    = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id);
    if (rowIdx === -1) return Response.json({ error: `Vendor #${id} not found.` }, { status: 404 });

    await deleteRow('vendors', rowIdx + 2);
    await logActivity({
      adminName: admin.name,
      action: 'deleted',
      module: 'Vendor Management',
      moduleKey: 'vendors',
      recordId: id,
    }).catch(() => {});

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: 'Failed to delete vendor.', detail: err?.message }, { status: 500 });
  }
}
