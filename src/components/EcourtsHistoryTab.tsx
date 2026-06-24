import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, Search, Download, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * eCourts Case History tab — complete litigation history pulled from the
 * eCourts partner *case* API (by CNR), with 24h browser caching so the API is
 * not hit on every open. Only the explicit "Refresh eCourts Data" button
 * bypasses the cache. The API token stays server-side (proxied via
 * /api/case-details/history).
 */

// MHC judgment/order PDFs are served by the existing viewpdf flow.
const MHC_VIEWPDF = 'https://mhc.tn.gov.in/judis/index.php/casestatus/viewpdf/';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

type Dict = Record<string, unknown>;

function cacheKey(cnr: string) { return `ecourts_case_${cnr}`; }

function readCache(cnr: string): { data: Dict; cachedAt: string } | null {
  try {
    const raw = localStorage.getItem(cacheKey(cnr));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Dict; cachedAt: string };
    if (parsed?.data && parsed.cachedAt) {
      const age = Date.now() - new Date(parsed.cachedAt).getTime();
      if (age >= 0 && age < CACHE_TTL) return parsed;
    }
  } catch { /* ignore quota / parse errors */ }
  return null;
}

function writeCache(cnr: string, data: Dict) {
  try {
    localStorage.setItem(cacheKey(cnr), JSON.stringify({ data, cachedAt: new Date().toISOString() }));
  } catch { /* ignore quota / private-mode errors */ }
}

// ── Field access helpers (tolerate camelCase / snake_case / Title Case) ──────────
function pickFrom(objs: Dict[], keys: string[]): unknown {
  for (const o of objs) {
    if (!o) continue;
    for (const k of keys) {
      const v = o[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return undefined;
}
function s(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}
function arrOf(objs: Dict[], keys: string[]): Dict[] {
  const v = pickFrom(objs, keys);
  if (Array.isArray(v)) return v as Dict[];
  return [];
}
function strArr(objs: Dict[], keys: string[]): string[] {
  const v = pickFrom(objs, keys);
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).map(x => (x && typeof x === 'object' ? s((x as Dict).name ?? JSON.stringify(x)) : s(x))).filter(Boolean);
}

function fmtDate(value: unknown): string {
  const str = s(value);
  if (!str) return '\u2014';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(value: unknown): string {
  const str = s(value);
  if (!str) return '\u2014';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysBetween(a: unknown, b: unknown): number | null {
  const d1 = new Date(s(a)); const d2 = new Date(s(b));
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
}
function openOrder(orderUrl: string) {
  const f = s(orderUrl);
  if (!f) { toast.error('No order document available.'); return; }
  const url = /^https?:\/\//i.test(f) ? f : `${MHC_VIEWPDF}${f}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ── Small presentational helpers ─────────────────────────────────────────────────
function SumCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value || '\u2014'}</p>
    </div>
  );
}
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="px-3 py-3 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
function PartyBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{'\u2014'}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5">
          {items.map((it, i) => <li key={`${it}-${i}`} className="text-sm">{it}</li>)}
        </ul>
      )}
    </div>
  );
}

