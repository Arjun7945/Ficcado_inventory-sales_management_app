/**
 * app/api/expenses/route.ts
 *
 * GET  /api/expenses — list all expense entries (all admins see all)
 * POST /api/expenses — create a new expense (auto-fills Admin Name from session)
 *
 * Phase 77 (B4): Expense Management module.
 * Category "Other" stores the admin's custom text in the Custom Category column.
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const PRESET_CATEGORIES = [
  'Fuel Expense',
  'Printing Exp',
  'Travel Exp',
  'Food Exp',
  'Tip Exp',
  'Purchase on Goods Exp',
  'Advertising Exp',
  'Other',
];

export async function GET() {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const rows = await readAllRows('expenses');
    if (rows.length === 0) return Response.json({ expenses: [] });

    const headerMap = buildHeaderMap(rows[0]);
    const expenses = rows.slice(1).map((row, i) => {
      const category       = getCellByHeader(row, headerMap, 'Expense Category');
      const customCategory = getCellByHeader(row, headerMap, 'Custom Category');
      // Effective display category: if "Other", show customCategory text
      const displayCategory = category === 'Other' && customCategory ? customCategory : category;
      return {
        rowIndex:        i + 2,
        sno:             getCellByHeader(row, headerMap, 'S.No') || String(i + 1),
        adminName:       getCellByHeader(row, headerMap, 'Admin Name'),
        category,
        customCategory,
        displayCategory,
        description:     getCellByHeader(row, headerMap, 'Description'),
        amount:          getCellByHeader(row, headerMap, 'Amount'),
        dateOfExpense:   getCellByHeader(row, headerMap, 'Date of Expense'),
        createdAt:       getCellByHeader(row, headerMap, 'Created At'),
        createdBy:       getCellByHeader(row, headerMap, 'Created By'),
        updatedAt:       getCellByHeader(row, headerMap, 'Updated At'),
        updatedBy:       getCellByHeader(row, headerMap, 'Updated By'),
      };
    }).filter((e) => e.adminName || e.description);

    return Response.json({ expenses });
  } catch (err: any) {
    return Response.json({ error: 'Failed to load expenses.', detail: err?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;

  try {
    const body = await request.json();
    const { category, customCategory, description, amount, dateOfExpense } = body as {
      category:        string;
      customCategory?: string;
      description:     string;
      amount:          string | number;
      dateOfExpense:   string;
    };

    if (!PRESET_CATEGORIES.includes(category)) {
      return Response.json({ error: `Invalid category. Must be one of: ${PRESET_CATEGORIES.join(', ')}.` }, { status: 400 });
    }
    if (category === 'Other' && !customCategory?.trim()) {
      return Response.json({ error: '"What type of expense is this?" is required when Category is Other.' }, { status: 400 });
    }
    if (!description?.trim()) {
      return Response.json({ error: 'Description is required.' }, { status: 400 });
    }
    if (!amount || isNaN(parseFloat(String(amount)))) {
      return Response.json({ error: 'A valid Amount is required.' }, { status: 400 });
    }
    if (!dateOfExpense) {
      return Response.json({ error: 'Date of Expense is required.' }, { status: 400 });
    }

    const rows = await readAllRows('expenses');
    const sno  = String(Math.max(rows.length - 1, 0) + 1);
    const now  = new Date().toISOString();

    const newRow = [
      sno,
      admin.name,
      category,
      category === 'Other' ? (customCategory?.trim() ?? '') : '',
      description.trim(),
      String(parseFloat(String(amount))),
      dateOfExpense,
      now,
      admin.name,
      '',
      '',
    ];

    await appendRows('expenses', [newRow]);
    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Expense Management',
      moduleKey: 'expenses',
      recordId: sno,
      customMessage: `Admin '${admin.name}' logged a new expense: ${category === 'Other' ? customCategory : category} — ₹${amount} on ${dateOfExpense}. Description: ${description}.`,
    }).catch(() => {});

    return Response.json({ success: true, sno });
  } catch (err: any) {
    return Response.json({ error: 'Failed to create expense.', detail: err?.message }, { status: 500 });
  }
}
