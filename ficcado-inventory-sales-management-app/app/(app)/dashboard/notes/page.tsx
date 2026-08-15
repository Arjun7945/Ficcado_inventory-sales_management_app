'use client';

/**
 * app/(app)/dashboard/notes/page.tsx
 * Keep Notes — shared memo pad for all admins. Full CRUD with inline edit.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';
import { formatISTDateTime } from '@/lib/dateUtils';

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
  const [notes, setNotes]           = useState<Note[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<{ message: string } | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const [newNote, setNewNote] = useState('');
  const [saving, setSaving]   = useState(false);

  // Inline edit state
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving]   = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);

  // Email Notification states
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notifyFeedback, setNotifyFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});

  async function loadNotes() {
    setLoading(true);
    try {
      const [notesRes, meRes] = await Promise.all([
        fetch('/api/notes').then((r) => r.json()),
        fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ admin: null })),
      ]);

      if (notesRes.notes) setNotes(notesRes.notes);
      else setError(parseApiError(notesRes));

      if (meRes.admin) setCurrentAdmin(meRes.admin);
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
    const targetId = editingNote.sno || editingNote.rowIndex;
    try {
      const res  = await fetch(`/api/notes/${encodeURIComponent(String(targetId))}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noteContent: editContent }) });
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
    const targetId = note.sno || note.rowIndex;
    setDeleting(String(targetId));
    try {
      const res  = await fetch(`/api/notes/${encodeURIComponent(String(targetId))}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess('Note deleted.');
      loadNotes();
    } catch { setError({ message: "Couldn't delete note." }); }
    finally { setDeleting(null); }
  }

  async function handleNotifyEmail(note: Note) {
    const targetId = note.sno || note.rowIndex;
    const strId = String(targetId);
    setNotifyingId(strId);
    setNotifyFeedback((prev) => { const n = { ...prev }; delete n[strId]; return n; });

    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(strId)}/notify-email`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setNotifyFeedback((prev) => ({
          ...prev,
          [strId]: { type: 'error', message: data.error || data.detail || 'Failed to send email.' },
        }));
      } else {
        setNotifyFeedback((prev) => ({
          ...prev,
          [strId]: { type: 'success', message: data.message || 'Notification email sent!' },
        }));
      }
    } catch {
      setNotifyFeedback((prev) => ({
        ...prev,
        [strId]: { type: 'error', message: "Couldn't connect to server." },
      }));
    } finally {
      setNotifyingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <MobileBackButton />

      <div className="page-header">
        <div>
          <h1 className="page-title">Keep Notes</h1>
          <div className="page-subtitle">Shared memo pad — visible to all admins (edit/delete restricted to note creator)</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadNotes} disabled={loading}>
          ⟳ Refresh
        </button>
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
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <LoadingGecko label="Fetching team notes…" />
        </div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>✎</div>
          <div className="empty-state-title">No notes yet</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Write the first note for your team.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.map((note, idx) => {
            const adminNameLower = (currentAdmin?.name || '').trim().toLowerCase();
            const noteCreatorLower = (note.createdBy || '').trim().toLowerCase();
            const isCreator = Boolean(
              currentAdmin &&
              (adminNameLower === noteCreatorLower ||
                (adminNameLower.split(/\s+/)[0] === noteCreatorLower.split(/\s+/)[0] && adminNameLower.split(/\s+/)[0].length >= 2))
            );

            const noteKey = note.sno || note.rowIndex || idx;
            const targetId = note.sno || note.rowIndex;
            const editingTargetId = editingNote ? (editingNote.sno || editingNote.rowIndex) : null;
            const isEditing = Boolean(editingTargetId && targetId && String(editingTargetId) === String(targetId));

            return (
              <div key={noteKey} className="card" style={{ padding: '14px 16px' }}>
                {isEditing ? (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                        {note.createdBy} · {formatISTDateTime(note.createdAt)}
                        {note.updatedBy && note.updatedBy !== note.createdBy && (
                          <span style={{ marginLeft: 8 }}>· Updated by {note.updatedBy}</span>
                        )}
                      </div>
                      {isCreator && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--color-brand-primary)', border: '1px solid var(--color-border)', fontSize: 12 }}
                            onClick={() => handleNotifyEmail(note)}
                            disabled={notifyingId === String(targetId)}
                          >
                            {notifyingId === String(targetId) ? (
                              <LoadingGecko size="inline" label="Sending email…" />
                            ) : (
                              '📧 Notify All via Email'
                            )}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(note)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteNote(note)} disabled={deleting === String(targetId)}>
                            {deleting === String(targetId) ? '…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>

                    {notifyFeedback[String(targetId)] && (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: notifyFeedback[String(targetId)].type === 'success' ? 'rgba(47, 125, 79, 0.08)' : 'rgba(176, 64, 58, 0.08)',
                          color: notifyFeedback[String(targetId)].type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                          border: `1px solid ${notifyFeedback[String(targetId)].type === 'success' ? 'rgba(47, 125, 79, 0.3)' : 'rgba(176, 64, 58, 0.3)'}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>{notifyFeedback[String(targetId)].type === 'success' ? '✓ ' : '⚠️ '}{notifyFeedback[String(targetId)].message}</span>
                        <button
                          onClick={() => setNotifyFeedback((prev) => { const n = { ...prev }; delete n[String(targetId)]; return n; })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: 'inherit', marginLeft: 8 }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
