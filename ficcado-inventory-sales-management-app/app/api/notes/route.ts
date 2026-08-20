/**
 * app/api/notes/route.ts
 * GET  /api/notes — list notes (header-mapped)
 * POST /api/notes — create note (header-mapped)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, NoteSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_HEADERS = MODULE_REGISTRY.keep_notes.headers;

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('keep_notes');
    if (rows.length === 0) {
      await updateRow('keep_notes', 1, EXPECTED_HEADERS).catch(() => {});
      return Response.json({ notes: [] });
    }

    if (rows[0] && rows[0].length < EXPECTED_HEADERS.length) {
      await updateRow('keep_notes', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0]);
    const notes = rows.slice(1).map((row, i) => ({
      rowIndex:  i + 2,
      sno:       getCellByHeader(row, headerMap, 'S.No') || String(i + 1),
      content:   getCellByHeader(row, headerMap, 'Note Content'),
      createdBy: getCellByHeader(row, headerMap, 'Created By (Admin)'),
      createdAt: getCellByHeader(row, headerMap, 'Created At'),
      updatedBy: getCellByHeader(row, headerMap, 'Updated By'),
      updatedAt: getCellByHeader(row, headerMap, 'Updated At'),
    })).filter((n) => n.content).reverse();

    return Response.json({ notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load notes.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(NoteSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const { noteContent } = data!;
    const rows = await readAllRows('keep_notes');
    if (rows.length === 0 || (rows[0] && rows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('keep_notes', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const sno = String(Math.max(rows.length - 1, 0) + 1);
    const now = new Date().toISOString();

    const noteObj = {
      'S.No':               sno,
      'Note Content':       noteContent,
      'Created By (Admin)': admin.name,
      'Created At':         now,
      'Updated By':         admin.name,
      'Updated At':         now,
    };

    const newRow = formatRowFromHeaderMap(noteObj, EXPECTED_HEADERS);
    await appendRows('keep_notes', [newRow]);

    const snippet = noteContent.trim().replace(/\s+/g, ' ');
    const shortSnippet = snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet;

    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Keep Notes',
      moduleKey: 'keep_notes',
      recordId: 'Note',
      customMessage: `${admin.name} created a new team note: "${shortSnippet}"`,
    });
    return Response.json({ success: true, message: 'Note saved.' }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't save note.", detail: message }, { status: 500 });
  }
}
