// Frontend eCourts service.
//
// All requests go through the app's own API service layer at `/api/ecourts/*`
// (proxied to the FastAPI backend in dev, Vercel Python functions in prod).
// The backend performs the eCourts captcha + search + history flow server-side
// and returns the captcha image as a base64 data URI plus a stateless token,
// so the browser never has to share PHP session cookies cross-origin.

const API_BASE = '/api';

export type EcourtsCaseDetails = {
  overview: {
    caseNumber: string;
    cnrNumber: string;
    petitioner: string;
    respondent: string;
    judge: string;
    courtHall: string;
    stage: string;
    caseStatus: string;
    nextHearingDate: string;
  };
  hearings: Array<{ date: string; purpose: string; stage: string; remarks: string }>;
  orders: Array<{ orderDate: string; orderNumber: string; downloadUrl: string }>;
  rawResponse: unknown;
};

export type CaptchaChallenge = {
  kind: 'captcha';
  captchaImage: string;
  captchaToken: string;
  message: string;
};

export type CaseDetailsResult = {
  kind: 'details';
  details: EcourtsCaseDetails;
};

export class EcourtsError extends Error {
  code: 'INVALID_CAPTCHA' | 'CASE_NOT_FOUND' | 'UNABLE_TO_FETCH_HISTORY' | 'SESSION_EXPIRED' | 'UNKNOWN';

  constructor(code: EcourtsError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

type BackendTable = {
  title?: string;
  headers?: string[];
  rows?: string[][];
  columnCount?: number;
};

type BackendResponse = {
  success?: boolean;
  requiresCaptcha?: boolean;
  message?: string;
  detail?: string;
  error?: string;
  captchaImage?: string;
  captchaToken?: string;
  cnr_number?: string;
  case_number?: string;
  tables?: BackendTable[];
  summary_fields?: Record<string, string>;
};

function clean(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function pickField(summary: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const lookup = Object.keys(summary).find((k) => k.toLowerCase() === key.toLowerCase());
    if (lookup && clean(summary[lookup])) return clean(summary[lookup]);
  }
  return '';
}

function headerIndex(headers: string[] | undefined, keywords: string[]): number {
  const list = headers ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const h = String(list[i] ?? '').toLowerCase();
    if (keywords.some((kw) => h.includes(kw))) return i;
  }
  return -1;
}

function cellAt(row: string[], idx: number): string {
  return idx >= 0 ? clean(row[idx]) : '';
}

function findTable(tables: BackendTable[], keyword: string): BackendTable | undefined {
  return tables.find((t) => String(t.title ?? '').toLowerCase().includes(keyword));
}

function mapBackendToDetails(resp: BackendResponse, fallbackCaseNumber: string): EcourtsCaseDetails {
  const summary = resp.summary_fields ?? {};
  const tables = resp.tables ?? [];

  const hearings: EcourtsCaseDetails['hearings'] = [];
  const hearingTable = findTable(tables, 'history of case hearing') ?? findTable(tables, 'hearing');
  if (hearingTable?.rows?.length) {
    const dateIdx = headerIndex(hearingTable.headers, ['hearing date', 'next date', 'date']);
    const purposeIdx = headerIndex(hearingTable.headers, ['purpose']);
    const stageIdx = headerIndex(hearingTable.headers, ['cause list type', 'stage']);
    const remarksIdx = headerIndex(hearingTable.headers, ['judge', 'business on date', 'remarks']);
    for (const row of hearingTable.rows) {
      const entry = {
        date: cellAt(row, dateIdx) || clean(row[row.length - 1]),
        purpose: cellAt(row, purposeIdx),
        stage: cellAt(row, stageIdx) || clean(row[0]),
        remarks: cellAt(row, remarksIdx),
      };
      if (entry.date || entry.purpose || entry.stage || entry.remarks) hearings.push(entry);
    }
  }

  const orders: EcourtsCaseDetails['orders'] = [];
  const orderTable = findTable(tables, 'order');
  if (orderTable?.rows?.length) {
    const dateIdx = headerIndex(orderTable.headers, ['order date', 'date']);
    const numberIdx = headerIndex(orderTable.headers, ['order no', 'order number', 'sl']);
    const linkIdx = headerIndex(orderTable.headers, ['pdf link', 'pdf', 'link', 'url']);
    for (const row of orderTable.rows) {
      const downloadUrl = cellAt(row, linkIdx);
      const entry = {
        orderDate: cellAt(row, dateIdx),
        orderNumber: cellAt(row, numberIdx) || clean(row[0]),
        downloadUrl,
      };
      if (entry.orderDate || entry.orderNumber || entry.downloadUrl) orders.push(entry);
    }
  }

  const overview = {
    caseNumber:
      pickField(summary, ['Case Number', 'Registration Number', 'Filing Number']) ||
      clean(resp.case_number) ||
      clean(fallbackCaseNumber),
    cnrNumber: pickField(summary, ['CNR Number']) || clean(resp.cnr_number),
    petitioner: pickField(summary, ['Petitioner', 'Petitioner and Advocate', 'Petitioner Name']),
    respondent: pickField(summary, ['Respondent', 'Respondent and Advocate', 'Respondent Name']),
    judge: pickField(summary, ['Coram', 'Judge', 'Judge/Coram', 'Hon\'ble Judge']),
    courtHall: pickField(summary, ['Court Hall', 'Court', 'Court Number', 'Court No', 'Bench']),
    stage: pickField(summary, ['Stage of Case', 'Stage', 'Case Stage']),
    caseStatus: pickField(summary, ['Case Status', 'Status', 'Disposal Nature']),
    nextHearingDate: pickField(summary, ['Next Hearing Date', 'Next Date', 'Next Date / Purpose']),
  };

  return { overview, hearings, orders, rawResponse: resp };
}

async function postCaseDetails(payload: {
  case_number?: string;
  cnr_number?: string;
  captcha?: string;
  captcha_token?: string;
}): Promise<BackendResponse> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/ecourts/case-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new EcourtsError('UNKNOWN', 'Unable to reach the case details service.');
  }

  let data: BackendResponse;
  try {
    data = (await resp.json()) as BackendResponse;
  } catch {
    if (!resp.ok) {
      throw new EcourtsError('UNKNOWN', 'Unable to fetch case details.');
    }
    throw new EcourtsError('UNKNOWN', 'Unexpected response from the case details service.');
  }

  if (!resp.ok) {
    throw new EcourtsError('UNKNOWN', clean(data?.detail || data?.message) || 'Unable to fetch case details.');
  }

  return data;
}

