import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Building2, CreditCard, Activity, CalendarClock, Plus } from 'lucide-react';
import {
  fetchOrganizations, fetchPricing, addCredits, setPlan, setOrganizationActive,
  summarizeUsage, PLAN_NAMES,
} from '@/lib/organizations';
import type { Organization, EcourtsApiUsage } from '@/types';

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtMoney(v: number | null | undefined): string {
  return `\u20b9${Number(v ?? 0).toFixed(2)}`;
}

async function fetchAllUsage(): Promise<EcourtsApiUsage[]> {
  try {
    const { data, error } = await supabase
      .from('ecourts_api_usage').select('*').order('created_at', { ascending: false }).range(0, 49999);
    if (error) return [];
    return (data ?? []) as EcourtsApiUsage[];
  } catch { return []; }
}

async function fetchOrgCaseCounts(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase.from('cases').select('organization_id').eq('active', true).range(0, 49999);
    if (error) return {};
    const m: Record<string, number> = {};
    (data ?? []).forEach(r => {
      const id = (r as { organization_id: string | null }).organization_id;
      if (id) m[id] = (m[id] ?? 0) + 1;
    });
    return m;
  } catch { return {}; }
}

function Stat({ label, value, accent = 'text-foreground' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${accent}`}>{value}</p>
    </div>
  );
}

export default function OrganizationsPage() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ['organizations'], queryFn: fetchOrganizations });
  const pricingQ = useQuery({ queryKey: ['ecourts-pricing'], queryFn: fetchPricing });
  const usageQ = useQuery({ queryKey: ['ecourts-usage-all'], queryFn: fetchAllUsage });
  const caseCountsQ = useQuery({ queryKey: ['org-case-counts'], queryFn: fetchOrgCaseCounts });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'credits' | 'plan'; org: Organization } | null>(null);
  const [creditInput, setCreditInput] = useState('100');
  const [planInput, setPlanInput] = useState<string>('Standard');

  const orgs = orgsQ.data ?? [];
  const usage = usageQ.data ?? [];
  const pricing = pricingQ.data ?? [];
  const caseCounts = caseCountsQ.data ?? {};

  const usageByOrg = useMemo(() => {
    const m = new Map<string, EcourtsApiUsage[]>();
    for (const u of usage) {
      const id = u.organization_id ?? '__none__';
      if (!m.has(id)) m.set(id, []);
      m.get(id)!.push(u);
    }
    return m;
  }, [usage]);

  const selected = orgs.find(o => o.id === selectedId) ?? null;
  const selectedSummary = useMemo(
    () => (selected ? summarizeUsage(usageByOrg.get(selected.id) ?? [], pricing) : null),
    [selected, usageByOrg, pricing],
  );
  const selectedLogs = selected ? (usageByOrg.get(selected.id) ?? []).slice(0, 100) : [];

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['organizations'] }),
      qc.invalidateQueries({ queryKey: ['ecourts-usage-all'] }),
    ]);
  }

  async function submitDialog() {
    if (!dialog) return;
    try {
      if (dialog.mode === 'credits') {
        const amt = Number(creditInput);
        if (!Number.isFinite(amt) || amt === 0) { toast.error('Enter a valid balance amount.'); return; }
        await addCredits(dialog.org.id, amt);
        toast.success(`${amt > 0 ? 'Added' : 'Deducted'} ₹${Math.abs(amt).toFixed(2)} balance.`);
      } else {
        await setPlan(dialog.org.id, planInput);
        toast.success(`Plan changed to ${planInput}.`);
      }
      setDialog(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed.');
    }
  }

  async function toggleActive(org: Organization) {
    try {
      await setOrganizationActive(org.id, !(org.active !== false));
      toast.success(org.active !== false ? 'Organization disabled.' : 'Organization enabled.');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Building2 className="h-5 w-5" /> Organization Management</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage organizations, plans, credit balances and eCourts API usage.</p>
      </div>

      {/* Organizations table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Organizations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orgsQ.isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div>
          ) : orgs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No organizations. Run <code>supabase/migrations/organizations_credits.sql</code> to seed them.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Organization</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 text-right font-medium">Balance (₹)</th>
                    <th className="px-3 py-2 text-right font-medium">Amount Charged (₹)</th>
                    <th className="px-3 py-2 text-right font-medium">Active Cases</th>
                    <th className="px-3 py-2 font-medium">Last Sync</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map(org => {
                    const sum = summarizeUsage(usageByOrg.get(org.id) ?? [], pricing);
                    const avail = Number(org.available_credits ?? 0);
                    const disabled = org.active === false;
                    return (
                      <tr key={org.id} className={`border-b last:border-0 ${disabled ? 'opacity-60' : ''}`}>
                        <td className="px-3 py-2">
                          <button type="button" className="text-left font-medium hover:underline" onClick={() => setSelectedId(org.id)}>
                            {org.organization_name}
                          </button>
                          {org.short_name && <span className="ml-1 text-xs text-muted-foreground">({org.short_name})</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{org.plan_name ?? 'Trial'}</span>
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${avail <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtMoney(avail)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(sum.amountCharged)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{(caseCounts[org.id] ?? 0).toLocaleString('en-IN')}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{sum.lastSync ? fmtDateTime(sum.lastSync) : '\u2014'}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setCreditInput('100'); setDialog({ mode: 'credits', org }); }}>
                              <Plus className="h-3 w-3" /> Balance
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPlanInput(org.plan_name ?? 'Standard'); setDialog({ mode: 'plan', org }); }}>
                              Plan
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedId(org.id)}>
                              Logs
                            </Button>
                            <div className="flex items-center gap-1">
                              <Switch checked={org.active !== false} onCheckedChange={() => toggleActive(org)} />
                              <span className="text-[11px] text-muted-foreground">{disabled ? 'Disabled' : 'Active'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected organization analytics */}
      {selected && selectedSummary && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{selected.organization_name}</h2>

          {/* Organization Credits */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-emerald-600" /> Organization Credits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="Plan" value={selected.plan_name ?? 'Trial'} />
                <Stat label="Balance (₹)" value={fmtMoney(selected.available_credits)} accent={Number(selected.available_credits ?? 0) <= 0 ? 'text-red-600' : 'text-emerald-600'} />
                <Stat label="Amount Charged (₹)" value={fmtMoney(selectedSummary.amountCharged)} />
                <Stat label="Cases Synced" value={selectedSummary.casesSynced.toLocaleString('en-IN')} />
                <Stat label="API Calls" value={selectedSummary.apiCalls.toLocaleString('en-IN')} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* API Usage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-blue-600" /> API Usage</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {selectedSummary.byEndpoint.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No API usage yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Endpoint</th>
                        <th className="px-3 py-2 text-right font-medium">Calls</th>
                        <th className="px-3 py-2 text-right font-medium">Rate Applied</th>
                        <th className="px-3 py-2 text-right font-medium">Amount Charged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSummary.byEndpoint.map(e => (
                        <tr key={e.endpoint} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">{e.endpoint}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.calls}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(e.rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(e.amountCharged)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Monthly Consumption */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-indigo-600" /> Monthly Consumption</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Charged This Month (₹)" value={fmtMoney(selectedSummary.amountThisMonth)} />
                  <Stat label="Total Charged (₹)" value={fmtMoney(selectedSummary.amountCharged)} />
                  <Stat label="Remaining Balance (₹)" value={fmtMoney(selected.available_credits)} accent={Number(selected.available_credits ?? 0) <= 0 ? 'text-red-600' : 'text-emerald-600'} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Usage Logs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Usage Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selectedLogs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No usage logs.</p>
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Endpoint</th>
                        <th className="px-3 py-2 font-medium">CNR</th>
                        <th className="px-3 py-2 text-right font-medium">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLogs.map(l => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDateTime(l.created_at)}</td>
                          <td className="px-3 py-2 font-mono text-xs">{l.endpoint_name ?? '\u2014'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{l.cnr_number ?? '\u2014'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.credits_used)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Credits / Change Plan dialog */}
      <Dialog open={!!dialog} onOpenChange={o => { if (!o) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'credits' ? 'Add Balance (₹)' : 'Change Plan'}</DialogTitle>
            <DialogDescription>{dialog?.org.organization_name}</DialogDescription>
          </DialogHeader>
          {dialog?.mode === 'credits' ? (
            <div className="space-y-2">
              <Label htmlFor="credit-amt">Balance to add in ₹ (use a negative number to deduct)</Label>
              <Input id="credit-amt" type="number" value={creditInput} onChange={e => setCreditInput(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={planInput} onValueChange={setPlanInput}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_NAMES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={submitDialog}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
