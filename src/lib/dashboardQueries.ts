import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardKpis {
  total_cases: number;
  pending_cases: number;
  disposed_cases: number;
  cases_listed_today: number;
  hearings_within_7_days: number;
  hearings_today: number;
}

export interface CategoryCount {
  label: string;
  value: number;
}

export interface HearingDateCount {
  hearing_date: string;
  value: number;
}

export interface RecentListing {
  id: string;
  case_number: string | null;
  court_hall: string | null;
  judge_name: string | null;
  stage: string | null;
  listed_date: string | null;
  created_at: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function rpcRows<T>(fn: string): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

// ── Query functions (server-side SQL aggregation via RPC) ────────────────────

export async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const { data, error } = await supabase.rpc('dashboard_kpis');
  if (error) throw new Error(error.message);
  return (data ?? {
    total_cases: 0,
    pending_cases: 0,
    disposed_cases: 0,
    cases_listed_today: 0,
    hearings_within_7_days: 0,
    hearings_today: 0,
  }) as DashboardKpis;
}

export const fetchCasesByCourt        = () => rpcRows<CategoryCount>('cases_by_court');
export const fetchCaseStatusBreakdown = () => rpcRows<CategoryCount>('case_status_breakdown');
export const fetchCasesByDistrict     = () => rpcRows<CategoryCount>('cases_by_district');
export const fetchCasesBySection      = () => rpcRows<CategoryCount>('cases_by_section');
export const fetchDisposalOutcomes    = () => rpcRows<CategoryCount>('disposal_outcomes');
export const fetchHearingsByDate       = () => rpcRows<HearingDateCount>('hearings_by_date');

export async function fetchRecentListings(): Promise<RecentListing[]> {
  const { data, error } = await supabase
    .from('today_matched_listings')
    .select('id, case_number, court_hall, judge_name, stage, listed_date, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecentListing[];
}

// Top cases by number of connections (both directions). Degrades to [] if the
// case_connections table doesn't exist yet.
export async function fetchMostConnectedCases(): Promise<CategoryCount[]> {
  try {
    const { data, error } = await supabase
      .from('case_connections')
      .select('parent_case_id, connected_case_id');
    if (error) return [];

    const counts: Record<string, number> = {};
    (data ?? []).forEach(r => {
      counts[r.parent_case_id as string] = (counts[r.parent_case_id as string] ?? 0) + 1;
      counts[r.connected_case_id as string] = (counts[r.connected_case_id as string] ?? 0) + 1;
    });

    const topIds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    if (topIds.length === 0) return [];

    const { data: cs } = await supabase
      .from('cases')
      .select('id, case_number')
      .in('id', topIds);
    const byId = new Map((cs ?? []).map(c => [c.id as string, c.case_number as string | null]));

    return topIds.map(id => ({ label: byId.get(id) || '—', value: counts[id] }));
  } catch {
    return [];
  }
}

