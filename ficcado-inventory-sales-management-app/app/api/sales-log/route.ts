/**
 * app/api/sales-log/route.ts
 *
 * GET /api/sales-log — Fetch narrative sales log entries from `sales_log` sheet.
 * Supports limit, module filter, and keyword search.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'Auth required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const moduleFilter = searchParams.get('module');
    const searchQuery = searchParams.get('search')?.toLowerCase();

    const rows = await readAllRows('sales_log');
    if (rows.length === 0) return Response.json({ logs: [] });

    const headerMap = buildHeaderMap(rows[0]);
    let logs = rows.slice(1).map((row) => ({
      sno:                  getCellByHeader(row, headerMap, 'S.No'),
      module:               getCellByHeader(row, headerMap, 'Module'),
      operation:            getCellByHeader(row, headerMap, 'Operation'),
      relatedInvoiceNumber: getCellByHeader(row, headerMap, 'Related Invoice Number'),
      message:              getCellByHeader(row, headerMap, 'Log Message'),
      createdAt:            getCellByHeader(row, headerMap, 'Created At'),
      createdBy:            getCellByHeader(row, headerMap, 'Created By'),
      updatedAt:            getCellByHeader(row, headerMap, 'Updated At'),
      updatedBy:            getCellByHeader(row, headerMap, 'Updated By'),
    })).filter((l) => l.message);

    // Filter by module if provided
    if (moduleFilter && moduleFilter !== 'ALL') {
      logs = logs.filter((l) => l.module.toLowerCase() === moduleFilter.toLowerCase());
    }

    // Filter by search query if provided
    if (searchQuery) {
      logs = logs.filter((l) =>
        l.message.toLowerCase().includes(searchQuery) ||
        l.relatedInvoiceNumber.toLowerCase().includes(searchQuery) ||
        l.createdBy.toLowerCase().includes(searchQuery) ||
        l.module.toLowerCase().includes(searchQuery)
      );
    }

    // Reverse chronologically so newest entries appear first
    logs.reverse();

    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        logs = logs.slice(0, limit);
      }
    }

    return Response.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load sales log entries.", detail: message }, { status: 500 });
  }
}
