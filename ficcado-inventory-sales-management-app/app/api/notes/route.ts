/**
 * app/api/notes/route.ts
 * GET  /api/notes — list notes
 * POST /api/notes — create note
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, NoteSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = { sno: 0, content: 1, createdBy: 2, createdAt: 3, updatedBy: 4, updatedAt: 5 };

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('keep_notes');
    const notes = rows.slice(1).map((row, i) => ({
      rowIndex:  i + 2,
      content:   row[COL.content]   ?? '',
      createdBy: row[COL.createdBy] ?? '',
      createdAt: row[COL.createdAt] ?? '',
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
    const now = new Date().toISOString();

    await appendRows('keep_notes', [[
      String(rows.length), noteContent, admin.name, now, admin.name, now,
    ]]);

    await logActivity({ adminName: admin.name, action: 'created', module: 'Keep Notes', moduleKey: 'keep_notes', recordId: 'Note' });
    return Response.json({ success: true, message: 'Note saved.' }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't save note.", detail: message }, { status: 500 });
  }
}
