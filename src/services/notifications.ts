import * as real from './notificationService';
import * as mock from './mockNotificationService';
import type { Notification } from '@/types';

export async function fetchNotifications(orgId: string, demo: boolean): Promise<Notification[]> {
  return demo ? mock.fetchNotifications(orgId) : real.fetchNotifications(orgId);
}

export async function generateNotificationsForMatches(
  orgId: string,
  demo: boolean,
): Promise<{ generated: number }> {
  return demo
    ? mock.generateNotificationsForMatches(orgId)
    : real.generateNotificationsForMatches(orgId);
}
