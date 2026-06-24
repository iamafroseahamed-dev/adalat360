-- ═══════════════════════════════════════════════════════════════════════════════
--  Advocate Activity Status Tracking
--  Court Status (cases.case_status)  = external court progress (eCourts / MHC)
--  Advocate Status (cases.advocate_status) = internal CLA / advocate progress
--  case_status_history                = audit trail of every advocate-status change
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Internal advocate-activity status on the case master record.
alter table public.cases
  add column if not exists advocate_status text;

-- 2. Audit trail / timeline for advocate-status changes.
create table if not exists public.case_status_history (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete cascade,
  old_status  text,
  new_status  text,
  remarks     text,
  changed_by  text,
  changed_at  timestamptz default now()
);

create index if not exists case_status_history_case_idx
  on public.case_status_history(case_id);
create index if not exists case_status_history_changed_at_idx
  on public.case_status_history(changed_at desc);

-- Helps the dashboard advocate-status aggregations.
create index if not exists cases_advocate_status_idx
  on public.cases(advocate_status);

-- RLS ─────────────────────────────────────────────────────────────────────────
-- PERMISSIVE policies because the app uses a localStorage session fallback, so
-- queries may run as the anon role (same pattern as case_management / connected_cases).
alter table public.case_status_history enable row level security;

drop policy if exists case_status_history_all on public.case_status_history;
create policy case_status_history_all on public.case_status_history
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.case_status_history to anon, authenticated;
