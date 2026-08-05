/**
 * app/api/damaged-products/[rowIndex]/route.ts
 * PUT, DELETE for Damaged Products records by 1-based sheet row index
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { validate, DamagedProductSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = {
  sno:           0,
  invoiceNumber: 1,
  itemName:      2,
  size:          3,
  quantity:      4,
  customerName:  5,
  reasonNotes:   6,
  createdAt:     7,
  createdBy:     8,
  updatedAt:     9,
  updatedBy:     10,
};

export async function PUT(request: Request, { params }: { params: Promise<{ rowIndex: string }> }) {
  const { rowIndex: rowIndexStr } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const rowIndex = parseInt(rowIndexStr, 10);
    if (isNaN(rowIndex) || rowIndex < 2) {
      return Response.json({ error: 'Invalid row index.' }, { status: 400 });
    }

    const body = await request.json();
    const { valid, data, errors } = validate(DamagedProductSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const rows = await readAllRows('damaged_products');
    const row = rows[rowIndex - 1];
    if (!row) return Response.json({ error: 'Damaged product record not found.' }, { status: 404 });

    const now = new Date().toISOString();
    await updateRow('damaged_products', rowIndex, [
      row[COL.sno],
      data!.invoiceNumber ?? row[COL.invoiceNumber],
      data!.itemName,
      data!.size,
      String(data!.quantity),
      data!.customerName ?? row[COL.customerName],
      data!.reasonNotes ?? row[COL.reasonNotes],
      row[COL.createdAt],
      row[COL.createdBy],
      now,
      admin.name,
    ]);

    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Damaged Products Management',
      moduleKey: 'damaged_products',
      recordId: data!.itemName,
    });

    return Response.json({ success: true, message: 'Damaged product record updated.' });
  } catch (err) {
    return Response.json({ error: 'Failed to update damaged product record.', detail: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ rowIndex: string }> }) {
  const { rowIndex: rowIndexStr } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const rowIndex = parseInt(rowIndexStr, 10);
    if (isNaN(rowIndex) || rowIndex < 2) {
      return Response.json({ error: 'Invalid row index.' }, { status: 400 });
    }

    await deleteRow('damaged_products', rowIndex);
    await logActivity({
      adminName: admin.name,
      action: 'deleted',
      module: 'Damaged Products Management',
      moduleKey: 'damaged_products',
      recordId: `row ${rowIndex}`,
    });

    return Response.json({ success: true, message: 'Damaged product record deleted.' });
  } catch (err) {
    return Response.json({ error: 'Failed to delete damaged product record.', detail: (err as Error).message }, { status: 500 });
  }
}
