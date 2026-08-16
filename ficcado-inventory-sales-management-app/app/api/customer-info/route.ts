/**
 * app/api/customer-info/route.ts
 *
 * GET /api/customer-info?phone={phone} -> Look up single customer by phone number.
 * GET /api/customer-info               -> List all customer information records.
 * PUT /api/customer-info               -> Update a customer record (name, email, addresses).
 *
 * Phase 76 (B3): Address column now stores a JSON array of labeled address entries:
 *   [{ label: string, address: string }]
 * Old plain-string values are decoded as [{ label: "Default", address: "<value>" }]
 * on first read, making this fully backward-compatible with existing data.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

export interface AddressEntry {
  label:   string;
  address: string;
}

const COL_CI = {
  sno:            0,
  customerName:   1,
  phoneNumber:    2,
  address:        3,  // now stores JSON: AddressEntry[]
  emailId:        4,
  totalOrders:    5,
  invoiceNumbers: 6,
  createdAt:      7,
  createdBy:      8,
  updatedAt:      9,
  updatedBy:      10,
};

/** Parse the address column — supports both legacy string and new JSON format */
function parseAddresses(raw: string): AddressEntry[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as AddressEntry[];
    } catch { /* fall through to legacy */ }
  }
  // Legacy plain-string — wrap as single Default address
  return [{ label: 'Default', address: trimmed }];
}

/** Serialize address list to store in the sheet column */
function serializeAddresses(addresses: AddressEntry[]): string {
  if (!addresses || addresses.length === 0) return '';
  return JSON.stringify(addresses);
}

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

      const addresses = parseAddresses(match[COL_CI.address] ?? '');

      return Response.json({
        found: true,
        customer: {
          name:           match[COL_CI.customerName]   ?? '',
          phone:          match[COL_CI.phoneNumber]    ?? '',
          addresses,
          // Legacy single field for backward compat — first address text
          address:        addresses[0]?.address ?? '',
          email:          match[COL_CI.emailId]        ?? '',
          totalOrders:    match[COL_CI.totalOrders]    ?? '0',
          invoiceNumbers: match[COL_CI.invoiceNumbers] ?? '',
        },
      });
    }

    // ── List All Customers ──────────────────────────────────────────────────
    const customers = rows.slice(1).map((r, idx) => {
      const addresses = parseAddresses(r[COL_CI.address] ?? '');
      return {
        sno:            r[COL_CI.sno]            || String(idx + 1),
        name:           r[COL_CI.customerName]   || '',
        phone:          r[COL_CI.phoneNumber]    || '',
        addresses,
        address:        addresses[0]?.address ?? '',  // legacy compat
        email:          r[COL_CI.emailId]        || '',
        totalOrders:    r[COL_CI.totalOrders]    || '0',
        invoiceNumbers: r[COL_CI.invoiceNumbers] || '',
        createdAt:      r[COL_CI.createdAt]      || '',
        createdBy:      r[COL_CI.createdBy]      || '',
        updatedAt:      r[COL_CI.updatedAt]      || '',
      };
    }).filter((c) => c.phone || c.name);

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
    const { phone, name, addresses, email } = body as {
      phone:     string;
      name?:     string;
      addresses?: AddressEntry[];
      email?:    string;
    };

    if (!phone) {
      return Response.json({ error: 'Phone number is required to update customer record.' }, { status: 400 });
    }

    const rows = await readAllRows('customer_info');
    const idx  = rows.slice(1).findIndex((r) => (r[COL_CI.phoneNumber] ?? '').trim() === phone.trim());
    if (idx === -1) {
      return Response.json({ error: `Customer record for phone '${phone}' not found.` }, { status: 404 });
    }

    const rowIndex    = idx + 2;
    const existingRow = rows[idx + 1];
    const now         = new Date().toISOString();

    // Determine the address value to store
    let newAddressValue: string;
    if (addresses !== undefined) {
      newAddressValue = serializeAddresses(addresses);
    } else {
      // Preserve existing value
      newAddressValue = existingRow[COL_CI.address] ?? '';
    }

    const updatedRow = [
      existingRow[COL_CI.sno] || String(idx + 1),
      name !== undefined ? name : existingRow[COL_CI.customerName],
      existingRow[COL_CI.phoneNumber],
      newAddressValue,
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
