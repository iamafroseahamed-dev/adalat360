import { searchCauseList, getAvailableCauseListDates, isLiveMode } from './ecourtsService';
import { upsertCauseListRecords, runMatchingForOrg } from './causeListService';
import { generateNotificationsForMatches } from './notificationService';

export interface SyncResult {
  date: string;
  causeListLoaded: number;
  matchesFound: number;
  notificationsGenerated: number;
  liveMode: boolean;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function runDailySync(orgId: string): Promise<SyncResult> {
  const today = new Date().toISOString().split('T')[0];

  const availableDates = await withRetry(() => getAvailableCauseListDates('TN'));
  const syncDate = availableDates.includes(today) ? today : availableDates[0] ?? today;

  const causeListItems = await withRetry(() => searchCauseList({ state: 'TN', date: syncDate }));

  let causeListLoaded = 0;

  if (isLiveMode()) {
    const records = causeListItems.map(item => ({
      cause_date: item.cause_date,
      court_name: item.court_name,
      bench: item.bench,
      court_no: item.court_no,
      judge_name: item.judge_name,
      item_number: item.item_number,
      case_number: item.case_number,
      cnr_number: item.cnr_number,
      petitioner: item.petitioner,
      respondent: item.respondent,
      status: item.status,
      raw_response: item.raw_response ?? undefined,
    }));
    causeListLoaded = await upsertCauseListRecords(records);
  } else {
    causeListLoaded = causeListItems.length;
  }

  const matchesFound = await runMatchingForOrg(orgId, syncDate);

  const { generated: notificationsGenerated } = await generateNotificationsForMatches(orgId);

  return {
    date: syncDate,
    causeListLoaded,
    matchesFound,
    notificationsGenerated,
    liveMode: isLiveMode(),
  };
}
