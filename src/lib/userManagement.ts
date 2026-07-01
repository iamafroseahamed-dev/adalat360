/**
 * lib/userManagement.ts — Data access for the User Management module.
 *
 * Every query is scoped to the caller's organisation UNLESS they are a platform
 * admin. This mirrors the row-level-security policies in migration 017 — the
 * client filter is a convenience; RLS is the real boundary.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Organization, Role } from '@/types';
import { isPlatformAdmin } from '@/lib/roles';

const serviceUrl = import.meta.env.VITE_SUPABASE_URL as string;
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

const NOTIFICATION_KEYS = [
  'email_notifications',
  'notify_hearing_reminder',
  'notify_task_assignment',
  'notify_daily_cause_list',
  'notify_case_assignment',
] as const;

function getAdminClient(): SupabaseClient {
  if (!serviceUrl || !serviceRoleKey) {
    throw new Error('Missing VITE_SUPABASE_SERVICE_ROLE_KEY env var for frontend user administration.');
  }
  return createClient(serviceUrl, serviceRoleKey);
}

function normalizeRole(role: string | null | undefined): Role {
  const r = (role ?? '').toLowerCase();
  if (r === 'user') return 'viewer';
  if (
    r === 'platform_admin' ||
    r === 'super_admin' ||
    r === 'admin' ||
    r === 'advocate' ||
    r === 'viewer'
  ) {
    return r as Role;
  }
  return 'viewer';
}

function generatePassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const n of bytes) out += alphabet[n % alphabet.length];
  return out;
}

async function audit(
  action: string,
  target: { id?: string; email?: string | null; organization_id?: string | null } | null,
  metadata: Record<string, unknown> = {},
) {
  const session = await supabase.auth.getSession();
  const user = session.data.session?.user;
  await getAdminClient().from('audit_logs').insert({
    organization_id: target?.organization_id ?? null,
    actor_user_id: user?.id ?? null,
    actor_email: user?.email ?? null,
    action,
    target_type: 'user',
    target_id: target?.id ?? null,
    target_email: target?.email ?? null,
    metadata,
  }).catch(() => {
    // Audit failures do not break the primary operation.
  });
}

export interface AppUser {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  full_name: string;
  email: string;
  mobile: string | null;
  role: Role;
  active: boolean;
  last_login_at: string | null;
  email_notifications: boolean;
  notify_hearing_reminder: boolean;
  notify_task_assignment: boolean;
  notify_daily_cause_list: boolean;
  notify_case_assignment: boolean;
  created_at: string;
  organization?: Organization | null;
}

export interface UserInput {
  full_name: string;
  email: string;
  mobile: string;
  role: Role;
  organization_id: string | null;
  active: boolean;
  email_notifications: boolean;
  notify_hearing_reminder: boolean;
  notify_task_assignment: boolean;
  notify_daily_cause_list: boolean;
  notify_case_assignment: boolean;
}

const USER_COLUMNS =
  'id, user_id, organization_id, full_name, email, mobile, role, active, last_login_at, ' +
  'email_notifications, notify_hearing_reminder, notify_task_assignment, ' +
  'notify_daily_cause_list, notify_case_assignment, created_at, ' +
  'organization:organizations(*)';

/**
 * Fetch users visible to the current actor.
 * Platform admins see all users; everyone else is restricted to their own org.
 */
export async function fetchUsers(actorRole: Role | null | undefined, orgId: string | null): Promise<AppUser[]> {
  let query = supabase
    .from('profiles')
    .select(USER_COLUMNS)
    .order('full_name', { ascending: true });

  if (!isPlatformAdmin(actorRole)) {
    if (!orgId) return [];
    query = query.eq('organization_id', orgId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AppUser[];
}

/** Org-scoped user list (always filtered to one organization). */
export async function fetchUsersByOrg(orgId: string): Promise<AppUser[]> {
  return fetchUsers('admin', orgId);
}

export interface CreateUserResult {
  userId: string;
  temporaryPassword: string;
}

/**
 * Create a fully provisioned user: Supabase Auth account + profile (+ advocate
 * directory entry). Returns a one-time temporary password to share securely.
 */
export async function createUser(input: UserInput): Promise<CreateUserResult> {
  const full_name = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const mobile = input.mobile.trim();
  const targetRole = normalizeRole(input.role);
  const organizationId = input.organization_id ?? null;

  if (!full_name) throw new Error('Full name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email address is required.');
  }
  if (!organizationId) throw new Error('An organization is required.');

  const admin = getAdminClient();
  const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing) throw new Error('A user with this email already exists.');

  const temporaryPassword = generatePassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'unknown error';
    if (/registered|exists/i.test(msg)) {
      throw new Error('A user with this email already exists.');
    }
    throw new Error(`Auth creation failed: ${msg}`);
  }

  const newUserId = created.user.id;
  const profileRow: Record<string, unknown> = {
    user_id: newUserId,
    organization_id: organizationId,
    full_name,
    email,
    mobile,
    role: targetRole,
    active: true,
  };
  for (const key of NOTIFICATION_KEYS) {
    profileRow[key] = input[key as keyof UserInput] !== undefined ? Boolean(input[key as keyof UserInput]) : true;
  }

  const { error: profileErr } = await admin.from('profiles').insert(profileRow);
  if (profileErr) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    throw new Error(`Profile creation failed: ${profileErr.message}`);
  }

  if (targetRole === 'advocate') {
    try {
      const { data: dupe } = await admin
        .from('advocates')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', email)
        .maybeSingle();
      if (!dupe) {
        await admin.from('advocates').insert({
          organization_id: organizationId,
          advocate_name: full_name,
          email,
          mobile,
          active: true,
        });
      }
    } catch {
      // Advocate mirroring is best-effort.
    }
  }

  if (targetRole === 'super_admin') {
    await demoteOtherSuperAdmins(organizationId, newUserId);
  }

  await audit(
    targetRole === 'super_admin' ? 'super_admin_assigned' : 'user_created',
    { id: undefined, email, organization_id: organizationId },
    { role: targetRole },
  );

  return { userId: newUserId, temporaryPassword };
}

