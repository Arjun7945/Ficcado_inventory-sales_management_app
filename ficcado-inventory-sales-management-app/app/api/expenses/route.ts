/**
 * app/api/expenses/route.ts
 *
 * GET  /api/expenses — list all expense entries
 * POST /api/expenses — create a new expense (with header-mapped formatting)
 *
 * Phase 77 (B4): Expense Management module.
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

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

const EXPECTED_HEADERS = MODULE_REGISTRY.expenses.headers;

export async function GET(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const categoryFilter = (searchParams.get('category') || '').trim().toLowerCase();

  try {
    const rows = await readAllRows('expenses');
    if (rows.length === 0) {
      await updateRow('expenses', 1, EXPECTED_HEADERS).catch(() => {});
      return Response.json({ expenses: [] });
    }

    // Auto-sync header row if outdated
    if (rows[0] && rows[0].length < EXPECTED_HEADERS.length) {
      await updateRow('expenses', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0]);
    const expenses = rows.slice(1).map((row, i) => {
      const category       = getCellByHeader(row, headerMap, 'Expense Category');
      const customCategory = getCellByHeader(row, headerMap, 'Custom Category');
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

    let filtered = expenses;
    if (search) {
      filtered = filtered.filter((e) =>
        e.description.toLowerCase().includes(search) ||
        e.adminName.toLowerCase().includes(search) ||
        e.createdBy.toLowerCase().includes(search)
      );
    }
    if (categoryFilter) {
      filtered = filtered.filter((e) =>
        e.category.toLowerCase() === categoryFilter ||
        e.displayCategory.toLowerCase() === categoryFilter
      );
    }

    return Response.json({ expenses: filtered });
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
    if (rows.length === 0 || (rows[0] && rows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('expenses', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const sno  = String(Math.max(rows.length - 1, 0) + 1);
    const now  = new Date().toISOString();

    const rowObj = {
      'S.No':             sno,
      'Admin Name':        admin.name,
      'Expense Category': category,
      'Custom Category':  category === 'Other' ? (customCategory?.trim() ?? '') : '',
      'Description':      description.trim(),
      'Amount':           String(parseFloat(String(amount))),
      'Date of Expense':  dateOfExpense,
      'Created At':       now,
      'Created By':       admin.name,
      'Updated At':       '',
      'Updated By':       '',
    };

    const newRow = formatRowFromHeaderMap(rowObj, EXPECTED_HEADERS);

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
