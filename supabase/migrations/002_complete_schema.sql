-- ============================================================
-- Litigo — Complete Database Schema
-- Multi-tenant Legal-Tech SaaS with Row Level Security
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Organizations ────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_name TEXT NOT NULL,
  contact_person    TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  mobile            TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Profiles ─────────────────────────────────────────────────────────────────

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
  UNIQUE(organization_id, case_number)
);

CREATE INDEX idx_cases_org ON cases(organization_id);
CREATE INDEX idx_cases_cnr ON cases(cnr_number) WHERE cnr_number IS NOT NULL;
CREATE INDEX idx_cases_active ON cases(organization_id, active);

-- ─── Cause Lists (global — shared across all orgs) ───────────────────────────

CREATE TABLE cause_lists (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cause_date   DATE NOT NULL,
  court_name   TEXT NOT NULL,
  bench        TEXT,
  court_no     TEXT,
  judge_name   TEXT,
  item_number  INTEGER,
  case_number  TEXT NOT NULL,
  cnr_number   TEXT,
  petitioner   TEXT,
  respondent   TEXT,
  status       TEXT,
  raw_response JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cause_date, court_name, case_number)
);

CREATE INDEX idx_cause_list_date ON cause_lists(cause_date);
CREATE INDEX idx_cause_list_cnr ON cause_lists(cnr_number) WHERE cnr_number IS NOT NULL;
CREATE INDEX idx_cause_list_court_date ON cause_lists(court_name, cause_date);

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
  UNIQUE(organization_id, case_id, cause_list_id)
);

CREATE INDEX idx_matches_org ON cause_list_matches(organization_id);
CREATE INDEX idx_matches_date ON cause_list_matches(matched_on);
CREATE INDEX idx_matches_org_date ON cause_list_matches(organization_id, matched_on);

-- ─── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id              UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cause_list_match_id  UUID REFERENCES cause_list_matches(id) ON DELETE SET NULL,
  notification_type    TEXT NOT NULL CHECK (notification_type IN ('whatsapp', 'sms', 'email')),
  recipient            TEXT NOT NULL,
  message              TEXT,
  sent_time            TIMESTAMPTZ,
  status               TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending')) DEFAULT 'pending',
  response             TEXT,
  retry_count          INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_org ON notifications(organization_id);
CREATE INDEX idx_notif_status ON notifications(organization_id, status);
CREATE INDEX idx_notif_case ON notifications(case_id);

-- ─── Uploaded Files ───────────────────────────────────────────────────────────

