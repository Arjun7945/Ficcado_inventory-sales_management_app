/**
 * app/api/announcements/route.ts
 * GET /api/announcements — returns past broadcast history
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const rows = await readAllRows('announcements');
    if (rows.length === 0) return Response.json({ logs: [] });

    const map = buildHeaderMap(rows[0]);
    const logs = rows.slice(1).map((r, i) => ({
      sno:             getCellByHeader(r, map, 'S.No') || String(i + 1),
      subject:         getCellByHeader(r, map, 'Subject'),
      targetAudience:  getCellByHeader(r, map, 'Target Audience'),
      recipientsCount: getCellByHeader(r, map, 'Recipients Count'),
      sentCount:       getCellByHeader(r, map, 'Sent Count'),
      failedCount:     getCellByHeader(r, map, 'Failed Count'),
      createdAt:       getCellByHeader(r, map, 'Created At'),
      createdBy:       getCellByHeader(r, map, 'Created By'),
    })).reverse();

    return Response.json({ logs });
  } catch (err: any) {
    return Response.json({ logs: [] });
  }
}
