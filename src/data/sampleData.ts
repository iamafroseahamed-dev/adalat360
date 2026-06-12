import type {
  Organization, Profile, Case, CauseList,
  CauseListMatch, Notification, UploadedFile,
} from '@/types';

// ─── Organizations ────────────────────────────────────────────────────────────

export const ORGANIZATIONS: Organization[] = [
  {
    id: 'org-001',
    organization_name: 'Chennai Legal Solutions',
    contact_person: 'Rajesh Kumar',
    email: 'admin@chennailegalsolutions.com',
    mobile: '9876543210',
    active: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-002',
    organization_name: 'Madurai Legal Associates',
    contact_person: 'Suresh Babu',
    email: 'admin@madurailegal.com',
    mobile: '9876543211',
    active: true,
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'org-003',
    organization_name: 'South Law Associates',
    contact_person: 'Priya Sharma',
    email: 'admin@southlawassociates.com',
    mobile: '9876543212',
    active: true,
    created_at: '2024-01-03T00:00:00Z',
  },
];

// ─── Demo Accounts ────────────────────────────────────────────────────────────

export const DEMO_ACCOUNTS: Record<string, { password: string; orgId: string; profile: Profile }> = {
  'admin@chennailegalsolutions.com': {
    password: 'Demo@123',
    orgId: 'org-001',
    profile: {
      id: 'prof-001', user_id: 'user-001', organization_id: 'org-001',
      full_name: 'Rajesh Kumar', email: 'admin@chennailegalsolutions.com',
      role: 'admin', active: true, created_at: '2024-01-01T00:00:00Z',
    },
  },
  'admin@madurailegal.com': {
    password: 'Demo@123',
    orgId: 'org-002',
    profile: {
      id: 'prof-002', user_id: 'user-002', organization_id: 'org-002',
      full_name: 'Suresh Babu', email: 'admin@madurailegal.com',
      role: 'admin', active: true, created_at: '2024-01-02T00:00:00Z',
    },
  },
  'admin@southlawassociates.com': {
    password: 'Demo@123',
    orgId: 'org-003',
    profile: {
      id: 'prof-003', user_id: 'user-003', organization_id: 'org-003',
      full_name: 'Priya Sharma', email: 'admin@southlawassociates.com',
      role: 'admin', active: true, created_at: '2024-01-03T00:00:00Z',
    },
  },
};

// ─── Sample Advocates ─────────────────────────────────────────────────────────

const ADVOCATES = [
  { name: 'S. Ramaswamy', mobile: '9444100001', email: 'ramaswamy@legalmail.in' },
  { name: 'P. Krishnamurti', mobile: '9444100002', email: 'krishnamurti@legalmail.in' },
  { name: 'M. Selvakumar', mobile: '9444100003', email: 'selvakumar@legalmail.in' },
  { name: 'K. Anandhi', mobile: '9444100004', email: 'anandhi@legalmail.in' },
  { name: 'R. Balasubramanian', mobile: '9444100005', email: 'bala@legalmail.in' },
  { name: 'V. Sundarajan', mobile: '9444100006', email: 'sundar@legalmail.in' },
  { name: 'T. Vijayakumar', mobile: '9444100007', email: 'vijay@legalmail.in' },
  { name: 'N. Meenakshisundaram', mobile: '9444100008', email: 'meena@legalmail.in' },
  { name: 'A. Parthasarathy', mobile: '9444100009', email: 'partha@legalmail.in' },
  { name: 'C. Ganesan', mobile: '9444100010', email: 'ganesan@legalmail.in' },
];

// ─── Sample Clients ───────────────────────────────────────────────────────────

