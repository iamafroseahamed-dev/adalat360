-- ============================================================
-- Legal Case Alert SaaS — Database Schema
-- Phase 1: Multi-tenant with Row Level Security
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Organizations ────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_name TEXT NOT NULL,
  contact_person  TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  mobile          TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Profiles ─────────────────────────────────────────────────────────────────
-- One profile per Supabase auth user
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'advocate', 'user')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── Cases ────────────────────────────────────────────────────────────────────
CREATE TABLE cases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cnr_number      TEXT,
  case_number     TEXT NOT NULL,
  court_name      TEXT,
  bench           TEXT,
  petitioner      TEXT,
  respondent      TEXT,
  advocate_name   TEXT,
  advocate_mobile TEXT,
  advocate_email  TEXT,
  client_name     TEXT,
  client_mobile   TEXT,
  client_whatsapp TEXT,
  client_email    TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate case numbers within same org
  UNIQUE(organization_id, case_number)
);

CREATE INDEX idx_cases_org ON cases(organization_id);
CREATE INDEX idx_cases_cnr ON cases(cnr_number) WHERE cnr_number IS NOT NULL;

-- ─── Cause Lists (global — court data shared across all orgs) ─────────────────
CREATE TABLE cause_lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cause_date  DATE NOT NULL,
  court_name  TEXT NOT NULL,
  bench       TEXT,
  court_no    TEXT,
  judge_name  TEXT,
  case_number TEXT NOT NULL,
  cnr_number  TEXT,
  listing_no  INTEGER,
  status      TEXT,
  raw_response JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate entries per date + court + case
  UNIQUE(cause_date, court_name, case_number)
);

CREATE INDEX idx_cause_list_date ON cause_lists(cause_date);
CREATE INDEX idx_cause_list_cnr ON cause_lists(cnr_number) WHERE cnr_number IS NOT NULL;

-- ─── Cause List Matches ───────────────────────────────────────────────────────
CREATE TABLE cause_list_matches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id          UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cause_list_id    UUID NOT NULL REFERENCES cause_lists(id) ON DELETE CASCADE,
  match_type       TEXT NOT NULL CHECK (match_type IN ('cnr', 'case_number', 'fuzzy')),
  match_confidence INTEGER NOT NULL DEFAULT 0,
  matched_on       DATE NOT NULL,
  alert_required   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate matches for same case + cause list entry
  UNIQUE(organization_id, case_id, cause_list_id)
);

CREATE INDEX idx_matches_org ON cause_list_matches(organization_id);
CREATE INDEX idx_matches_date ON cause_list_matches(matched_on);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id              UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cause_list_match_id  UUID NOT NULL REFERENCES cause_list_matches(id) ON DELETE CASCADE,
  notification_type    TEXT NOT NULL CHECK (notification_type IN ('whatsapp', 'sms', 'email')),
  recipient            TEXT NOT NULL,
  message              TEXT NOT NULL,
  sent_time            TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'pending')),
  response             TEXT,
  retry_count          INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate notifications for same match + type
  UNIQUE(cause_list_match_id, notification_type)
);

CREATE INDEX idx_notifications_org ON notifications(organization_id);
CREATE INDEX idx_notifications_status ON notifications(status);

-- ─── Uploaded Files ───────────────────────────────────────────────────────────
CREATE TABLE uploaded_files (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  uploaded_by     TEXT NOT NULL,
  total_records   INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Case Hearing History ─────────────────────────────────────────────────────
CREATE TABLE case_hearing_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  hearing_date    DATE NOT NULL,
  judge_name      TEXT,
  court_no        TEXT,
  stage           TEXT,
  remarks         TEXT,
  order_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security Policies
-- Each organization can only see/modify its own data.
-- cause_lists is global (readable by all authenticated users).
-- ============================================================

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cause_lists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cause_list_matches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_hearing_history  ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's org_id
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- profiles: user can only see own profile
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (user_id = auth.uid());

-- organizations: user can only see own org
CREATE POLICY "organizations_select" ON organizations FOR SELECT
  USING (id = get_my_org_id());
CREATE POLICY "organizations_update" ON organizations FOR UPDATE
  USING (id = get_my_org_id());

-- cases: tenant-scoped
CREATE POLICY "cases_select"  ON cases FOR SELECT  USING (organization_id = get_my_org_id());
CREATE POLICY "cases_insert"  ON cases FOR INSERT  WITH CHECK (organization_id = get_my_org_id());
CREATE POLICY "cases_update"  ON cases FOR UPDATE  USING (organization_id = get_my_org_id());
CREATE POLICY "cases_delete"  ON cases FOR DELETE  USING (organization_id = get_my_org_id());

-- cause_lists: global read for authenticated users
CREATE POLICY "cause_lists_select" ON cause_lists FOR SELECT
  USING (auth.role() = 'authenticated');
-- Only service role (backend) can insert/update cause lists
CREATE POLICY "cause_lists_insert" ON cause_lists FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- cause_list_matches: tenant-scoped
CREATE POLICY "matches_select" ON cause_list_matches FOR SELECT USING (organization_id = get_my_org_id());
CREATE POLICY "matches_insert" ON cause_list_matches FOR INSERT WITH CHECK (organization_id = get_my_org_id());
CREATE POLICY "matches_update" ON cause_list_matches FOR UPDATE USING (organization_id = get_my_org_id());

-- notifications: tenant-scoped
CREATE POLICY "notifs_select" ON notifications FOR SELECT USING (organization_id = get_my_org_id());
CREATE POLICY "notifs_insert" ON notifications FOR INSERT WITH CHECK (organization_id = get_my_org_id());
CREATE POLICY "notifs_update" ON notifications FOR UPDATE USING (organization_id = get_my_org_id());

-- uploaded_files: tenant-scoped
CREATE POLICY "uploads_select" ON uploaded_files FOR SELECT USING (organization_id = get_my_org_id());
CREATE POLICY "uploads_insert" ON uploaded_files FOR INSERT WITH CHECK (organization_id = get_my_org_id());

-- case_hearing_history: tenant-scoped
CREATE POLICY "hearing_select" ON case_hearing_history FOR SELECT USING (organization_id = get_my_org_id());
CREATE POLICY "hearing_insert" ON case_hearing_history FOR INSERT WITH CHECK (organization_id = get_my_org_id());

-- ============================================================
-- Sample Demo Organizations (run after schema creation)
-- Update emails to match auth.users after creating accounts in Supabase Auth
-- ============================================================

-- INSERT INTO organizations (organization_name, contact_person, email, mobile)
-- VALUES
--   ('Litigo Demo Firm', 'Rajesh Kumar', 'admin@litigodemo.com', '9876543210'),
--   ('Madurai Legal Associates', 'Suresh Babu', 'admin@madurailegal.com', '9876543211'),
--   ('South Law Associates', 'Priya Sharma', 'admin@southlawassociates.com', '9876543212');
