import { supabase } from '@/lib/supabase';
import type { CauseList } from '@/types';

const LIVE_ECOURTS = import.meta.env.VITE_LIVE_ECOURTS === 'true';

export interface ECourtsSearchParams {
  state?: string;
  date?: string;
  limit?: number;
  offset?: number;
}

export interface CaseDetails {
  cnr_number: string;
  case_number: string;
  case_type: string;
  filing_date: string;
  first_hearing_date: string;
  next_hearing_date: string;
  case_status: string;
  petitioner: string;
  respondent: string;
  petitioner_advocate: string;
  respondent_advocate: string;
  judge_name: string;
  court_name: string;
  hearing_history: {
    hearing_date: string;
    judge: string;
    purpose: string;
    next_date: string;
  }[];
}

async function callEdgeFunction<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}

export async function searchCauseList(params: ECourtsSearchParams): Promise<CauseList[]> {
  if (!LIVE_ECOURTS) {
    return getMockCauseListForDate(params.date ?? new Date().toISOString().split('T')[0]);
  }
  return callEdgeFunction<CauseList[]>('ecourts-search-causelist', {
    state: params.state ?? 'TN',
    date: params.date,
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
  });
}

export async function getAvailableCauseListDates(state = 'TN'): Promise<string[]> {
  if (!LIVE_ECOURTS) {
    const today = new Date().toISOString().split('T')[0];
    return [today];
  }
  return callEdgeFunction<string[]>('ecourts-available-dates', { state });
}

export async function getCaseDetails(cnrNumber: string): Promise<CaseDetails | null> {
  if (!LIVE_ECOURTS) return null;
  return callEdgeFunction<CaseDetails>('ecourts-case-details', { cnr: cnrNumber });
}

export async function getOrderMetadata(cnrNumber: string, orderDate: string) {
  if (!LIVE_ECOURTS) return null;
  return callEdgeFunction('ecourts-order-metadata', { cnr: cnrNumber, date: orderDate });
}

export async function refreshCase(cnrNumber: string): Promise<CaseDetails | null> {
  if (!LIVE_ECOURTS) return null;
  return getCaseDetails(cnrNumber);
}

export function isLiveMode(): boolean {
  return LIVE_ECOURTS;
}

function getMockCauseListForDate(date: string): CauseList[] {
  return [
    { id: 'mock-cl-01', cause_date: date, court_name: 'Madras High Court', bench: 'Chennai', court_no: 'Court Hall 23', judge_name: "Hon'ble Justice G.R. Swaminathan", item_number: 1, case_number: 'WP/12345/2024', cnr_number: 'TNHC0010012024', petitioner: 'Arun Industries Pvt Ltd', respondent: 'State of Tamil Nadu', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-02', cause_date: date, court_name: 'Madras High Court', bench: 'Chennai', court_no: 'Court Hall 23', judge_name: "Hon'ble Justice G.R. Swaminathan", item_number: 2, case_number: 'WP/12346/2024', cnr_number: 'TNHC0010022024', petitioner: 'Bharat Steel Works', respondent: 'Municipal Corporation', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-03', cause_date: date, court_name: 'Madras High Court', bench: 'Chennai', court_no: 'Court Hall 27', judge_name: "Hon'ble Justice P. Murugan", item_number: 1, case_number: 'WP/22100/2024', cnr_number: 'TNHC0010042024', petitioner: 'Durai Construction Co', respondent: 'State of Tamil Nadu', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-04', cause_date: date, court_name: 'Madras High Court', bench: 'Chennai', court_no: 'Court Hall 27', judge_name: "Hon'ble Justice P. Murugan", item_number: 2, case_number: 'WP/44500/2024', cnr_number: 'TNHC0010082024', petitioner: 'HariHara Textiles', respondent: 'Tamil Nadu Pollution Board', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-05', cause_date: date, court_name: 'Madras High Court', bench: 'Chennai', court_no: 'Court Hall 31', judge_name: "Hon'ble Justice R. Mahadevan", item_number: 1, case_number: 'OSA/451/2024', cnr_number: 'TNHC0010062024', petitioner: 'Fathima Trading', respondent: 'State Bank of India', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-06', cause_date: date, court_name: 'Madras High Court', bench: 'Chennai', court_no: 'Court Hall 31', judge_name: "Hon'ble Justice R. Mahadevan", item_number: 2, case_number: 'CMA/789/2024', cnr_number: null, petitioner: 'Grand Pharma Solutions', respondent: 'Union of India', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-07', cause_date: date, court_name: 'Madras High Court', bench: 'Chennai', court_no: 'Court Hall 31', judge_name: "Hon'ble Justice R. Mahadevan", item_number: 3, case_number: 'WP/55600/2024', cnr_number: 'TNHC0010102024', petitioner: 'Jaya Real Estates', respondent: 'Registration Department', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-08', cause_date: date, court_name: 'City Civil Court Chennai', bench: 'Principal', court_no: 'Court Hall 5', judge_name: 'Principal Judge R. Saravanan', item_number: 1, case_number: 'CS/5678/2024', cnr_number: 'TNCC0010032024', petitioner: 'Chennai Textiles Ltd', respondent: 'Eastern Exports Pvt Ltd', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-09', cause_date: date, court_name: 'City Civil Court Chennai', bench: 'I Additional', court_no: 'Court Hall 6', judge_name: 'I Additional Judge K. Priya', item_number: 1, case_number: 'AS/1023/2024', cnr_number: null, petitioner: 'Indo Agro Industries', respondent: 'Karnataka Bank Ltd', status: 'Listed', created_at: new Date().toISOString() },
    { id: 'mock-cl-10', cause_date: date, court_name: 'Madras High Court', bench: 'Madurai', court_no: 'Court Hall 4', judge_name: "Hon'ble Justice S. Vaidyanathan", item_number: 1, case_number: 'WP/33210/2024', cnr_number: 'TNHC0010052024', petitioner: 'Eastern Exports Pvt Ltd', respondent: 'Customs Department', status: 'Listed', created_at: new Date().toISOString() },
  ];
}
