-- ── Fix RLS on system_notification_recipients ────────────────────────────────
-- The previous policy lacked WITH CHECK (true) which caused INSERT to fail
-- for authenticated users via the frontend Supabase client.

DROP POLICY IF EXISTS "authenticated_system_notification_recipients"
  ON public.system_notification_recipients;

CREATE POLICY "authenticated_system_notification_recipients"
  ON public.system_notification_recipients
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also fix notification_delivery_logs in case it was missed
DROP POLICY IF EXISTS "authenticated_notification_delivery_logs"
  ON public.notification_delivery_logs;

CREATE POLICY "authenticated_notification_delivery_logs"
  ON public.notification_delivery_logs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
