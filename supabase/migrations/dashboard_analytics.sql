-- ─────────────────────────────────────────────────────────────────────────────
-- Litigation Dashboard — server-side SQL aggregations (RPC functions)
--
-- All dashboard counts, charts and aggregations are computed inside Postgres and
-- only summarized datasets are returned to the client. Functions run with the
-- caller's privileges (SECURITY INVOKER), so existing Row Level Security on the
-- `cases` / `today_matched_listings` tables still applies (org scoping, etc.).
--
-- Date columns are compared as text against ISO 'YYYY-MM-DD' boundaries so the
-- functions work whether next_hearing_date / listed_date are stored as `date`
-- or `text`.
-- ─────────────────────────────────────────────────────────────────────────────

-- KPI summary (Row 1 cards) ───────────────────────────────────────────────────
create or replace function public.dashboard_kpis()
returns json
language sql
stable
as $$
  select json_build_object(
    'total_cases',           (select count(*) from public.cases),
    'pending_cases',         (select count(*) from public.cases where case_status = 'Pending'),
    'disposed_cases',        (select count(*) from public.cases where case_status = 'Disposed'),
    'cases_listed_today',    (select count(*) from public.today_matched_listings
                                where listed_date::text = to_char(current_date, 'YYYY-MM-DD')),
    'hearings_within_7_days',(select count(*) from public.cases
                                where next_hearing_date is not null
                                  and next_hearing_date::text >= to_char(current_date, 'YYYY-MM-DD')
                                  and next_hearing_date::text <= to_char(current_date + 7, 'YYYY-MM-DD')),
    'hearings_today',        (select count(*) from public.cases
                                where next_hearing_date::text = to_char(current_date, 'YYYY-MM-DD'))
  );
$$;

-- Cases by court (vertical bar chart) ─────────────────────────────────────────
create or replace function public.cases_by_court()
returns table(label text, value bigint)
language sql
stable
as $$
  select coalesce(nullif(trim(court_name), ''), 'Unknown') as label, count(*) as value
  from public.cases
  group by 1
  order by value desc;
$$;

-- Case status breakdown (donut chart) ─────────────────────────────────────────
create or replace function public.case_status_breakdown()
returns table(label text, value bigint)
language sql
stable
as $$
  select coalesce(nullif(trim(case_status), ''), 'Unknown') as label, count(*) as value
  from public.cases
  group by 1
  order by value desc;
$$;

-- Cases by district (top 10, horizontal bar) ──────────────────────────────────
create or replace function public.cases_by_district()
returns table(label text, value bigint)
language sql
stable
as $$
  select coalesce(nullif(trim(district), ''), 'Unknown') as label, count(*) as value
  from public.cases
  group by 1
  order by value desc
  limit 10;
$$;

-- Cases by section (top 10, horizontal bar) ───────────────────────────────────
create or replace function public.cases_by_section()
returns table(label text, value bigint)
language sql
stable
as $$
  select coalesce(nullif(trim(section), ''), 'Unknown') as label, count(*) as value
  from public.cases
  group by 1
  order by value desc
  limit 10;
$$;

-- Disposal outcomes (disposed cases only) ─────────────────────────────────────
create or replace function public.disposal_outcomes()
returns table(label text, value bigint)
language sql
stable
as $$
  select coalesce(nullif(trim(nature_of_disposal), ''), 'Unspecified') as label, count(*) as value
  from public.cases
  where case_status = 'Disposed'
  group by 1
  order by value desc;
$$;

-- Hearings per day, from today onwards (calendar widget) ──────────────────────
create or replace function public.hearings_by_date()
returns table(hearing_date text, value bigint)
language sql
stable
as $$
  select next_hearing_date::text as hearing_date, count(*) as value
  from public.cases
  where next_hearing_date is not null
    and next_hearing_date::text >= to_char(current_date, 'YYYY-MM-DD')
  group by 1
  order by 1 asc;
$$;

-- Allow the API roles to execute the aggregation functions
grant execute on function
  public.dashboard_kpis(),
  public.cases_by_court(),
  public.case_status_breakdown(),
  public.cases_by_district(),
  public.cases_by_section(),
  public.disposal_outcomes(),
  public.hearings_by_date()
to anon, authenticated;
