// ─── Domain Types ────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  organization_name: string;
  contact_person: string;
  email: string;
  mobile: string;
  active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'advocate' | 'user';
  active: boolean;
  created_at: string;
  organization?: Organization;
}

export interface Case {
  id: string;
  organization_id: string;
  cnr_number: string;
  case_number: string;
  court_name: string;
  bench: string;
  petitioner: string;
  respondent: string;
  advocate_name: string;
  advocate_mobile: string;
  advocate_email: string;
  client_name: string;
  client_mobile: string;
  client_whatsapp: string;
  client_email: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CauseList {
  id: string;
  cause_date: string;
  court_name: string;
  bench: string;
  court_no: string;
  judge_name: string;
  case_number: string;
  cnr_number: string;
  listing_no: number;
  status: string;
  raw_response?: object;
  created_at: string;
}

export interface CauseListMatch {
  id: string;
  organization_id: string;
  case_id: string;
  cause_list_id: string;
  match_type: 'cnr' | 'case_number' | 'fuzzy';
  match_confidence: number;
  matched_on: string;
  alert_required: boolean;
  created_at: string;
  case?: Case;
  cause_list?: CauseList;
}

export type NotificationType = 'whatsapp' | 'sms' | 'email';
export type NotificationStatus = 'sent' | 'failed' | 'pending';

export interface Notification {
  id: string;
  organization_id: string;
  case_id: string;
  cause_list_match_id: string;
  notification_type: NotificationType;
  recipient: string;
  message: string;
  sent_time?: string;
  status: NotificationStatus;
  response?: string;
  retry_count: number;
  created_at: string;
  case?: Case;
}

export interface UploadedFile {
  id: string;
  organization_id: string;
  file_name: string;
  uploaded_by: string;
  total_records: number;
  success_count: number;
  failed_count: number;
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
}

export interface CaseHearingHistory {
  id: string;
  organization_id: string;
  case_id: string;
  hearing_date: string;
  judge_name: string;
  court_no: string;
  stage: string;
  remarks: string;
  order_url?: string;
  created_at: string;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile;
  organization: Organization;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// ─── Dashboard Types ──────────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalActiveCases: number;
  todayListedCases: number;
  matchedCasesToday: number;
  alertsGeneratedToday: number;
  failedAlerts: number;
  pendingAlerts: number;
}

// ─── Bulk Upload Types ────────────────────────────────────────────────────────

export interface BulkUploadRow {
  rowNumber: number;
  data: Partial<Case>;
  errors: string[];
  status: 'success' | 'error' | 'duplicate';
}

export interface BulkUploadResult {
  total: number;
  success: number;
  failed: number;
  duplicates: number;
  rows: BulkUploadRow[];
}

// ─── Filter Types ─────────────────────────────────────────────────────────────

export interface CaseFilters {
  search?: string;
  court_name?: string;
  bench?: string;
  advocate_name?: string;
  client_name?: string;
  active?: boolean | null;
}

export interface NotificationFilters {
  notification_type?: NotificationType | '';
  status?: NotificationStatus | '';
}

export interface CauseListFilters {
  date?: string;
  court?: string;
  bench?: string;
  judge?: string;
  status?: string;
}
