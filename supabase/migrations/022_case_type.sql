-- ============================================================================
-- 022_case_type.sql
--
-- Adds a derived "Case Type" classification to cases, populated automatically
-- from the case number's leading token for EVERY write path (bulk upload,
-- manual creation and eCourts sync) via a BEFORE trigger, while still allowing
-- a manual override (an explicitly supplied case_type is never overwritten).
--
--   "WA/2356/2026"     → "Writ Appeal"
--   "CRL OP/12/2025"   → "Criminal Original Petition"
--   "WP(MD)/9/2026"    → "Writ Petition"
--
-- Run in the Supabase SQL editor.
-- ============================================================================

-- 1. Column ------------------------------------------------------------------
alter table public.cases add column if not exists case_type text;

-- 2. Derivation function (mirrors src/lib/caseType.ts & backend _normalize_case_type)
create or replace function public.derive_case_type(p_case_number text)
returns text
language plpgsql
immutable
as $$
declare
  head text;
  norm text;
begin
  if p_case_number is null or btrim(p_case_number) = '' then
    return null;
  end if;

  -- Leading token (before first "/"), then drop everything from the first digit.
  head := split_part(p_case_number, '/', 1);
  head := regexp_replace(head, '[0-9].*$', '');

  -- Canonicalise: upper-case, drop (bench codes), strip separators, trailing NO.
  norm := upper(btrim(head));
  norm := regexp_replace(norm, '\([^)]*\)', '', 'g');
  norm := regexp_replace(norm, '[.[:space:]_-]', '', 'g');
  norm := regexp_replace(norm, 'NO$', '');
  norm := btrim(norm);

  if norm = '' then
    return null;
  end if;

  return case norm
    when 'WP'      then 'Writ Petition'
    when 'WPCRL'   then 'Writ Petition (Criminal)'
    when 'WA'      then 'Writ Appeal'
    when 'WMP'     then 'Writ Miscellaneous Petition'
    when 'WPMP'    then 'Writ Petition Miscellaneous Petition'
    when 'WAMP'    then 'Writ Appeal Miscellaneous Petition'
    when 'WVMP'    then 'Writ Vacate Miscellaneous Petition'
    when 'PIL'     then 'Public Interest Litigation'
    when 'CMA'     then 'Civil Miscellaneous Appeal'
    when 'CMSA'    then 'Civil Miscellaneous Second Appeal'
    when 'CMP'     then 'Civil Miscellaneous Petition'
    when 'CRP'     then 'Civil Revision Petition'
    when 'CS'      then 'Civil Suit'
    when 'OS'      then 'Original Suit'
    when 'AS'      then 'Appeal Suit'
    when 'SA'      then 'Second Appeal'
    when 'FA'      then 'First Appeal'
    when 'RFA'     then 'Regular First Appeal'
    when 'RSA'     then 'Regular Second Appeal'
    when 'LPA'     then 'Letters Patent Appeal'
    when 'OSA'     then 'Original Side Appeal'
    when 'OP'      then 'Original Petition'
    when 'OA'      then 'Original Application'
    when 'IA'      then 'Interlocutory Application'
    when 'EP'      then 'Election Petition'
    when 'RC'      then 'Revision Case'
    when 'MC'      then 'Miscellaneous Case'
    when 'MP'      then 'Miscellaneous Petition'
    when 'CRLOP'   then 'Criminal Original Petition'
    when 'CRLMP'   then 'Criminal Miscellaneous Petition'
    when 'CRLMC'   then 'Criminal Miscellaneous Case'
    when 'CRLA'    then 'Criminal Appeal'
    when 'CRLRC'   then 'Criminal Revision Case'
    when 'CRLRP'   then 'Criminal Revision Petition'
    when 'CRLREF'  then 'Criminal Reference'
    when 'CC'      then 'Criminal Complaint'
    when 'BA'      then 'Bail Application'
    when 'ABA'     then 'Anticipatory Bail Application'
    when 'HCP'     then 'Habeas Corpus Petition'
    when 'HCMP'    then 'Habeas Corpus Miscellaneous Petition'
    when 'CONTP'   then 'Contempt Petition'
    when 'CONTA'   then 'Contempt Appeal'
    when 'TC'      then 'Tax Case'
    when 'TCA'     then 'Tax Case Appeal'
    when 'TCP'     then 'Tax Case Petition'
    when 'TCR'     then 'Tax Case Reference'
    else norm
  end;
end;
$$;

-- 3. Backfill existing rows --------------------------------------------------
update public.cases
   set case_type = public.derive_case_type(case_number)
 where case_type is null or btrim(case_type) = '';

-- 4. Auto-populate trigger (respects a manual override) ----------------------
create or replace function public.cases_set_case_type()
returns trigger
language plpgsql
as $$
begin
  if new.case_type is null or btrim(new.case_type) = '' then
    new.case_type := public.derive_case_type(new.case_number);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cases_set_case_type on public.cases;
create trigger trg_cases_set_case_type
  before insert or update of case_number, case_type on public.cases
  for each row execute function public.cases_set_case_type();

-- 5. Optional index for case-type filtering / grouping -----------------------
create index if not exists idx_cases_case_type on public.cases (case_type);
