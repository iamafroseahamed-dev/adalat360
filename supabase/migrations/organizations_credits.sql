-- ════════════════════════════════════════════════════════════════════════════
--  Multi-Organization Architecture + eCourts Credit Tracking
--  Run this in the Supabase SQL editor. Idempotent (safe to re-run).
--  PERMISSIVE RLS + grants to match the app's anon/localStorage session model.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Organization master ────────────────────────────────────────────────────────
create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    organization_name text not null,
    short_name text,
    contact_person text,
    contact_email text,
    contact_mobile text,
    plan_name text default 'Trial',
    trial_credits numeric default 100,
    available_credits numeric default 100,
    active boolean default true,
    created_at timestamptz default now()
);

-- Each case belongs to one organization (nullable so existing rows are unaffected).
alter table public.cases
    add column if not exists organization_id uuid references public.organizations(id);
create index if not exists cases_organization_idx on public.cases(organization_id);

-- ── eCourts paid-API usage audit trail ─────────────────────────────────────────
create table if not exists public.ecourts_api_usage (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id),
    case_id uuid,
    endpoint_name text,
    credits_used numeric,
    request_id text,
    cnr_number text,
    created_at timestamptz default now()
);
create index if not exists ecourts_usage_org_idx on public.ecourts_api_usage(organization_id);
create index if not exists ecourts_usage_created_idx on public.ecourts_api_usage(created_at desc);
create index if not exists ecourts_usage_endpoint_idx on public.ecourts_api_usage(endpoint_name);

-- ── eCourts pricing per endpoint ───────────────────────────────────────────────
create table if not exists public.ecourts_api_pricing (
    endpoint_name text primary key,
    credits_per_call numeric,
    amount_per_call numeric
);

insert into public.ecourts_api_pricing (endpoint_name, credits_per_call, amount_per_call) values
    ('CASE_DETAIL',   1, 0.50),
    ('CASE_SEARCH',   1, 0.20),
    ('ORDER_PDF',     1, 1.25),
    ('ORDER_PDF_AI',  1, 2.50),
    ('CAUSE_LIST',    1, 1.00),
    ('ORDER_PDF_MD',  1, 1.75),
    ('CASE_REFRESH',  1, 0.05)
on conflict (endpoint_name) do update
    set credits_per_call = excluded.credits_per_call,
        amount_per_call  = excluded.amount_per_call;

-- ── Atomic usage recording + credit deduction ──────────────────────────────────
-- Inserts an audit row and decrements the organization's available_credits by the
-- endpoint's credits_per_call in a single statement. Returns remaining credits.
create or replace function public.record_ecourts_usage(
    p_org uuid,
    p_case uuid,
    p_endpoint text,
    p_request_id text,
    p_cnr text
) returns numeric
language plpgsql
as $$
declare
    v_credits numeric;
    v_remaining numeric;
begin
    select coalesce(credits_per_call, 1) into v_credits
    from public.ecourts_api_pricing where endpoint_name = p_endpoint;
    if v_credits is null then v_credits := 1; end if;

    insert into public.ecourts_api_usage (organization_id, case_id, endpoint_name, credits_used, request_id, cnr_number)
    values (p_org, p_case, p_endpoint, v_credits, p_request_id, p_cnr);

    if p_org is not null then
        update public.organizations
            set available_credits = coalesce(available_credits, 0) - v_credits
            where id = p_org
            returning available_credits into v_remaining;
    end if;

    return v_remaining;
end;
$$;

-- ── RLS (permissive — app runs queries as anon via localStorage session) ────────
alter table public.organizations       enable row level security;
alter table public.ecourts_api_usage    enable row level security;
alter table public.ecourts_api_pricing  enable row level security;

drop policy if exists organizations_all      on public.organizations;
drop policy if exists ecourts_api_usage_all   on public.ecourts_api_usage;
drop policy if exists ecourts_api_pricing_all on public.ecourts_api_pricing;

create policy organizations_all      on public.organizations      for all to anon, authenticated using (true) with check (true);
create policy ecourts_api_usage_all   on public.ecourts_api_usage   for all to anon, authenticated using (true) with check (true);
create policy ecourts_api_pricing_all on public.ecourts_api_pricing for all to anon, authenticated using (true) with check (true);

grant all on public.organizations       to anon, authenticated;
grant all on public.ecourts_api_usage    to anon, authenticated;
grant all on public.ecourts_api_pricing  to anon, authenticated;
grant execute on function public.record_ecourts_usage(uuid, uuid, text, text, text) to anon, authenticated;

-- ── Seed example organizations (only when the table is empty) ───────────────────
insert into public.organizations (organization_name, short_name, plan_name, trial_credits, available_credits)
select * from (values
    ('Commissioner of Land Administration', 'CLA',        'Trial', 100, 100),
    ('Revenue Department',                  'Revenue',    'Trial', 100, 100),
    ('Transport Department',                'Transport',  'Trial', 100, 100),
    ('Police Department',                   'Police',     'Trial', 100, 100),
    ('School Education Department',         'Education',  'Trial', 100, 100)
) as seed(organization_name, short_name, plan_name, trial_credits, available_credits)
where not exists (select 1 from public.organizations);
