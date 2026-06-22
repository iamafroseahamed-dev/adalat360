/**
 * Shared eCourtsIndia API client.
 *
 * All requests are routed through the Vite dev proxy (`/ecourts-proxy` for case
 * lookups and `/ecourts-orders-proxy` for order files). The proxy injects the
 * `Authorization: Bearer <ECOURTS_API_KEY>` header server-side, so the API key is
 * NEVER bundled into or exposed to the browser.
 *
 * Reuse these functions everywhere instead of duplicating fetch logic.
 */

const CASE_PROXY = '/ecourts-proxy';
const ORDER_PROXY = '/ecourts-orders-proxy';

export interface OrderResult {
  /** Direct downloadable URL, when the API returns JSON metadata with a link. */
  url?: string;
  /** Object URL created from PDF bytes, when the API streams the file directly. */
  blobUrl?: string;
  /** The requested order filename. */
  filename: string;
  /** Friendly download filename returned by the API (true-copy style name). */
  downloadFilename?: string;
}

async function describeError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return `eCourts API ${res.status}: ${text.slice(0, 300) || '(empty body)'}`;
}

/**
 * Fetch the full case-details payload for a CNR.
 * Returns the raw API response (callers map the shape they need).
 */
export async function getCaseDetails(cnr: string): Promise<any> {
  if (!cnr) throw new Error('CNR is required.');

  const res = await fetch(`${CASE_PROXY}/api/partner/case/${encodeURIComponent(cnr)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await describeError(res));

  const text = await res.text();
  if (!text) throw new Error('eCourts API returned an empty response.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`eCourts API returned non-JSON: ${text.slice(0, 300)}`);
  }
}

/**
 * Fetch a single order / judgment file for a case.
 *
 * Handles both response styles:
 *  - JSON metadata containing a downloadable URL, and
 *  - raw PDF bytes streamed directly (converted to an object URL).
 */
export async function getOrder(cnr: string, filename: string): Promise<OrderResult> {
  if (!cnr || !filename) throw new Error('Both CNR and order filename are required.');

  const res = await fetch(
    `${ORDER_PROXY}/api/partner/case/${encodeURIComponent(cnr)}/order/${encodeURIComponent(filename)}`,
    { headers: { Accept: 'application/json, application/pdf' } },
  );
  if (!res.ok) throw new Error(await describeError(res));

  const contentType = res.headers.get('content-type') ?? '';

  // PDF bytes streamed directly → wrap in an object URL.
  if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) {
    const blob = await res.blob();
    return { blobUrl: URL.createObjectURL(blob), filename, downloadFilename: filename };
  }

  // JSON metadata response (e.g. { data: { cnr, filename, downloadFilename, downloadUrl } }).
  const text = await res.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`eCourts API returned non-JSON: ${text.slice(0, 300)}`);
  }

  const body = payload?.data ?? payload;
  return {
    url: body?.downloadUrl ?? body?.download_url ?? body?.url ?? body?.orderUrl ?? undefined,
    filename: body?.filename ?? filename,
    downloadFilename:
      body?.downloadFilename ?? body?.download_filename ?? body?.filename ?? filename,
  };
}
