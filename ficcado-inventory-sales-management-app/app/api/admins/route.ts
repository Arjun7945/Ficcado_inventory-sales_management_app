/**
 * app/api/admins/route.ts
 *
 * GET  /api/admins — list all admins from Admin Information Sheet
 * POST /api/admins — create a new admin (Setup Wizard Step 4 + Admin Control Centre)
 */

import bcrypt from 'bcryptjs';
import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, AdminSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

// Column indices (0-based) in Admin Information Sheet
// S.No | Admin Name | Phone Number | Email ID | Notifications | Password Hash | Created At | Created By | Updated At | Updated By
const COL = {
  sno:           0,
  adminName:     1,
  phone:         2,
  email:         3,
  notifications: 4,
  passwordHash:  5,
  createdAt:     6,
  createdBy:     7,
  updatedAt:     8,
  updatedBy:     9,
};

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
  // NOTE: passwordHash is intentionally NOT returned to the client
}

function rowToAdmin(row: string[], rowIndex: number): AdminRecord {
  return {
    rowIndex,
    sno:           row[COL.sno]           ?? '',
    adminName:     row[COL.adminName]     ?? '',
    phone:         row[COL.phone]         ?? '',
    email:         row[COL.email]         ?? '',
    notifications: row[COL.notifications] ?? 'Enabled',
    createdAt:     row[COL.createdAt]     ?? '',
    createdBy:     row[COL.createdBy]     ?? '',
    updatedAt:     row[COL.updatedAt]     ?? '',
    updatedBy:     row[COL.updatedBy]     ?? '',
  };
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
    const rows = await readAllRows('admin_info');
    const admins = rows
      .slice(1) // skip header
      .map((row, i) => rowToAdmin(row, i + 2)) // +2: 1-indexed + skip header
      .filter((a) => a.adminName); // filter empty rows

    return Response.json({ admins });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      {
        error:
          "Couldn't load the admin list. Check Sheet Configuration for 'admin_info'.",
        detail: message,
      },
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

    // Check for duplicate email
    const rows = await readAllRows('admin_info');
    const duplicate = rows.slice(1).find(
      (row) => row[COL.email]?.toLowerCase() === emailId.toLowerCase()
    );
    if (duplicate) {
      return Response.json(
        { error: `An admin with email '${emailId}' already exists.` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, 12);
    const sno = String(rows.length); // next sequential number

    await appendRows('admin_info', [[
      sno,
      adminName,
      phoneNumber,
      emailId,
      notifications ?? 'Enabled',
      passwordHash,
      now,
      admin.name,
      now,
      admin.name,
    ]]);

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
