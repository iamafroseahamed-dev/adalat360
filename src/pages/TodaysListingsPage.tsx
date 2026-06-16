import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchTodayMatches } from '@/services/causeLists';
import type { CauseListMatch } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  CheckCircle2, Clock, XCircle, Search, FileDown, Printer,
  Scale, MapPin, User, AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatDate } from '@/lib/utils';

interface GroupedMatch {
  courtName: string;
  bench: string;
  courtNo: string;
  judgeName: string;
  matches: CauseListMatch[];
}

function groupMatches(matches: CauseListMatch[]): GroupedMatch[] {
  const map = new Map<string, GroupedMatch>();
  for (const m of matches) {
    const cl = m.cause_list;
    if (!cl) continue;
    const key = `${cl.court_name}||${cl.court_no ?? ''}||${cl.judge_name ?? ''}`;
    if (!map.has(key)) {
      map.set(key, {
        courtName: cl.court_name,
        bench: cl.bench ?? '',
        courtNo: cl.court_no ?? '',
        judgeName: cl.judge_name ?? '',
        matches: [],
      });
    }
    map.get(key)!.matches.push(m);
  }
  const groups = Array.from(map.values());
  groups.forEach(g => g.matches.sort((a, b) => (a.cause_list?.item_number ?? 0) - (b.cause_list?.item_number ?? 0)));
  return groups.sort((a, b) => a.courtName.localeCompare(b.courtName) || a.courtNo.localeCompare(b.courtNo));
}

function MatchTypeBadge({ type }: { type: CauseListMatch['match_type'] }) {
  if (type === 'cnr') return <Badge variant="info" className="text-xs">CNR</Badge>;
  if (type === 'case_number') return <Badge variant="success" className="text-xs">Case No.</Badge>;
  return <Badge variant="warning" className="text-xs">Fuzzy</Badge>;
}

