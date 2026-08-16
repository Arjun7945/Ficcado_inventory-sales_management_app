/**
 * app/api/vendors/route.ts
 *
 * GET  /api/vendors — list all vendors
 * POST /api/vendors — create a new vendor
 *
 * Phase 78 (B5): Vendor Management module.
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const PRESET_VENDOR_TYPES = ['Courier Partner', 'Designer', 'Printing', 'Marketing', 'Other'];

export async function GET() {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const rows = await readAllRows('vendors');
    if (rows.length === 0) return Response.json({ vendors: [] });

    const headerMap = buildHeaderMap(rows[0]);
    const vendors = rows.slice(1).map((row, i) => {
      const vendorType       = getCellByHeader(row, headerMap, 'Vendor Type');
      const customVendorType = getCellByHeader(row, headerMap, 'Custom Vendor Type');
      const displayType      = vendorType === 'Other' && customVendorType ? customVendorType : vendorType;
      
      const contactNumbersRaw = getCellByHeader(row, headerMap, 'Contact Number(s)', getCellByHeader(row, headerMap, 'Contact Details'));
      const emailId           = getCellByHeader(row, headerMap, 'Email ID');
      const phoneNumbers      = contactNumbersRaw ? contactNumbersRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

      return {
        rowIndex:        i + 2,
        sno:             getCellByHeader(row, headerMap, 'S.No') || String(i + 1),
        vendorName:      getCellByHeader(row, headerMap, 'Vendor Name'),
        vendorType,
        customVendorType,
        displayType,
        phoneNumbers,
        emailId,
        contactDetails:  contactNumbersRaw,
        purposeUse:      getCellByHeader(row, headerMap, 'Purpose/Use'),
        totalAmountPaid: getCellByHeader(row, headerMap, 'Total Amount Paid') || '0',
        createdAt:       getCellByHeader(row, headerMap, 'Created At'),
        createdBy:       getCellByHeader(row, headerMap, 'Created By'),
        updatedAt:       getCellByHeader(row, headerMap, 'Updated At'),
        updatedBy:       getCellByHeader(row, headerMap, 'Updated By'),
      };
    }).filter((v) => v.vendorName);

    return Response.json({ vendors });
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
    const sno  = String(Math.max(rows.length - 1, 0) + 1);
    const now  = new Date().toISOString();

    const newRow = [
      sno,
      vendorName.trim(),
      vendorType,
      vendorType === 'Other' ? (customVendorType?.trim() ?? '') : '',
      phoneNumbersStr,
      emailIdStr,
      purposeUse?.trim() ?? '',
      '0',  // Total Amount Paid starts at 0
      now,
      admin.name,
      '',
      '',
    ];

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
