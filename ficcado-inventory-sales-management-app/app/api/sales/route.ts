/**
 * app/api/sales/route.ts
 *
 * GET  /api/sales         — list all sales
 * POST /api/sales         — create a new sale (auto-generates FIC- invoice number)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, SalesSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

// Column indices (0-based) matching spec Section 3.3
// S.No | Invoice Number | Sale Status | Customer Name | Customer Phone | Customer Address |
// Total Items | Item Name(s) | Size(s) | Total Amount | Payment Status | Mode of Payment |
// Transaction ID | Created At | Created By | Updated At | Updated By | Version
const COL = {
  sno:             0,
  invoiceNumber:   1,
  saleStatus:      2,
  customerName:    3,
  customerPhone:   4,
  customerAddress: 5,
  totalItems:      6,
  itemNames:       7,
  sizes:           8,
  totalAmount:     9,
  paymentStatus:   10,
  modeOfPayment:   11,
  transactionId:   12,
  createdAt:       13,
  createdBy:       14,
  updatedAt:       15,
  updatedBy:       16,
  version:         17,
};

/** Generate the next FIC- invoice number based on existing rows. */
async function generateInvoiceNumber(rows: string[][]): Promise<string> {
  let maxNum = 0;
  for (let i = 1; i < rows.length; i++) {
    const inv = rows[i][COL.invoiceNumber] ?? '';
    const match = inv.match(/^FIC-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `FIC-${maxNum + 1}`;
}

export async function GET() {
  try {
    await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const rows = await readAllRows('sales');
    const sales = rows.slice(1).map((row, i) => ({
      rowIndex:       i + 2,
      sno:            row[COL.sno]             ?? '',
      invoiceNumber:  row[COL.invoiceNumber]   ?? '',
      saleStatus:     row[COL.saleStatus]      ?? '',
      customerName:   row[COL.customerName]    ?? '',
      customerPhone:  row[COL.customerPhone]   ?? '',
      customerAddress:row[COL.customerAddress] ?? '',
      totalItems:     row[COL.totalItems]      ?? '',
      itemNames:      row[COL.itemNames]       ?? '',
      sizes:          row[COL.sizes]           ?? '',
      totalAmount:    row[COL.totalAmount]     ?? '',
      paymentStatus:  row[COL.paymentStatus]   ?? '',
      modeOfPayment:  row[COL.modeOfPayment]   ?? '',
      transactionId:  row[COL.transactionId]   ?? '',
      createdAt:      row[COL.createdAt]       ?? '',
      createdBy:      row[COL.createdBy]       ?? '',
      updatedAt:      row[COL.updatedAt]       ?? '',
      updatedBy:      row[COL.updatedBy]       ?? '',
      version:        row[COL.version]         ?? '1',
    })).filter((s) => s.invoiceNumber);

    return Response.json({ sales });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: "Couldn't load sales data. Check Sheet Configuration for 'sales'.", detail: message },
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
    const { valid, data, errors } = validate(SalesSchema, body);

    if (!valid) {
      return Response.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const {
      customerName, customerPhoneNumber, customerAddress,
      totalNumberOfItems, itemNames, sizesChosen,
      totalAmount, paymentStatus, modeOfPayment,
      transactionId, saleStatus,
    } = data!;

    const rows = await readAllRows('sales');
    const invoiceNumber = await generateInvoiceNumber(rows);
    const now = new Date().toISOString();
    const sno = String(rows.length);

    await appendRows('sales', [[
      sno,
      invoiceNumber,
      saleStatus ?? 'Purchase Satisfied',
      customerName,
      customerPhoneNumber,
      customerAddress,
      String(totalNumberOfItems),
      Array.isArray(itemNames) ? itemNames.join(', ') : itemNames,
      Array.isArray(sizesChosen) ? sizesChosen.join(', ') : sizesChosen,
      String(totalAmount),
      paymentStatus,
      modeOfPayment,
      transactionId ?? '',
      now,
      admin.name,
      now,
      admin.name,
      '1',
    ]]);

    await logActivity({
      adminName:  admin.name,
      action:     'created',
      module:     'Sales Management',
      moduleKey:  'sales',
      recordId:   invoiceNumber,
    });

    return Response.json(
      { success: true, invoiceNumber, message: `Sale ${invoiceNumber} created successfully.` },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sales POST]', message);
    return Response.json(
      { error: "Couldn't create the sale. Check your connection and try again.", detail: message },
      { status: 500 }
    );
  }
}
