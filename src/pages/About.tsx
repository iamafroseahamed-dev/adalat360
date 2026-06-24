import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchExecutiveAnalytics } from '@/lib/dashboardQueries';
import {
  Scale, ShieldCheck, Landmark, Mail, User,
  Briefcase, CalendarClock, Network, Users, ListTodo, BarChart3,
  Database, Download, GitCompareArrows, Bell, Gavel,
  MessageSquare, MapPin, Link2, CheckCircle2, Clock,
} from 'lucide-react';
import {
  APP_NAME, APP_VERSION, DEVELOPER_NAME, DEVELOPER_EMAIL,
} from '@/lib/appInfo';

// ── Static content ───────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Briefcase,
    title: 'Case Management',
    desc: 'Centralised registry of every government case — parties, status, sensitivity, CLA tagging and full hearing history in one place.',
    accent: 'text-blue-600',
    bg: 'bg-blue-50',
    ring: 'ring-blue-100',
  },
  {
    icon: CalendarClock,
    title: 'Cause List Monitoring',
    desc: 'Automated daily ingestion of the Madras High Court cause list with instant matching against your tracked portfolio.',
    accent: 'text-amber-600',
    bg: 'bg-amber-50',
    ring: 'ring-amber-100',
  },
  {
    icon: Network,
    title: 'eCourts Integration',
    desc: 'Live case status, orders and hearing history pulled directly from the national eCourts and MHC judicial services.',
    accent: 'text-emerald-600',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-100',
  },
  {
    icon: Users,
    title: 'Advocate Management',
    desc: 'Assign advocates, track readiness, counters, documents awaited and compliance across the entire litigation team.',
    accent: 'text-indigo-600',
    bg: 'bg-indigo-50',
    ring: 'ring-indigo-100',
  },
  {
    icon: ListTodo,
    title: 'Task Management',
    desc: 'Create, assign and monitor case tasks with due dates, ownership and overdue escalation for accountability.',
    accent: 'text-rose-600',
    bg: 'bg-rose-50',
    ring: 'ring-rose-100',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    desc: 'Executive command centre with district heat-maps, advocate performance and disposal trends for data-driven decisions.',
    accent: 'text-violet-600',
    bg: 'bg-violet-50',
    ring: 'ring-violet-100',
  },
];

const WORKFLOW = [
  { icon: Download,         title: 'Ingest',  desc: 'Daily cause list pulled from the High Court automatically.' },
  { icon: GitCompareArrows, title: 'Match',   desc: 'Listings matched to your tracked cases by CNR & case number.' },
  { icon: Bell,             title: 'Notify',  desc: 'Advocates and officers alerted to relevant hearings.' },
  { icon: Gavel,            title: 'Hearing', desc: 'Teams prepare with orders, history and task checklists.' },
  { icon: BarChart3,        title: 'Analyse', desc: 'Outcomes feed dashboards for compliance and oversight.' },
];

const INTEGRATIONS = [
  { icon: Scale,         name: 'eCourts Services',  detail: 'National judicial data exchange' },
  { icon: Landmark,      name: 'Madras High Court', detail: 'Cause list & order PDFs' },
  { icon: Database,      name: 'Supabase',          detail: 'Secure managed Postgres backend' },
  { icon: Mail,          name: 'Email Alerts',      detail: 'Transactional case notifications' },
  { icon: MessageSquare, name: 'SMS / WhatsApp',    detail: 'Multi-channel hearing reminders' },
  { icon: ShieldCheck,   name: 'Role-based Access', detail: 'Organisation-scoped permissions' },
];

// ── Small presentational helpers ──────────────────────────────────────────────

function StatTile({
  icon: Icon, label, value, accent, loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardContent className="p-5 text-center">
        <Icon className={`mx-auto h-5 w-5 ${accent}`} />
        {loading
          ? <Skeleton className="mx-auto mt-3 h-8 w-16 bg-white/20" />
          : <p className="mt-2 text-3xl font-bold tracking-tight text-white">{value.toLocaleString('en-IN')}</p>}
        <p className="mt-1 text-xs font-medium text-blue-200/80">{label}</p>
      </CardContent>
    </Card>
  );
}

function AnalyticsBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{value.toLocaleString('en-IN')}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── About page ─────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const exec = useQuery({ queryKey: ['executive-analytics'], queryFn: fetchExecutiveAnalytics });
  const a = exec.data;
  const kp = a?.kpis;
  const loading = exec.isLoading;

  const stats = {
    totalCases:  kp?.totalCases ?? 0,
    listedToday: kp?.casesListedToday ?? 0,
    upcoming:    kp?.upcomingHearings30 ?? 0,
    advocates:   a?.advocates.length ?? 0,
    districts:   a?.districts.length ?? 0,
    connected:   a?.connectedTotal ?? 0,
    pending:     kp?.pendingCases ?? 0,
    disposed:    kp?.disposedCases ?? 0,
    openTasks:   kp?.openTasks ?? 0,
  };

  const analyticsMax = Math.max(stats.pending, stats.disposed, stats.upcoming, stats.openTasks, 1);

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-8">

      {/* ═══ 1. Product Hero ═══════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 shadow-xl ring-1 ring-white/10">
        <div className="px-6 py-10 sm:px-10 sm:py-14">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-900/40">
              <Scale className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{APP_NAME}</h1>
                <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-200 ring-1 ring-blue-400/30">
                  {APP_VERSION}
                </span>
              </div>
              <p className="mt-1 text-base font-medium text-blue-100 sm:text-lg">
                Government Litigation Management &amp; Monitoring Platform
              </p>
            </div>
          </div>

          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-blue-100/90 sm:text-base">
            {APP_NAME} is a unified litigation command centre for government departments — tracking court
            cases, daily cause-list listings, hearings, advocate activity and compliance across Tamil Nadu
            in a single, training-free dashboard built to government-grade security and reliability standards.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { icon: ShieldCheck, label: 'Secure & Compliant' },
              { icon: Landmark,    label: 'Built for Government' },
              { icon: Network,     label: 'eCourts Connected' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/15">
                <Icon className="h-3.5 w-3.5 text-blue-200" /> {label}
              </span>
            ))}
          </div>

          {/* Platform statistics embedded in hero */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile icon={Briefcase}     label="Total Cases"     value={stats.totalCases}  accent="text-blue-300"    loading={loading} />
            <StatTile icon={CalendarClock} label="Listed Today"    value={stats.listedToday} accent="text-amber-300"   loading={loading} />
            <StatTile icon={Clock}         label="Upcoming (30d)"  value={stats.upcoming}    accent="text-emerald-300" loading={loading} />
            <StatTile icon={Users}         label="Advocates"       value={stats.advocates}   accent="text-indigo-300"  loading={loading} />
            <StatTile icon={MapPin}        label="Districts"       value={stats.districts}   accent="text-rose-300"    loading={loading} />
            <StatTile icon={Link2}         label="Connected Cases" value={stats.connected}   accent="text-violet-300"  loading={loading} />
          </div>
        </div>
      </section>

      {/* ═══ 2. Feature Cards ══════════════════════════════════════════════════ */}
      <section>
        <header className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Platform Capabilities</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Everything a litigation department needs, from intake to insight.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, accent, bg, ring }) => (
            <Card key={title} className="group h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-5">
                <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl ${bg} ring-1 ${ring}`}>
                  <Icon className={`h-5 w-5 ${accent}`} />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ═══ 3. Workflow Diagram ═══════════════════════════════════════════════ */}
      <section>
        <header className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">How It Works</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            An automated pipeline from court data to courtroom readiness.
          </p>
        </header>
        <Card>
          <CardContent className="p-6">
            <ol className="relative flex flex-col gap-8 lg:flex-row lg:gap-4">
              {/* connecting line */}
              <div className="absolute left-5 top-0 hidden h-full w-px bg-border lg:left-0 lg:top-5 lg:h-px lg:w-full" />
              {WORKFLOW.map(({ icon: Icon, title, desc }, i) => (
                <li key={title} className="relative flex flex-1 items-start gap-4 lg:flex-col lg:items-center lg:text-center">
                  <div className="z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-600/20 ring-4 ring-background">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="lg:mt-2">
                    <div className="flex items-center gap-2 lg:justify-center">
                      <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Step {i + 1}</span>
                    </div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground lg:max-w-[12rem]">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* ═══ 4. Analytics Preview ══════════════════════════════════════════════ */}
      <section>
        <header className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Live Analytics Preview</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A snapshot of current portfolio activity, updated in real time.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-4 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case &amp; Task Distribution</p>
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  <AnalyticsBar label="Pending Cases"     value={stats.pending}   max={analyticsMax} color="bg-amber-500" />
                  <AnalyticsBar label="Disposed Cases"    value={stats.disposed}  max={analyticsMax} color="bg-emerald-500" />
                  <AnalyticsBar label="Upcoming Hearings" value={stats.upcoming}  max={analyticsMax} color="bg-blue-500" />
                  <AnalyticsBar label="Open Tasks"        value={stats.openTasks} max={analyticsMax} color="bg-rose-500" />
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="flex h-full flex-col justify-center gap-4 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Disposal Rate</p>
                  {loading
                    ? <Skeleton className="mt-1 h-7 w-16" />
                    : <p className="text-2xl font-bold text-blue-700">
                        {stats.totalCases > 0 ? Math.round((stats.disposed / stats.totalCases) * 100) : 0}%
                      </p>}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Full interactive dashboards with district heat-maps, advocate leaderboards and disposal
                trends are available in the Analytics workspace.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ═══ 5. Integrations ═══════════════════════════════════════════════════ */}
      <section>
        <header className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Integrations &amp; Connectivity</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connected to the systems government legal teams rely on.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map(({ icon: Icon, name, detail }) => (
            <div key={name} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 6. Platform Statistics ════════════════════════════════════════════ */}
      <section>
        <header className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Platform at a Glance</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live figures drawn directly from your organisation&apos;s data.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: Briefcase,     label: 'Total Cases',  value: stats.totalCases,  accent: 'text-blue-600' },
            { icon: Clock,         label: 'Pending',      value: stats.pending,     accent: 'text-amber-600' },
            { icon: CheckCircle2,  label: 'Disposed',     value: stats.disposed,    accent: 'text-emerald-600' },
            { icon: CalendarClock, label: 'Listed Today', value: stats.listedToday, accent: 'text-indigo-600' },
            { icon: Users,         label: 'Advocates',    value: stats.advocates,   accent: 'text-rose-600' },
            { icon: ListTodo,      label: 'Open Tasks',   value: stats.openTasks,   accent: 'text-violet-600' },
          ].map(({ icon: Icon, label, value, accent }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <Icon className={`h-4 w-4 ${accent}`} />
                </div>
                {loading
                  ? <Skeleton className="mt-2 h-8 w-14" />
                  : <p className={`mt-1 text-2xl font-bold ${accent}`}>{value.toLocaleString('en-IN')}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ═══ 7. Version Information ════════════════════════════════════════════ */}
      <section>
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{APP_NAME} {APP_VERSION}</p>
                <p className="text-xs text-muted-foreground">Government Litigation Management Platform</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Version</dt>
                <dd className="font-medium">{APP_VERSION}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Edition</dt>
                <dd className="font-medium">Government</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Region</dt>
                <dd className="font-medium">Tamil Nadu</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {/* ═══ 8. Developer Information ══════════════════════════════════════════ */}
      <section>
        <div className="flex flex-col items-center gap-3 border-t pt-6 text-center sm:flex-row sm:justify-center sm:gap-6">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4 text-blue-600" />
            Developed by <span className="font-semibold text-foreground">{DEVELOPER_NAME}</span>
          </div>
          <a
            href={`mailto:${DEVELOPER_EMAIL}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            <Mail className="h-4 w-4" />
            {DEVELOPER_EMAIL}
          </a>
        </div>
      </section>
    </div>
  );
}