export function EcourtsHistoryTab({ caseId, fallbackCnr }: { caseId?: string | null; fallbackCnr?: string | null }) {
  const [cnr, setCnr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Dict | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [sub, setSub] = useState('summary');
  const [hearingSearch, setHearingSearch] = useState('');

  const resolveCnr = useCallback(async (): Promise<string> => {
    if (caseId) {
      try {
        const { data: row } = await supabase.from('cases').select('cnr_number').eq('id', caseId).maybeSingle();
        const dbc = s(row?.cnr_number);
        if (dbc) return dbc;
      } catch { /* fall through to prop */ }
    }
    return s(fallbackCnr);
  }, [caseId, fallbackCnr]);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    const c = await resolveCnr();
    setCnr(c);
    if (!c) { setData(null); setCachedAt(null); setLoading(false); return; }

    if (!force) {
      const cached = readCache(c);
      if (cached) { setData(cached.data); setCachedAt(cached.cachedAt); setLoading(false); return; }
    }
    try {
      const res = await fetch(`/api/case-details/history?cnr=${encodeURIComponent(c)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        if (json?.rateLimited) throw new Error('rate');
        throw new Error('fail');
      }
      if (!json.data) { setData(null); setCachedAt(null); setLoading(false); return; }
      setData(json.data as Dict);
      setCachedAt(new Date().toISOString());
      writeCache(c, json.data as Dict);
    } catch {
      setError('Unable to retrieve case history from eCourts.');
    } finally {
      setLoading(false);
    }
  }, [resolveCnr]);

  useEffect(() => { load(false); }, [load]);

  // ── Parse the response into view models (defensive across key casings) ──────────
  const vm = useMemo(() => {
    if (!data) return null;
    const root = data;
    const cc = (root.courtCaseData && typeof root.courtCaseData === 'object'
      ? root.courtCaseData as Dict : root);
    const containers = [cc, root];

    const summary: { label: string; value: string }[] = [
      { label: 'Case Status', value: s(pickFrom(containers, ['caseStatus', 'case_status', 'status'])) },
      { label: 'Case Type', value: s(pickFrom(containers, ['caseType', 'case_type', 'type'])) },
      { label: 'Court Name', value: s(pickFrom(containers, ['courtName', 'court_name', 'court'])) },
      { label: 'District', value: s(pickFrom(containers, ['district', 'districtName', 'district_name'])) },
      { label: 'Filing Date', value: fmtDate(pickFrom(containers, ['filingDate', 'filing_date'])) },
      { label: 'Registration Date', value: fmtDate(pickFrom(containers, ['registrationDate', 'registration_date'])) },
      { label: 'First Hearing Date', value: fmtDate(pickFrom(containers, ['firstHearingDate', 'first_hearing_date'])) },
      { label: 'Last Hearing Date', value: fmtDate(pickFrom(containers, ['lastHearingDate', 'last_hearing_date'])) },
      { label: 'Next Hearing Date', value: fmtDate(pickFrom(containers, ['nextHearingDate', 'next_hearing_date'])) },
      { label: 'Decision Date', value: fmtDate(pickFrom(containers, ['decisionDate', 'decision_date'])) },
      { label: 'Purpose', value: s(pickFrom(containers, ['purpose', 'caseStage', 'stage', 'nextPurpose'])) },
      { label: 'Disposal Type', value: s(pickFrom(containers, ['disposalType', 'natureOfDisposal', 'nature_of_disposal', 'disposal_type'])) },
      { label: 'Contested Status', value: s(pickFrom(containers, ['contestedStatus', 'contested_status', 'contested'])) },
      { label: 'Case Duration', value: s(pickFrom(containers, ['caseDuration', 'case_duration', 'duration'])) },
      { label: 'Total Hearings', value: s(pickFrom(containers, ['totalHearings', 'hearingCount', 'total_hearings'])) },
      { label: 'Orders', value: s(pickFrom(containers, ['orders', 'orderCount', 'order_count'])) },
      { label: 'Judgments', value: s(pickFrom(containers, ['judgments', 'judgmentCount', 'judgment_count'])) },
      { label: 'Interim Orders', value: s(pickFrom(containers, ['interimOrders', 'interimOrderCount', 'interim_order_count'])) },
    ];

    const petitioners = strArr(containers, ['petitioners', 'petitionerNames']);
    const petitionerAdvocates = strArr(containers, ['petitionerAdvocates', 'petitioner_advocates']);
    const respondents = strArr(containers, ['respondents', 'respondentNames']);
    const respondentAdvocates = strArr(containers, ['respondentAdvocates', 'respondent_advocates']);

    const hearingsRaw = arrOf(containers, ['historyOfCaseHearings', 'hearingHistory', 'caseHistory', 'hearings']);
    const hearings = hearingsRaw.map(h => ({
      hearingDate: s(pickFrom([h], ['hearingDate', 'hearing_date', 'businessDate', 'date'])),
      businessDate: s(pickFrom([h], ['businessDate', 'business_date', 'causeListDate'])),
      purpose: s(pickFrom([h], ['purpose', 'hearingPurpose', 'nextPurpose'])),
      judge: s(pickFrom([h], ['judge', 'judgeName', 'coram', 'judge_name'])),
    })).sort((a, b) => new Date(b.hearingDate).getTime() - new Date(a.hearingDate).getTime());

    const timelineRaw = arrOf(containers, ['businessOnDateEntries', 'businessOnDate', 'dailyBusiness', 'businessEntries']);
    const timeline = timelineRaw.map(b => ({
      date: s(pickFrom([b], ['date', 'businessDate', 'business_date'])),
      businessNotes: s(pickFrom([b], ['businessNotes', 'business', 'businessOnDate', 'notes', 'observation'])),
      nextPurpose: s(pickFrom([b], ['nextPurpose', 'next_purpose', 'purpose'])),
      nextHearingDate: s(pickFrom([b], ['nextHearingDate', 'next_hearing_date'])),
      courtOf: s(pickFrom([b], ['courtOf', 'court_of', 'court', 'judge'])),
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const mapOrder = (o: Dict, type: string) => ({
      date: s(pickFrom([o], ['date', 'orderDate', 'order_date', 'judgmentDate'])),
      type: s(pickFrom([o], ['type', 'orderType', 'order_type'])) || type,
      description: s(pickFrom([o], ['description', 'orderDetails', 'title', 'particulars', 'order'])),
      orderUrl: s(pickFrom([o], ['orderUrl', 'order_url', 'url', 'pdf', 'fileName', 'file'])),
    });
    const interimOrders = arrOf(containers, ['interimOrders', 'interim_orders']);
    const judgmentOrders = arrOf(containers, ['judgmentOrders', 'judgment_orders', 'judgments']);
    const orders = [
      ...interimOrders.map(o => mapOrder(o, 'Interim Order')),
      ...judgmentOrders.map(o => mapOrder(o, 'Judgment')),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const linkCases = strArr(containers, ['linkCases', 'link_cases', 'linkedCases']);
    const taggedMatters = strArr(containers, ['taggedMatters', 'tagged_matters']);
    const caveats = arrOf(containers, ['caveatDetails', 'caveats', 'caveat_details']);
    const notices = arrOf(containers, ['notices', 'noticeDetails']);
    const ias = arrOf(containers, ['interlocutoryApplications', 'iaDetails', 'interlocutory_applications', 'ias']);

    const totalHearings = Number(pickFrom(containers, ['totalHearings', 'hearingCount'])) || hearings.length;
    const totalInterim = Number(pickFrom(containers, ['interimOrderCount'])) || interimOrders.length;
    const totalJudgments = Number(pickFrom(containers, ['judgmentCount'])) || judgmentOrders.length;
    const totalOrders = Number(pickFrom(containers, ['orderCount'])) || (interimOrders.length + judgmentOrders.length);
    const durationDays = daysBetween(
      pickFrom(containers, ['filingDate', 'filing_date', 'registrationDate']),
      pickFrom(containers, ['decisionDate', 'decision_date']) ?? new Date().toISOString(),
    );
    const daysToFirst = daysBetween(
      pickFrom(containers, ['filingDate', 'filing_date', 'registrationDate']),
      pickFrom(containers, ['firstHearingDate', 'first_hearing_date']),
    );

    return {
      summary, petitioners, petitionerAdvocates, respondents, respondentAdvocates,
      hearings, timeline, orders, linkCases, taggedMatters, caveats, notices, ias,
      stats: {
        totalHearings, totalOrders, totalJudgments, totalInterim,
        durationDays: durationDays ?? 0, daysToFirst: daysToFirst ?? 0,
      },
    };
  }, [data]);

  const filteredHearings = useMemo(() => {
    if (!vm) return [];
    const q = hearingSearch.trim().toLowerCase();
    if (!q) return vm.hearings;
    return vm.hearings.filter(h =>
      [h.hearingDate, h.businessDate, h.purpose, h.judge].some(v => v.toLowerCase().includes(q)));
  }, [vm, hearingSearch]);

  function exportHearings() {
    if (!vm || vm.hearings.length === 0) { toast.error('No hearing history to export.'); return; }
    const rows = vm.hearings.map(h => ({
      'Hearing Date': h.hearingDate || '', 'Business Date': h.businessDate || '',
      'Purpose': h.purpose || '', 'Judge': h.judge || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hearings');
    XLSX.writeFile(wb, `hearing_history_${cnr || 'case'}.xlsx`);
  }

  // ── Render states ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Fetching eCourts Case History...
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Unable to retrieve case history from eCourts.
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => load(true)}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh eCourts Data
        </Button>
      </div>
    );
  }
  if (!vm) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">No eCourts history available.</p>
        {cnr && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => load(true)}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh eCourts Data
          </Button>
        )}
      </div>
    );
  }

  const lastSynced = cachedAt ? fmtDateTime(cachedAt) : '\u2014';

  return (
    <div className="space-y-4">
      {/* Header: last synced + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Last Synced:</span> {lastSynced}
          {cnr && <span className="ml-2 font-mono text-[11px]">CNR: {cnr}</span>}
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => load(true)}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh eCourts Data
        </Button>
      </div>

      <Tabs value={sub} onValueChange={setSub}>
        <div className="overflow-x-auto">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="parties">Parties</TabsTrigger>
            <TabsTrigger value="hearings">Hearing History</TabsTrigger>
            <TabsTrigger value="timeline">Case Timeline</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
            <TabsTrigger value="related">Related Cases</TabsTrigger>
            <TabsTrigger value="caveats">Caveats</TabsTrigger>
            <TabsTrigger value="notices">Notices</TabsTrigger>
            <TabsTrigger value="ia">IA</TabsTrigger>
          </TabsList>
        </div>

        {/* Summary */}
        <TabsContent value="summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {vm.summary.map(c => <SumCard key={c.label} label={c.label} value={c.value} />)}
          </div>
        </TabsContent>

        {/* Parties */}
        <TabsContent value="parties">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <PartyBlock title="Petitioners" items={vm.petitioners} />
            <PartyBlock title="Petitioner Advocates" items={vm.petitionerAdvocates} />
            <PartyBlock title="Respondents" items={vm.respondents} />
            <PartyBlock title="Respondent Advocates" items={vm.respondentAdvocates} />
          </div>
        </TabsContent>

        {/* Hearing History */}
        <TabsContent value="hearings">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search hearings (date, purpose, judge)…"
                value={hearingSearch} onChange={e => setHearingSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" className="gap-1" onClick={exportHearings}>
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>
          {filteredHearings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No hearing history.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Hearing Date</th>
                    <th className="px-3 py-2 font-medium">Business Date</th>
                    <th className="px-3 py-2 font-medium">Purpose</th>
                    <th className="px-3 py-2 font-medium">Judge</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHearings.map((h, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(h.hearingDate)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(h.businessDate)}</td>
                      <td className="px-3 py-2">{h.purpose || '\u2014'}</td>
                      <td className="px-3 py-2">{h.judge || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Case Timeline (full court observations — not truncated) */}
        <TabsContent value="timeline">
          {vm.timeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No business timeline available.</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-5">
              {vm.timeline.map((b, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[1.45rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <p className="text-sm font-semibold">{fmtDate(b.date)}</p>
                  {b.businessNotes && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{b.businessNotes}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {b.nextPurpose && <span>Next Purpose: <span className="text-foreground">{b.nextPurpose}</span></span>}
                    {b.nextHearingDate && <span>Next Hearing: <span className="text-foreground">{fmtDate(b.nextHearingDate)}</span></span>}
                    {b.courtOf && <span>Court Of: <span className="text-foreground">{b.courtOf}</span></span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders">
          {vm.orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No orders or judgments available.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.orders.map((o, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(o.date)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${o.type === 'Judgment' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          <FileText className="h-3 w-3" />{o.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">{o.description || '\u2014'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                          disabled={!o.orderUrl} onClick={() => openOrder(o.orderUrl)}>
                          <ExternalLink className="h-3 w-3" /> View Order
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Statistics */}
        <TabsContent value="stats">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total Hearings" value={vm.stats.totalHearings} />
            <StatCard label="Total Orders" value={vm.stats.totalOrders} />
            <StatCard label="Total Judgments" value={vm.stats.totalJudgments} />
            <StatCard label="Total Interim Orders" value={vm.stats.totalInterim} />
            <StatCard label="Case Duration (Days)" value={vm.stats.durationDays} />
            <StatCard label="Days to First Hearing" value={vm.stats.daysToFirst} />
          </div>
        </TabsContent>

        {/* Related Cases */}
        <TabsContent value="related">
          {vm.linkCases.length === 0 && vm.taggedMatters.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No related cases available</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <PartyBlock title="Linked Cases" items={vm.linkCases} />
              <PartyBlock title="Tagged Matters" items={vm.taggedMatters} />
            </div>
          )}
        </TabsContent>

        {/* Caveats */}
        <TabsContent value="caveats">
          <RawList items={vm.caveats} empty="No caveats available." />
        </TabsContent>

        {/* Notices */}
        <TabsContent value="notices">
          <RawList items={vm.notices} empty="No notices available." />
        </TabsContent>

        {/* Interlocutory Applications */}
        <TabsContent value="ia">
          <RawList items={vm.ias} empty="No interlocutory applications available." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Generic renderer for arrays of records (caveats / notices / IAs) whose exact
// shape varies — shows every key/value so nothing useful is hidden.
function RawList({ items, empty }: { items: Dict[]; empty: string }) {
  if (!items || items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const entries = Object.entries(it).filter(([, v]) => v !== null && v !== undefined && v !== '');
        return (
          <div key={i} className="rounded-md border px-3 py-2">
            {typeof it !== 'object' ? (
              <p className="text-sm">{String(it)}</p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {entries.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <dt className="text-xs capitalize text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}:</dt>
                    <dd className="font-medium">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
