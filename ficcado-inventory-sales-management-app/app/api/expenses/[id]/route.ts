/**
 * app/api/expenses/[id]/route.ts
 *
 * PUT    /api/expenses/[id] — update an expense (creator-only)
 * DELETE /api/expenses/[id] — delete an expense (creator-only)
 *
 * [id] is the S.No of the expense entry.
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;
  const { id } = await params;

  try {
    const rows = await readAllRows('expenses');
    if (rows.length < 2) return Response.json({ error: 'No expenses found.' }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    const rowIdx = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id);
    if (rowIdx === -1) return Response.json({ error: `Expense #${id} not found.` }, { status: 404 });

    const existingRow = rows[rowIdx + 1];
    const createdBy   = getCellByHeader(existingRow, headerMap, 'Created By');
    if (createdBy !== admin.name) {
      return Response.json({ error: 'You can only edit expenses you created.' }, { status: 403 });
    }

    const body = await request.json();
    const { category, customCategory, description, amount, dateOfExpense } = body;

    if (category && !PRESET_CATEGORIES.includes(category)) {
      return Response.json({ error: `Invalid category.` }, { status: 400 });
    }
    if (category === 'Other' && !customCategory?.trim()) {
      return Response.json({ error: '"What type of expense is this?" is required when Category is Other.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newCategory       = category       ?? getCellByHeader(existingRow, headerMap, 'Expense Category');
    const newCustomCategory = newCategory === 'Other' ? (customCategory?.trim() ?? getCellByHeader(existingRow, headerMap, 'Custom Category')) : '';
    const updatedRow = [
      getCellByHeader(existingRow, headerMap, 'S.No'),
      getCellByHeader(existingRow, headerMap, 'Admin Name'),
      newCategory,
      newCustomCategory,
      description?.trim() ?? getCellByHeader(existingRow, headerMap, 'Description'),
      amount !== undefined ? String(parseFloat(String(amount))) : getCellByHeader(existingRow, headerMap, 'Amount'),
      dateOfExpense ?? getCellByHeader(existingRow, headerMap, 'Date of Expense'),
      getCellByHeader(existingRow, headerMap, 'Created At'),
      getCellByHeader(existingRow, headerMap, 'Created By'),
      now,
      admin.name,
    ];

    await updateRow('expenses', rowIdx + 2, updatedRow);
    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Expense Management',
      moduleKey: 'expenses',
      recordId: id,
      customMessage: `Admin '${admin.name}' updated expense #${id}.`,
    }).catch(() => {});

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: 'Failed to update expense.', detail: err?.message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;
  const { id } = await params;

  try {
    const rows = await readAllRows('expenses');
    if (rows.length < 2) return Response.json({ error: 'No expenses found.' }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    const rowIdx = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id);
    if (rowIdx === -1) return Response.json({ error: `Expense #${id} not found.` }, { status: 404 });

    const existingRow = rows[rowIdx + 1];
    const createdBy   = getCellByHeader(existingRow, headerMap, 'Created By');
    if (createdBy !== admin.name) {
      return Response.json({ error: 'You can only delete expenses you created.' }, { status: 403 });
    }

    await deleteRow('expenses', rowIdx + 2);
    await logActivity({
      adminName: admin.name,
      action: 'deleted',
      module: 'Expense Management',
      moduleKey: 'expenses',
      recordId: id,
      customMessage: `Admin '${admin.name}' deleted expense #${id}.`,
    }).catch(() => {});

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: 'Failed to delete expense.', detail: err?.message }, { status: 500 });
  }
}