const CLIENTS = [
  { name: 'Arun Industries Pvt Ltd', mobile: '9500200001', email: 'arun@example.com' },
  { name: 'Bharat Steel Works', mobile: '9500200002', email: 'bharat@example.com' },
  { name: 'Chennai Textiles Ltd', mobile: '9500200003', email: 'chetextiles@example.com' },
  { name: 'Durai Construction Co', mobile: '9500200004', email: 'durai@example.com' },
  { name: 'Eastern Exports Pvt Ltd', mobile: '9500200005', email: 'eastern@example.com' },
  { name: 'Fathima Trading', mobile: '9500200006', email: 'fathima@example.com' },
  { name: 'Grand Pharma Solutions', mobile: '9500200007', email: 'grandpharma@example.com' },
  { name: 'HariHara Textiles', mobile: '9500200008', email: 'harihara@example.com' },
  { name: 'Indo Agro Industries', mobile: '9500200009', email: 'indoagro@example.com' },
  { name: 'Jaya Real Estates', mobile: '9500200010', email: 'jaya@example.com' },
  { name: 'Kannan Motors', mobile: '9500200011', email: 'kannanmotors@example.com' },
  { name: 'Lakshmi Silk Weavers', mobile: '9500200012', email: 'lakshmisilk@example.com' },
  { name: 'Muthu Traders', mobile: '9500200013', email: 'muthu@example.com' },
  { name: 'Nila Hotels Pvt Ltd', mobile: '9500200014', email: 'nilahotels@example.com' },
  { name: 'Om Sakthi Industries', mobile: '9500200015', email: 'omsakthi@example.com' },
  { name: 'Paari Foods Ltd', mobile: '9500200016', email: 'paarifoods@example.com' },
  { name: 'Quantum Technologies', mobile: '9500200017', email: 'quantum@example.com' },
  { name: 'Raja Crackers Pvt Ltd', mobile: '9500200018', email: 'rajacrackers@example.com' },
  { name: 'Saraswathi Jewellers', mobile: '9500200019', email: 'saraswathi@example.com' },
  { name: 'Tamil Nadu Organics', mobile: '9500200020', email: 'tnorganics@example.com' },
  { name: 'Uma Shankar & Co', mobile: '9500200021', email: 'uma@example.com' },
  { name: 'Vijay Steels Ltd', mobile: '9500200022', email: 'vijaysteels@example.com' },
  { name: 'Wintech Engineering', mobile: '9500200023', email: 'wintech@example.com' },
  { name: 'Xpress Cargo Services', mobile: '9500200024', email: 'xpress@example.com' },
  { name: 'Yoga Ayurvedics', mobile: '9500200025', email: 'yogaayur@example.com' },
  { name: 'Zeal Solar Energy', mobile: '9500200026', email: 'zealsolar@example.com' },
  { name: 'Anbu Nala Sangam', mobile: '9500200027', email: 'anbu@example.com' },
  { name: 'Balaji Cotton Mills', mobile: '9500200028', email: 'balajicotton@example.com' },
  { name: 'Cholan IT Services', mobile: '9500200029', email: 'cholanit@example.com' },
  { name: 'Deepika Enterprises', mobile: '9500200030', email: 'deepika@example.com' },
  { name: 'Elavarasi Trading Co', mobile: '9500200031', email: 'elavarasi@example.com' },
  { name: 'Flora Florals Pvt Ltd', mobile: '9500200032', email: 'flora@example.com' },
  { name: 'Galaxy Properties', mobile: '9500200033', email: 'galaxy@example.com' },
  { name: 'Heritage Homeworks', mobile: '9500200034', email: 'heritage@example.com' },
  { name: 'Imperial Impex', mobile: '9500200035', email: 'imperial@example.com' },
  { name: 'Jasmine Cosmetics', mobile: '9500200036', email: 'jasmine@example.com' },
  { name: 'Kavi Silks', mobile: '9500200037', email: 'kavisilks@example.com' },
  { name: 'Lotus Auto Parts', mobile: '9500200038', email: 'lotus@example.com' },
  { name: 'Mega Milk Products', mobile: '9500200039', email: 'megamilk@example.com' },
  { name: 'Noble Constructions', mobile: '9500200040', email: 'noble@example.com' },
  { name: 'Olive Healthcare', mobile: '9500200041', email: 'olive@example.com' },
  { name: 'Pearl Fisheries', mobile: '9500200042', email: 'pearl@example.com' },
  { name: 'Quest Diagnostics', mobile: '9500200043', email: 'quest@example.com' },
  { name: 'Royal Readymade', mobile: '9500200044', email: 'royal@example.com' },
  { name: 'Sunrise Shipping', mobile: '9500200045', email: 'sunrise@example.com' },
  { name: 'Tropical Fruits Ltd', mobile: '9500200046', email: 'tropical@example.com' },
  { name: 'United Power Corp', mobile: '9500200047', email: 'united@example.com' },
  { name: 'Vega Innovations', mobile: '9500200048', email: 'vega@example.com' },
  { name: 'Wave Logistics', mobile: '9500200049', email: 'wave@example.com' },
  { name: 'Xcel Constructions', mobile: '9500200050', email: 'xcel@example.com' },
];

// ─── Courts & Benches ─────────────────────────────────────────────────────────

