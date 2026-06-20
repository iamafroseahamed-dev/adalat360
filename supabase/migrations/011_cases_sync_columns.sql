-- ── Add eCourts sync tracking column to cases ─────────────────────────────────
-- Stores when the cases master record was last updated from eCourts data.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS ecourts_last_synced_at timestamptz;
