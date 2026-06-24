-- Migration 016: Permanent order cache + model column for case_ai_analysis
--
-- Adds storage for parsed court orders (judgment / interim) so they are
-- downloaded and parsed only once, then cached permanently and reused by the
-- AI analysis. Also records which model produced the cached analysis.

ALTER TABLE public.case_ai_analysis
  ADD COLUMN IF NOT EXISTS parsed_orders jsonb NULL;

ALTER TABLE public.case_ai_analysis
  ADD COLUMN IF NOT EXISTS parsed_orders_at timestamptz NULL;

ALTER TABLE public.case_ai_analysis
  ADD COLUMN IF NOT EXISTS model text NULL;
