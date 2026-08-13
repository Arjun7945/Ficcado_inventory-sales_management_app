/**
 * app/api/sales-log/route.ts
 *
 * GET /api/sales-log — Fetch narrative sales log entries from `sales_log` sheet.
 *
 * Supports:
 *  - ?page=N&pageSize=50 — server-side paginated, newest-first (Phase 63)
 *  - ?limit=N            — backward-compatible: return last N entries (full-read, for Dashboard preview)
 *  - ?module=MODULE      — filter by module
 *  - ?search=QUERY       — keyword filter
 *
 * Phase 66: Dashboard preview (limit=10) is served from a 30s server-side cache.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, readRowsPage, getSalesLogPreviewCache, setSalesLogPreviewCache } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';
import { formatISTTextTimestamps } from '@/lib/dateUtils';

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
    const limitParam    = searchParams.get('limit');
    const pageParam     = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');
    const moduleFilter  = searchParams.get('module');
    const searchQuery   = searchParams.get('search')?.toLowerCase();
    const isPreview     = limitParam === '10' && !moduleFilter && !searchQuery;

    // ── Phase 66: Serve preview from cache ───────────────────────────────────
    if (isPreview) {
      const cached = getSalesLogPreviewCache();
      if (cached) return Response.json({ logs: cached.logs });
    }

    // ── Phase 63: Paginated mode ──────────────────────────────────────────────
    if (pageParam && !moduleFilter && !searchQuery) {
      const page     = Math.max(1, parseInt(pageParam, 10)  || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeParam ?? '50', 10) || 50));

      const paged = await readRowsPage('sales_log', page, pageSize, /* fromEnd= */ true);

      const headerMap = buildHeaderMap(paged.header);
      const logs = paged.rows.map((row) => ({
        sno:                  getCellByHeader(row, headerMap, 'S.No'),
        module:               getCellByHeader(row, headerMap, 'Module'),
        operation:            getCellByHeader(row, headerMap, 'Operation'),
        relatedInvoiceNumber: getCellByHeader(row, headerMap, 'Related Invoice Number'),
        message:              formatISTTextTimestamps(getCellByHeader(row, headerMap, 'Log Message')),
        createdAt:            getCellByHeader(row, headerMap, 'Created At'),
        createdBy:            getCellByHeader(row, headerMap, 'Created By'),
        updatedAt:            getCellByHeader(row, headerMap, 'Updated At'),
        updatedBy:            getCellByHeader(row, headerMap, 'Updated By'),
      })).filter((l) => l.message);

      return Response.json({
        logs,
        pagination: {
          page:       paged.page,
          pageSize:   paged.pageSize,
          total:      paged.total,
          totalPages: paged.totalPages,
        },
      });
    }

    // ── Full-read path (dashboard feed, module filter, or search) ─────────────
    const rows = await readAllRows('sales_log');
    if (rows.length === 0) return Response.json({ logs: [] });

    const headerMap = buildHeaderMap(rows[0]);
    let logs = rows.slice(1).map((row) => ({
      sno:                  getCellByHeader(row, headerMap, 'S.No'),
      module:               getCellByHeader(row, headerMap, 'Module'),
      operation:            getCellByHeader(row, headerMap, 'Operation'),
      relatedInvoiceNumber: getCellByHeader(row, headerMap, 'Related Invoice Number'),
      message:              formatISTTextTimestamps(getCellByHeader(row, headerMap, 'Log Message')),
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

    // ── Phase 66: Populate preview cache ─────────────────────────────────────
    if (isPreview) setSalesLogPreviewCache(logs);

    return Response.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load sales log entries.", detail: message }, { status: 500 });
  }
}
