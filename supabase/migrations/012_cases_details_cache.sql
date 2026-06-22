-- Store eCourtsIndia API response cache on the cases table.
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS case_details_json jsonb,
  ADD COLUMN IF NOT EXISTS case_details_last_fetched timestamptz,
  ADD COLUMN IF NOT EXISTS cnr_discovered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cases_case_details_last_fetched
  ON public.cases (case_details_last_fetched DESC);
