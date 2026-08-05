'use client';

/**
 * app/(app)/dashboard/notes/page.tsx
 * Keep Notes — internal memo pad for admins.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface Note {
  rowIndex:  number;
  content:   string;
  createdBy: string;
  createdAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadNotes() {
    setLoading(true);
    try {
      const res = await fetch('/api/notes');
      const data = await res.json();
      if (data.notes) setNotes(data.notes);
      else setError(parseApiError(data));
    } catch {
      setError({ message: "Couldn't load notes." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadNotes(); }, []);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteContent: newNote }),
      });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }

      setNewNote('');
      loadNotes();
    } catch {
      setError({ message: "Couldn't save note." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label="Loading notes…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Keep Notes</h1>
          <div className="page-subtitle">Internal memos, operational reminders, and team notes</div>
        </div>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      {/* New Note Input */}
      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={handleAddNote}>
          <div className="form-group">
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Write a note or reminder for the team…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving || !newNote.trim()}>
              {saving ? <LoadingGecko size="inline" label="Saving…" /> : 'Post Note'}
            </button>
          </div>
        </form>
      </div>

      {/* Notes Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {notes.map((note, idx) => (
          <div key={note.createdAt + idx} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--color-ink)', lineHeight: 1.6, marginBottom: 16 }}>
              {note.content}
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--color-ink-muted)' }}>
              <span>By {note.createdBy || 'Admin'}</span>
              <span>{note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-IN') : '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
