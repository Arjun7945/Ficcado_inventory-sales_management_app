/**
 * app/api/sheet-config/test/route.ts
 * POST — test-read a spreadsheetId + tabName without saving.
 * Used by Admin Control Centre to validate before committing changes.
 */
import { requireAuth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheetsClient';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const { spreadsheetId, tabName } = await request.json();
    if (!spreadsheetId || !tabName) {
      return Response.json({ error: 'spreadsheetId and tabName are required.' }, { status: 400 });
    }

    const sheets = await getSheetsClient();
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:A2`,
    });

    const rowCount = (res.data.values ?? []).length;
    return Response.json({ success: true, message: `Connection successful — found ${rowCount} header row(s) in tab '${tabName}'.` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('not found') || msg.includes('Unable to parse') || msg.includes('404')) {
      return Response.json({ error: `Tab '${(await request.json?.().catch(() => ({}))).tabName}' not found. Check the tab name matches exactly.`, detail: msg }, { status: 422 });
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      return Response.json({ error: 'Service account does not have access to this spreadsheet. Share it with Editor access.', detail: msg }, { status: 403 });
    }
    return Response.json({ error: `Connection failed: ${msg}` }, { status: 500 });
  }
}
