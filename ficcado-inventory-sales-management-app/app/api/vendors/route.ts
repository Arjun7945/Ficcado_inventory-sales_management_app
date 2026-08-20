/**
 * app/api/vendors/route.ts
 *
 * GET  /api/vendors — list all vendors (with auto-repair for shifted legacy header rows)
 * POST /api/vendors — create a new vendor (with header-name-mapped formatting)
 *
 * Phase 78 (B5) & Phase 85 (A2): Vendor Management module.
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const PRESET_VENDOR_TYPES = [
  'Courier Partner',
  'Designer Team',
  'Printing Partner',
  'Marketing Partners',
  'Packing Team',
  'Stock Management Team',
  'Transportation Team',
  'Handler Team',
  'Other',
];

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

/** Check if row data was shifted from legacy 11-column header format */
function isShiftedRow(row: string[], headerMap: Map<string, number>): boolean {
  const createdAtVal = getCellByHeader(row, headerMap, 'Created At');
  const totalAmountPaidVal = getCellByHeader(row, headerMap, 'Total Amount Paid');
  const emailIdVal = getCellByHeader(row, headerMap, 'Email ID');

  const isTotalAmountTimestamp = totalAmountPaidVal.includes('T') && totalAmountPaidVal.includes('Z');
  const isEmailPurposeText = emailIdVal.length > 0 && !emailIdVal.includes('@');

  return isTotalAmountTimestamp || (isEmailPurposeText && !createdAtVal.includes('T')) || row.length === 11;
}

