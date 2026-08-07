/**
 * app/api/invoice/[invoiceNumber]/pdf/route.ts
 * GET — generate and stream a PDF invoice for a given invoice number.
 * Returns application/pdf with Content-Disposition: attachment.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { generateInvoicePdf, type InvoiceSaleData } from '@/lib/invoiceGenerator';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = {
  invoiceNumber:        1,
  saleStatus:           2,
  customerName:         3,
  customerPhone:        4,
  customerAddress:      5,
  totalItems:           6,
  itemNames:            7,
  sizes:                8,
  itemPrices:           9,
  totalAmount:          10,
  paymentStatus:        11,
  modeOfPayment:        12,
  transactionId:        13,
  createdAt:            14,
  createdBy:            15,
  updatedAt:            16,
  updatedBy:            17,
  version:              18,
  deliveryStatus:       19,
  deliveryChargeToggle: 20,
  deliveryChargeAmount: 21,
  fulfilmentStatus:     22,
  fulfilmentSource:     23,
  saleClosedBy:         24,
  discount:             25,
  customerEmail:        26,
};

export async function GET(
  _: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const { invoiceNumber } = await params;
  let admin;
  try {
    admin = await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'Auth required.' }, { status: 401 });
  }

  try {
    const salesRows = await readAllRows('sales');
    const match = salesRows.slice(1).find((r) => r[COL.invoiceNumber] === invoiceNumber);

    if (!match) {
      return Response.json(
        { error: `No sale found with invoice number '${invoiceNumber}'.` },
        { status: 404 }
      );
    }

    const saleData: InvoiceSaleData = {
      invoiceNumber:        match[COL.invoiceNumber]        ?? invoiceNumber,
      customerName:         match[COL.customerName]         ?? '',
      customerPhone:        match[COL.customerPhone]        ?? '',
      customerAddress:      match[COL.customerAddress]      ?? '',
      customerEmail:        match[COL.customerEmail]        ?? '',
      itemNames:            match[COL.itemNames]            ?? '',
      sizes:                match[COL.sizes]                ?? '',
      itemPrices:           match[COL.itemPrices]           ?? '',
      totalItems:           match[COL.totalItems]           ?? '1',
      totalAmount:          match[COL.totalAmount]          ?? '0',
      discount:             parseFloat(match[COL.discount]  ?? '0') || 0,
      deliveryChargeToggle: match[COL.deliveryChargeToggle] === 'true',
      deliveryChargeAmount: parseFloat(match[COL.deliveryChargeAmount] ?? '0') || 0,
      paymentStatus:        match[COL.paymentStatus]        ?? '',
      modeOfPayment:        match[COL.modeOfPayment]        ?? '',
      transactionId:        match[COL.transactionId]        ?? '',
      createdAt:            match[COL.createdAt]            ?? '',
    };

    const pdfBuffer = await generateInvoicePdf(saleData);

    // Log Activity for Invoice PDF Download
    const custName = saleData.customerName || 'Customer';
    const logMsg = `Administrator '${admin.name}' generated and downloaded official PDF invoice '${invoiceNumber}' for customer '${custName}' containing ${saleData.itemNames || 'purchased items'} (Grand Total: ₹${saleData.totalAmount}) on ${new Date().toLocaleString('en-IN')}.`;

    logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Sales Management',
      moduleKey: 'sales',
      recordId: invoiceNumber,
      customMessage: logMsg,
    }).catch(() => {});

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
        'Content-Length':      String(pdfBuffer.length),
      },
    });
  } catch (err) {
    return Response.json(
      { error: 'Failed to generate invoice PDF.', detail: (err as Error).message },
      { status: 500 }
    );
  }
}