export async function updateUser(id: string, patch: Partial<UserInput>): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (patch.full_name !== undefined) updates.full_name = patch.full_name.trim();
  if (patch.email !== undefined) updates.email = patch.email.trim().toLowerCase();
  if (patch.mobile !== undefined) updates.mobile = patch.mobile.trim();
  if (patch.role !== undefined) updates.role = patch.role;
  if (patch.organization_id !== undefined) updates.organization_id = patch.organization_id;
  if (patch.active !== undefined) updates.active = patch.active;
  if (patch.email_notifications !== undefined) updates.email_notifications = patch.email_notifications;
  if (patch.notify_hearing_reminder !== undefined) updates.notify_hearing_reminder = patch.notify_hearing_reminder;
  if (patch.notify_task_assignment !== undefined) updates.notify_task_assignment = patch.notify_task_assignment;
  if (patch.notify_daily_cause_list !== undefined) updates.notify_daily_cause_list = patch.notify_daily_cause_list;
  if (patch.notify_case_assignment !== undefined) updates.notify_case_assignment = patch.notify_case_assignment;
  if (Object.keys(updates).length === 0) return;

  const { error } = await getAdminClient().from('profiles').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  const admin = getAdminClient();
  const { data: target } = await admin
    .from('profiles')
    .select('id, user_id, email, organization_id')
    .eq('id', id)
    .maybeSingle();
  if (!target) throw new Error('User not found.');

  const { error } = await admin.from('profiles').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);

  if (target.user_id) {
    await admin.auth.admin.updateUserById(target.user_id, {
      ban_duration: active ? 'none' : '876000h',
    }).catch(() => {});
  }

  await audit(active ? 'user_activated' : 'user_disabled', target);
}

/** Issue a new one-time temporary password for an existing user. */
export async function resetUserPassword(id: string): Promise<string> {
  const admin = getAdminClient();
  const { data: target } = await admin
    .from('profiles')
    .select('id, user_id, email, organization_id')
    .eq('id', id)
    .maybeSingle();
  if (!target) throw new Error('User not found.');
  if (!target.user_id) throw new Error('This user has no authentication account.');

  const temporaryPassword = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(target.user_id, {
    password: temporaryPassword,
  });
  if (error) throw new Error(`Password reset failed: ${error.message}`);

  await audit('password_reset', target);
  return temporaryPassword;
}

/**
 * Promote a user to Super Admin of an organization. The admin client demotes
 * the current Super Admin (if any) to 'admin' and records the change in the audit log.
 */
