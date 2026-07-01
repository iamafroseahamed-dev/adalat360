
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  fetchOrganizations, fetchPricing, createOrganization, updateOrganization,
  addCredits, setPlan, setOrganizationActive, summarizeUsage,
  fetchOrgUserCounts, fetchOrgCaseCounts, fetchOrgSuperAdmins,
  fetchRecipients, createRecipient, updateRecipient, deleteRecipient,
  PLAN_NAMES,
  type OrgUsageSummary, type OrgSuperAdmin, type NotificationRecipient, type RecipientInput,
} from '@/lib/organizations';
import {
  fetchUsersByOrg, fetchAdvocatesByOrg, createUser, assignSuperAdmin, fetchAuditLogs,
  type AuditLogEntry,
} from '@/lib/userManagement';
import {
  normalizeRole, canManageOrganizations, ROLE_LABELS, ROLE_BADGE_VARIANT, type BadgeVariant,
} from '@/lib/roles';
import type { Organization, EcourtsApiUsage } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Building2, Plus, Search, MoreHorizontal, CreditCard, Activity, History, Users, Scale,
  Bell, Settings as SettingsIcon, ShieldCheck, Crown, Power, Edit2, Check, Copy, KeyRound,
  X, Mail, MessageSquare, Phone, Trash2, ShieldAlert, CalendarClock, Wallet,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Formatting helpers (module scope — required by the static-components lint rule)
// ──────────────────────────────────────────────────────────────────────────────
const RUPEE = '\u20B9';

