/**
 * app/api/notes/[id]/route.ts
 * PUT    — update note (header-mapped)
 * DELETE — delete note (header-mapped)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, NoteSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_HEADERS = MODULE_REGISTRY.keep_notes.headers;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const body = await request.json();
    const { valid, data, errors } = validate(NoteSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const rows = await readAllRows('keep_notes');
    if (rows.length < 2) return Response.json({ error: 'No notes found.' }, { status: 404 });

    if (rows[0] && rows[0].length < EXPECTED_HEADERS.length) {
      await updateRow('keep_notes', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0]);
    let idx = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id);
    if (idx === -1) {
      idx = rows.slice(1).findIndex((_, i) => String(i + 2) === id || String(i + 1) === id);
    }
    if (idx === -1) return Response.json({ error: 'Note not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const createdByVal = getCellByHeader(row, headerMap, 'Created By (Admin)');

    // Permission check: Creator only (case & first-name flexible match)
    const creatorLower = createdByVal.trim().toLowerCase();
    const currentLower = admin.name.trim().toLowerCase();
    const isMatch = creatorLower === currentLower ||
      (creatorLower.split(/\s+/)[0] === currentLower.split(/\s+/)[0] && creatorLower.split(/\s+/)[0].length >= 2);

    if (creatorLower && !isMatch) {
      return Response.json(
        { error: `Permission denied — only the creator of this note (${createdByVal}) can edit or delete it.` },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const snoVal = getCellByHeader(row, headerMap, 'S.No');
    const createdAtVal = getCellByHeader(row, headerMap, 'Created At');

    const noteObj = {
      'S.No':               snoVal,
      'Note Content':       data!.noteContent,
      'Created By (Admin)': createdByVal,
      'Created At':         createdAtVal,
      'Updated By':         admin.name,
      'Updated At':         now,
    };

    const updatedRow = formatRowFromHeaderMap(noteObj, EXPECTED_HEADERS);
    await updateRow('keep_notes', idx + 2, updatedRow);

    const snippet = data!.noteContent.trim().replace(/\s+/g, ' ');
    const shortSnippet = snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet;

    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Keep Notes',
      moduleKey: 'keep_notes',
      recordId: `Note #${snoVal}`,
      customMessage: `${admin.name} updated a team note: "${shortSnippet}"`,
    });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to update note.', detail: (err as Error).message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('keep_notes');
    if (rows.length < 2) return Response.json({ error: 'No notes found.' }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    let idx = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id);
    if (idx === -1) {
      idx = rows.slice(1).findIndex((_, i) => String(i + 2) === id || String(i + 1) === id);
    }
    if (idx === -1) return Response.json({ error: 'Note not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const createdByVal = getCellByHeader(row, headerMap, 'Created By (Admin)');

    // Permission check: Creator only (case & first-name flexible match)
    const creatorLower = createdByVal.trim().toLowerCase();
    const currentLower = admin.name.trim().toLowerCase();
    const isMatch = creatorLower === currentLower ||
      (creatorLower.split(/\s+/)[0] === currentLower.split(/\s+/)[0] && creatorLower.split(/\s+/)[0].length >= 2);

    if (creatorLower && !isMatch) {
      return Response.json(
        { error: `Permission denied — only the creator of this note (${createdByVal}) can edit or delete it.` },
        { status: 403 }
      );
    }

    const snoVal = getCellByHeader(row, headerMap, 'S.No');
    await deleteRow('keep_notes', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Keep Notes', moduleKey: 'keep_notes', recordId: `Note #${snoVal}` });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete note.', detail: (err as Error).message }, { status: 500 }); }
}
