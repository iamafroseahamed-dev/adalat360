/**
 * Mock eCourts Service
 *
 * PLACEHOLDER — Real eCourts API integration is pending credentials.
 * When credentials are available, replace this service with actual API calls:
 *   GET /api/partner/causelist/search?date=today&state=TN&court=...&bench=...
 *
 * Expected response fields: Case Number, CNR Number, Court Name, Bench,
 * Judge Name, Court Number, Listing Number, Status
 */

import type { CauseList } from '@/types';
import { SAMPLE_CAUSE_LISTS } from '@/data/sampleData';

export interface EcourtsConfig {
  baseUrl: string;      // e.g. https://api.ecourts.gov.in
  apiKey: string;       // eCourts partner API key
  state: string;        // e.g. TN
  court: string;        // e.g. Madras High Court
  bench: string;        // e.g. Chennai / Madurai
}

export interface EcourtsSearchParams {
  date: string;         // YYYY-MM-DD
  state: string;
  court: string;
  bench: string;
}

const DEMO_MODE = true; // Set to false when real credentials are configured

/**
 * Fetch today's cause list from eCourts API (demo: returns sample data)
 */
export async function fetchCauseListFromEcourts(
  _params: EcourtsSearchParams,
  _config?: EcourtsConfig,
): Promise<{ data: CauseList[]; isDemo: boolean }> {
  if (DEMO_MODE) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1200));
    return { data: SAMPLE_CAUSE_LISTS, isDemo: true };
  }

  // ── Real API call (uncomment when credentials ready) ──
  // const response = await fetch(
  //   `${config!.baseUrl}/api/partner/causelist/search?date=${params.date}&state=${params.state}&court=${params.court}&bench=${params.bench}`,
  //   { headers: { 'x-api-key': config!.apiKey, 'Content-Type': 'application/json' } }
  // );
  // if (!response.ok) throw new Error(`eCourts API error: ${response.status}`);
  // const json = await response.json();
  // return { data: mapEcourtsResponse(json), isDemo: false };

  throw new Error('eCourts API not configured. Please add credentials in Settings.');
}

/**
 * Validate eCourts API credentials (demo: always returns success)
 */
export async function validateEcourtsCredentials(
  _config: EcourtsConfig,
): Promise<{ valid: boolean; message: string }> {
  await new Promise(resolve => setTimeout(resolve, 800));
  if (DEMO_MODE) {
    return { valid: true, message: 'Demo mode — credentials not validated against real API.' };
  }
  return { valid: false, message: 'Real validation not implemented yet.' };
}

export const ECOURTS_DEMO_NOTE =
  'eCourts API integration is currently in demo mode. Real credentials can be configured in Settings.';