export async function GET(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const vendorTypeFilter = (searchParams.get('vendorType') || '').trim().toLowerCase();

  try {
    const rows = await readAllRows('vendors');
    if (rows.length === 0) {
      await updateRow('vendors', 1, EXPECTED_VENDOR_HEADERS).catch(() => {});
      return Response.json({ vendors: [] });
    }

    // Auto-update header row if outdated or missing Contact Number(s) / Email ID
    const currentHeaders = rows[0] ?? [];
    if (currentHeaders.length < EXPECTED_VENDOR_HEADERS.length || currentHeaders.includes('Contact Details')) {
      await updateRow('vendors', 1, EXPECTED_VENDOR_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0]);
    const vendors = [];

    for (let i = 0; i < rows.slice(1).length; i++) {
      const row = rows[i + 1];
      if (!row || row.length === 0) continue;

      let sno = getCellByHeader(row, headerMap, 'S.No') || String(i + 1);
      let vendorName = getCellByHeader(row, headerMap, 'Vendor Name');
      let vendorType = getCellByHeader(row, headerMap, 'Vendor Type');
      let customVendorType = getCellByHeader(row, headerMap, 'Custom Vendor Type');
      let contactNumbersRaw = getCellByHeader(row, headerMap, 'Contact Number(s)', getCellByHeader(row, headerMap, 'Contact Details'));
      let emailId = getCellByHeader(row, headerMap, 'Email ID');
      let purposeUse = getCellByHeader(row, headerMap, 'Purpose/Use');
      let totalAmountPaid = getCellByHeader(row, headerMap, 'Total Amount Paid') || '0';
      let createdAt = getCellByHeader(row, headerMap, 'Created At');
      let createdBy = getCellByHeader(row, headerMap, 'Created By');
      let updatedAt = getCellByHeader(row, headerMap, 'Updated At');
      let updatedBy = getCellByHeader(row, headerMap, 'Updated By');

      // Auto-repair shifted legacy row if detected
      if (isShiftedRow(row, headerMap)) {
        sno = row[0] || String(i + 1);
        vendorName = row[1] || '';
        vendorType = row[2] || '';
        customVendorType = row[3] || '';
        contactNumbersRaw = row[4] || '';
        emailId = '';
        purposeUse = row[5] || '';
        totalAmountPaid = row[6] || '0';
        createdAt = row[7] || '';
        createdBy = row[8] || '';
        updatedAt = row[9] || '';
        updatedBy = row[10] || '';

        // Auto-fix row in Google Sheet using header-name mapping
        const repairedObj = {
          'S.No':               sno,
          'Vendor Name':        vendorName,
          'Vendor Type':        vendorType,
          'Custom Vendor Type': customVendorType,
          'Contact Number(s)':  contactNumbersRaw,
          'Email ID':           '',
          'Purpose/Use':        purposeUse,
          'Total Amount Paid':  totalAmountPaid,
          'Created At':         createdAt,
          'Created By':         createdBy,
          'Updated At':         updatedAt,
          'Updated By':         updatedBy,
        };
        const repairedRow = formatRowFromHeaderMap(repairedObj, EXPECTED_VENDOR_HEADERS);
        updateRow('vendors', i + 2, repairedRow).catch(() => {});
      }

      if (!vendorName) continue;

      const displayType = vendorType === 'Other' && customVendorType ? customVendorType : vendorType;
      const phoneNumbers = contactNumbersRaw ? contactNumbersRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

      vendors.push({
        rowIndex: i + 2,
        sno,
        vendorName,
        vendorType,
        customVendorType,
        displayType,
        phoneNumbers,
        emailId,
        contactDetails: contactNumbersRaw,
        purposeUse,
        totalAmountPaid,
        createdAt,
        createdBy,
        updatedAt,
        updatedBy,
      });
    }

    let filtered = vendors;
    if (search) {
      filtered = filtered.filter((v) =>
        v.vendorName.toLowerCase().includes(search) ||
        v.purposeUse.toLowerCase().includes(search)
      );
    }
    if (vendorTypeFilter) {
      filtered = filtered.filter((v) =>
        v.vendorType.toLowerCase() === vendorTypeFilter ||
        v.displayType.toLowerCase() === vendorTypeFilter
      );
    }

    return Response.json({ vendors: filtered });
  } catch (err: any) {
    return Response.json({ error: 'Failed to load vendors.', detail: err?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;

  try {
    const body = await request.json();
    const { vendorName, vendorType, customVendorType, phoneNumbers, emailId, contactDetails, purposeUse } = body;

    if (!vendorName?.trim()) {
      return Response.json({ error: 'Vendor Name is required.' }, { status: 400 });
    }
    if (!PRESET_VENDOR_TYPES.includes(vendorType)) {
      return Response.json({ error: `Invalid Vendor Type. Must be one of: ${PRESET_VENDOR_TYPES.join(', ')}.` }, { status: 400 });
    }
    if (vendorType === 'Other' && !customVendorType?.trim()) {
      return Response.json({ error: '"What type of vendor is this?" is required when Vendor Type is Other.' }, { status: 400 });
    }

    const phoneNumbersArr = Array.isArray(phoneNumbers)
      ? phoneNumbers.map((p: any) => String(p).trim()).filter(Boolean)
      : (phoneNumbers ? String(phoneNumbers).split(',').map((s) => s.trim()).filter(Boolean) : (contactDetails ? [String(contactDetails).trim()] : []));
    const phoneNumbersStr = phoneNumbersArr.join(', ');
    const emailIdStr      = (emailId || '').trim();

    const rows = await readAllRows('vendors');

    // Ensure header row is synced with EXPECTED_VENDOR_HEADERS
    if (rows.length === 0 || (rows[0] && (rows[0].length < EXPECTED_VENDOR_HEADERS.length || rows[0].includes('Contact Details')))) {
      await updateRow('vendors', 1, EXPECTED_VENDOR_HEADERS).catch(() => {});
    }

    const sno  = String(Math.max(rows.length - 1, 0) + 1);
    const now  = new Date().toISOString();

    const rowObj = {
      'S.No':               sno,
      'Vendor Name':        vendorName.trim(),
      'Vendor Type':        vendorType,
      'Custom Vendor Type': vendorType === 'Other' ? (customVendorType?.trim() ?? '') : '',
      'Contact Number(s)':  phoneNumbersStr,
      'Email ID':           emailIdStr,
      'Purpose/Use':        purposeUse?.trim() ?? '',
      'Total Amount Paid':  '0',
      'Created At':         now,
      'Created By':         admin.name,
      'Updated At':         '',
      'Updated By':         '',
    };

    const newRow = formatRowFromHeaderMap(rowObj, EXPECTED_VENDOR_HEADERS);

    await appendRows('vendors', [newRow]);
    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Vendor Management',
      moduleKey: 'vendors',
      recordId: sno,
      customMessage: `Admin '${admin.name}' added vendor '${vendorName}' (${vendorType === 'Other' ? customVendorType : vendorType}).`,
    }).catch(() => {});

    return Response.json({ success: true, sno });
  } catch (err: any) {
    return Response.json({ error: 'Failed to create vendor.', detail: err?.message }, { status: 500 });
  }
}
