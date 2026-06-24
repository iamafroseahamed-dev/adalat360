import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDateTime } from '@/lib/caseManagement';
import type { CaseNote } from '@/types';

export function CaseNotesTab({ caseId }: { caseId: string | null | undefined }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('case_notes')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setNotes((data ?? []) as CaseNote[]);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    const value = text.trim();
    if (!value) { toast.error('Note cannot be empty.'); return; }
    if (!caseId) { toast.error('No case selected.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('case_notes').insert({
        case_id: caseId,
        note_text: value,
        created_by: user?.profile?.full_name || user?.email || 'Unknown',
      });
      if (error) throw error;
      setText('');
      toast.success('Note added.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add note.');
    } finally {
      setSaving(false);
    }
  }

  if (!caseId) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Notes are available once a case is selected.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="space-y-2 rounded-md border p-3">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a note, discussion summary or follow-up…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" className="h-8 gap-1" disabled={saving} onClick={addNote}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Note
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
          <StickyNote className="h-5 w-5" />
          No notes yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map(n => (
            <li key={n.id} className="rounded-md border p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{n.created_by || 'Unknown'}</span>
                <span>{fmtDateTime(n.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{n.note_text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