function interpret(resp: BackendResponse, caseNumber: string): CaptchaChallenge | CaseDetailsResult {
  if (resp.requiresCaptcha && resp.captchaImage && resp.captchaToken) {
    return {
      kind: 'captcha',
      captchaImage: resp.captchaImage,
      captchaToken: resp.captchaToken,
      message: clean(resp.message) || 'Captcha required.',
    };
  }

  if (resp.success) {
    return { kind: 'details', details: mapBackendToDetails(resp, caseNumber) };
  }

  const message = clean(resp.message) || 'Case Not Found';
  if (resp.error === 'CASE_TYPE_MAPPING_NOT_FOUND') {
    throw new EcourtsError('UNKNOWN', message);
  }
  throw new EcourtsError('CASE_NOT_FOUND', message);
}

/**
 * Begin a case-details lookup. For a case number this returns a captcha
 * challenge (image + token) that must be solved via {@link submitCaseCaptcha}.
 */
export async function startCaseDetails(caseNumber: string): Promise<CaptchaChallenge | CaseDetailsResult> {
  const resp = await postCaseDetails({ case_number: caseNumber });
  return interpret(resp, caseNumber);
}

/**
 * Submit a solved captcha. On success returns the parsed case details. If the
 * captcha was wrong the backend issues a fresh challenge, returned here as a
 * `captcha` result so the UI can refresh the image and prompt again.
 */
export async function submitCaseCaptcha(args: {
  caseNumber: string;
  captcha: string;
  captchaToken: string;
}): Promise<CaptchaChallenge | CaseDetailsResult> {
  const resp = await postCaseDetails({
    case_number: args.caseNumber,
    captcha: args.captcha,
    captcha_token: args.captchaToken,
  });
  return interpret(resp, args.caseNumber);
}
