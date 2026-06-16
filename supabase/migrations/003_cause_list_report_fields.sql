-- ============================================================
-- Litigo — Migration 003: Cause List Report Fields
-- Adds section, district to cause_lists
-- Adds prayer, hearing, counsel enrichment to cause_list_matches
-- ============================================================

-- Add court-metadata fields to cause_lists
ALTER TABLE cause_lists ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE cause_lists ADD COLUMN IF NOT EXISTS district TEXT;

-- Add case-detail enrichment fields to cause_list_matches
-- Populated when eCourts case detail API is called after matching
ALTER TABLE cause_list_matches ADD COLUMN IF NOT EXISTS prayer TEXT;
ALTER TABLE cause_list_matches ADD COLUMN IF NOT EXISTS last_hearing TEXT;
ALTER TABLE cause_list_matches ADD COLUMN IF NOT EXISTS posted_stage TEXT;
ALTER TABLE cause_list_matches ADD COLUMN IF NOT EXISTS counsel_name TEXT;
ALTER TABLE cause_list_matches ADD COLUMN IF NOT EXISTS raw_case_detail_response JSONB;

-- Index for prayer search (useful for filtering)
CREATE INDEX IF NOT EXISTS idx_matches_counsel ON cause_list_matches(counsel_name) WHERE counsel_name IS NOT NULL;

-- Update seed cause list records with sample section/district data for demo
UPDATE cause_lists SET
  section = CASE
    WHEN case_number LIKE 'WP/%' THEN 'Writ Petitions'
    WHEN case_number LIKE 'OSA/%' THEN 'Original Side Appeals'
    WHEN case_number LIKE 'CMA/%' THEN 'Civil Misc. Appeals'
    WHEN case_number LIKE 'CS/%' THEN 'Civil Suits'
    WHEN case_number LIKE 'AS/%' THEN 'Appeal Suits'
    ELSE 'General'
  END,
  district = CASE
    WHEN court_name LIKE '%Madurai%' OR bench = 'Madurai' THEN 'Madurai'
    WHEN bench = 'Chennai' OR bench IS NULL THEN 'Chennai'
    ELSE bench
  END
WHERE section IS NULL;
