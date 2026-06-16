import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchCases } from '@/services/cases';
import { fetchCauseList, fetchTodayMatches } from '@/services/causeLists';
import { fetchNotifications } from '@/services/notifications';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DashboardMetrics, CauseListMatch, Notification, UploadedFile } from '@/types';
import { isLiveMode } from '@/services/ecourtsService';
import {
  Briefcase, List, GitCompare, Bell, XCircle, Clock,
  TrendingUp, CheckCircle2, AlertCircle
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { formatDate, formatDateTime } from '@/lib/utils';


function MetricCard({
  title, value, icon: Icon, color, subtitle,
}: {
  title: string; value: number; icon: React.ElementType; color: string; subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`mt-1 text-2xl font-bold sm:text-3xl ${color}`}>{value.toLocaleString()}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-opacity-10 sm:h-12 sm:w-12 ${color.replace('text-', 'bg-').replace('-600', '-100').replace('-500', '-100')}`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NotifStatusBadge({ status }: { status: string }) {
  if (status === 'sent') return <Badge variant="success"><CheckCircle2 className="w-3 h-3 mr-1" />Sent</Badge>;
  if (status === 'failed') return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
  return <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

export default function DashboardPage() {
  const { user, isDemo } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalActiveCases: 0,
    totalCauseListToday: 0,
    matchedCasesToday: 0,
    unmatchedCasesToday: 0,
    alertsGeneratedToday: 0,
    failedAlerts: 0,
    pendingAlerts: 0,
    upcomingHearings: 0,
  });
  const [matches, setMatches] = useState<CauseListMatch[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [courtData, setCourtData] = useState<{ name: string; value: number }[]>([]);
  const [notifStatusData, setNotifStatusData] = useState<{ name: string; value: number }[]>([]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [cases, causeList, matchList, notifList] = await Promise.all([
        fetchCases(user.organization.id, isDemo),
        fetchCauseList(isDemo, { date: today }),
        fetchTodayMatches(user.organization.id, isDemo),
        fetchNotifications(user.organization.id, isDemo),
      ]);

      const uploadsData = isDemo ? null : await supabase
        .from('uploaded_files')
        .select('*')
        .eq('organization_id', user.organization.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const activeCases = cases.filter(c => c.active);
      const todayNotifs = notifList.filter(n => n.created_at.startsWith(today));

      setMetrics({
        totalActiveCases: activeCases.length,
        totalCauseListToday: causeList.length,
        matchedCasesToday: matchList.length,
        unmatchedCasesToday: Math.max(0, activeCases.length - matchList.length),
        alertsGeneratedToday: todayNotifs.filter(n => n.status === 'sent').length,
        failedAlerts: todayNotifs.filter(n => n.status === 'failed').length,
        pendingAlerts: todayNotifs.filter(n => n.status === 'pending').length,
        upcomingHearings: 0,
      });

      setMatches(matchList.slice(0, 8));
      setNotifications(todayNotifs.slice(0, 8));
      setUploads(isDemo ? [] : (uploadsData?.data ?? []));

      const courtMap: Record<string, number> = {};
      activeCases.forEach(c => {
        if (c.court_name) {
          const name = c.court_name.length > 20 ? c.court_name.slice(0, 18) + '…' : c.court_name;
          courtMap[name] = (courtMap[name] ?? 0) + 1;
        }
      });
      setCourtData(Object.entries(courtMap).map(([name, value]) => ({ name, value })));

      setNotifStatusData([
        { name: 'Sent', value: todayNotifs.filter(n => n.status === 'sent').length },
        { name: 'Failed', value: todayNotifs.filter(n => n.status === 'failed').length },
        { name: 'Pending', value: todayNotifs.filter(n => n.status === 'pending').length },
      ]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mode Banner */}
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs sm:px-4 sm:text-sm ${isLiveMode() ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>
          {isLiveMode()
            ? <><strong>Live Mode</strong> — Connected to eCourts India. Data is real-time.</>
            : <><strong>Demo Mode</strong> — Using seeded sample data. Click <strong>Run Daily Sync</strong> to populate today's listings.</>
          }
        </span>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard title="Active Cases" value={metrics.totalActiveCases} icon={Briefcase} color="text-blue-600" subtitle="Total registered" />
        <MetricCard title="Today's Cause List" value={metrics.totalCauseListToday} icon={List} color="text-indigo-600" subtitle="Court records" />
        <MetricCard title="Matched Today" value={metrics.matchedCasesToday} icon={GitCompare} color="text-emerald-600" subtitle="Cases found" />
        <MetricCard title="Alerts Sent" value={metrics.alertsGeneratedToday} icon={Bell} color="text-green-600" subtitle="Delivered" />
        <MetricCard title="Failed Alerts" value={metrics.failedAlerts} icon={XCircle} color="text-red-600" subtitle="Need retry" />
        <MetricCard title="Pending Alerts" value={metrics.pendingAlerts} icon={Clock} color="text-amber-600" subtitle="Queued" />
        <MetricCard title="Unmatched Cases" value={metrics.unmatchedCasesToday} icon={AlertCircle} color="text-orange-600" subtitle="Not listed today" />
        <MetricCard title="Upcoming Hearings" value={metrics.upcomingHearings} icon={CheckCircle2} color="text-purple-600" subtitle="Next 7 days" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" /> Court-wise Case Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courtData.length > 0 ? (
              <div className="h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={courtData} margin={{ left: 0, right: 8 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Cases" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-600" /> Notification Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notifStatusData.some(d => d.value > 0) ? (
              <div className="h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={notifStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {notifStatusData.map((_, index) => (
                        <Cell key={index} fill={['#10b981', '#ef4444', '#f59e0b'][index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-52 text-muted-foreground">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Run Daily Sync to generate notifications</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Today's Matched Cases */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's Matched Cases</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {matches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <GitCompare className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No matches yet. Run Daily Sync to populate.</p>
              </div>
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Case No</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Court</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.case?.case_number}</TableCell>
                      <TableCell className="text-xs">{m.case?.client_name}</TableCell>
                      <TableCell className="text-xs">{m.cause_list?.court_no}</TableCell>
                      <TableCell>
                        <Badge variant={m.match_type === 'cnr' ? 'info' : m.match_type === 'case_number' ? 'success' : 'warning'} className="text-xs">
                          {m.match_type.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-green-700">{m.match_confidence}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Notification Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notification Status</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet.</p>
              </div>
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map(n => (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-xs">{n.case?.case_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{n.notification_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">{n.recipient}</TableCell>
                      <TableCell><NotifStatusBadge status={n.status} /></TableCell>
                      <TableCell className="text-xs">{n.sent_time ? formatDateTime(n.sent_time) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Uploads */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Uploads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">No uploads yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm font-medium">{u.file_name}</TableCell>
                      <TableCell className="text-sm">{u.uploaded_by}</TableCell>
                      <TableCell className="text-sm">{u.total_records}</TableCell>
                      <TableCell className="text-sm text-green-600 font-medium">{u.success_count}</TableCell>
                      <TableCell className="text-sm text-red-600 font-medium">{u.failed_count}</TableCell>
                      <TableCell>
                        <Badge variant={u.status === 'completed' ? 'success' : u.status === 'failed' ? 'destructive' : 'warning'} className="text-xs capitalize">
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(u.created_at)}</TableCell>
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
