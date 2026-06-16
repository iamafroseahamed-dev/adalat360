import type { Notification, NotificationType, NotificationStatus } from '@/types';
import { fetchMatches } from './mockCauseListService';
import { generateId } from '@/lib/utils';
import { ORGANIZATIONS } from '@/data/sampleData';

const notificationStore: Map<string, Notification[]> = new Map();

export async function fetchNotifications(orgId: string): Promise<Notification[]> {
  await new Promise(r => setTimeout(r, 300));
  return notificationStore.get(orgId) ?? [];
}

export async function generateNotificationsForMatches(orgId: string): Promise<{
  generated: number;
  details: Notification[];
}> {
  await new Promise(r => setTimeout(r, 800));

  const matches = await fetchMatches(orgId);
  const today = new Date().toISOString().split('T')[0];
  const existing = notificationStore.get(orgId) ?? [];

  const notifiedKeys = new Set(
    existing
      .filter(n => n.created_at.startsWith(today))
      .map(n => `${n.cause_list_match_id}__${n.notification_type}`)
  );

  const org = ORGANIZATIONS.find(o => o.id === orgId);
  const orgName = org?.organization_name ?? 'Legal Solutions';
  const newNotifications: Notification[] = [];

  const types: NotificationType[] = ['whatsapp', 'sms', 'email'];
  const statusCycle: NotificationStatus[] = ['sent', 'sent', 'sent', 'pending', 'failed'];

  let statusIdx = 0;
  for (const match of matches.filter(m => m.matched_on === today)) {
    const c = match.case!;
    const cl = match.cause_list!;

    for (const type of types) {
      const key = `${match.id}__${type}`;
      if (notifiedKeys.has(key)) continue;
      notifiedKeys.add(key);

      const status = statusCycle[statusIdx % statusCycle.length];
      statusIdx++;

      const recipient = type === 'email' ? c.client_email
        : type === 'whatsapp' ? c.client_whatsapp
        : c.client_mobile;

      const message = buildNotificationMessage(orgName, c.client_name ?? '', c.case_number, c.court_name ?? '', c.bench ?? '', cl.judge_name ?? '', cl.court_no ?? '', String(cl.item_number ?? ''), cl.cause_date, c.advocate_name ?? '', orgName);

      newNotifications.push({
        id: `notif-${generateId()}`,
        organization_id: orgId,
        case_id: c.id,
        cause_list_match_id: match.id,
        notification_type: type,
        recipient,
        message,
        sent_time: status === 'sent' ? new Date().toISOString() : undefined,
        status,
        response: status === 'sent' ? 'Delivered' : status === 'failed' ? 'Connection timeout' : undefined,
        retry_count: status === 'failed' ? 1 : 0,
        created_at: new Date().toISOString(),
        case: c,
      });
    }
  }

  notificationStore.set(orgId, [...existing, ...newNotifications]);
  return { generated: newNotifications.length, details: newNotifications };
}

function buildNotificationMessage(
  orgName: string, clientName: string, caseNo: string,
  court: string, bench: string, judge: string, courtHall: string,
  listingNo: string, hearingDate: string, advocate: string, footer: string,
): string {
  return `${orgName}\n\nDear ${clientName},\n\nYour case has been listed today.\n\nCase No: ${caseNo}\nCourt: ${court}\nBench: ${bench}\nJudge: ${judge}\nCourt Hall: ${courtHall}\nSerial No: ${listingNo}\nDate: ${hearingDate}\nAdvocate: ${advocate}\n\nPlease contact our office for further instructions.\n\n${footer}`;
}