const COURTS = [
  { court: 'Madras High Court', bench: 'Chennai', judges: ['Hon. Justice S. Vaidyanathan', 'Hon. Justice M. Sundar', 'Hon. Justice R. Mahadevan', 'Hon. Justice D. Bharatha Chakravarthy'] },
  { court: 'Madras High Court', bench: 'Madurai', judges: ['Hon. Justice G.R. Swaminathan', 'Hon. Justice R.M.T. Teekaa Raman', 'Hon. Justice B. Pugalendhi'] },
  { court: 'City Civil Court Chennai', bench: 'Principal', judges: ['Hon. Judge A. Krishnamurthy', 'Hon. Judge P. Suresh'] },
  { court: 'Family Court Chennai', bench: 'I Additional', judges: ['Hon. Judge S. Rajalakshmi'] },
];

const CASE_TYPES = ['CS', 'WP', 'CRP', 'SA', 'OSA', 'WA', 'CP', 'MP'];
const CASE_STATUSES = ['Adjourned', 'Listed', 'Part Heard', 'Orders Reserved', 'Pending'];

function randomCourt() { return COURTS[Math.floor(Math.random() * COURTS.length)]; }
function randomItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomYear() { return 2018 + Math.floor(Math.random() * 7); }

function generateCaseNumber(idx: number): string {
  const type = randomItem(CASE_TYPES);
  return `${type}/${1000 + idx}/${randomYear()}`;
}

function generateCNR(idx: number): string {
  return `TNHC${String(idx + 1000).padStart(6, '0')}2${randomYear()}`;
}

// ─── Generate 100 Cases per org  (we store per-org slices) ───────────────────

