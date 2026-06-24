import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { RELATIONSHIP_TYPES, searchCases, type CaseSearchResult } from '@/lib/connections';

/**
 * Reusable "Add Connected Case" picker. Lets the user pick a relationship type,
 * search the `cases` table, and add results one by one (stays open for multiple).
 * The host decides what `onAdd` does (insert a connection, or push to a draft).
 */
export function AddConnectionDialog({
  open, onOpenChange, excludeIds, onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeIds: string[];
  onAdd: (caseRow: CaseSearchResult, relationshipType: string) => void | Promise<void>;
}) {
  const [relationship, setRelationship] = useState<string>('Connected');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CaseSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setRelationship('Connected'); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchCases(query, excludeIds);
        if (!cancelled) setResults(rows);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Search failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open, excludeIds]);

  async function add(row: CaseSearchResult) {
    setBusyId(row.id);
    try {
      await onAdd(row, relationship);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Connected Case</DialogTitle>
          <DialogDescription>Search by case number, petitioner, respondent or CNR, then add.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Relationship</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search cases…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No matching cases.</p>
            ) : (
              <ul className="divide-y">
                {results.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold">{r.case_number || '—'}</p>
                      <p className="truncate text-xs text-muted-foreground" title={`${r.petitioner ?? ''} vs ${r.respondent ?? ''}`}>
                        {(r.petitioner || '—')} vs {(r.respondent || '—')}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs"
                      disabled={busyId === r.id} onClick={() => add(r)}>
                      {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