function NotifBadge({ status }: { status?: string }) {
  if (status === 'sent') return <Badge variant="success" className="text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Sent</Badge>;
  if (status === 'failed') return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
  return <Badge variant="warning" className="text-xs"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

function exportExcel(matches: CauseListMatch[], date: string) {
  const rows = matches.map(m => ({
    'Court': m.cause_list?.court_name ?? '',
    'Court Hall': m.cause_list?.court_no ?? '',
    'Judge': m.cause_list?.judge_name ?? '',
    'Item No.': m.cause_list?.item_number ?? '',
    'Case Number': m.case?.case_number ?? '',
    'CNR': m.case?.cnr_number ?? '',
    'Petitioner': m.cause_list?.petitioner ?? m.case?.petitioner ?? '',
    'Respondent': m.cause_list?.respondent ?? m.case?.respondent ?? '',
    'Advocate': m.case?.advocate_name ?? '',
    'Client': m.case?.client_name ?? '',
    'Match Type': m.match_type,
    'Confidence': `${m.match_confidence}%`,
    'Notif. Status': 'Pending',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "Today's Listings");
  XLSX.writeFile(wb, `litigo_listings_${date}.xlsx`);
}

export default function TodaysListingsPage() {
  const { user, isDemo } = useAuth();
  const [matches, setMatches] = useState<CauseListMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setMatches(await fetchTodayMatches(user.organization.id, isDemo));
    } catch (err) {
      toast.error('Failed to load today\'s listings');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? matches.filter(m => {
        const q = search.toLowerCase();
        return (
          m.case?.case_number?.toLowerCase().includes(q) ||
          m.case?.cnr_number?.toLowerCase().includes(q) ||
          m.case?.client_name?.toLowerCase().includes(q) ||
          m.case?.advocate_name?.toLowerCase().includes(q) ||
          m.cause_list?.court_name?.toLowerCase().includes(q) ||
          m.cause_list?.judge_name?.toLowerCase().includes(q) ||
          m.cause_list?.petitioner?.toLowerCase().includes(q)
        );
      })
    : matches;

  const groups = groupMatches(filtered);

  const handlePrint = () => window.print();
  const handleExcel = () => {
    if (matches.length === 0) { toast.error('No matches to export'); return; }
    exportExcel(matches, today);
    toast.success('Excel report downloaded');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search cases, clients, courts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {matches.length} case{matches.length !== 1 ? 's' : ''} matched
          </Badge>
          <Button variant="outline" size="sm" onClick={handleExcel} className="gap-1.5">
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-20 text-muted-foreground">
          <Scale className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-base font-semibold">No cases listed today</p>
          <p className="text-sm mt-1">Click <strong>Run Daily Sync</strong> to check for today's listings.</p>
        </div>
      ) : (
        <div ref={printRef} className="space-y-6 print:space-y-4">
          {/* Report Header (print only) */}
          <div className="hidden print:block text-center border-b-2 pb-3 mb-4">
            <h1 className="text-xl font-bold">{user?.organization.organization_name}</h1>
            <p className="text-sm text-gray-600">Daily Cause List Report — {formatDate(today)}</p>
            <p className="text-xs text-gray-500 mt-1">{matches.length} cases listed across {groups.length} court hall{groups.length !== 1 ? 's' : ''}</p>
          </div>

          {groups.map(group => (
            <CourtHallSection key={`${group.courtName}||${group.courtNo}`} group={group} />
          ))}
        </div>
      )}

      <style>{`
        @media print {
          header, nav, aside, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

function CourtHallSection({ group }: { group: GroupedMatch }) {
  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden print:border-gray-300 print:shadow-none">
      {/* Court Header */}
      <div className="bg-slate-800 text-white px-4 py-3 print:bg-white print:text-black print:border-b-2 print:border-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <Scale className="w-4 h-4 flex-shrink-0 print:text-black" />
          <span className="font-bold text-sm sm:text-base">{group.courtName}</span>
          {group.bench && (
            <span className="text-slate-300 text-xs print:text-gray-500">— {group.bench} Bench</span>
          )}
        </div>
      </div>

      {/* Court Hall + Judge */}
      <div className="bg-blue-50 border-b px-4 py-2.5 print:bg-gray-50">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {group.courtNo && (
            <span className="flex items-center gap-1.5 font-semibold text-blue-900 print:text-black">
              <MapPin className="w-3.5 h-3.5" />
              {group.courtNo}
            </span>
          )}
          {group.judgeName && (
            <span className="flex items-center gap-1.5 text-slate-700 print:text-black">
              <User className="w-3.5 h-3.5" />
              {group.judgeName}
            </span>
          )}
          <span className="ml-auto">
            <Badge variant="outline" className="text-xs">
              {group.matches.length} case{group.matches.length !== 1 ? 's' : ''}
            </Badge>
          </span>
        </div>
      </div>

      {/* Cases Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <th className="px-3 py-2.5 text-center w-10">No.</th>
              <th className="px-3 py-2.5 text-left">Case Number</th>
              <th className="px-3 py-2.5 text-left">Petitioner</th>
              <th className="px-3 py-2.5 text-left">Respondent</th>
              <th className="px-3 py-2.5 text-left">Advocate</th>
              <th className="px-3 py-2.5 text-left">Client</th>
              <th className="px-3 py-2.5 text-center">Match</th>
              <th className="px-3 py-2.5 text-center">Conf.</th>
              <th className="px-3 py-2.5 text-center print:hidden">Notif.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {group.matches.map((m, idx) => (
              <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-3 py-2.5 text-center font-mono text-xs font-bold text-slate-500">
                  {m.cause_list?.item_number ?? idx + 1}
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-slate-800">{m.case?.case_number}</p>
                  {m.case?.cnr_number && (
                    <p className="text-xs text-muted-foreground font-mono">{m.case.cnr_number}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 max-w-[160px]">
                  <p className="truncate text-slate-700">{m.cause_list?.petitioner ?? m.case?.petitioner ?? '—'}</p>
                </td>
                <td className="px-3 py-2.5 max-w-[160px]">
                  <p className="truncate text-slate-700">{m.cause_list?.respondent ?? m.case?.respondent ?? '—'}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="whitespace-nowrap text-slate-700">{m.case?.advocate_name ?? '—'}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="whitespace-nowrap font-medium text-slate-800">{m.case?.client_name ?? '—'}</p>
                  {m.case?.client_mobile && (
                    <p className="text-xs text-muted-foreground">{m.case.client_mobile}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <MatchTypeBadge type={m.match_type} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`text-xs font-bold ${m.match_confidence >= 98 ? 'text-green-600' : m.match_confidence >= 80 ? 'text-amber-600' : 'text-red-500'}`}>
                    {m.match_confidence}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center print:hidden">
                  <NotifBadge />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unmatched hint */}
      {group.matches.some(m => m.match_confidence < 80) && (
        <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border-t text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5" />
          Some cases matched with lower confidence. Review manually.
        </div>
      )}
    </div>
  );
}
