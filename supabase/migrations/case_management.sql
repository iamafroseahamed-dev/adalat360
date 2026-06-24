-- ─────────────────────────────────────────────────────────────────────────────
-- Litigo — Case Assignment & Task Management module
--
--   1. Case assignment columns on `cases`
--   2. `case_notes`  — per-case notes timeline
--   3. `case_tasks`  — per-case task tracker
--
-- New tables get permissive RLS policies (internal tool; mirrors how the rest of
-- the app reads/writes under the anon/authenticated roles).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Case assignment ──────────────────────────────────────────────────────────
alter table public.cases
  add column if not exists assigned_advocate_name   text,
  add column if not exists assigned_advocate_email  text,
  add column if not exists assigned_advocate_mobile text,
  add column if not exists assigned_on              timestamptz;

-- 2. Case notes ───────────────────────────────────────────────────────────────
create table if not exists public.case_notes (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  note_text  text not null,
  created_by text,
  created_at timestamptz default now()
);

create index if not exists case_notes_case_id_idx    on public.case_notes(case_id);
create index if not exists case_notes_created_at_idx on public.case_notes(created_at desc);

-- 3. Case tasks ───────────────────────────────────────────────────────────────
create table if not exists public.case_tasks (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references public.cases(id) on delete cascade,
  task_title        text not null,
  task_description  text,
  assigned_to_name  text,
  assigned_to_email text,
  assigned_to_mobile text,
  due_date          date,
  task_status       text default 'Open',     -- Open | In Progress | Waiting | Completed | Cancelled
  priority          text default 'Medium',   -- Low | Medium | High | Critical
  created_by        text,
  created_at        timestamptz default now(),
  completed_at      timestamptz
);

create index if not exists case_tasks_case_id_idx  on public.case_tasks(case_id);
create index if not exists case_tasks_status_idx   on public.case_tasks(task_status);
create index if not exists case_tasks_due_date_idx on public.case_tasks(due_date);

-- RLS ─────────────────────────────────────────────────────────────────────────
alter table public.case_notes enable row level security;
alter table public.case_tasks enable row level security;

drop policy if exists case_notes_all on public.case_notes;
create policy case_notes_all on public.case_notes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists case_tasks_all on public.case_tasks;
create policy case_tasks_all on public.case_tasks
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.case_notes to anon, authenticated;
grant select, insert, update, delete on public.case_tasks to anon, authenticated;

-- 4. Advocate master ──────────────────────────────────────────────────────────
create table if not exists public.advocates (
  id            uuid primary key default gen_random_uuid(),
  advocate_name text not null,
  email         text,
  mobile        text,
  designation   text,
  active        boolean default true,
  created_at    timestamptz default now()
);

create index if not exists advocates_active_idx on public.advocates(active);

alter table public.advocates enable row level security;

drop policy if exists advocates_all on public.advocates;
create policy advocates_all on public.advocates
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.advocates to anon, authenticated;

-- Seed the advocate master from existing active notification recipients (one-off,
-- skips rows already present by email). Safe to re-run.
insert into public.advocates (advocate_name, email, mobile, designation, active)
select r.name, r.email, r.mobile_number, 'Advocate', true
from public.system_notification_recipients r
where r.active = true
  and coalesce(r.email, '') <> ''
  and not exists (
    select 1 from public.advocates a where lower(a.email) = lower(r.email)
  );

-- 5. Task email-notification + related hearing tracking ───────────────────────
alter table public.case_tasks
  add column if not exists related_hearing_date        date,
  add column if not exists email_notification_sent     boolean default false,
  add column if not exists email_notification_sent_at  timestamptz,
  add column if not exists email_notification_status   text default 'Pending'; -- Pending | Sent | Failed | Skipped
