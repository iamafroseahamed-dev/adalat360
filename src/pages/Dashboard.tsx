import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
  AreaChart, Area,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Briefcase, Clock, CheckCircle2, CalendarDays, CalendarClock, Gavel,
  ChevronLeft, ChevronRight, ListTodo, AlertTriangle, Link2,
} from 'lucide-react';
import {
  fetchDashboardKpis, fetchCasesByCourt, fetchCaseStatusBreakdown,
  fetchCasesByDistrict, fetchCasesBySection, fetchDisposalOutcomes,
  fetchHearingsByDate, fetchRecentListings, fetchMostConnectedCases,
  type CategoryCount,
} from '@/lib/dashboardQueries';
import { taskPriorityClasses, taskStatusClasses } from '@/lib/caseManagement';
import type { Case } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#db2777', '#0d9488', '#4f46e5', '#ca8a04'];
const STATUS_COLORS: Record<string, string> = {
  Pending: '#d97706',
  Disposed: '#16a34a',
  Active: '#2563eb',
  Unknown: '#94a3b8',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, accent, loading, onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  loading: boolean;
  onClick?: () => void;
}) {
  const body = (
    <Card className={onClick ? 'h-full transition-colors hover:bg-muted/40' : 'h-full'}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        {loading
          ? <Skeleton className="mt-2 h-8 w-16" />
          : <p className={`mt-1 text-3xl font-bold ${accent}`}>{value.toLocaleString('en-IN')}</p>}
      </CardContent>
    </Card>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left" aria-label={label}>
        {body}
      </button>
    );
  }
  return body;
}

// ── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({
  title, loading, empty, height = 300, children,
}: {
  title: string;
  loading: boolean;
  empty: boolean;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton style={{ height }} className="w-full" />
        ) : empty ? (
          <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
            No data available.
          </div>
        ) : (
          <div style={{ width: '100%', height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Hearing calendar widget ──────────────────────────────────────────────────

function HearingCalendar({ counts }: { counts: Map<string, number> }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const todayIso = isoLocal(new Date());

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) out.push(isoLocal(new Date(year, month, day)));
    return out;
  }, [cursor]);

  const { data: dayHearings, isFetching } = useQuery({
    queryKey: ['hearings-on-date', selected],
    queryFn: async (): Promise<Case[]> => {
      if (!selected) return [];
      const { data, error } = await supabase
        .from('cases')
        .select('id,case_number,court_name,district,next_hearing_date,case_status,petitioner,respondent')
        .eq('next_hearing_date', selected)
        .order('case_number', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Case[];
    },
    enabled: !!selected,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Hearing Calendar</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[120px] text-center text-sm font-medium">{monthLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <div key={`empty-${i}`} />;
            const count = counts.get(iso) ?? 0;
            const isToday = iso === todayIso;
            const isSelected = iso === selected;
            const day = Number(iso.slice(8, 10));
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso === selected ? null : iso)}
                className={[
                  'relative flex h-12 flex-col items-center justify-center rounded-md border text-xs transition-colors',
                  isSelected ? 'border-primary bg-primary/10' : 'border-transparent',
                  count > 0 ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-muted',
                  isToday ? 'font-bold text-primary' : '',
                ].join(' ')}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-sm font-medium">Hearings on {fmtDate(selected)}</p>
            {isFetching ? (
              <Skeleton className="h-16 w-full" />
            ) : !dayHearings || dayHearings.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hearings scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {dayHearings.map(h => (
                  <li key={h.id} className="rounded-md border px-3 py-2 text-xs">
                    <p className="font-mono font-medium">{h.case_number}</p>
                    <p className="text-muted-foreground">
                      {[h.court_name, h.district, h.case_status].filter(Boolean).join(' · ') || '\u2014'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();

  const kpis        = useQuery({ queryKey: ['dashboard-kpis'], queryFn: fetchDashboardKpis });
  const byCourt     = useQuery({ queryKey: ['cases-by-court'], queryFn: fetchCasesByCourt });
  const statusMix   = useQuery({ queryKey: ['case-status-breakdown'], queryFn: fetchCaseStatusBreakdown });
  const byDistrict  = useQuery({ queryKey: ['cases-by-district'], queryFn: fetchCasesByDistrict });
  const bySection   = useQuery({ queryKey: ['cases-by-section'], queryFn: fetchCasesBySection });
  const disposal    = useQuery({ queryKey: ['disposal-outcomes'], queryFn: fetchDisposalOutcomes });
  const hearings    = useQuery({ queryKey: ['hearings-by-date'], queryFn: fetchHearingsByDate });
  const listings    = useQuery({ queryKey: ['recent-listings'], queryFn: fetchRecentListings });
  const mostConnected = useQuery({ queryKey: ['most-connected-cases'], queryFn: fetchMostConnectedCases });

  // ── Task tracker widgets ──────────────────────────────────────────────────
  const todayIso = isoLocal(new Date());
  const tasksOpen = useQuery({
    queryKey: ['tasks-open-count'],
    queryFn: async () => {
      const { count } = await supabase.from('case_tasks').select('*', { count: 'exact', head: true }).neq('task_status', 'Completed');
      return count ?? 0;
    },
  });
  const tasksDueToday = useQuery({
    queryKey: ['tasks-due-today', todayIso],
    queryFn: async () => {
      const { count } = await supabase.from('case_tasks').select('*', { count: 'exact', head: true }).eq('due_date', todayIso);
      return count ?? 0;
    },
  });
  const tasksOverdue = useQuery({
    queryKey: ['tasks-overdue', todayIso],
    queryFn: async () => {
      const { count } = await supabase.from('case_tasks').select('*', { count: 'exact', head: true }).lt('due_date', todayIso).neq('task_status', 'Completed');
      return count ?? 0;
    },
  });
  const openTaskList = useQuery({
    queryKey: ['tasks-open-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('case_tasks')
        .select('id, task_title, assigned_to_name, due_date, priority, task_status')
        .neq('task_status', 'Completed')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10);
      return (data ?? []) as Array<{ id: string; task_title: string; assigned_to_name: string | null; due_date: string | null; priority: string | null; task_status: string | null }>;
    },
  });

  const k = kpis.data;

  const hearingCounts = useMemo(() => {
    const m = new Map<string, number>();
    (hearings.data ?? []).forEach(h => m.set(h.hearing_date.slice(0, 10), Number(h.value)));
    return m;
  }, [hearings.data]);

  const hearingTrend = useMemo(() => {
    return (hearings.data ?? [])
      .slice(0, 30)
      .map(h => ({ date: fmtDate(h.hearing_date), value: Number(h.value) }));
  }, [hearings.data]);

  const num = (rows: CategoryCount[] | undefined) =>
    (rows ?? []).map(r => ({ ...r, value: Number(r.value) }));

  const courtData    = num(byCourt.data);
  const statusData   = num(statusMix.data);
  const districtData = num(byDistrict.data);
  const sectionData  = num(bySection.data);
  const disposalData = num(disposal.data);

  const anyError = kpis.error || byCourt.error || statusMix.error || byDistrict.error
    || bySection.error || disposal.error || hearings.error || listings.error;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome to Adalat360</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Monitor litigation, hearings, listings, advocates and compliance activities from a single platform.
        </p>
      </div>

      {anyError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(anyError as Error).message}
        </p>
      )}

      {/* Row 1 — KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Cases"          value={k?.total_cases ?? 0}            icon={Briefcase}     accent="text-slate-700" loading={kpis.isLoading} onClick={() => navigate('/cases')} />
        <KpiCard label="Pending Cases"        value={k?.pending_cases ?? 0}          icon={Clock}         accent="text-amber-600" loading={kpis.isLoading} />
        <KpiCard label="Disposed Cases"       value={k?.disposed_cases ?? 0}         icon={CheckCircle2}  accent="text-emerald-600" loading={kpis.isLoading} />
        <KpiCard label="Cases Listed Today"   value={k?.cases_listed_today ?? 0}     icon={CalendarDays}  accent="text-blue-600" loading={kpis.isLoading} onClick={() => navigate('/todays-listings')} />
        <KpiCard label="Hearings (7 Days)"    value={k?.hearings_within_7_days ?? 0} icon={CalendarClock} accent="text-orange-600" loading={kpis.isLoading} onClick={() => navigate('/upcoming-hearings')} />
        <KpiCard label="Hearings Today"       value={k?.hearings_today ?? 0}         icon={Gavel}         accent="text-red-600" loading={kpis.isLoading} onClick={() => navigate('/upcoming-hearings')} />
      </div>

      {/* Task Tracker — My Open / Due Today / Overdue */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="My Open Tasks"   value={tasksOpen.data ?? 0}     icon={ListTodo}      accent="text-slate-700" loading={tasksOpen.isLoading} />
        <KpiCard label="Tasks Due Today" value={tasksDueToday.data ?? 0} icon={CalendarClock} accent="text-blue-600"   loading={tasksDueToday.isLoading} />
        <KpiCard label="Overdue Tasks"   value={tasksOverdue.data ?? 0}  icon={AlertTriangle} accent="text-red-600"    loading={tasksOverdue.isLoading} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Open Tasks</CardTitle></CardHeader>
        <CardContent className="p-0">
          {openTaskList.isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div>
          ) : (openTaskList.data ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No open tasks.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Task</th>
                    <th className="px-3 py-2 font-medium">Assignee</th>
                    <th className="px-3 py-2 font-medium">Due Date</th>
                    <th className="px-3 py-2 font-medium">Priority</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(openTaskList.data ?? []).map(t => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{t.task_title}</td>
                      <td className="px-3 py-2">{t.assigned_to_name ?? '\u2014'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(t.due_date)}</td>
                      <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${taskPriorityClasses(t.priority)}`}>{t.priority}</span></td>
                      <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${taskStatusClasses(t.task_status)}`}>{t.task_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Most Connected Cases — top 10 by connection count */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Most Connected Cases</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mostConnected.isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>
          ) : (mostConnected.data ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No connected cases yet.</p>
          ) : (
            <ul className="divide-y">
              {(mostConnected.data ?? []).map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{i + 1}</span>
                    <span className="truncate font-mono text-xs">{c.label}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                    <Link2 className="h-3 w-3" />{c.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Row 2 — Cases by court + status donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Cases by Court" loading={byCourt.isLoading} empty={courtData.length === 0}>
            <ResponsiveContainer>
              <BarChart data={courtData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {courtData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard title="Case Status Breakdown" loading={statusMix.isLoading} empty={statusData.length === 0}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="label" cx="50%" cy="50%"
                innerRadius={55} outerRadius={90} paddingAngle={2}>
                {statusData.map((d, i) => (
                  <Cell key={i} fill={STATUS_COLORS[d.label] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={24} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3 — District + Section horizontal bars */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Cases by District (Top 10)" loading={byDistrict.isLoading} empty={districtData.length === 0}>
          <ResponsiveContainer>
            <BarChart data={districtData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Cases by Section (Top 10)" loading={bySection.isLoading} empty={sectionData.length === 0}>
          <ResponsiveContainer>
            <BarChart data={sectionData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#7c3aed" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 4 — Disposal outcomes + hearing trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Disposal Outcomes" loading={disposal.isLoading} empty={disposalData.length === 0}>
          <ResponsiveContainer>
            <BarChart data={disposalData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Upcoming Hearings Trend" loading={hearings.isLoading} empty={hearingTrend.length === 0}>
          <ResponsiveContainer>
            <AreaChart data={hearingTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="hearingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" height={50} angle={-20} textAnchor="end" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="#d97706" fill="url(#hearingFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 5 — Calendar + recent listings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <HearingCalendar counts={hearingCounts} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Listings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {listings.isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : (listings.data ?? []).length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">No recent listings.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Case Number</th>
                      <th className="px-3 py-2 font-medium">Court Hall</th>
                      <th className="px-3 py-2 font-medium">Judge</th>
                      <th className="px-3 py-2 font-medium">Stage</th>
                      <th className="px-3 py-2 font-medium">Listed Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(listings.data ?? []).map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.case_number ?? '\u2014'}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.court_hall ?? '\u2014'}</td>
                        <td className="max-w-[160px] truncate px-3 py-2" title={r.judge_name ?? undefined}>{r.judge_name ?? '\u2014'}</td>
                        <td className="max-w-[140px] truncate px-3 py-2" title={r.stage ?? undefined}>{r.stage ?? '\u2014'}</td>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.listed_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