function generateCases(orgId: string, startIdx: number): Case[] {
  const cases: Case[] = [];
  for (let i = 0; i < 100; i++) {
    const idx = startIdx + i;
    const courtInfo = randomCourt();
    const advocate = randomItem(ADVOCATES);
    const client = CLIENTS[i % CLIENTS.length];
    const now = new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000);
    cases.push({
      id: `case-${orgId}-${String(i + 1).padStart(3, '0')}`,
      organization_id: orgId,
      cnr_number: generateCNR(idx),
      case_number: generateCaseNumber(idx),
      court_name: courtInfo.court,
      bench: courtInfo.bench,
      petitioner: CLIENTS[(i * 2) % CLIENTS.length].name,
      respondent: CLIENTS[(i * 2 + 1) % CLIENTS.length].name,
      advocate_name: advocate.name,
      advocate_mobile: advocate.mobile,
      advocate_email: advocate.email,
      client_name: client.name,
      client_mobile: client.mobile,
      client_whatsapp: client.mobile,
      client_email: client.email,
      active: i < 90,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }
  return cases;
}

export const SAMPLE_CASES_ORG1 = generateCases('org-001', 0);
export const SAMPLE_CASES_ORG2 = generateCases('org-002', 100);
export const SAMPLE_CASES_ORG3 = generateCases('org-003', 200);

export function getCasesForOrg(orgId: string): Case[] {
  if (orgId === 'org-001') return SAMPLE_CASES_ORG1;
  if (orgId === 'org-002') return SAMPLE_CASES_ORG2;
  return SAMPLE_CASES_ORG3;
}

// ─── 30 Cause List Records (global) ──────────────────────────────────────────

const today = new Date().toISOString().split('T')[0];

export const SAMPLE_CAUSE_LISTS: CauseList[] = [
  ...SAMPLE_CASES_ORG1.slice(0, 10).map((c, i) => ({
    id: `cl-${String(i + 1).padStart(3, '0')}`,
    cause_date: today,
    court_name: c.court_name,
    bench: c.bench,
    court_no: `Court No. ${i + 1}`,
    judge_name: randomItem(COURTS.find(ct => ct.court === c.court_name)?.judges ?? ['Hon. Justice Unknown']),
    case_number: c.case_number,
    cnr_number: c.cnr_number,
    listing_no: i + 1,
    status: randomItem(CASE_STATUSES),
    created_at: new Date().toISOString(),
  })),
  ...SAMPLE_CASES_ORG2.slice(0, 10).map((c, i) => ({
    id: `cl-${String(i + 11).padStart(3, '0')}`,
    cause_date: today,
    court_name: c.court_name,
    bench: c.bench,
    court_no: `Court No. ${i + 1}`,
    judge_name: randomItem(COURTS.find(ct => ct.court === c.court_name)?.judges ?? ['Hon. Justice Unknown']),
    case_number: c.case_number,
    cnr_number: c.cnr_number,
    listing_no: i + 1,
    status: randomItem(CASE_STATUSES),
    created_at: new Date().toISOString(),
  })),
  ...SAMPLE_CASES_ORG3.slice(0, 10).map((c, i) => ({
    id: `cl-${String(i + 21).padStart(3, '0')}`,
    cause_date: today,
    court_name: c.court_name,
    bench: c.bench,
    court_no: `Court No. ${i + 1}`,
    judge_name: randomItem(COURTS.find(ct => ct.court === c.court_name)?.judges ?? ['Hon. Justice Unknown']),
    case_number: c.case_number,
    cnr_number: c.cnr_number,
    listing_no: i + 1,
    status: randomItem(CASE_STATUSES),
    created_at: new Date().toISOString(),
  })),
];

// ─── 15 Matched Cases (per org slice = 5 each) ───────────────────────────────

export function generateMatches(orgId: string): CauseListMatch[] {
  const cases = getCasesForOrg(orgId);
  const orgCauseLists = SAMPLE_CAUSE_LISTS.filter(cl =>
    cases.some(c => c.case_number === cl.case_number || c.cnr_number === cl.cnr_number)
  );
  return orgCauseLists.slice(0, 5).map((cl, i) => {
    const matchedCase = cases.find(c => c.case_number === cl.case_number || c.cnr_number === cl.cnr_number)!;
    return {
      id: `match-${orgId}-${String(i + 1).padStart(3, '0')}`,
      organization_id: orgId,
      case_id: matchedCase.id,
      cause_list_id: cl.id,
      match_type: 'cnr' as const,
      match_confidence: 95 + Math.floor(Math.random() * 5),
      matched_on: today,
      alert_required: true,
      created_at: new Date().toISOString(),
      case: matchedCase,
      cause_list: cl,
    };
  });
}

// ─── Notification Records (3 per match = 45 total for all orgs) ─────────────

export function generateNotifications(orgId: string): Notification[] {
  const matches = generateMatches(orgId);
  const notifications: Notification[] = [];
  const statuses: Array<'sent' | 'failed' | 'pending'> = ['sent', 'sent', 'pending', 'failed', 'sent'];

  matches.forEach((match, mi) => {
    const c = match.case!;
    const statusIdx = mi % statuses.length;

    const types: Array<{ type: 'whatsapp' | 'sms' | 'email'; recipient: string }> = [
      { type: 'whatsapp', recipient: c.client_whatsapp },
      { type: 'sms', recipient: c.client_mobile },
      { type: 'email', recipient: c.client_email },
    ];

    types.forEach(({ type, recipient }, ti) => {
      const cl = match.cause_list!;
      const status = statuses[(statusIdx + ti) % statuses.length];
      notifications.push({
        id: `notif-${orgId}-${String(mi * 3 + ti + 1).padStart(3, '0')}`,
        organization_id: orgId,
        case_id: c.id,
        cause_list_match_id: match.id,
        notification_type: type,
        recipient,
        message: buildMessage(c, cl),
        sent_time: status === 'sent' ? new Date().toISOString() : undefined,
        status,
        response: status === 'sent' ? 'Delivered' : status === 'failed' ? 'Network Error' : undefined,
        retry_count: status === 'failed' ? 1 : 0,
        created_at: new Date().toISOString(),
        case: c,
      });
    });
  });
  return notifications;
}

function buildMessage(c: Case, cl: CauseList): string {
  const org = ORGANIZATIONS.find(o => o.id === c.organization_id);
  const orgName = org?.organization_name ?? 'Legal Solutions';
  return `${orgName}\n\nDear ${c.client_name},\n\nYour case has been listed today.\n\nCase No: ${c.case_number}\nCourt: ${c.court_name}\nBench: ${c.bench}\nJudge: ${cl.judge_name}\nCourt Hall: ${cl.court_no}\nSerial No: ${cl.listing_no}\nDate: ${cl.cause_date}\nAdvocate: ${c.advocate_name}\n\nPlease contact our office for further instructions.\n\n${orgName}`;
}

// ─── Uploaded Files Sample ────────────────────────────────────────────────────

export const SAMPLE_UPLOADS: UploadedFile[] = [
  {
    id: 'upload-001', organization_id: 'org-001', file_name: 'cases_batch_jan2025.xlsx',
    uploaded_by: 'Rajesh Kumar', total_records: 45, success_count: 43, failed_count: 2,
    status: 'completed', created_at: '2025-01-15T10:00:00Z',
  },
  {
    id: 'upload-002', organization_id: 'org-001', file_name: 'cases_batch_feb2025.xlsx',
    uploaded_by: 'Rajesh Kumar', total_records: 30, success_count: 30, failed_count: 0,
    status: 'completed', created_at: '2025-02-10T09:30:00Z',
  },
];
