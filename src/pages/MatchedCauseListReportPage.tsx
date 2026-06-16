import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchTodayMatches } from '@/services/causeLists';
import type { CauseListMatch } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileDown, Printer, Search, Scale, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatDate } from '@/lib/utils';

interface CourtHallGroup {
  courtName: string;
  bench: string;
  courtNo: string;
  judgeName: string;
  matches: CauseListMatch[];
  startSNo: number;
}

function buildGroups(matches: CauseListMatch[]): CourtHallGroup[] {
  const map = new Map<string, Omit<CourtHallGroup, 'startSNo'>>();
  for (const m of matches) {
    const cl = m.cause_list;
    if (!cl) continue;
    const key = `${cl.court_name}||${cl.bench ?? ''}||${cl.court_no ?? ''}||${cl.judge_name ?? ''}`;
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
  groups.forEach(g =>
    g.matches.sort((a, b) => (a.cause_list?.item_number ?? 0) - (b.cause_list?.item_number ?? 0))
  );
  groups.sort((a, b) =>
    a.courtName.localeCompare(b.courtName) ||
    a.bench.localeCompare(b.bench) ||
    a.courtNo.localeCompare(b.courtNo)
  );
  let sno = 1;
  return groups.map(g => {
    const startSNo = sno;
    sno += g.matches.length;
    return { ...g, startSNo };
  });
}

function getPrayer(m: CauseListMatch): string {
  if (m.prayer) return m.prayer;
  const raw = m.raw_case_detail_response as Record<string, unknown> | undefined;
  if (raw) {
    const keys = ['prayer', 'relief', 'casePrayer', 'petitionPrayer', 'orderPrayer', 'subject', 'caseSubject'];
    for (const k of keys) {
      if (typeof raw[k] === 'string' && raw[k]) return raw[k] as string;
    }
  }
  return 'Prayer details not available from API';
}

function getLastHearing(m: CauseListMatch): string {
  if (m.last_hearing) return m.last_hearing;
  if (m.posted_stage) return m.posted_stage;
  return m.cause_list?.status ?? '—';
}

function getCounsel(m: CauseListMatch): string {
  return m.case?.advocate_name || m.counsel_name || '—';
}

function exportToExcel(matches: CauseListMatch[], orgName: string, date: string) {
  let sno = 1;
  const rows = matches.map(m => ({
    'S.No': sno++,
    'Court Hall': m.cause_list?.court_no ?? '',
    'Item No': m.cause_list?.item_number ?? '',
    'Case No': m.case?.case_number ?? m.cause_list?.case_number ?? '',
    'CNR Number': m.case?.cnr_number ?? '',
    'Petitioner': m.cause_list?.petitioner ?? m.case?.petitioner ?? '',
    'Respondent': m.cause_list?.respondent ?? m.case?.respondent ?? '',
    'Name of the Judge(s)': m.cause_list?.judge_name ?? '',
    'Section': m.cause_list?.section ?? '—',
    'District': m.cause_list?.district ?? '—',
    'Prayer': getPrayer(m),
    'Last Hearing / Posted Stage': getLastHearing(m),
    'Counsel / Advocate': getCounsel(m),
    'Client Name': m.case?.client_name ?? '',
    'Client Mobile': m.case?.client_mobile ?? '',
    'Match Type': m.match_type,
    'Confidence': `${m.match_confidence}%`,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 8 }, { wch: 18 }, { wch: 16 },
    { wch: 26 }, { wch: 26 }, { wch: 24 }, { wch: 16 }, { wch: 14 },
    { wch: 36 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Cause List Report');
  XLSX.writeFile(wb, `${orgName.replace(/\s+/g, '_')}_CauseList_${date}.xlsx`);
}

export default function MatchedCauseListReportPage() {
  const { user, isDemo } = useAuth();
  const [matches, setMatches] = useState<CauseListMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setMatches(await fetchTodayMatches(user.organization.id, isDemo));
    } catch {
      toast.error('Failed to load matched cases');
    } finally {
      setLoading(false);
    }
  }, [user, isDemo]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? matches.filter(m => {
        const q = search.toLowerCase();
        return (
          (m.case?.case_number ?? '').toLowerCase().includes(q) ||
          (m.case?.cnr_number ?? '').toLowerCase().includes(q) ||
          (m.cause_list?.petitioner ?? '').toLowerCase().includes(q) ||
          (m.cause_list?.respondent ?? '').toLowerCase().includes(q) ||
          (m.cause_list?.court_no ?? '').toLowerCase().includes(q) ||
          (m.cause_list?.judge_name ?? '').toLowerCase().includes(q) ||
          (m.case?.client_name ?? '').toLowerCase().includes(q)
        );
      })
    : matches;

  const groups = buildGroups(filtered);
  const orgName = user?.organization.organization_name ?? 'Litigo';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search cases, parties, judges…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 text-sm">
            {filtered.length} matched case{filtered.length !== 1 ? 's' : ''}
          </Badge>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => {
              if (!filtered.length) { toast.error('No cases to export'); return; }
              exportToExcel(filtered, orgName, today);
              toast.success('Excel report downloaded');
            }}
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print / PDF</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 no-print">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="no-print flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-20 text-muted-foreground">
          <Scale className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-base font-semibold">No matched cases for today</p>
          <p className="text-sm mt-1">Run <strong>Daily Sync</strong> in the header to generate matches.</p>
        </div>
      ) : (
        <div id="cause-list-report" className="bg-white">
          {/* Document Header */}
          <div className="report-doc-header text-center mb-6 pb-4 border-b-2 border-gray-800">
            <div className="flex justify-center items-center gap-2 mb-1">
              <Scale className="w-5 h-5 text-gray-700" />
              <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                Litigo — Legal Case Monitoring System
              </span>
            </div>
            <h1 className="text-xl font-bold uppercase tracking-widest text-gray-900">
              {orgName}
            </h1>
            <h2 className="text-base font-semibold text-gray-700 mt-1 uppercase tracking-wide">
              Matched Cause List Report
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-6 mt-2.5 text-sm text-gray-600">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                Dated: <span className="text-gray-900">{formatDate(today)}</span>
              </span>
              <span className="text-gray-400">|</span>
              <span className="font-medium">
                Total Listed: <span className="text-gray-900">{filtered.length} case{filtered.length !== 1 ? 's' : ''}</span>
              </span>
              <span className="text-gray-400">|</span>
              <span className="font-medium">
                Court Halls: <span className="text-gray-900">{groups.length}</span>
              </span>
            </div>
          </div>

          {/* Court Hall Sections */}
          {groups.map(group => (
            <CourtHallSection
              key={`${group.courtName}||${group.courtNo}||${group.judgeName}`}
              group={group}
            />
          ))}

          {/* Footer */}
          <div className="mt-10 pt-4 border-t-2 border-gray-200 text-center text-xs text-gray-400 report-footer">
            <p className="font-medium">
              This is a computer-generated cause list match report produced by Litigo.
            </p>
            <p className="mt-0.5">
              Generated on {new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0.8cm; }
          body { background: white !important; font-family: 'Times New Roman', Times, serif !important; }
          .no-print, header, nav, aside, [class*="sidebar"], [class*="Sidebar"] { display: none !important; }
          main { padding: 0 !important; background: white !important; overflow: visible !important; }
          #cause-list-report { width: 100%; font-size: 8.5pt; }
          .report-doc-header { border-bottom: 2px solid black !important; margin-bottom: 12pt !important; }
          .report-doc-header h1 { font-size: 13pt; }
          .report-doc-header h2 { font-size: 10pt; }
          .court-section { margin-bottom: 14pt !important; page-break-inside: avoid; }
          .court-name-bar { background: white !important; color: black !important; border: 1.5pt solid black !important; }
          .court-sub-bar { background: #f0f0f0 !important; border: 1pt solid black !important; border-top: none !important; }
          .cause-list-table th { font-size: 7pt !important; padding: 2pt 3pt !important; background: #e0e0e0 !important; }
          .cause-list-table td { font-size: 7.5pt !important; padding: 2pt 3pt !important; border-color: #333 !important; }
          .cause-list-table tr:hover td { background: inherit !important; }
          .report-footer { border-top: 1pt solid #666 !important; }
        }
        .cause-list-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
          table-layout: fixed;
        }
        .cause-list-table th {
          background: #e4e8ee;
          border: 1px solid #777;
          padding: 6px 5px;
          font-weight: 700;
          text-align: center;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          line-height: 1.35;
          word-wrap: break-word;
        }
        .cause-list-table td {
          border: 1px solid #999;
          padding: 5px 6px;
          vertical-align: top;
          word-wrap: break-word;
          overflow-wrap: break-word;
          line-height: 1.45;
        }
        .cause-list-table tr:nth-child(even) td { background: #fafafa; }
        .cause-list-table tr:hover td { background: #edf2ff; }
        .parties-vs {
          text-align: center;
          font-style: italic;
          color: #888;
          font-size: 9px;
          line-height: 1.2;
          padding: 1px 0;
        }
        .prayer-unavailable { color: #aaa !important; font-style: italic; }
        @media print {
          .parties-vs { color: #555; font-size: 7pt; }
          .prayer-unavailable { color: #666 !important; }
        }
      `}</style>
    </div>
  );
}

function CourtHallSection({ group }: { group: CourtHallGroup }) {
  return (
    <div className="court-section mb-8">
      {/* Court Name Bar */}
      <div className="court-name-bar bg-slate-800 text-white px-4 py-2.5 rounded-t-md">
        <div className="flex flex-wrap items-center gap-2">
          <Scale className="w-4 h-4 flex-shrink-0 opacity-80" />
          <span className="font-bold text-sm uppercase tracking-wide">{group.courtName}</span>
          {group.bench && (
            <span className="text-slate-300 text-xs font-medium">— {group.bench} Bench</span>
          )}
        </div>
      </div>

      {/* Court Hall + Judge Sub-bar */}
      <div className="court-sub-bar bg-slate-50 border-x border-b border-slate-300 px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span className="font-bold text-slate-900">
            Court Hall: <span className="text-blue-700 font-semibold">{group.courtNo || '—'}</span>
          </span>
          <span className="text-slate-600">
            Before: <span className="font-semibold text-slate-800">{group.judgeName || '—'}</span>
          </span>
          <span className="ml-auto no-print">
            <Badge variant="outline" className="text-xs">
              {group.matches.length} case{group.matches.length !== 1 ? 's' : ''}
            </Badge>
          </span>
        </div>
      </div>

      {/* Report Table */}
      <div className="overflow-x-auto border border-t-0 border-slate-300 rounded-b-md">
        <table className="cause-list-table">
          <colgroup>
            <col style={{ width: '3%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Court Hall</th>
              <th>Item No</th>
              <th>Case No</th>
              <th>Name of the Parties</th>
              <th>Name of the Judge(s)</th>
              <th>Section</th>
              <th>District</th>
              <th>Prayer</th>
              <th>Last Hearing /<br />Posted Stage</th>
              <th>Counsel /<br />Advocate</th>
            </tr>
          </thead>
          <tbody>
            {group.matches.map((m, idx) => {
              const cl = m.cause_list;
              const petitioner = cl?.petitioner ?? m.case?.petitioner ?? '—';
              const respondent = cl?.respondent ?? m.case?.respondent ?? '—';
              const prayer = getPrayer(m);
              const isNoPrayer = prayer.includes('not available');
              const caseNo = m.case?.case_number ?? cl?.case_number ?? '—';

              return (
                <tr key={m.id}>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>
                    {group.startSNo + idx}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '10.5px' }}>
                    {cl?.court_no ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>
                    {cl?.item_number ?? '—'}
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                      {caseNo}
                    </div>
                    {m.case?.cnr_number && (
                      <div style={{ fontSize: '9px', color: '#888', fontFamily: 'monospace', marginTop: '2px' }}>
                        {m.case.cnr_number}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '11px' }}>{petitioner}</div>
                    <div className="parties-vs">— Vs —</div>
                    <div style={{ fontWeight: 600, fontSize: '11px' }}>{respondent}</div>
                    {m.case?.client_name && (
                      <div style={{ fontSize: '9px', color: '#888', marginTop: '3px' }}>
                        Client: {m.case.client_name}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '10.5px' }}>
                    {cl?.judge_name ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '10px', color: cl?.section ? undefined : '#bbb' }}>
                    {cl?.section ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '10px', color: cl?.district ? undefined : '#bbb' }}>
                    {cl?.district ?? '—'}
                  </td>
                  <td
                    className={isNoPrayer ? 'prayer-unavailable' : undefined}
                    style={{ fontSize: '10px' }}
                  >
                    {prayer}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '10px' }}>
                    {getLastHearing(m)}
                  </td>
                  <td style={{ fontSize: '10px' }}>
                    <div style={{ fontWeight: 500 }}>{getCounsel(m)}</div>
                    {m.case?.advocate_mobile && (
                      <div style={{ fontSize: '9px', color: '#999', marginTop: '2px' }}>
                        {m.case.advocate_mobile}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Row count hint (screen only) */}
      <p className="no-print text-right text-xs text-gray-400 mt-1 pr-1">
        {group.matches.length} case{group.matches.length !== 1 ? 's' : ''} — S.No {group.startSNo}–{group.startSNo + group.matches.length - 1}
      </p>
    </div>
  );
}
