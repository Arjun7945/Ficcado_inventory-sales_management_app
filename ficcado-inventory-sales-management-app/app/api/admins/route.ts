/**
 * app/api/admins/route.ts
 *
 * GET  /api/admins — list all admins from Admin Information Sheet (header-mapped)
 * POST /api/admins — create a new admin (with header-mapped formatting)
 */

import bcrypt from 'bcryptjs';
import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, AdminSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_HEADERS = MODULE_REGISTRY.admin_info.headers;

export interface AdminRecord {
  rowIndex:      number;
  sno:           string;
  adminName:     string;
  phone:         string;
  email:         string;
  notifications: string;
  createdAt:     string;
  createdBy:     string;
  updatedAt:     string;
  updatedBy:     string;
}

export async function GET() {
  let admin;
  try {
    admin = await requireAuth();
    void admin;
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const [adminRows, salesRows] = await Promise.all([
      readAllRows('admin_info'),
      readAllRows('sales').catch(() => []),
    ]);

    if (adminRows.length === 0) {
      await updateRow('admin_info', 1, EXPECTED_HEADERS).catch(() => {});
      return Response.json({ admins: [] });
    }

    if (adminRows[0] && adminRows[0].length < EXPECTED_HEADERS.length) {
      await updateRow('admin_info', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(adminRows[0]);
    const salesHeaderMap = buildHeaderMap(salesRows[0] ?? []);
    const salesList = salesRows.slice(1);

    const admins = adminRows
      .slice(1)
      .map((row, i) => {
        const a: AdminRecord = {
          rowIndex:  i + 2,
          sno:       getCellByHeader(row, headerMap, 'S.No') || String(i + 1),
          adminName: getCellByHeader(row, headerMap, 'Admin Name'),
          phone:     getCellByHeader(row, headerMap, 'Phone Number'),
          email:     getCellByHeader(row, headerMap, 'Email ID'),
          notifications: getCellByHeader(row, headerMap, 'Notifications', 'Enabled'),
          createdAt: getCellByHeader(row, headerMap, 'Created At'),
          createdBy: getCellByHeader(row, headerMap, 'Created By'),
          updatedAt: getCellByHeader(row, headerMap, 'Updated At'),
          updatedBy: getCellByHeader(row, headerMap, 'Updated By'),
        };

        const normName = a.adminName.trim().toLowerCase();
        let salesCreated = 0;
        let salesClosed = 0;
        let revenueGenerated = 0;

        for (const sRow of salesList) {
          const createdBy = getCellByHeader(sRow, salesHeaderMap, 'Created By (Admin)').trim().toLowerCase();
          const saleClosedBy = getCellByHeader(sRow, salesHeaderMap, 'Sale Closed By').trim().toLowerCase();
          const amount = parseFloat(getCellByHeader(sRow, salesHeaderMap, 'Total Amount', '0').replace(/[^0-9.]/g, '')) || 0;

          if (createdBy === normName) {
            salesCreated += 1;
            revenueGenerated += amount;
          }
          if (saleClosedBy === normName) {
            salesClosed += 1;
          }
        }

        return {
          ...a,
          metrics: {
            salesCreated,
            salesClosed,
            revenueGenerated: Math.round(revenueGenerated),
          },
        };
      })
      .filter((a) => a.adminName);

    return Response.json({ admins });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admins GET]', message);
    return Response.json(
      { error: "Couldn't load admins directory.", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(AdminSchema, body);

    if (!valid) {
      return Response.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const { adminName, phoneNumber, emailId, notifications, password } = data!;

    if (!password) {
      return Response.json(
        { error: 'Password is required when creating a new admin.' },
        { status: 400 }
      );
    }

    const rows = await readAllRows('admin_info');
    if (rows.length === 0 || (rows[0] && rows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('admin_info', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0] ?? []);
    const existingName = rows.slice(1).find(
      (row) => getCellByHeader(row, headerMap, 'Admin Name').trim().toLowerCase() === adminName.trim().toLowerCase()
    );
    const existingEmail = rows.slice(1).find(
      (row) => getCellByHeader(row, headerMap, 'Email ID').trim().toLowerCase() === emailId.trim().toLowerCase()
    );

    if (existingName) {
      return Response.json(
        {
          error: `Cannot create admin '${adminName}': An admin with this exact name already exists in the system.`,
          detail: `Admin names must be unique across all system accounts to prevent order assignment, warehouse allocation, and activity logging conflicts. Please use a different name for this admin account.`,
        },
        { status: 409 }
      );
    }

    if (existingEmail) {
      return Response.json(
        {
          error: `Cannot create admin: An account with email address '${emailId}' already exists.`,
          detail: `Email addresses must be unique to guarantee secure login authentication and notification delivery. Please use a unique email address for this admin account.`,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, 12);
    const sno = String(Math.max(rows.length - 1, 0) + 1);

    const adminObj = {
      'S.No':          sno,
      'Admin Name':    adminName,
      'Phone Number':  phoneNumber,
      'Email ID':      emailId,
      'Notifications': notifications ?? 'Enabled',
      'Password Hash': passwordHash,
      'Created At':    now,
      'Created By':    admin.name,
      'Updated At':    now,
      'Updated By':    admin.name,
    };

    const newRow = formatRowFromHeaderMap(adminObj, EXPECTED_HEADERS);
    await appendRows('admin_info', [newRow]);

    await logActivity({
      adminName:  admin.name,
      action:     'created',
      module:     'Admin Information',
      moduleKey:  'admin_info',
      recordId:   adminName,
    });

    return Response.json(
      { success: true, message: `Admin '${adminName}' created successfully.` },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admins POST]', message);
    return Response.json(
      { error: "Couldn't create the admin. Check your connection and try again.", detail: message },
      { status: 500 }
    );
  }
}
