import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { Case } from '@/types';

function isoToday(): string {
  return new Date().toISOString().split('T')[0];
}

function isoInNDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function UpcomingHearingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Case[]>([]);

  const today = useMemo(() => isoToday(), []);
  const in7 = useMemo(() => isoInNDays(7), []);

  useEffect(() => {
    async function fetchUpcomingHearings() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: sbErr } = await supabase
          .from('cases')
          .select('id,case_number,petitioner,respondent,district,next_hearing_date,case_status')
          .eq('active', true)
          .gte('next_hearing_date', today)
          .lte('next_hearing_date', in7)
          .order('next_hearing_date', { ascending: true, nullsFirst: false });

        if (sbErr) throw sbErr;
        setRows((data ?? []) as Case[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load upcoming hearings.');
      } finally {
        setLoading(false);
      }
    }

    void fetchUpcomingHearings();
  }, [today, in7]);

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Upcoming Hearings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Read-only hearing calendar view for the next 7 days.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Hearings between {fmtDate(today)} and {fmtDate(in7)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : error ? (
            <p className="px-4 py-8 text-center text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No hearings in the next 7 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Case Number</TableHead>
                    <TableHead className="whitespace-nowrap">Petitioner</TableHead>
                    <TableHead className="whitespace-nowrap">Respondent</TableHead>
                    <TableHead className="whitespace-nowrap">District</TableHead>
                    <TableHead className="whitespace-nowrap">Next Hearing Date</TableHead>
                    <TableHead className="whitespace-nowrap">Case Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                        {c.case_number}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={c.petitioner ?? undefined}>
                        {c.petitioner ?? '\u2014'}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={c.respondent ?? undefined}>
                        {c.respondent ?? '\u2014'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{c.district ?? '\u2014'}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(c.next_hearing_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{c.case_status ?? '\u2014'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
