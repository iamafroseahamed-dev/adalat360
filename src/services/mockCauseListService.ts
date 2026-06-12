/**
 * Mock Cause List Service
 *
 * Handles cause list fetching, storage, and matching logic.
 * Replace fetchCauseList with real eCourts API call when credentials are ready.
 */

import type { CauseList, CauseListMatch } from '@/types';
import { SAMPLE_CAUSE_LISTS } from '@/data/sampleData';
import { fetchCases } from './mockCaseService';
import { generateId } from '@/lib/utils';

// In-memory cause list store
let causeListStore: CauseList[] = [...SAMPLE_CAUSE_LISTS];

// Per-org match store
const matchStore: Map<string, CauseListMatch[]> = new Map();

export async function fetchCauseList(): Promise<CauseList[]> {
  await new Promise(r => setTimeout(r, 400));
  return causeListStore;
}

export async function fetchMatches(orgId: string): Promise<CauseListMatch[]> {
  await new Promise(r => setTimeout(r, 300));
  return matchStore.get(orgId) ?? [];
}

/**
 * Run daily cause list sync:
 * 1. Load sample cause list data
 * 2. Match against org's active cases
 * 3. Store match records (prevent duplicates)
 * 4. Return summary
 */
export async function runDailySync(orgId: string): Promise<{
  causeListLoaded: number;
  matchesFound: number;
}> {
  await new Promise(r => setTimeout(r, 1500));

  const today = new Date().toISOString().split('T')[0];
  const cases = await fetchCases(orgId);
  const activeCases = cases.filter(c => c.active);

  const existingMatches = matchStore.get(orgId) ?? [];

  // Prevent duplicate matches for same case + same date
  const matchedKeys = new Set(
    existingMatches
      .filter(m => m.matched_on === today)
      .map(m => `${m.case_id}__${m.cause_list_id}`)
  );

  const newMatches: CauseListMatch[] = [];

  for (const cl of causeListStore) {
    if (cl.cause_date !== today) continue;

    for (const c of activeCases) {
      let matchType: CauseListMatch['match_type'] | null = null;
      let confidence = 0;

      // Priority 1: Exact CNR match
      if (c.cnr_number && cl.cnr_number && c.cnr_number === cl.cnr_number) {
        matchType = 'cnr';
        confidence = 100;
      }
      // Priority 2: Exact Case Number match
      else if (c.case_number && cl.case_number && c.case_number === cl.case_number) {
        matchType = 'case_number';
        confidence = 98;
      }
      // Priority 3: Petitioner/Respondent fuzzy match
      else if (
        c.petitioner && cl.case_number &&
        c.petitioner.toLowerCase().includes(cl.case_number.split('/')[0]?.toLowerCase() ?? '')
      ) {
        matchType = 'fuzzy';
        confidence = 75;
      }

      if (matchType) {
        const key = `${c.id}__${cl.id}`;
        if (!matchedKeys.has(key)) {
          matchedKeys.add(key);
          newMatches.push({
            id: `match-${generateId()}`,
            organization_id: orgId,
            case_id: c.id,
            cause_list_id: cl.id,
            match_type: matchType,
            match_confidence: confidence,
            matched_on: today,
            alert_required: true,
            created_at: new Date().toISOString(),
            case: c,
            cause_list: cl,
          });
        }
      }
    }
  }

  matchStore.set(orgId, [...existingMatches, ...newMatches]);

  return {
    causeListLoaded: causeListStore.filter(cl => cl.cause_date === today).length,
    matchesFound: newMatches.length,
  };
}

export function resetCauseListStore() {
  matchStore.clear();
  causeListStore = [...SAMPLE_CAUSE_LISTS];
}
