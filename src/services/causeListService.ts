import { supabase } from '@/lib/supabase';
import type { CauseList, CauseListMatch } from '@/types';

export async function fetchCauseList(filters?: {
  date?: string;
  court?: string;
  judge?: string;
  bench?: string;
}): Promise<CauseList[]> {
  let query = supabase
    .from('cause_lists')
    .select('*')
    .order('cause_date', { ascending: false })
    .order('court_name')
    .order('court_no')
    .order('item_number');

  if (filters?.date) query = query.eq('cause_date', filters.date);
  if (filters?.court) query = query.ilike('court_name', `%${filters.court}%`);
  if (filters?.judge) query = query.ilike('judge_name', `%${filters.judge}%`);
  if (filters?.bench) query = query.ilike('bench', `%${filters.bench}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchMatches(
  orgId: string,
  date?: string,
): Promise<CauseListMatch[]> {
  let query = supabase
    .from('cause_list_matches')
    .select(`*, case:cases(*), cause_list:cause_lists(*)`)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (date) query = query.eq('matched_on', date);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTodayMatches(orgId: string): Promise<CauseListMatch[]> {
  const today = new Date().toISOString().split('T')[0];
  return fetchMatches(orgId, today);
}

export async function upsertCauseListRecords(records: Omit<CauseList, 'id' | 'created_at'>[]): Promise<number> {
  const { data, error } = await supabase
    .from('cause_lists')
    .upsert(records, { onConflict: 'cause_date,court_name,case_number' })
    .select('id');

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function runMatchingForOrg(orgId: string, today: string): Promise<number> {
  const [causeListData, casesData] = await Promise.all([
    supabase.from('cause_lists').select('*').eq('cause_date', today),
    supabase.from('cases').select('*').eq('organization_id', orgId).eq('active', true),
  ]);

  if (causeListData.error) throw new Error(causeListData.error.message);
  if (casesData.error) throw new Error(casesData.error.message);

  const causeListItems = causeListData.data ?? [];
  const activeCases = casesData.data ?? [];

  const { data: existingMatches } = await supabase
    .from('cause_list_matches')
    .select('case_id, cause_list_id')
    .eq('organization_id', orgId)
    .eq('matched_on', today);

  const matchedKeys = new Set(
    (existingMatches ?? []).map(m => `${m.case_id}__${m.cause_list_id}`)
  );

  const newMatches: {
    organization_id: string;
    case_id: string;
    cause_list_id: string;
    match_type: string;
    match_confidence: number;
    matched_on: string;
    alert_required: boolean;
  }[] = [];

  for (const cl of causeListItems) {
    for (const c of activeCases) {
      const key = `${c.id}__${cl.id}`;
      if (matchedKeys.has(key)) continue;

      let matchType: string | null = null;
      let confidence = 0;

      if (c.cnr_number && cl.cnr_number && c.cnr_number === cl.cnr_number) {
        matchType = 'cnr';
        confidence = 100;
      } else if (c.case_number && cl.case_number && c.case_number === cl.case_number) {
        matchType = 'case_number';
        confidence = 98;
      }

      if (matchType) {
        matchedKeys.add(key);
        newMatches.push({
          organization_id: orgId,
          case_id: c.id,
          cause_list_id: cl.id,
          match_type: matchType,
          match_confidence: confidence,
          matched_on: today,
          alert_required: true,
        });
      }
    }
  }

  if (newMatches.length > 0) {
    const { error } = await supabase
      .from('cause_list_matches')
      .upsert(newMatches, { onConflict: 'organization_id,case_id,cause_list_id' });
    if (error) throw new Error(error.message);
  }

  return newMatches.length;
}