export async function assignSuperAdmin(args: {
  organizationId: string;
  profileId?: string;
  userId?: string;
}): Promise<{ demoted: string[] }> {
  const admin = getAdminClient();
  const targetQuery = admin
    .from('profiles')
    .select('id, user_id, role, organization_id, email');

  let query = targetQuery;
  if (args.profileId) query = query.eq('id', args.profileId);
  else if (args.userId) query = query.eq('user_id', args.userId);
  else throw new Error('A target user is required.');

  const { data: target } = await query.maybeSingle();
  if (!target) throw new Error('User not found.');

  const demoted = await demoteOtherSuperAdmins(args.organizationId, target.user_id ?? null);
  const { error } = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', target.id);
  if (error) throw new Error(`Assigning Super Admin failed: ${error.message}`);

  await audit('super_admin_assigned', target, { demoted });
  return { demoted };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  organization_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Read the administrative audit trail. RLS (migration 019) limits rows to the
 * caller's organisation unless they are a platform admin. The org filter here is
 * a convenience; the real boundary is enforced in the database.
 */
export async function fetchAuditLogs(
  actorRole: Role | null | undefined,
  orgId: string | null,
  limit = 100,
): Promise<AuditLogEntry[]> {
  let query = supabase
    .from('audit_logs')
    .select('id, organization_id, actor_email, action, target_type, target_email, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!isPlatformAdmin(actorRole)) {
    if (!orgId) return [];
    query = query.eq('organization_id', orgId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AuditLogEntry[];
}

// ── Notification preferences (current user, self-service) ─────────────────────

export interface NotificationPrefs {
  email_notifications: boolean;
  notify_hearing_reminder: boolean;
  notify_task_assignment: boolean;
  notify_daily_cause_list: boolean;
  notify_case_assignment: boolean;
}

/**
 * Update the signed-in user's own notification preferences. RLS allows a user to
 * update their own profile row (see migration 017 profiles_update policy).
 */
export async function updateMyNotificationPreferences(userId: string, prefs: NotificationPrefs): Promise<void> {
  const { error } = await supabase.from('profiles').update(prefs).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// ── Advocates module ──────────────────────────────────────────────────────────
// Advocates are derived from the cases they are assigned to, with live metrics.
// Every advocate belongs to one organisation (the org of their cases).

export interface AdvocateSummary {
  name: string;
  email: string | null;
  mobile: string | null;
  assignedCases: number;
  activeCases: number;
  disposedCases: number;
  upcomingHearings: number;
  statusBreakdown: Record<string, number>;
  lastAssignedOn: string | null;
}

interface AdvocateCaseRow {
  assigned_advocate_name: string | null;
  assigned_advocate_email: string | null;
  assigned_advocate_mobile: string | null;
  advocate_name: string | null;
  advocate_email: string | null;
  advocate_mobile: string | null;
  advocate_status: string | null;
  case_status: string | null;
  next_hearing_date: string | null;
  assigned_on: string | null;
}

export async function fetchAdvocates(actorRole: Role | null | undefined, orgId: string | null): Promise<AdvocateSummary[]> {  let query = supabase
    .from('cases')
    .select(
      'assigned_advocate_name, assigned_advocate_email, assigned_advocate_mobile, ' +
      'advocate_name, advocate_email, advocate_mobile, advocate_status, case_status, ' +
      'next_hearing_date, assigned_on',
    )
    .limit(10000);

  if (!isPlatformAdmin(actorRole)) {
    if (!orgId) return [];
    query = query.eq('organization_id', orgId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const today = new Date().toISOString().slice(0, 10);
  const byAdvocate = new Map<string, AdvocateSummary>();

  for (const row of (data ?? []) as unknown as AdvocateCaseRow[]) {
    const name = (row.assigned_advocate_name || row.advocate_name || '').trim();
    if (!name) continue;

    let summary = byAdvocate.get(name.toLowerCase());
    if (!summary) {
      summary = {
        name,
        email: row.assigned_advocate_email || row.advocate_email || null,
        mobile: row.assigned_advocate_mobile || row.advocate_mobile || null,
        assignedCases: 0,
        activeCases: 0,
        disposedCases: 0,
        upcomingHearings: 0,
        statusBreakdown: {},
        lastAssignedOn: null,
      };
      byAdvocate.set(name.toLowerCase(), summary);
    }

    summary.assignedCases += 1;
    const status = (row.case_status || '').toLowerCase();
    if (status === 'disposed') summary.disposedCases += 1;
    else summary.activeCases += 1;

    if (row.next_hearing_date && row.next_hearing_date >= today) summary.upcomingHearings += 1;

    const advStatus = (row.advocate_status || '').trim();
    if (advStatus) summary.statusBreakdown[advStatus] = (summary.statusBreakdown[advStatus] ?? 0) + 1;

    if (row.assigned_on && (!summary.lastAssignedOn || row.assigned_on > summary.lastAssignedOn)) {
      summary.lastAssignedOn = row.assigned_on;
    }
    if (!summary.email && (row.assigned_advocate_email || row.advocate_email)) {
      summary.email = row.assigned_advocate_email || row.advocate_email || null;
    }
    if (!summary.mobile && (row.assigned_advocate_mobile || row.advocate_mobile)) {
      summary.mobile = row.assigned_advocate_mobile || row.advocate_mobile || null;
    }
  }

  return Array.from(byAdvocate.values()).sort((a, b) => b.assignedCases - a.assignedCases);
}

/** Org-scoped advocate list (always filtered to one organization). */
export async function fetchAdvocatesByOrg(orgId: string): Promise<AdvocateSummary[]> {
  return fetchAdvocates('admin', orgId);
}
