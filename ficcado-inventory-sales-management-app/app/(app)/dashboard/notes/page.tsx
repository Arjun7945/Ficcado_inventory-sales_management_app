'use client';

/**
 * app/(app)/dashboard/notes/page.tsx
 * Keep Notes — shared memo pad for all admins. Full CRUD with inline edit.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface Note {
  rowIndex:  number;
  sno:       string;
  content:   string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export default function NotesPage() {
  const [notes, setNotes]     = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<{ message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newNote, setNewNote] = useState('');
  const [saving, setSaving]   = useState(false);

  // Inline edit state
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving]   = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);

  async function loadNotes() {
    setLoading(true);
    try {
      const res  = await fetch('/api/notes');
      const data = await res.json();
      if (data.notes) setNotes(data.notes);
      else setError(parseApiError(data));
    } catch { setError({ message: "Couldn't load notes." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadNotes(); }, []);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noteContent: newNote }) });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setNewNote('');
      loadNotes();
    } catch { setError({ message: "Couldn't save note." }); }
    finally { setSaving(false); }
  }

  function startEdit(note: Note) {
    setEditingNote(note);
    setEditContent(note.content);
  }

  async function handleEditNote(e: React.FormEvent) {
    e.preventDefault();
    if (!editingNote) return;
    setEditSaving(true);
    try {
      const res  = await fetch(`/api/notes/${encodeURIComponent(editingNote.sno)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noteContent: editContent }) });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setEditingNote(null);
      setSuccess('Note updated.');
      loadNotes();
    } catch { setError({ message: "Couldn't update note." }); }
    finally { setEditSaving(false); }
  }

  async function handleDeleteNote(note: Note) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(note.sno);
    try {
      const res  = await fetch(`/api/notes/${encodeURIComponent(note.sno)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess('Note deleted.');
      loadNotes();
    } catch { setError({ message: "Couldn't delete note." }); }
    finally { setDeleting(null); }
  }

  if (loading) return <LoadingGecko size="full" label="Loading notes…" />;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Keep Notes</h1>
          <div className="page-subtitle">Shared memo pad — visible to all admins</div>
        </div>
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* New Note Form */}
      <form onSubmit={handleAddNote} className="card" style={{ marginBottom: 20 }}>
        <textarea
          className="form-input"
          placeholder="Write a note for your team… (Shift+Enter for new line)"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(e as any); } }}
          rows={3}
          style={{ resize: 'vertical', marginBottom: 10, fontFamily: 'inherit', fontSize: 14 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={saving || !newNote.trim()}>
            {saving ? <LoadingGecko size="inline" label="Saving…" /> : '+ Add Note'}
          </button>
        </div>
      </form>

      {/* Notes Feed */}
      {notes.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>✎</div>
          <div className="empty-state-title">No notes yet</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Write the first note for your team.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.map((note) => (
            <div key={note.sno} className="card" style={{ padding: '14px 16px' }}>
              {editingNote?.sno === note.sno ? (
                <form onSubmit={handleEditNote}>
                  <textarea
                    className="form-input"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    autoFocus
                    style={{ resize: 'vertical', marginBottom: 10, fontSize: 14, fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingNote(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={editSaving}>
                      {editSaving ? <LoadingGecko size="inline" label="Saving…" /> : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                    {note.content}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                      {note.createdBy} · {note.createdAt ? new Date(note.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      {note.updatedBy && note.updatedBy !== note.createdBy && (
                        <span style={{ marginLeft: 8 }}>· Updated by {note.updatedBy}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(note)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteNote(note)} disabled={deleting === note.sno}>
                        {deleting === note.sno ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
