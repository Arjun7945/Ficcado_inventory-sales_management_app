/**
 * app/api/notes/[id]/route.ts
 * PUT    — update note
 * DELETE — delete note
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { validate, NoteSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';
const COL = { sno: 0, content: 1, createdBy: 2, createdAt: 3, updatedBy: 4, updatedAt: 5 };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const body = await request.json();
    const { valid, data, errors } = validate(NoteSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const rows = await readAllRows('keep_notes');
    let idx = rows.slice(1).findIndex((r) => r[COL.sno] && String(r[COL.sno]).trim() === id);
    if (idx === -1) {
      idx = rows.slice(1).findIndex((_, i) => String(i + 2) === id || String(i + 1) === id);
    }
    if (idx === -1) return Response.json({ error: 'Note not found.' }, { status: 404 });

    const row = rows[idx + 1];

    // Permission check: Creator only (case & first-name flexible match)
    const creatorLower = (row[COL.createdBy] || '').trim().toLowerCase();
    const currentLower = admin.name.trim().toLowerCase();
    const isMatch = creatorLower === currentLower ||
      (creatorLower.split(/\s+/)[0] === currentLower.split(/\s+/)[0] && creatorLower.split(/\s+/)[0].length >= 2);

    if (creatorLower && !isMatch) {
      return Response.json(
        { error: `Permission denied — only the creator of this note (${row[COL.createdBy]}) can edit or delete it.` },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    await updateRow('keep_notes', idx + 2, [row[COL.sno], data!.noteContent, row[COL.createdBy], row[COL.createdAt], admin.name, now]);

    const snippet = data!.noteContent.trim().replace(/\s+/g, ' ');
    const shortSnippet = snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet;

    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Keep Notes',
      moduleKey: 'keep_notes',
      recordId: `Note #${row[COL.sno]}`,
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
    let idx = rows.slice(1).findIndex((r) => r[COL.sno] && String(r[COL.sno]).trim() === id);
    if (idx === -1) {
      idx = rows.slice(1).findIndex((_, i) => String(i + 2) === id || String(i + 1) === id);
    }
    if (idx === -1) return Response.json({ error: 'Note not found.' }, { status: 404 });

    const row = rows[idx + 1];

    // Permission check: Creator only (case & first-name flexible match)
    const creatorLower = (row[COL.createdBy] || '').trim().toLowerCase();
    const currentLower = admin.name.trim().toLowerCase();
    const isMatch = creatorLower === currentLower ||
      (creatorLower.split(/\s+/)[0] === currentLower.split(/\s+/)[0] && creatorLower.split(/\s+/)[0].length >= 2);

    if (creatorLower && !isMatch) {
      return Response.json(
        { error: `Permission denied — only the creator of this note (${row[COL.createdBy]}) can edit or delete it.` },
        { status: 403 }
      );
    }

    await deleteRow('keep_notes', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Keep Notes', moduleKey: 'keep_notes', recordId: `Note #${row[COL.sno]}` });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete note.', detail: (err as Error).message }, { status: 500 }); }
}