function fmtMoney(v?: number | null): string {
  return `${RUPEE}${Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(v?: number | null): string {
  return Number(v ?? 0).toLocaleString('en-IN');
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const PLAN_VARIANT: Record<string, BadgeVariant> = {
  Trial: 'warning',
  Standard: 'info',
  Enterprise: 'purple',
};
function planVariant(plan?: string | null): BadgeVariant {
  return PLAN_VARIANT[plan ?? ''] ?? 'secondary';
}

const AUDIT_META: Record<string, { label: string; variant: BadgeVariant }> = {
  user_created: { label: 'User created', variant: 'success' },
  user_updated: { label: 'User updated', variant: 'info' },
  user_disabled: { label: 'User disabled', variant: 'destructive' },
  user_activated: { label: 'User activated', variant: 'success' },
  role_changed: { label: 'Role changed', variant: 'warning' },
  password_reset: { label: 'Password reset', variant: 'warning' },
  super_admin_assigned: { label: 'Super Admin assigned', variant: 'purple' },
};
function auditMeta(action: string): { label: string; variant: BadgeVariant } {
  return AUDIT_META[action] ?? { label: action.replace(/_/g, ' '), variant: 'secondary' };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** Pull every API-usage row (platform admin) for per-org billing roll-ups. */
async function fetchAllUsage(): Promise<EcourtsApiUsage[]> {
  const { data, error } = await supabase
    .from('ecourts_api_usage')
    .select('id, organization_id, case_id, endpoint_name, credits_used, request_id, cnr_number, created_at')
    .order('created_at', { ascending: false })
    .limit(50000);
  if (error) return [];
  return (data ?? []) as EcourtsApiUsage[];
}

// Dialog the console can open over the table / panel.
type DialogState =
  | { type: 'create' }
  | { type: 'edit'; org: Organization }
  | { type: 'recharge'; org: Organization }
  | { type: 'plan'; org: Organization }
  | { type: 'assign'; org: Organization };

interface Credential {
  title: string;
  description: string;
  email: string;
  password: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Page entry — gate to platform admins before any console hooks run
// ──────────────────────────────────────────────────────────────────────────────
export default function OrganizationsPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.profile?.role);
  if (!canManageOrganizations(role)) return <AccessDenied />;
  return <OrganizationsConsole />;
}

function AccessDenied() {
  return (
    <div className="p-4 sm:p-6">
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <ShieldAlert className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">Restricted area</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Organization Management is available to Platform Admins only. If you need access,
            contact your platform administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Console
// ──────────────────────────────────────────────────────────────────────────────
function OrganizationsConsole() {
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ['organizations'], queryFn: fetchOrganizations });
  const pricingQ = useQuery({ queryKey: ['ecourts-pricing'], queryFn: fetchPricing });
  const usageQ = useQuery({ queryKey: ['ecourts-usage-all'], queryFn: fetchAllUsage });
  const userCountsQ = useQuery({ queryKey: ['org-user-counts'], queryFn: fetchOrgUserCounts });
  const caseCountsQ = useQuery({ queryKey: ['org-case-counts'], queryFn: fetchOrgCaseCounts });
  const superAdminsQ = useQuery({ queryKey: ['org-super-admins'], queryFn: fetchOrgSuperAdmins });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [planFilter, setPlanFilter] = useState('__all__');
  const [openOrgId, setOpenOrgId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);

  const orgs = orgsQ.data ?? [];
  const pricing = pricingQ.data ?? [];
  const usage = usageQ.data ?? [];
  const userCounts = userCountsQ.data ?? {};
  const caseCounts = caseCountsQ.data ?? {};
  const superAdmins = superAdminsQ.data ?? {};

  const usageByOrg = useMemo(() => {
    const m: Record<string, EcourtsApiUsage[]> = {};
    for (const row of usage) {
      const id = row.organization_id;
      if (!id) continue;
      (m[id] ??= []).push(row);
    }
    return m;
  }, [usage]);

  const summaryByOrg = useMemo(() => {
    const m: Record<string, OrgUsageSummary> = {};
    for (const org of orgs) m[org.id] = summarizeUsage(usageByOrg[org.id] ?? [], pricing);
    return m;
  }, [orgs, usageByOrg, pricing]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orgs.filter(o => {
      if (statusFilter === 'active' && o.active === false) return false;
      if (statusFilter === 'inactive' && o.active !== false) return false;
      if (planFilter !== '__all__' && (o.plan_name ?? 'Trial') !== planFilter) return false;
      if (!term) return true;
      const sa = superAdmins[o.id];
      return [
        o.organization_name, o.short_name, o.contact_person, o.contact_email,
        o.plan_name, sa?.full_name, sa?.email,
      ].some(v => (v ?? '').toLowerCase().includes(term));
    });
  }, [orgs, search, statusFilter, planFilter, superAdmins]);

  const openOrg = openOrgId ? orgs.find(o => o.id === openOrgId) ?? null : null;

  const totals = useMemo(() => {
    const active = orgs.filter(o => o.active !== false).length;
    const credits = orgs.reduce((s, o) => s + Number(o.available_credits ?? 0), 0);
    const users = Object.values(userCounts).reduce((s, n) => s + n, 0);
    return { count: orgs.length, active, credits, users };
  }, [orgs, userCounts]);

  function refreshOrgs() {
    qc.invalidateQueries({ queryKey: ['organizations'] });
    qc.invalidateQueries({ queryKey: ['org-user-counts'] });
    qc.invalidateQueries({ queryKey: ['org-case-counts'] });
    qc.invalidateQueries({ queryKey: ['org-super-admins'] });
  }

  async function handleToggleActive(org: Organization) {
    try {
      await setOrganizationActive(org.id, org.active === false);
      toast.success(org.active === false ? 'Organization activated.' : 'Organization deactivated.');
      refreshOrgs();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const loading = orgsQ.isLoading;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Organization Management</h1>
            <p className="text-sm text-muted-foreground">
              Provision and govern every organisation on the platform.
            </p>
          </div>
        </div>
        <Button onClick={() => setDialog({ type: 'create' })} className="gap-1.5 self-start sm:self-auto">
          <Plus className="h-4 w-4" /> New Organization
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Building2} label="Organizations" value={fmtNum(totals.count)} tone="primary" />
        <StatCard icon={Power} label="Active" value={fmtNum(totals.active)} tone="emerald" />
        <StatCard icon={Users} label="Total Users" value={fmtNum(totals.users)} tone="indigo" />
        <StatCard icon={Wallet} label="Credits in System" value={fmtNum(totals.credits)} tone="amber" />
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search organisations, plans or super admins…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All plans</SelectItem>
              {PLAN_NAMES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Short Name</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Credits Remaining</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Cases</TableHead>
                <TableHead>Super Admin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-0">
                    <EmptyState
                      icon={Building2}
                      title="No organizations"
                      description="Create your first organisation to start onboarding teams."
                      className="m-4"
                    />
                  </TableCell>
                </TableRow>
              )}

              {!loading && filtered.map(org => {
                const sa = superAdmins[org.id];
                return (
                  <TableRow
                    key={org.id}
                    className="cursor-pointer"
                    onClick={() => setOpenOrgId(org.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold uppercase text-muted-foreground">
                          {(org.organization_name || '?').slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{org.organization_name}</p>
                          {org.contact_email && (
                            <p className="truncate text-xs text-muted-foreground">{org.contact_email}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{org.short_name || '—'}</TableCell>
                    <TableCell><Badge variant={planVariant(org.plan_name)}>{org.plan_name || 'Trial'}</Badge></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtNum(org.available_credits)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(userCounts[org.id] ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(caseCounts[org.id] ?? 0)}</TableCell>
                    <TableCell>
                      {sa ? (
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-rose-500" />
                          <span className="truncate text-sm">{sa.full_name || sa.email}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.active === false ? 'destructive' : 'success'}>
                        {org.active === false ? 'Inactive' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(org.created_at)}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <RowActions
                        org={org}
                        onOpen={() => setOpenOrgId(org.id)}
                        onEdit={() => setDialog({ type: 'edit', org })}
                        onRecharge={() => setDialog({ type: 'recharge', org })}
                        onAssign={() => setDialog({ type: 'assign', org })}
                        onToggle={() => handleToggleActive(org)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Slide-over panel */}
      {openOrg && (
        <OrgPanel
          org={openOrg}
          summary={summaryByOrg[openOrg.id]}
          usageRows={usageByOrg[openOrg.id] ?? []}
          userCount={userCounts[openOrg.id] ?? 0}
          caseCount={caseCounts[openOrg.id] ?? 0}
          superAdmin={superAdmins[openOrg.id] ?? null}
          onClose={() => setOpenOrgId(null)}
          onEdit={() => setDialog({ type: 'edit', org: openOrg })}
          onRecharge={() => setDialog({ type: 'recharge', org: openOrg })}
          onPlan={() => setDialog({ type: 'plan', org: openOrg })}
          onAssign={() => setDialog({ type: 'assign', org: openOrg })}
          onToggleActive={() => handleToggleActive(openOrg)}
        />
      )}

      {/* Dialogs */}
      {dialog?.type === 'create' && (
        <OrgFormDialog
          org={null}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refreshOrgs(); }}
        />
      )}
      {dialog?.type === 'edit' && (
        <OrgFormDialog
          org={dialog.org}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refreshOrgs(); }}
        />
      )}
      {dialog?.type === 'recharge' && (
        <RechargeDialog
          org={dialog.org}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refreshOrgs(); }}
        />
      )}
      {dialog?.type === 'plan' && (
        <PlanDialog
          org={dialog.org}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refreshOrgs(); }}
        />
      )}
      {dialog?.type === 'assign' && (
        <AssignSuperAdminDialog
          org={dialog.org}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refreshOrgs();
            qc.invalidateQueries({ queryKey: ['org-users', dialog.org.id] });
          }}
          onCreated={setCredential}
        />
      )}

      {credential && (
        <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Small presentational components
// ──────────────────────────────────────────────────────────────────────────────
const TONE_CLASS: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-50 text-emerald-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  amber: 'bg-amber-50 text-amber-600',
};

function StatCard({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tone: keyof typeof TONE_CLASS;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${TONE_CLASS[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RowActions({
  org, onOpen, onEdit, onRecharge, onAssign, onToggle,
}: {
  org: Organization;
  onOpen: () => void;
  onEdit: () => void;
  onRecharge: () => void;
  onAssign: () => void;
  onToggle: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Manage</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onOpen}><Building2 className="mr-2 h-4 w-4" /> Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}><Edit2 className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={onRecharge}><Wallet className="mr-2 h-4 w-4" /> Recharge Credits</DropdownMenuItem>
        <DropdownMenuItem onSelect={onAssign}><Crown className="mr-2 h-4 w-4" /> Assign Super Admin</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggle}>
          <Power className="mr-2 h-4 w-4" />
          {org.active === false ? 'Activate' : 'Deactivate'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Create / Edit organisation
// ──────────────────────────────────────────────────────────────────────────────
interface OrgFormState {
  organization_name: string;
  short_name: string;
  contact_person: string;
  contact_email: string;
  contact_mobile: string;
  plan_name: string;
  trial_credits: string;
  active: boolean;
}

function blankOrgForm(): OrgFormState {
  return {
    organization_name: '', short_name: '', contact_person: '', contact_email: '',
    contact_mobile: '', plan_name: 'Trial', trial_credits: '100', active: true,
  };
}

// Shared create / edit dialog (org === null means create).
function OrgFormDialog({
  org, onClose, onSaved,
}: {
  org: Organization | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!org;
  const [form, setForm] = useState<OrgFormState>(() =>
    org
      ? {
        organization_name: org.organization_name ?? '',
        short_name: org.short_name ?? '',
        contact_person: org.contact_person ?? '',
        contact_email: org.contact_email ?? '',
        contact_mobile: org.contact_mobile ?? '',
        plan_name: org.plan_name ?? 'Trial',
        trial_credits: String(org.trial_credits ?? 100),
        active: org.active !== false,
      }
      : blankOrgForm(),
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof OrgFormState>(key: K, value: OrgFormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.organization_name.trim()) { toast.error('Organisation name is required.'); return; }
    setSaving(true);
    try {
      const payload: Partial<Organization> = {
        organization_name: form.organization_name.trim(),
        short_name: form.short_name.trim() || null,
        contact_person: form.contact_person.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_mobile: form.contact_mobile.trim() || null,
        plan_name: form.plan_name,
        trial_credits: Number(form.trial_credits) || 0,
        active: form.active,
      };
      if (isEdit && org) {
        await updateOrganization(org.id, payload);
        toast.success('Organisation updated.');
      } else {
        await createOrganization({ ...payload, available_credits: Number(form.trial_credits) || 0 });
        toast.success('Organisation created.');
      }
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {isEdit ? 'Edit Organization' : 'Create Organization'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the organisation profile and plan.' : 'Provision a new organisation on the platform.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Organization name <span className="text-rose-500">*</span></Label>
            <Input value={form.organization_name} onChange={e => set('organization_name', e.target.value)} placeholder="Acme Legal LLP" />
          </div>
          <div className="space-y-1.5">
            <Label>Short name</Label>
            <Input value={form.short_name} onChange={e => set('short_name', e.target.value)} placeholder="ACME" />
          </div>
          <div className="space-y-1.5">
            <Label>Contact person</Label>
            <Input value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="Jane Counsel" />
          </div>
          <div className="space-y-1.5">
            <Label>Contact email</Label>
            <Input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="admin@acme.in" />
          </div>
          <div className="space-y-1.5">
            <Label>Contact mobile</Label>
            <Input value={form.contact_mobile} onChange={e => set('contact_mobile', e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={form.plan_name} onValueChange={v => set('plan_name', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAN_NAMES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{isEdit ? 'Trial credits' : 'Starting credits'}</Label>
            <Input type="number" min={0} value={form.trial_credits} onChange={e => set('trial_credits', e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">Inactive organisations cannot sign in or sync.</p>
            </div>
            <Switch checked={form.active} onCheckedChange={v => set('active', v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>{isEdit ? 'Save Changes' : 'Create Organization'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Recharge credits
// ──────────────────────────────────────────────────────────────────────────────
function RechargeDialog({
  org, onClose, onSaved,
}: {
  org: Organization;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('100');
  const [saving, setSaving] = useState(false);
  const next = Number(org.available_credits ?? 0) + (Number(amount) || 0);

  async function apply() {
    const value = Number(amount);
    if (!value) { toast.error('Enter a non-zero amount.'); return; }
    setSaving(true);
    try {
      await addCredits(org.id, value);
      toast.success(`${value > 0 ? 'Added' : 'Removed'} ${Math.abs(value)} credits.`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-amber-600" /> Recharge Credits</DialogTitle>
          <DialogDescription>{org.organization_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Current balance</span>
            <span className="ml-2 font-semibold tabular-nums text-foreground">{fmtNum(org.available_credits)}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Credits to add (use a negative value to deduct)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            New balance: <span className="font-semibold tabular-nums">{fmtNum(next)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={apply} loading={saving}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Change plan
// ──────────────────────────────────────────────────────────────────────────────
function PlanDialog({
  org, onClose, onSaved,
}: {
  org: Organization;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlanName] = useState(org.plan_name ?? 'Trial');
  const [topUp, setTopUp] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const topUpTo = topUp.trim() === '' ? undefined : Number(topUp);
      await setPlan(org.id, plan, topUpTo);
      toast.success('Subscription plan updated.');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-indigo-600" /> Configure Subscription</DialogTitle>
          <DialogDescription>{org.organization_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={setPlanName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAN_NAMES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Set credit balance to (optional)</Label>
            <Input type="number" value={topUp} onChange={e => setTopUp(e.target.value)} placeholder="Leave blank to keep current balance" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Assign / transfer Super Admin
// ──────────────────────────────────────────────────────────────────────────────
function AssignSuperAdminDialog({
  org, onClose, onSaved, onCreated,
}: {
  org: Organization;
  onClose: () => void;
  onSaved: () => void;
  onCreated: (c: Credential) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedUser, setSelectedUser] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);

  const usersQ = useQuery({
    queryKey: ['org-users', org.id],
    queryFn: () => fetchUsersByOrg(org.id),
  });
  const users = usersQ.data ?? [];

  async function submit() {
    setSaving(true);
    try {
      if (mode === 'existing') {
        if (!selectedUser) { toast.error('Select a user to promote.'); setSaving(false); return; }
        const res = await assignSuperAdmin({ organizationId: org.id, profileId: selectedUser });
        toast.success(
          res.demoted.length
            ? `Super Admin assigned. ${res.demoted.length} previous super admin demoted.`
            : 'Super Admin assigned.',
        );
        onSaved();
      } else {
        if (!name.trim() || !email.trim()) { toast.error('Name and email are required.'); setSaving(false); return; }
        const res = await createUser({
          full_name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          role: 'super_admin',
          organization_id: org.id,
          active: true,
          email_notifications: true,
          notify_hearing_reminder: true,
          notify_task_assignment: true,
          notify_daily_cause_list: true,
          notify_case_assignment: true,
        });
        toast.success('Super Admin created.');
        onCreated({
          title: 'Super Admin Created',
          description: `${email.trim()} is now the Super Admin of ${org.organization_name}.`,
          email: email.trim(),
          password: res.temporaryPassword,
        });
        onSaved();
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-600" /> Assign Super Admin</DialogTitle>
          <DialogDescription>
            The current Super Admin of {org.organization_name} (if any) will be demoted to Admin automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${mode === 'existing' ? 'border-primary bg-primary/5 text-primary' : 'border-border/70 text-muted-foreground hover:bg-muted/50'}`}
            >
              Existing user
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${mode === 'new' ? 'border-primary bg-primary/5 text-primary' : 'border-border/70 text-muted-foreground hover:bg-muted/50'}`}
            >
              Create new user
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-1.5">
              <Label>Promote a member of {org.organization_name}</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser} disabled={usersQ.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={usersQ.isLoading ? 'Loading users…' : 'Select a user'} />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!usersQ.isLoading && users.length === 0 && (
                <p className="text-xs text-muted-foreground">This organisation has no users yet — create a new one instead.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Full name <span className="text-rose-500">*</span></Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Counsel" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Email <span className="text-rose-500">*</span></Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@acme.in" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Mobile</Label>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91 98765 43210" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} className="gap-1.5"><Crown className="h-4 w-4" /> Assign Super Admin</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// One-time credential dialog (new super admin password)
// ──────────────────────────────────────────────────────────────────────────────
function CredentialDialog({ credential, onClose }: { credential: Credential; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Email: ${credential.email}\nTemporary password: ${credential.password}`);
      setCopied(true);
      toast.success('Credentials copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  }
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-600" /> {credential.title}</DialogTitle>
          <DialogDescription>{credential.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Email</p>
            <p className="break-all font-mono text-sm text-foreground">{credential.email}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Temporary Password</p>
            <p className="break-all font-mono text-sm font-semibold text-foreground">{credential.password}</p>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This password is shown only once. Share it securely and ask the user to change it after first sign-in.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Slide-over panel
// ──────────────────────────────────────────────────────────────────────────────
const PANEL_TABS = [
  { value: 'general', label: 'General', icon: Building2 },
  { value: 'subscription', label: 'Subscription', icon: CreditCard },
  { value: 'credits', label: 'Credits', icon: Wallet },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'advocates', label: 'Advocates', icon: Scale },
  { value: 'recipients', label: 'Recipients', icon: Bell },
  { value: 'usage', label: 'API Usage', icon: Activity },
  { value: 'audit', label: 'Audit Logs', icon: History },
  { value: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

function OrgPanel({
  org, summary, usageRows, userCount, caseCount, superAdmin,
  onClose, onEdit, onRecharge, onPlan, onAssign, onToggleActive,
}: {
  org: Organization;
  summary?: OrgUsageSummary;
  usageRows: EcourtsApiUsage[];
  userCount: number;
  caseCount: number;
  superAdmin: OrgSuperAdmin | null;
  onClose: () => void;
  onEdit: () => void;
  onRecharge: () => void;
  onPlan: () => void;
  onAssign: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-background shadow-2xl animate-in slide-in-from-right-4 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold uppercase text-muted-foreground">
              {(org.organization_name || '?').slice(0, 2)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{org.organization_name}</h2>
                <Badge variant={org.active === false ? 'destructive' : 'success'}>
                  {org.active === false ? 'Inactive' : 'Active'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {org.short_name ? `${org.short_name} · ` : ''}{org.plan_name || 'Trial'} plan
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">Actions <MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={onEdit}><Edit2 className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                <DropdownMenuItem onSelect={onPlan}><CreditCard className="mr-2 h-4 w-4" /> Change Plan</DropdownMenuItem>
                <DropdownMenuItem onSelect={onRecharge}><Wallet className="mr-2 h-4 w-4" /> Recharge Credits</DropdownMenuItem>
                <DropdownMenuItem onSelect={onAssign}><Crown className="mr-2 h-4 w-4" /> Assign Super Admin</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onToggleActive}>
                  <Power className="mr-2 h-4 w-4" />{org.active === false ? 'Activate' : 'Deactivate'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Tabs defaultValue="general">
            <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
              {PANEL_TABS.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="general">
              <GeneralTab org={org} userCount={userCount} caseCount={caseCount} superAdmin={superAdmin} onEdit={onEdit} />
            </TabsContent>
            <TabsContent value="subscription">
              <SubscriptionTab org={org} onPlan={onPlan} />
            </TabsContent>
            <TabsContent value="credits">
              <CreditsTab org={org} summary={summary} onRecharge={onRecharge} />
            </TabsContent>
            <TabsContent value="users">
              <OrgUsersTab orgId={org.id} />
            </TabsContent>
            <TabsContent value="advocates">
              <OrgAdvocatesTab orgId={org.id} />
            </TabsContent>
            <TabsContent value="recipients">
              <RecipientsTab orgId={org.id} />
            </TabsContent>
            <TabsContent value="usage">
              <ApiUsageTab summary={summary} usageRows={usageRows} />
            </TabsContent>
            <TabsContent value="audit">
              <OrgAuditTab orgId={org.id} />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsTab org={org} superAdmin={superAdmin} onAssign={onAssign} onToggleActive={onToggleActive} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ── Panel tab: General ────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm text-foreground">{value || '—'}</p>
      </div>
    </div>
  );
}

function GeneralTab({
  org, userCount, caseCount, superAdmin, onEdit,
}: {
  org: Organization;
  userCount: number;
  caseCount: number;
  superAdmin: OrgSuperAdmin | null;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Users" value={fmtNum(userCount)} />
        <MiniStat label="Active Cases" value={fmtNum(caseCount)} />
        <MiniStat label="Credits" value={fmtNum(org.available_credits)} />
      </div>

      <Card>
        <CardContent className="divide-y divide-border/60 p-4">
          <InfoRow icon={Building2} label="Organization name" value={org.organization_name} />
          <InfoRow icon={ShieldCheck} label="Super Admin" value={superAdmin ? `${superAdmin.full_name} (${superAdmin.email})` : 'Unassigned'} />
          <InfoRow icon={Mail} label="Contact email" value={org.contact_email ?? ''} />
          <InfoRow icon={Phone} label="Contact mobile" value={org.contact_mobile ?? ''} />
          <InfoRow icon={Users} label="Contact person" value={org.contact_person ?? ''} />
          <InfoRow icon={CalendarClock} label="Created" value={fmtDateTime(org.created_at)} />
        </CardContent>
      </Card>

      <Button variant="outline" onClick={onEdit} className="gap-1.5"><Edit2 className="h-4 w-4" /> Edit organisation</Button>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

// ── Panel tab: Subscription ───────────────────────────────────────────────────
function SubscriptionTab({ org, onPlan }: { org: Organization; onPlan: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Current plan</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={planVariant(org.plan_name)}>{org.plan_name || 'Trial'}</Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onPlan} className="gap-1.5"><CreditCard className="h-4 w-4" /> Change plan</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Trial credits" value={fmtNum(org.trial_credits)} />
            <MiniStat label="Available credits" value={fmtNum(org.available_credits)} />
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {PLAN_NAMES.map(p => (
          <span
            key={p}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${(org.plan_name ?? 'Trial') === p ? 'border-primary bg-primary/5 text-primary' : 'border-border/70 text-muted-foreground'}`}
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Panel tab: Credits ────────────────────────────────────────────────────────
function CreditsTab({ org, summary, onRecharge }: { org: Organization; summary?: OrgUsageSummary; onRecharge: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted-foreground">Credits remaining</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{fmtNum(org.available_credits)}</p>
          </div>
          <Button onClick={onRecharge} className="gap-1.5"><Plus className="h-4 w-4" /> Recharge</Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Amount charged" value={fmtMoney(summary?.amountCharged)} />
        <MiniStat label="This month" value={fmtMoney(summary?.amountThisMonth)} />
        <MiniStat label="API calls" value={fmtNum(summary?.apiCalls)} />
        <MiniStat label="Cases synced" value={fmtNum(summary?.casesSynced)} />
      </div>
    </div>
  );
}

// ── Panel tab: Users ──────────────────────────────────────────────────────────
function OrgUsersTab({ orgId }: { orgId: string }) {
  const q = useQuery({ queryKey: ['org-users', orgId], queryFn: () => fetchUsersByOrg(orgId) });
  const users = q.data ?? [];

  if (q.isLoading) return <TabSkeleton />;
  if (users.length === 0) {
    return <EmptyState icon={Users} title="No users" description="This organisation has no members yet." className="py-10" />;
  }
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.full_name}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell><Badge variant={ROLE_BADGE_VARIANT[u.role]}>{ROLE_LABELS[u.role]}</Badge></TableCell>
              <TableCell>
                <Badge variant={u.active ? 'success' : 'destructive'}>{u.active ? 'Active' : 'Disabled'}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Panel tab: Advocates ──────────────────────────────────────────────────────
function OrgAdvocatesTab({ orgId }: { orgId: string }) {
  const q = useQuery({ queryKey: ['org-advocates', orgId], queryFn: () => fetchAdvocatesByOrg(orgId) });
  const advocates = q.data ?? [];

  if (q.isLoading) return <TabSkeleton />;
  if (advocates.length === 0) {
    return <EmptyState icon={Scale} title="No advocates" description="Advocates appear once cases are assigned." className="py-10" />;
  }
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Advocate</TableHead>
            <TableHead className="text-right">Assigned</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead className="text-right">Disposed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {advocates.map(a => (
            <TableRow key={a.name}>
              <TableCell>
                <p className="font-medium">{a.name}</p>
                {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(a.assignedCases)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(a.activeCases)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(a.disposedCases)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Panel tab: Notification recipients ────────────────────────────────────────
function blankRecipient(): RecipientInput {
  return {
    name: '', email: '', mobile_number: '', whatsapp_number: '',
    notify_email: true, notify_sms: false, notify_whatsapp: false, active: true,
  };
}

function ChannelDot({ on, icon: Icon }: { on: boolean; icon: typeof Mail }) {
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${on ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground/50'}`}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function RecipientsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['org-recipients', orgId], queryFn: () => fetchRecipients(orgId) });
  const recipients = q.data ?? [];
  const [editing, setEditing] = useState<NotificationRecipient | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRecipient | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() { qc.invalidateQueries({ queryKey: ['org-recipients', orgId] }); }

  async function toggleActive(r: NotificationRecipient) {
    try {
      await updateRecipient(r.id, { active: !r.active });
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteRecipient(deleteTarget.id);
      toast.success('Recipient removed.');
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">People who receive hearing & cause-list alerts.</p>
        <Button size="sm" onClick={() => setEditing('new')} className="gap-1.5"><Plus className="h-4 w-4" /> Add</Button>
      </div>

      {q.isLoading ? (
        <TabSkeleton />
      ) : recipients.length === 0 ? (
        <EmptyState icon={Bell} title="No recipients" description="Add someone to start sending notifications." className="py-10" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.email || r.mobile_number || '—'}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <ChannelDot on={r.notify_email} icon={Mail} />
                      <ChannelDot on={r.notify_sms} icon={Phone} />
                      <ChannelDot on={r.notify_whatsapp} icon={MessageSquare} />
                    </div>
                  </TableCell>
                  <TableCell><Switch checked={r.active} onCheckedChange={() => toggleActive(r)} /></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(r)}><Edit2 className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDeleteTarget(r)} className="text-rose-600"><Trash2 className="mr-2 h-4 w-4" /> Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {editing && (
        <RecipientDialog
          orgId={orgId}
          recipient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove recipient</DialogTitle>
            <DialogDescription>{deleteTarget?.name} will no longer receive notifications.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" loading={busy} onClick={confirmDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecipientDialog({
  orgId, recipient, onClose, onSaved,
}: {
  orgId: string;
  recipient: NotificationRecipient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RecipientInput>(() =>
    recipient
      ? {
        name: recipient.name ?? '',
        email: recipient.email ?? '',
        mobile_number: recipient.mobile_number ?? '',
        whatsapp_number: recipient.whatsapp_number ?? '',
        notify_email: recipient.notify_email,
        notify_sms: recipient.notify_sms,
        notify_whatsapp: recipient.notify_whatsapp,
        active: recipient.active,
      }
      : blankRecipient(),
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof RecipientInput>(key: K, value: RecipientInput[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) { toast.error('Name is required.'); return; }
    setSaving(true);
    try {
      const payload: RecipientInput = {
        ...form,
        name: form.name.trim(),
        email: form.email?.trim() || null,
        mobile_number: form.mobile_number?.trim() || null,
        whatsapp_number: form.whatsapp_number?.trim() || null,
      };
      if (recipient) {
        await updateRecipient(recipient.id, payload);
        toast.success('Recipient updated.');
      } else {
        await createRecipient(orgId, payload);
        toast.success('Recipient added.');
      }
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> {recipient ? 'Edit Recipient' : 'Add Recipient'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name <span className="text-rose-500">*</span></Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mobile (SMS)</Label>
              <Input value={form.mobile_number ?? ''} onChange={e => set('mobile_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp_number ?? ''} onChange={e => set('whatsapp_number', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-border/70 p-3">
            <ChannelToggle label="Email alerts" icon={Mail} checked={form.notify_email} onChange={v => set('notify_email', v)} />
            <ChannelToggle label="SMS alerts" icon={Phone} checked={form.notify_sms} onChange={v => set('notify_sms', v)} />
            <ChannelToggle label="WhatsApp alerts" icon={MessageSquare} checked={form.notify_whatsapp} onChange={v => set('notify_whatsapp', v)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>{recipient ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelToggle({
  label, icon: Icon, checked, onChange,
}: {
  label: string;
  icon: typeof Mail;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-foreground"><Icon className="h-4 w-4 text-muted-foreground" /> {label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ── Panel tab: API usage ──────────────────────────────────────────────────────
function ApiUsageTab({ summary, usageRows }: { summary?: OrgUsageSummary; usageRows: EcourtsApiUsage[] }) {
  const recent = usageRows.slice(0, 25);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="API calls" value={fmtNum(summary?.apiCalls)} />
        <MiniStat label="Amount charged" value={fmtMoney(summary?.amountCharged)} />
        <MiniStat label="Cases synced" value={fmtNum(summary?.casesSynced)} />
        <MiniStat label="Last sync" value={fmtDate(summary?.lastSync)} />
      </div>

      {summary && summary.byEndpoint.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Charged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.byEndpoint.map(e => (
                <TableRow key={e.endpoint}>
                  <TableCell className="font-medium">{e.endpoint}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(e.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(e.rate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(e.amountCharged)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {recent.length === 0 ? (
        <EmptyState icon={Activity} title="No API usage" description="Usage appears once cases sync from eCourts." className="py-10" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>CNR</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.endpoint_name || '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.cnr_number || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r.credits_used)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDateTime(r.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ── Panel tab: Audit logs ─────────────────────────────────────────────────────
function OrgAuditTab({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ['org-audit', orgId],
    queryFn: () => fetchAuditLogs('platform_admin', orgId, 100),
  });
  const logs: AuditLogEntry[] = q.data ?? [];

  if (q.isLoading) return <TabSkeleton />;
  if (logs.length === 0) {
    return <EmptyState icon={History} title="No audit events" description="Administrative actions for this organisation will appear here." className="py-10" />;
  }
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map(l => {
            const meta = auditMeta(l.action);
            return (
              <TableRow key={l.id}>
                <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.target_email || l.target_type || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.actor_email || '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDateTime(l.created_at)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Panel tab: Settings ───────────────────────────────────────────────────────
function SettingsTab({
  org, superAdmin, onAssign, onToggleActive,
}: {
  org: Organization;
  superAdmin: OrgSuperAdmin | null;
  onAssign: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Crown className="h-4 w-4 text-amber-600" /> Super Admin</p>
            <p className="text-sm text-muted-foreground">
              {superAdmin ? `${superAdmin.full_name} · ${superAdmin.email}` : 'No Super Admin assigned.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onAssign}>{superAdmin ? 'Transfer' : 'Assign'}</Button>
        </CardContent>
      </Card>

      <Card className="border-rose-200">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Power className="h-4 w-4 text-rose-500" /> {org.active === false ? 'Activate organisation' : 'Deactivate organisation'}</p>
            <p className="text-sm text-muted-foreground">
              {org.active === false
                ? 'Re-enable sign-in and syncing for this organisation.'
                : 'Members will be unable to sign in or sync cases.'}
            </p>
          </div>
          <Button variant={org.active === false ? 'default' : 'destructive'} size="sm" onClick={onToggleActive}>
            {org.active === false ? 'Activate' : 'Deactivate'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}
