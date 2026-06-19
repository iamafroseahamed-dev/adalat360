-- ── Performance indexes ───────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor once.
-- These indexes are critical for fast case matching in Today's Listings.

-- cases table
CREATE INDEX IF NOT EXISTS idx_cases_organization_id
  ON public.cases (organization_id);

CREATE INDEX IF NOT EXISTS idx_cases_case_number
  ON public.cases (case_number);

CREATE INDEX IF NOT EXISTS idx_cases_cnr_number
  ON public.cases (cnr_number)
  WHERE cnr_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_active
  ON public.cases (active, next_hearing_date);

-- daily_cause_list table
CREATE INDEX IF NOT EXISTS idx_dcl_cause_date
  ON public.daily_cause_list (cause_date DESC, court_name, bench);

CREATE INDEX IF NOT EXISTS idx_dcl_case_number
  ON public.daily_cause_list (case_number);

CREATE INDEX IF NOT EXISTS idx_dcl_cnr_number
  ON public.daily_cause_list (cnr_number)
  WHERE cnr_number IS NOT NULL;

-- notification_logs table
CREATE INDEX IF NOT EXISTS idx_notif_logs_case_id
  ON public.notification_logs (case_id);

CREATE INDEX IF NOT EXISTS idx_notif_logs_created_at
  ON public.notification_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_logs_cause_date
  ON public.notification_logs (cause_date)
  WHERE cause_date IS NOT NULL;

-- case_notification_recipients table
CREATE INDEX IF NOT EXISTS idx_notif_recipients_case_id
  ON public.case_notification_recipients (case_id, active);
