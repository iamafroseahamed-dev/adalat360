-- Cache parsed eCourts case-details payload per listing row.
ALTER TABLE public.today_matched_listings
  ADD COLUMN IF NOT EXISTS case_details_json jsonb,
  ADD COLUMN IF NOT EXISTS case_details_last_fetched timestamptz;

CREATE INDEX IF NOT EXISTS idx_tml_case_details_last_fetched
  ON public.today_matched_listings (case_details_last_fetched DESC);
