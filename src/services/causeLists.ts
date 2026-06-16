import * as real from './causeListService';
import * as mock from './mockCauseListService';
import type { CauseList, CauseListMatch } from '@/types';

export async function fetchCauseList(
  demo: boolean,
  filters?: { date?: string; court?: string; judge?: string; bench?: string },
): Promise<CauseList[]> {
  return demo ? mock.fetchCauseList() : real.fetchCauseList(filters);
}

export async function fetchMatches(orgId: string, demo: boolean): Promise<CauseListMatch[]> {
  return demo ? mock.fetchMatches(orgId) : real.fetchMatches(orgId);
}

export async function fetchTodayMatches(orgId: string, demo: boolean): Promise<CauseListMatch[]> {
  return demo ? mock.fetchMatches(orgId) : real.fetchTodayMatches(orgId);
}

export async function runDailySync(
  orgId: string,
  demo: boolean,
): Promise<{ date: string; causeListLoaded: number; matchesFound: number; notificationsGenerated: number; liveMode: boolean }> {
  if (demo) {
    const r = await mock.runDailySync(orgId);
    return { date: new Date().toISOString().split('T')[0], causeListLoaded: r.causeListLoaded, matchesFound: r.matchesFound, notificationsGenerated: 0, liveMode: false };
  }
  const { runDailySync: realSync } = await import('./syncService');
  return realSync(orgId);
}
