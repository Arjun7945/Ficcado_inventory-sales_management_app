/**
 * app/api/invoice/[invoiceNumber]/route.ts
 * GET — return full data for invoice generation (sales + replacement + return/refund)
 */
import { requireAuth } from '@/lib/auth';
import { batchGet } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ invoiceNumber: string }> }) {
  const { invoiceNumber } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const results = await batchGet([
      { moduleKey: 'sales',        range: 'A:R', label: 'sales' },
      { moduleKey: 'replacement',  range: 'A:M', label: 'replacement' },
      { moduleKey: 'return_refund', range: 'A:M', label: 'return_refund' },
    ]);

    const salesResult = results.find((r) => r.label === 'sales');
    const repResult   = results.find((r) => r.label === 'replacement');
    const retResult   = results.find((r) => r.label === 'return_refund');

    const salesRows = (salesResult?.values ?? []).slice(1).filter((r) => r[1] === invoiceNumber);
    const repRows   = (repResult?.values  ?? []).slice(1).filter((r) => r[1] === invoiceNumber);
    const retRows   = (retResult?.values  ?? []).slice(1).filter((r) => r[1] === invoiceNumber);

    if (!salesRows.length) {
      return Response.json({ error: `No sale found with invoice number '${invoiceNumber}'.` }, { status: 404 });
    }

    const s = salesRows[0];
    const sale = {
      invoiceNumber:      s[1],
      saleStatus:         s[2],
      customerName:       s[3],
      customerPhone:      s[4],
      customerAddress:    s[5],
      totalItems:         s[6],
      itemNames:          s[7],
      sizesChosen:        s[8],
      totalAmount:        s[9],
      paymentStatus:      s[10],
      modeOfPayment:      s[11],
      transactionId:      s[12],
      createdAt:          s[13],
      createdBy:          s[14],
    };

    const replacements = repRows.map((r) => ({
      invoiceNumber: r[1], totalItems: r[2], lastItems: r[3], lastSizes: r[4],
      newItems: r[5], newSizes: r[6], invoiceStatus: r[7], createdAt: r[8], createdBy: r[9],
    }));

    const returnRefunds = retRows.map((r) => ({
      invoiceNumber: r[1], verificationStatus: r[2], refundStatus: r[3],
      refundAmount: r[4], refundCompletedAt: r[5], transactionId: r[6],
      modeOfRefund: r[7], createdAt: r[8], createdBy: r[9],
    }));

    return Response.json({ sale, replacements, returnRefunds });
  } catch (err) {
    return Response.json({ error: 'Failed to load invoice data.', detail: (err as Error).message }, { status: 500 });
  }
}
