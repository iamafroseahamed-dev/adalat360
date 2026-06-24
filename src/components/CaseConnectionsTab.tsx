import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Eye, Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AddConnectionDialog } from '@/components/AddConnectionDialog';
import { addConnection, loadConnections, removeConnection } from '@/lib/connections';
import { fmtDate } from '@/lib/caseManagement';
import type { ConnectedCaseRow } from '@/types';
import type { CaseSearchResult } from '@/lib/connections';

export function CaseConnectionsTab({
  caseId, onOpenCase, onCountChange,
}: {
  caseId: string | null | undefined;
  onOpenCase?: (caseId: string, caseNumber: string | null) => void;
  onCountChange?: (count: number) => void;
}) {
  const [rows, setRows] = useState<ConnectedCaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const data = await loadConnections(caseId);
      setRows(data);
      onCountChange?.(data.length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load connected cases.');
    } finally {
      setLoading(false);
    }
  }, [caseId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(row: CaseSearchResult, relationship: string) {
    if (!caseId) return;
    try {
      await addConnection(caseId, row.id, relationship);
      toast.success(`Connected ${row.case_number ?? 'case'}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to connect case.');
    }
  }

  async function handleRemove(r: ConnectedCaseRow) {
    setBusyId(r.connectionId);
    try {
      await removeConnection(r.connectionId);
      toast.success('Link removed.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove link.');
    } finally {
      setBusyId(null);
    }
  }

  if (!caseId) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Connected cases are available once a case is selected.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} connected case{rows.length !== 1 ? 's' : ''}</p>
        <Button size="sm" className="h-8 gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Connected Case
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading connected cases…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
          <Link2 className="h-5 w-5" /> No connected cases yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Case Number</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Hearing</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.connectionId}>
                  <TableCell className="font-mono text-xs font-semibold">{r.case.case_number || '—'}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs" title={r.case.court_name ?? ''}>{r.case.court_name || '—'}</TableCell>
                  <TableCell className="text-xs">{r.case.case_status || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.case.next_hearing_date)}</TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{r.relationship_type}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="View Case"
                        disabled={!onOpenCase} onClick={() => onOpenCase?.(r.case.id, r.case.case_number)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" title="Remove Link"
                        disabled={busyId === r.connectionId} onClick={() => handleRemove(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddConnectionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        excludeIds={[caseId, ...rows.map(r => r.case.id)]}
        onAdd={handleAdd}
      />
    </div>
  );
}