CREATE TABLE uploaded_files (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  uploaded_by      TEXT NOT NULL,
  total_records    INTEGER NOT NULL DEFAULT 0,
  success_count    INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')) DEFAULT 'processing',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uploads_org ON uploaded_files(organization_id);

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

CREATE INDEX idx_hearing_case ON case_hearing_history(case_id);
CREATE INDEX idx_hearing_org ON case_hearing_history(organization_id);

-- ─── Triggers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile for demo users when they first authenticate
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
BEGIN
  CASE NEW.email
    WHEN 'admin@litigodemo.com' THEN
      SELECT id INTO v_org_id FROM organizations WHERE email = 'admin@litigodemo.com';
      IF v_org_id IS NOT NULL THEN
        INSERT INTO profiles (user_id, organization_id, full_name, email, role)
        VALUES (NEW.id, v_org_id, 'Rajesh Kumar', NEW.email, 'admin')
        ON CONFLICT (user_id) DO NOTHING;
      END IF;
    WHEN 'admin@madurailegal.com' THEN
      SELECT id INTO v_org_id FROM organizations WHERE email = 'admin@madurailegal.com';
      IF v_org_id IS NOT NULL THEN
        INSERT INTO profiles (user_id, organization_id, full_name, email, role)
        VALUES (NEW.id, v_org_id, 'Suresh Babu', NEW.email, 'admin')
        ON CONFLICT (user_id) DO NOTHING;
      END IF;
    WHEN 'admin@southlawassociates.com' THEN
      SELECT id INTO v_org_id FROM organizations WHERE email = 'admin@southlawassociates.com';
      IF v_org_id IS NOT NULL THEN
        INSERT INTO profiles (user_id, organization_id, full_name, email, role)
        VALUES (NEW.id, v_org_id, 'Priya Sharma', NEW.email, 'admin')
        ON CONFLICT (user_id) DO NOTHING;
      END IF;
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cause_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE cause_list_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_hearing_history ENABLE ROW LEVEL SECURITY;

-- Helper: returns the authenticated user's organization_id
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Organizations: users can read and update their own org
CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (id = get_my_org_id());

CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (id = get_my_org_id());

-- Profiles: users can read their own profile
CREATE POLICY "profile_select" ON profiles FOR SELECT
  USING (user_id = auth.uid() OR organization_id = get_my_org_id());

CREATE POLICY "profile_insert" ON profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profile_update" ON profiles FOR UPDATE
  USING (user_id = auth.uid());

-- Cases: full CRUD scoped to organization
CREATE POLICY "cases_select" ON cases FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "cases_insert" ON cases FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "cases_update" ON cases FOR UPDATE
  USING (organization_id = get_my_org_id());

CREATE POLICY "cases_delete" ON cases FOR DELETE
  USING (organization_id = get_my_org_id());

-- Cause lists: readable by all authenticated users (global data)
CREATE POLICY "cause_list_select" ON cause_lists FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "cause_list_insert" ON cause_lists FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Cause list matches: scoped to organization
CREATE POLICY "matches_select" ON cause_list_matches FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "matches_insert" ON cause_list_matches FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "matches_delete" ON cause_list_matches FOR DELETE
  USING (organization_id = get_my_org_id());

-- Notifications: scoped to organization
CREATE POLICY "notif_select" ON notifications FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "notif_insert" ON notifications FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "notif_update" ON notifications FOR UPDATE
  USING (organization_id = get_my_org_id());

-- Uploaded files: scoped to organization
CREATE POLICY "uploads_select" ON uploaded_files FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "uploads_insert" ON uploaded_files FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- Case hearing history: scoped to organization
CREATE POLICY "hearing_select" ON case_hearing_history FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "hearing_insert" ON case_hearing_history FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- ─── Seed Data: Organizations ─────────────────────────────────────────────────

INSERT INTO organizations (id, organization_name, contact_person, email, mobile) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Litigo Demo Firm', 'Rajesh Kumar', 'admin@litigodemo.com', '9876543210'),
  ('22222222-2222-2222-2222-222222222222', 'Madurai Legal Associates', 'Suresh Babu', 'admin@madurailegal.com', '9876543211'),
  ('33333333-3333-3333-3333-333333333333', 'South Law Associates', 'Priya Sharma', 'admin@southlawassociates.com', '9876543212');

-- ─── Seed Data: Sample Cases (for org-001) ───────────────────────────────────

INSERT INTO cases (organization_id, cnr_number, case_number, court_name, bench, petitioner, respondent, advocate_name, advocate_mobile, advocate_email, client_name, client_mobile, client_whatsapp, client_email, active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'TNHC0010012024', 'WP/12345/2024', 'Madras High Court', 'Chennai', 'Arun Industries Pvt Ltd', 'State of Tamil Nadu', 'S. Ramaswamy', '9444100001', 'ramaswamy@legalmail.in', 'Arun Industries Pvt Ltd', '9500200001', '9500200001', 'arun@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'TNHC0010022024', 'WP/12346/2024', 'Madras High Court', 'Chennai', 'Bharat Steel Works', 'Municipal Corporation', 'P. Krishnamurti', '9444100002', 'krishnamurti@legalmail.in', 'Bharat Steel Works', '9500200002', '9500200002', 'bharat@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'TNCC0010032024', 'CS/5678/2024', 'City Civil Court Chennai', 'Principal', 'Chennai Textiles Ltd', 'Eastern Exports Pvt Ltd', 'M. Selvakumar', '9444100003', 'selvakumar@legalmail.in', 'Chennai Textiles Ltd', '9500200003', '9500200003', 'chetextiles@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'TNHC0010042024', 'WP/22100/2024', 'Madras High Court', 'Chennai', 'Durai Construction Co', 'State of Tamil Nadu', 'K. Anandhi', '9444100004', 'anandhi@legalmail.in', 'Durai Construction Co', '9500200004', '9500200004', 'durai@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'TNHC0010052024', 'WP/33210/2024', 'Madras High Court', 'Madurai', 'Eastern Exports Pvt Ltd', 'Customs Department', 'R. Balasubramanian', '9444100005', 'bala@legalmail.in', 'Eastern Exports Pvt Ltd', '9500200005', '9500200005', 'eastern@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'TNHC0010062024', 'OSA/451/2024', 'Madras High Court', 'Chennai', 'Fathima Trading', 'State Bank of India', 'V. Sundarajan', '9444100006', 'sundar@legalmail.in', 'Fathima Trading', '9500200006', '9500200006', 'fathima@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', NULL, 'CMA/789/2024', 'Madras High Court', 'Chennai', 'Grand Pharma Solutions', 'Union of India', 'T. Vijayakumar', '9444100007', 'vijay@legalmail.in', 'Grand Pharma Solutions', '9500200007', '9500200007', 'grandpharma@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'TNHC0010082024', 'WP/44500/2024', 'Madras High Court', 'Chennai', 'HariHara Textiles', 'Tamil Nadu Pollution Board', 'N. Meenakshisundaram', '9444100008', 'meena@legalmail.in', 'HariHara Textiles', '9500200008', '9500200008', 'harihara@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', NULL, 'AS/1023/2024', 'City Civil Court Chennai', 'I Additional', 'Indo Agro Industries', 'Karnataka Bank Ltd', 'A. Parthasarathy', '9444100009', 'partha@legalmail.in', 'Indo Agro Industries', '9500200009', '9500200009', 'indoagro@example.com', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'TNHC0010102024', 'WP/55600/2024', 'Madras High Court', 'Chennai', 'Jaya Real Estates', 'Registration Department', 'C. Ganesan', '9444100010', 'ganesan@legalmail.in', 'Jaya Real Estates', '9500200010', '9500200010', 'jaya@example.com', TRUE);

-- ─── Seed Data: Today's Cause List ───────────────────────────────────────────
-- Note: Replace CURRENT_DATE with a fixed date if needed for testing

INSERT INTO cause_lists (cause_date, court_name, bench, court_no, judge_name, item_number, case_number, cnr_number, petitioner, respondent, status) VALUES
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 23', 'Hon''ble Justice G.R. Swaminathan', 1, 'WP/12345/2024', 'TNHC0010012024', 'Arun Industries Pvt Ltd', 'State of Tamil Nadu', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 23', 'Hon''ble Justice G.R. Swaminathan', 2, 'WP/12346/2024', 'TNHC0010022024', 'Bharat Steel Works', 'Municipal Corporation', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 23', 'Hon''ble Justice G.R. Swaminathan', 3, 'WP/98765/2024', NULL, 'Kannan Traders', 'Income Tax Department', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 27', 'Hon''ble Justice P. Murugan', 1, 'WP/22100/2024', 'TNHC0010042024', 'Durai Construction Co', 'State of Tamil Nadu', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 27', 'Hon''ble Justice P. Murugan', 2, 'WP/44500/2024', 'TNHC0010082024', 'HariHara Textiles', 'Tamil Nadu Pollution Board', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 27', 'Hon''ble Justice P. Murugan', 3, 'WP/11123/2024', NULL, 'Muthu Traders', 'Customs Department', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 27', 'Hon''ble Justice P. Murugan', 4, 'WP/11124/2024', NULL, 'Nila Hotels Pvt Ltd', 'TANGEDCO', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 31', 'Hon''ble Justice R. Mahadevan', 1, 'OSA/451/2024', 'TNHC0010062024', 'Fathima Trading', 'State Bank of India', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 31', 'Hon''ble Justice R. Mahadevan', 2, 'CMA/789/2024', NULL, 'Grand Pharma Solutions', 'Union of India', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Chennai', 'Court Hall 31', 'Hon''ble Justice R. Mahadevan', 3, 'WP/55600/2024', 'TNHC0010102024', 'Jaya Real Estates', 'Registration Department', 'Listed'),
  (CURRENT_DATE, 'City Civil Court Chennai', 'Principal', 'Court Hall 5', 'Principal Judge R. Saravanan', 1, 'CS/5678/2024', 'TNCC0010032024', 'Chennai Textiles Ltd', 'Eastern Exports Pvt Ltd', 'Listed'),
  (CURRENT_DATE, 'City Civil Court Chennai', 'I Additional', 'Court Hall 6', 'I Additional Judge K. Priya', 1, 'AS/1023/2024', NULL, 'Indo Agro Industries', 'Karnataka Bank Ltd', 'Listed'),
  (CURRENT_DATE, 'City Civil Court Chennai', 'I Additional', 'Court Hall 6', 'I Additional Judge K. Priya', 2, 'AS/1024/2024', NULL, 'Om Sakthi Industries', 'Axis Bank', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Madurai', 'Court Hall 4', 'Hon''ble Justice S. Vaidyanathan', 1, 'WP/33210/2024', 'TNHC0010052024', 'Eastern Exports Pvt Ltd', 'Customs Department', 'Listed'),
  (CURRENT_DATE, 'Madras High Court', 'Madurai', 'Court Hall 4', 'Hon''ble Justice S. Vaidyanathan', 2, 'WP/33211/2024', NULL, 'Paari Foods Ltd', 'FSSAI', 'Listed');
