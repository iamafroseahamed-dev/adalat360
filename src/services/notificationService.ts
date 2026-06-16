import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types';

export async function fetchNotifications(orgId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(`*, case:cases(case_number, client_name, advocate_name)`)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function generateNotificationsForMatches(orgId: string): Promise<{
  generated: number;
}> {
  const today = new Date().toISOString().split('T')[0];

  const { data: matches, error: matchError } = await supabase
    .from('cause_list_matches')
    .select(`*, case:cases(*)`)
    .eq('organization_id', orgId)
    .eq('matched_on', today)
    .eq('alert_required', true);

  if (matchError) throw new Error(matchError.message);

  const { data: existingNotifs } = await supabase
    .from('notifications')
    .select('cause_list_match_id')
    .eq('organization_id', orgId);

  const notifiedMatchIds = new Set((existingNotifs ?? []).map(n => n.cause_list_match_id));

  const toInsert: {
    organization_id: string;
    case_id: string;
    cause_list_match_id: string;
    notification_type: string;
    recipient: string;
    message: string;
    status: string;
  }[] = [];

  for (const match of matches ?? []) {
    if (notifiedMatchIds.has(match.id)) continue;
    const c = match.case;
    if (!c) continue;

    const msg = `Your case ${c.case_number} has been listed today. Please attend court on time.`;

    if (c.client_whatsapp) {
      toInsert.push({
        organization_id: orgId,
        case_id: c.id,
        cause_list_match_id: match.id,
        notification_type: 'whatsapp',
        recipient: c.client_whatsapp,
        message: msg,
        status: 'pending',
      });
    }
    if (c.client_mobile) {
      toInsert.push({
        organization_id: orgId,
        case_id: c.id,
        cause_list_match_id: match.id,
        notification_type: 'sms',
        recipient: c.client_mobile,
        message: msg,
        status: 'pending',
      });
    }
    if (c.client_email) {
      toInsert.push({
        organization_id: orgId,
        case_id: c.id,
        cause_list_match_id: match.id,
        notification_type: 'email',
        recipient: c.client_email,
        message: msg,
        status: 'pending',
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('notifications').insert(toInsert);
    if (error) throw new Error(error.message);
  }

  return { generated: toInsert.length };
}
